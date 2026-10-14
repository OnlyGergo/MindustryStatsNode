// ─────────────────────────────────────────────────────────────────────────────
// admin.ts
// Admin panel API (F3+). Every route is `requireAdmin`; every write is also
// `requireOrigin`. Nothing here is cached: the responses are admin-only and
// change with every write. Later features add their queues to this file.
//
// Ownership is assigned only here -- there is deliberately no self-service
// claim flow; an admin assigns owners by hand from /admin/owners.
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia, status, t } from 'elysia';
import { authPlugin } from '../auth/plugin.js';
import { listOwners, searchUsers } from '../../repositories/ownershipRepository.js';
import { addOwner, removeOwner } from '../../repositories/user/ownerRepository.js';
import { listImagesForAdmin } from '../../repositories/customisationReadRepository.js';
import { approveImage, rejectImage, type ModerateImageResult } from '../../repositories/user/imageRepository.js';
import { dismissReports, getModerationQueue, moderateReply, moderateReview } from '../../repositories/user/moderationRepository.js';
import { normalizeReviewBody } from '../../repositories/user/reviewBody.js';
import { clearCaches } from '../middleware/cache.js';
import { ModerationQuery } from '../lib/schemas.js';
import { REMOVED_REASON_MAX, REVIEW_BODY_MAX } from '../../../../common/models/reviews.js';
import { UPLOAD_ID_RE } from '../../../../common/models/customisation.js';
import { getMergedFamilies, getMergeFamily, getMergeSuggestions } from '../../repositories/adminMergeRepository.js';
import { dismissMergeSuggestion, mergeServers, unmergeServer, type MergeResult } from '../../repositories/user/serverMergeRepository.js';

/** bigserial ids travel as strings; reject anything that is not a plain positive integer. */
const BigIdString = t.String({ pattern: '^[1-9][0-9]{0,18}$' });
const PositiveInt = t.Integer({ minimum: 1, maximum: 2_147_483_647 });
const ReviewIdParam = t.Object({ id: BigIdString });
const REPORTS_PER_PAGE = 20;
const RemoveBody = t.Object({ action: t.Literal('remove'), reason: t.String({ minLength: 1, maxLength: REMOVED_REASON_MAX }) }, { additionalProperties: false });
const RestoreBody = t.Object({ action: t.Literal('restore') }, { additionalProperties: false });
const ImageIdParam = t.Object({ id: t.String({ pattern: UPLOAD_ID_RE.source }) });

/**
 * A merge changes what nearly every public route returns (lists, details,
 * charts, reviews, customisation), so a successful one clears every cache.
 */
function mergeResponse(result: MergeResult) {
  if (result.kind === 'not_found') return status(404, { error: 'Server not found' });
  if (result.kind === 'conflict') return status(409, { error: result.message });
  clearCaches();
  return { rootId: result.rootId };
}

function moderationError(result: Exclude<ModerateImageResult, { kind: 'ok' }>, action: string) {
  return result.kind === 'not_found'
    ? status(404, { error: 'Image not found' })
    : status(409, { error: `Can't ${action} an image that is ${result.status}` });
}

export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  .use(authPlugin)

  .get('/users', async ({ query, set }) => {
    set.headers['cache-control'] = 'no-store';
    return searchUsers(query.q.trim());
  }, {
    requireAdmin: true,
    query: t.Object({ q: t.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false }),
  })

  .get('/owners', async ({ set }) => {
    set.headers['cache-control'] = 'no-store';
    return listOwners();
  }, {
    requireAdmin: true,
  })

  .post('/owners', async ({ body, user, set }) => {
    // Exactly one target, mirroring the table's CHECK. Checked here rather than
    // as a t.Union of two objects: Elysia strips unknown keys before matching,
    // so a body carrying both would quietly validate as whichever came first.
    const { networkId, serverId } = body;
    if ((networkId === undefined) === (serverId === undefined)) {
      return status(422, { error: 'Give exactly one of networkId or serverId' });
    }

    const target = networkId !== undefined ? { networkId } : { serverId: serverId! };
    const result = await addOwner(body.userId, target, user.id);

    if (result.kind === 'user_not_found') return status(404, { error: 'User not found' });
    if (result.kind === 'target_not_found') {
      return status(404, { error: networkId !== undefined ? 'Network not found' : 'Server not found' });
    }
    if (result.kind === 'exists') return status(409, { error: 'That user already owns this' });

    set.status = 201;
    return { id: result.id };
  }, {
    requireAdmin: true,
    requireOrigin: true,
    body: t.Object({
      userId: BigIdString,
      networkId: t.Optional(PositiveInt),
      serverId: t.Optional(PositiveInt),
    }, { additionalProperties: false }),
  })

  .delete('/owners/:id', async ({ params, set }) => {
    if (!(await removeOwner(params.id))) return status(404, { error: 'Owner assignment not found' });
    set.status = 204;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    params: t.Object({ id: BigIdString }),
  })

  // Owner images awaiting (or past) review -- F4. Never cached.
  .get('/images', async ({ query, set }) => {
    set.headers['cache-control'] = 'no-store';
    return listImagesForAdmin(query.status ?? 'pending');
  }, {
    requireAdmin: true,
    query: t.Object({
      status: t.Optional(t.Union([t.Literal('pending'), t.Literal('approved'), t.Literal('rejected')])),
    }, { additionalProperties: false }),
  })

  .post('/images/:id/approve', async ({ params, user, set }) => {
    set.headers['cache-control'] = 'no-store';
    const result = await approveImage(params.id, user.id);
    if (result.kind !== 'ok') return moderationError(result, 'approve');
    clearCaches('customisation');
    set.status = 204;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    params: ImageIdParam,
  })

  // Also the takedown for an already-approved image: it is un-set everywhere and its file deleted.
  .post('/images/:id/reject', async ({ params, body, user, set }) => {
    set.headers['cache-control'] = 'no-store';
    const reason = body?.reason?.trim() || null;
    const result = await rejectImage(params.id, user.id, reason);
    if (result.kind !== 'ok') return moderationError(result, 'reject');
    clearCaches('customisation');
    set.status = 204;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    params: ImageIdParam,
    body: t.Optional(t.Object({
      reason: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
    }, { additionalProperties: false })),
  })

  // ── F7: review reports + moderation ───────────────────────────────────────
  // These payloads name the real author of anonymous reviews, which is one
  // more reason none of this may ever be cached.
  .get('/reports', async ({ query, set }) => {
    set.headers['cache-control'] = 'no-store';
    const page = Math.max(parseInt(query.page ?? '', 10) || 1, 1);
    return getModerationQueue(query.view ?? 'open', page, REPORTS_PER_PAGE);
  }, {
    requireAdmin: true,
    query: ModerationQuery,
  })

  // All open reports on a review at once: the queue is grouped by review, and
  // "this review is fine" is a decision about the review. Nothing public changes.
  .post('/reviews/:id/reports/dismiss', async ({ params, user, set }) => {
    await dismissReports(params.id, user.id);
    set.status = 204;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    params: ReviewIdParam,
  })

  .patch('/reviews/:id', async ({ params, user, body }) => {
    let review;
    if (body.action === 'remove') {
      const reason = normalizeReviewBody(body.reason);
      if (!reason) return status(422, { error: 'A reason is required' });
      review = await moderateReview(params.id, user.id, { action: 'remove', reason });
    } else if (body.action === 'restore') {
      review = await moderateReview(params.id, user.id, { action: 'restore' });
    } else {
      review = await moderateReview(params.id, user.id, { action: 'edit', body: normalizeReviewBody(body.body) });
    }
    if (!review) return status(404, { error: 'Review not found' });

    // The public list and summary read these rows, same clear as a user's own write.
    clearCaches('reviews');
    return review;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    params: ReviewIdParam,
    // Each branch is a distinct `action` literal, so the strip-before-match
    // pitfall from POST /owners can't make one body validate as another.
    body: t.Union([
      RemoveBody,
      RestoreBody,
      t.Object({ action: t.Literal('edit'), body: t.Nullable(t.String({ maxLength: REVIEW_BODY_MAX })) }, { additionalProperties: false }),
    ]),
  })

  .patch('/reviews/:id/reply', async ({ params, user, body }) => {
    let review;
    if (body.action === 'remove') {
      const reason = normalizeReviewBody(body.reason);
      if (!reason) return status(422, { error: 'A reason is required' });
      review = await moderateReply(params.id, user.id, { action: 'remove', reason });
    } else {
      review = await moderateReply(params.id, user.id, { action: 'restore' });
    }
    if (!review) return status(404, { error: 'Reply not found' });

    clearCaches('reviews');
    return review;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    params: ReviewIdParam,
    body: t.Union([RemoveBody, RestoreBody]),
  })

  // ── Server merges ─────────────────────────────────────────────────────────
  // Reads on the read connection; writes go through the SECURITY DEFINER
  // functions from 40_admin_server_merge.sql (see serverMergeRepository).
  .get('/merge-suggestions', async ({ set }) => {
    set.headers['cache-control'] = 'no-store';
    return getMergeSuggestions();
  }, {
    requireAdmin: true,
  })

  .get('/merged-families', async ({ set }) => {
    set.headers['cache-control'] = 'no-store';
    return getMergedFamilies();
  }, {
    requireAdmin: true,
  })

  // Any member id works; the preview for the manual merge form.
  .get('/families/:id', async ({ params, set }) => {
    set.headers['cache-control'] = 'no-store';
    return (await getMergeFamily(params.id)) ?? status(404, { error: 'Server not found' });
  }, {
    requireAdmin: true,
    params: t.Object({ id: t.Numeric({ minimum: 1, maximum: 2_147_483_647 }) }),
  })

  .post('/merges', async ({ body }) => {
    if (body.sourceId === body.targetId) return status(409, { error: 'Pick two different servers' });
    return mergeResponse(await mergeServers(body.sourceId, body.targetId));
  }, {
    requireAdmin: true,
    requireOrigin: true,
    body: t.Object({ sourceId: PositiveInt, targetId: PositiveInt }, { additionalProperties: false }),
  })

  // Detaches one raw member from its family: the inverse of a merge.
  .delete('/merges/:id', async ({ params }) => mergeResponse(await unmergeServer(params.id)), {
    requireAdmin: true,
    requireOrigin: true,
    params: t.Object({ id: t.Numeric({ minimum: 1, maximum: 2_147_483_647 }) }),
  })

  .post('/merge-dismissals', async ({ body, user, set }) => {
    if (body.a === body.b) return status(422, { error: 'Pick two different servers' });
    await dismissMergeSuggestion(body.a, body.b, user.id);
    set.status = 204;
  }, {
    requireAdmin: true,
    requireOrigin: true,
    body: t.Object({ a: PositiveInt, b: PositiveInt }, { additionalProperties: false }),
  });
