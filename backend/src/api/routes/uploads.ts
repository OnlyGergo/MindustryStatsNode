// ─────────────────────────────────────────────────────────────────────────────
// uploads.ts
// GET /uploads/:id -- serves owner images (F4).
//
// Approved images are public and immutable (the id is a fresh uuid per upload,
// so they cache forever). Pending ones are visible only to an admin, who needs
// them to review. Rejected or missing rows, and rows whose file has gone, are
// all the same plain 404. The session is looked up only when the image is
// pending: the common (approved) path touches no auth at all.
//
// The file path is built from the DB row's id and its sniffed mime, never from
// the request string. `requireAdmin` is not used here: it would answer 401/403
// and so reveal that a pending image exists.
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia, status, t } from 'elysia';
import { resolveUser, type CookieJar } from '../auth/plugin.js';
import { getImageForServing } from '../../repositories/customisationReadRepository.js';
import { uploadPath } from '../../repositories/user/uploadStorage.js';
import { UPLOAD_ID_RE } from '../../../../common/models/customisation.js';

const notFound = () => status(404, { error: 'Not found' });

export const uploadRoutes = new Elysia()
  .get('/uploads/:id', async ({ params, cookie }) => {
    // Not a schema pattern: a bad id should be a 404, not a 422.
    if (!UPLOAD_ID_RE.test(params.id)) return notFound();

    const image = await getImageForServing(params.id);
    if (!image) return notFound();

    let cacheControl: string;
    if (image.status === 'approved') {
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (image.status === 'pending') {
      const user = await resolveUser(cookie as unknown as CookieJar);
      if (!user?.isAdmin) return notFound();
      cacheControl = 'private, no-store';
    } else {
      return notFound();
    }

    const file = Bun.file(uploadPath(params.id, image.mime));
    if (!(await file.exists())) return notFound();

    return new Response(file, {
      headers: {
        'Content-Type': image.mime,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': cacheControl,
      },
    });
  }, {
    params: t.Object({ id: t.String() }),
  });
