// ─────────────────────────────────────────────────────────────────────────────
// owner.ts
// Owner-facing API (F4+): image uploads and per-server / per-network
// customisation. Every route needs a logged-in user who may manage the target
// (admin, or an owner of it -- see ownershipRepository.canManageTarget); every
// write also needs a same-origin request. Nothing here is cached: the
// responses are per-user and change with every write.
//
// Uploaded images start `pending` and are only served publicly once an admin
// approves them (routes/uploads.ts, routes/admin.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia, ElysiaCustomStatusResponse, status, t } from 'elysia';
import { env } from '../../config/env.js';
import { authPlugin } from '../auth/plugin.js';
import { isSameOrigin } from '../auth/originGuard.js';
import { checkImage } from '../lib/imageValidation.js';
import { IntId } from '../lib/schemas.js';
import { clearCaches } from '../middleware/cache.js';
import { canManageTarget, type ManageTarget } from '../../repositories/ownershipRepository.js';
import { getOwnerState, targetExists } from '../../repositories/customisationReadRepository.js';
import { setCustomisation } from '../../repositories/user/customisationRepository.js';
import { countPendingByUploader, insertImage, MAX_PENDING_PER_UPLOADER } from '../../repositories/user/imageRepository.js';
import { removeUpload, writeUpload } from '../../repositories/user/uploadStorage.js';
import {
  ACCENT_COLOR_RE,
  uploadUrl,
  type OwnerImage,
} from '../../../../common/models/customisation.js';
import { SESSION_COOKIE } from '../auth/plugin.js';

const PositiveInt = t.Integer({ minimum: 1, maximum: 2_147_483_647 });

/** multipart framing around the file (boundaries, part headers, the two small fields). */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const mb = (bytes: number): string => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/**
 * Runs as a `parse` hook, which Elysia calls BEFORE it reads the request body
 * (verified in elysia/dist/compose: the parse hooks are invoked ahead of the
 * default formData/json parsers, which only run if no hook claimed the body).
 * Returning undefined hands over to the default multipart parser.
 *
 * It refuses, without buffering anything, requests that are not logged in
 * (no session cookie), cross-origin, or whose declared Content-Length is
 * missing or over the cap. This is a best-effort guard against honest or
 * lazy abuse: a lying client can still send more than it declared, which Bun
 * stops at its own maxRequestBodySize, and checkImage below stays the
 * authoritative size check on the bytes actually received.
 */
function refuseBeforeBuffering({ request }: { request: Request }): void {
  if (!isSameOrigin(request, env.SITE_ORIGIN)) throw status(403, { error: 'Bad origin' });

  const cookies = request.headers.get('cookie') ?? '';
  if (!cookies.split(';').some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`))) {
    throw status(401, { error: 'Not logged in' });
  }

  const declared = request.headers.get('content-length');
  const length = declared !== null && /^\d+$/.test(declared) ? Number(declared) : null;
  if (length === null || length > env.UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw status(413, { error: `That image is too large. The limit is ${mb(env.UPLOAD_MAX_BYTES)}.` });
  }
}

/**
 * Exactly one of networkId / serverId, mirroring the tables' CHECK. Checked by
 * hand rather than as a t.Union of two objects: Elysia strips unknown keys
 * before matching, so a body carrying both would quietly validate as whichever
 * came first.
 */
function pickTarget(networkId: number | undefined, serverId: number | undefined): ManageTarget | null {
  if ((networkId === undefined) === (serverId === undefined)) return null;
  return networkId !== undefined ? { networkId } : { serverId: serverId! };
}

const BAD_TARGET = { error: 'Give exactly one of networkId or serverId' };
const notFoundFor = (target: ManageTarget) =>
  ({ error: 'networkId' in target ? 'Network not found' : 'Server not found' });

export const ownerRoutes = new Elysia({ prefix: '/api/owner' })
  // Elysia wraps anything thrown from a parse hook in a 400 ParseError, and a
  // function parse hook cannot *return* a response (its return value becomes
  // the body), so refuseBeforeBuffering throws and this unwraps it again.
  .onError(({ code, error, set }) => {
    if (code !== 'PARSE') return;
    const cause = (error as Error).cause;
    if (!(cause instanceof ElysiaCustomStatusResponse)) return;
    set.status = cause.code;
    return cause.response;
  })
  .use(authPlugin)

  .post('/images', async ({ body, user }) => {
    const target = pickTarget(body.networkId, body.serverId);
    if (!target) return status(422, BAD_TARGET);

    if (!(await canManageTarget(user, target))) return status(403, { error: 'Forbidden' });
    if (!(await targetExists(target))) return status(404, notFoundFor(target));

    if ((await countPendingByUploader(user.id)) >= MAX_PENDING_PER_UPLOADER) {
      return status(429, {
        error: `You already have ${MAX_PENDING_PER_UPLOADER} images awaiting approval. Wait for a review before uploading more.`,
      });
    }

    const checked = checkImage(new Uint8Array(await body.file.arrayBuffer()), {
      maxBytes: env.UPLOAD_MAX_BYTES,
      maxWidth: env.UPLOAD_MAX_WIDTH,
      maxHeight: env.UPLOAD_MAX_HEIGHT,
    });
    if (checked.kind === 'too_large') {
      return status(413, { error: `That image is too large. The limit is ${mb(env.UPLOAD_MAX_BYTES)}.` });
    }
    if (checked.kind === 'unsupported') {
      return status(415, { error: 'Only PNG, JPEG and WebP images are accepted.' });
    }
    if (checked.kind === 'too_many_pixels') {
      return status(422, {
        error: `That image is too big. The limit is ${env.UPLOAD_MAX_WIDTH}x${env.UPLOAD_MAX_HEIGHT} pixels.`,
      });
    }

    // Server-generated name; the client's filename and content type are never used.
    const id = crypto.randomUUID();
    const { image } = checked;
    // The stripped bytes are what hit the disk, never the original upload.
    await writeUpload(id, image.mime, checked.bytes);
    try {
      const row = await insertImage({
        id,
        uploaderId: user.id,
        target,
        kind: 'background',
        mime: image.mime,
        bytes: checked.bytes.length,
        width: image.width,
        height: image.height,
      });
      const result: OwnerImage = {
        id: row.id,
        status: 'pending',
        rejectReason: null,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        createdAt: row.createdAt.getTime(),
        url: uploadUrl(row.id),
      };
      return status(201, result);
    } catch (err) {
      // No row, so nothing would ever reference (or clean up) the file.
      await removeUpload(id, image.mime).catch(() => {});
      throw err;
    }
  }, {
    requireUser: true,
    requireOrigin: true,
    parse: refuseBeforeBuffering,
    // No maxSize on the file: it would answer an oversize file with a bare 422
    // validation error. The Content-Length guard above stops big bodies being
    // buffered and checkImage gives the friendly 413.
    body: t.Object({
      file: t.File(),
      networkId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
      serverId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
    }),
  })

  .get('/customisation', async ({ query, user, set }) => {
    set.headers['cache-control'] = 'no-store';
    const target = pickTarget(query.networkId, query.serverId);
    if (!target) return status(422, BAD_TARGET);

    if (!(await canManageTarget(user, target))) return status(403, { error: 'Forbidden' });
    if (!(await targetExists(target))) return status(404, notFoundFor(target));
    return getOwnerState(target);
  }, {
    requireUser: true,
    query: t.Object({ networkId: t.Optional(IntId()), serverId: t.Optional(IntId()) }, { additionalProperties: false }),
  })

  .put('/customisation', async ({ body, user, set }) => {
    set.headers['cache-control'] = 'no-store';
    const target = pickTarget(body.target.networkId, body.target.serverId);
    if (!target) return status(422, BAD_TARGET);

    // The schema pattern is the first line; this is the one that guards the style attribute.
    if (body.accentColor != null && !ACCENT_COLOR_RE.test(body.accentColor)) {
      return status(422, { error: 'Accent colour must look like #1a2b3c' });
    }

    if (!(await canManageTarget(user, target))) return status(403, { error: 'Forbidden' });

    // PUT is a full replace: an omitted field is cleared, same as null.
    const result = await setCustomisation(target, {
      accentColor: body.accentColor?.toLowerCase() ?? null,
      backgroundImageId: body.backgroundImageId ?? null,
    }, user.id);

    if (result.kind === 'not_found') return status(404, notFoundFor(target));
    if (result.kind === 'image_not_allowed') {
      return status(422, {
        error: `That image isn't approved for this ${'networkId' in target ? 'network' : 'server'} yet.`,
      });
    }

    clearCaches('customisation');
    return getOwnerState(target);
  }, {
    requireUser: true,
    requireOrigin: true,
    body: t.Object({
      target: t.Object({
        networkId: t.Optional(PositiveInt),
        serverId: t.Optional(PositiveInt),
      }, { additionalProperties: false }),
      accentColor: t.Optional(t.Nullable(t.String({ pattern: '^#[0-9a-fA-F]{6}$' }))),
      backgroundImageId: t.Optional(t.Nullable(t.String({
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      }))),
    }, { additionalProperties: false }),
  });
