// ─────────────────────────────────────────────────────────────────────────────
// reportRepository.ts
// Write path for review_reports (F7), on the user-content connection only.
// The admin side of the queue lives in moderationRepository.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { serverFamilySql } from '../canonicalIdentity.js';
import type { ReportReason } from '../../../../common/models/reviews.js';

export interface FiledReport {
  reportId: string;
  createdAt: number;
  review: { id: string; rating: number; body: string | null; anonymous: boolean; createdAt: number };
  author: ReportedUser;
}

export interface ReportedUser {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}

/** `filed` is only returned for a NEW report, so a repeat click never re-notifies. */
export type ReportResult = 'duplicate' | 'not_found' | 'own_review' | { filed: FiledReport };

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
  const [review] = await userSequelize.query<{
    id: string | number; user_id: string | number; rating: number; body: string | null; anonymous: boolean;
    created_at: string | Date; discord_id: string; username: string; global_name: string | null; avatar_hash: string | null;
  }>(
    `SELECT r.id, r.user_id, r.rating, r.body, r.anonymous, r.created_at,
            u.discord_id, u.username, u.global_name, u.avatar_hash
     FROM server_reviews r JOIN users u ON u.id = r.user_id
     WHERE r.id = :reviewId AND r.removed_at IS NULL AND r.server_id IN (${serverFamilySql(':serverId')})`,
    { replacements: { reviewId, serverId }, type: QueryTypes.SELECT },
  );
  if (!review) return 'not_found';
  if (String(review.user_id) === reporterId) return 'own_review';

  const [report] = await userSequelize.query<{ id: string | number; created_at: string | Date }>(
    `INSERT INTO review_reports (review_id, reporter_id, reason, note)
     VALUES (:reviewId, :reporterId, :reason, :note)
     ON CONFLICT (review_id, reporter_id) DO NOTHING
     RETURNING id, created_at`,
    { replacements: { reviewId, reporterId, reason, note }, type: QueryTypes.SELECT },
  );
  if (!report) return 'duplicate';

  return {
    filed: {
      reportId: String(report.id),
      createdAt: new Date(report.created_at).getTime(),
      review: {
        id: String(review.id),
        rating: review.rating,
        body: review.body,
        anonymous: review.anonymous,
        createdAt: new Date(review.created_at).getTime(),
      },
      author: {
        discordId: review.discord_id,
        username: review.username,
        globalName: review.global_name,
        avatarHash: review.avatar_hash,
      },
    },
  };
}
