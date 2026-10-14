// ─────────────────────────────────────────────────────────────────────────────
// reportRepository.ts
// Write path for review_reports (F7), on the user-content connection only.
// The admin side of the queue lives in moderationRepository.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { serverFamilySql } from '../canonicalIdentity.js';
import type { ReportReason } from '../../../../common/models/reviews.js';

export type ReportResult = 'ok' | 'not_found' | 'own_review';

/**
 * Files `reporterId`'s report against `reviewId`, which must be a live review
 * in `serverId`'s family: the route is nested under the server, so a review id
 * from some other server is a 404 rather than a report filed under the wrong page.
 * Reporting the same review twice is a silent no-op.
 */
export async function reportReview(
  reporterId: string,
  serverId: number,
  reviewId: string,
  reason: ReportReason,
  note: string | null,
): Promise<ReportResult> {
  const [review] = await userSequelize.query<{ user_id: string | number }>(
    `SELECT user_id FROM server_reviews
     WHERE id = :reviewId AND removed_at IS NULL AND server_id IN (${serverFamilySql(':serverId')})`,
    { replacements: { reviewId, serverId }, type: QueryTypes.SELECT },
  );
  if (!review) return 'not_found';
  if (String(review.user_id) === reporterId) return 'own_review';

  await userSequelize.query(
    `INSERT INTO review_reports (review_id, reporter_id, reason, note)
     VALUES (:reviewId, :reporterId, :reason, :note)
     ON CONFLICT (review_id, reporter_id) DO NOTHING`,
    { replacements: { reviewId, reporterId, reason, note }, type: QueryTypes.INSERT },
  );
  return 'ok';
}
