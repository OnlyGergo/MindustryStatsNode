// ─────────────────────────────────────────────────────────────────────────────
// reviews.ts
// Server ratings + reviews (F2). Reads go through reviewReadRepository (the
// read connection); the PUT/DELETE mutations go through reviewRepository
// (the user-content connection) -- same split as every other route that
// touches user content.
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia, status, t } from 'elysia';
import { authPlugin } from '../auth/plugin.js';
import { IdParam, ReviewsQuery, StrictNoQuery } from '../lib/schemas.js';
import { withCache, clearCaches } from '../middleware/cache.js';
import { getReviewPage, getReviewSummary } from '../../repositories/reviewReadRepository.js';
import { deleteMyReview, getMyReview, upsertReview } from '../../repositories/user/reviewRepository.js';
import { normalizeReviewBody } from '../../repositories/user/reviewBody.js';
import { REVIEW_BODY_MAX, type ReviewSort } from '../../../../common/models/reviews.js';
import { containsProfanity } from '../../../../common/profanity.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 50;

export const reviewRoutes = new Elysia({ prefix: '/api' })
  .use(authPlugin)

  .get('/servers/:id/reviews', async ({ params, query }) => {
    const page = Math.max(parseInt(query.page ?? '', 10) || DEFAULT_PAGE, 1);
    const perPage = Math.min(Math.max(parseInt(query.perPage ?? '', 10) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
    const sort: ReviewSort = query.sort ?? 'newest';

    return getReviewPage(params.id, page, perPage, sort);
  }, {
    params: IdParam,
    query: ReviewsQuery,
    ...withCache({
      name: 'reviews',
      ttlMs: 30_000,
      getKey: ({ path, params, query }) => `${path}:${params.id}:${query.page ?? '1'}:${query.perPage ?? '10'}:${query.sort ?? 'newest'}`,
    }),
  })

  .get('/servers/:id/reviews/summary', async ({ params }) => getReviewSummary(params.id), {
    params: IdParam,
    query: StrictNoQuery,
    ...withCache({
      name: 'reviews',
      ttlMs: 30_000,
      getKey: ({ path, params }) => `${path}:${params.id}`,
    }),
  })

  .get('/servers/:id/reviews/mine', async ({ params, user, set }) => {
    // Per-user, so it must never be replayed from the shared response cache.
    set.headers['cache-control'] = 'no-store';
    return getMyReview(user.id, params.id);
  }, {
    params: IdParam,
    query: StrictNoQuery,
    requireUser: true,
  })

  .put('/servers/:id/reviews', async ({ params, user, body }) => {
    const normalizedBody = normalizeReviewBody(body.body);
    if (normalizedBody && containsProfanity(normalizedBody)) {
      return status(422, { error: 'Please remove inappropriate language from your review.' });
    }

    const result = await upsertReview(user.id, params.id, {
      rating: body.rating,
      body: normalizedBody,
      anonymous: body.anonymous ?? false,
    });

    if (result.kind === 'not_found') return status(404, { error: 'Server not found' });
    if (result.kind === 'removed') return status(403, { error: 'This review was removed by a moderator' });

    // The list and summary share the 'reviews' store name, so one clear drops
    // both. /mine is never cached, so it needs nothing.
    clearCaches('reviews');
    return result.review;
  }, {
    params: IdParam,
    requireUser: true,
    requireOrigin: true,
    body: t.Object({
      rating: t.Integer({ minimum: 1, maximum: 5 }),
      body: t.Optional(t.Nullable(t.String({ maxLength: REVIEW_BODY_MAX }))),
      anonymous: t.Optional(t.Boolean()),
    }, { additionalProperties: false }),
  })

  .delete('/servers/:id/reviews', async ({ params, user, set }) => {
    await deleteMyReview(user.id, params.id);
    clearCaches('reviews');
    set.status = 204;
  }, {
    params: IdParam,
    requireUser: true,
    requireOrigin: true,
  });
