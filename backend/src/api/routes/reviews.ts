// ─────────────────────────────────────────────────────────────────────────────
// reviews.ts
// Server ratings + reviews (F2). Reads go through reviewReadRepository (the
// read connection); the PUT/DELETE mutations go through reviewRepository
// (the user-content connection) -- same split as every other route that
// touches user content.
//
// F5: owners (and admins) can post one public reply per review, under
// /servers/:id/reviews/:reviewId/reply. Replies ride along on the cached
// public list, so their writes clear the same 'reviews' store.
//
// F7: any logged-in user can report a review; the queue lives in admin.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia, status, t } from 'elysia';
import { authPlugin, type AuthUser } from '../auth/plugin.js';
import { paginationKey, parsePagination } from '../lib/pagination.js';
import { AspectsBody, IdParam, IntId, ReportReasonSchema, ReviewsQuery, StrictNoQuery } from '../lib/schemas.js';
import { withCache, clearCaches } from '../middleware/cache.js';
import { getReviewPage, getReviewSummary } from '../../repositories/reviewReadRepository.js';
import { deleteMyReview, getMyReview, upsertReview } from '../../repositories/user/reviewRepository.js';
import { deleteReply, upsertReply } from '../../repositories/user/reviewReplyRepository.js';
import { reportReview } from '../../repositories/user/reportRepository.js';
import { normalizeReviewBody } from '../../repositories/user/reviewBody.js';
import { notifyReviewPosted, notifyReviewReported } from '../lib/discordWebhooks.js';
import { canManageServer } from '../../repositories/ownershipRepository.js';
import { REPLY_BODY_MAX, REPORT_NOTE_MAX, REVIEW_BODY_MAX, type MyReview, type ReviewSort } from '../../../../common/models/reviews.js';
import { containsProfanity } from '../../../../common/profanity.js';

const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 50;

// Review ids are bigserial, so they stay strings end to end (PublicReview.id).
const ReviewParams = t.Object({
  id: IntId(),
  reviewId: t.String({ pattern: '^[1-9][0-9]{0,17}$' }),
});

/** Fire-and-forget Discord post; the summary lookup is best-effort too. */
async function announceReview(author: AuthUser, serverId: number, review: MyReview): Promise<void> {
  const summary = await getReviewSummary(serverId).catch(() => null);
  await notifyReviewPosted({
    review,
    author,
    serverId,
    averageRating: summary?.average,
    ratingCount: summary?.count,
  });
}

export const reviewRoutes = new Elysia({ prefix: '/api' })
  .use(authPlugin)

  .get('/servers/:id/reviews', async ({ params, query }) => {
    const { page, perPage } = parsePagination(query, DEFAULT_PER_PAGE, MAX_PER_PAGE);
    const sort: ReviewSort = query.sort ?? 'newest';

    return getReviewPage(params.id, page, perPage, sort);
  }, {
    params: IdParam,
    query: ReviewsQuery,
    ...withCache({
      name: 'reviews',
      ttlMs: 30_000,
      getKey: ({ path, params, query }) => `${path}:${params.id}:${paginationKey(parsePagination(query, DEFAULT_PER_PAGE, MAX_PER_PAGE))}:${query.sort ?? 'newest'}`,
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
      aspects: body.aspects ?? {},
    });

    if (result.kind === 'not_found') return status(404, { error: 'Server not found' });
    if (result.kind === 'removed') return status(403, { error: 'This review was removed by a moderator' });

    // The list and summary share the 'reviews' store name, so one clear drops
    // both. /mine is never cached, so it needs nothing.
    clearCaches('reviews');

    // Only brand-new reviews: an edit keeps created_at, so the two differ.
    if (result.review.createdAt === result.review.updatedAt) {
      void announceReview(user, params.id, result.review);
    }
    return result.review;
  }, {
    params: IdParam,
    requireUser: true,
    requireOrigin: true,
    body: t.Object({
      rating: t.Integer({ minimum: 1, maximum: 5 }),
      body: t.Optional(t.Nullable(t.String({ maxLength: REVIEW_BODY_MAX }))),
      anonymous: t.Optional(t.Boolean()),
      aspects: AspectsBody,
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
  })

  .put('/servers/:id/reviews/:reviewId/reply', async ({ params, user, body }) => {
    if (!(await canManageServer(user, params.id))) return status(403, { error: 'Only owners of this server can reply' });

    // Same normalisation as a review body; an empty reply is a delete, not a PUT.
    const normalizedBody = normalizeReviewBody(body.body);
    if (!normalizedBody) return status(422, { error: 'Your reply is empty.' });
    if (containsProfanity(normalizedBody)) {
      return status(422, { error: 'Please remove inappropriate language from your reply.' });
    }

    const result = await upsertReply(user.id, params.id, params.reviewId, normalizedBody);
    if (result.kind === 'not_found') return status(404, { error: 'Review not found' });
    if (result.kind === 'removed') return status(403, { error: 'This reply was removed by a moderator' });

    clearCaches('reviews');
    return { ok: true as const };
  }, {
    params: ReviewParams,
    requireUser: true,
    requireOrigin: true,
    body: t.Object({
      body: t.String({ minLength: 1, maxLength: REPLY_BODY_MAX }),
    }, { additionalProperties: false }),
  })

  .delete('/servers/:id/reviews/:reviewId/reply', async ({ params, user, set }) => {
    if (!(await canManageServer(user, params.id))) return status(403, { error: 'Only owners of this server can reply' });

    await deleteReply(params.id, params.reviewId);
    clearCaches('reviews');
    set.status = 204;
  }, {
    params: ReviewParams,
    requireUser: true,
    requireOrigin: true,
  })

  // Nothing public changes, so there is no cache to clear; the queue is
  // admin-only and uncached.
  .post('/servers/:id/reviews/:reviewId/report', async ({ params, user, body, set }) => {
    const normalizedNote = normalizeReviewBody(body.note);
    const result = await reportReview(user.id, params.id, params.reviewId, body.reason, normalizedNote);
    if (result === 'not_found') return status(404, { error: 'Review not found' });
    if (result === 'own_review') return status(403, { error: "You can't report your own review" });
    if (typeof result === 'object') {
      const { filed } = result;
      void notifyReviewReported({
        report: { id: filed.reportId, reason: body.reason, note: normalizedNote, createdAt: filed.createdAt },
        review: filed.review,
        author: filed.author,
        reporter: user,
        serverId: params.id,
      });
    }
    set.status = 204;
  }, {
    params: ReviewParams,
    requireUser: true,
    requireOrigin: true,
    body: t.Object({
      reason: ReportReasonSchema,
      note: t.Optional(t.Nullable(t.String({ maxLength: REPORT_NOTE_MAX }))),
    }, { additionalProperties: false }),
  });
