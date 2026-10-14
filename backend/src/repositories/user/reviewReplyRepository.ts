// ─────────────────────────────────────────────────────────────────────────────
// reviewReplyRepository.ts
// Write path for review_replies (F5), on the user-content connection
// (userSequelize) ONLY. One reply per review, keyed on review_id, so a second
// reply from any manager of the server replaces the first.
//
// The caller (routes/reviews.ts) has already checked canManageServer; every
// statement here additionally scopes the review to the family of the server
// in the URL, so a manager of server A can't reply to a review on server B by
// putting B's review id under A's path.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { serverFamilySql } from '../canonicalIdentity.js';

export type UpsertReplyResult =
  | { kind: 'not_found' }
  | { kind: 'removed' }
  | { kind: 'ok' };

/**
 * Inserts or replaces the reply to `reviewId`. The review must be in
 * `serverId`'s family and not removed by a moderator; a reply a moderator
 * removed is not overwritten.
 */
export async function upsertReply(
  userId: string,
  serverId: number,
  reviewId: string,
  body: string,
): Promise<UpsertReplyResult> {
  // One statement, so no transaction or lock: the review check and the upsert
  // see the same snapshot, and ON CONFLICT serialises concurrent replies on
  // the review_id primary key.
  const rows = await userSequelize.query<{ review_id: string }>(
    `INSERT INTO review_replies (review_id, author_user_id, body)
     SELECT r.id, CAST(:userId AS bigint), :body
     FROM server_reviews r
     WHERE r.id = CAST(:reviewId AS bigint)
       AND r.server_id IN (${serverFamilySql(':serverId')})
       AND r.removed_at IS NULL
     ON CONFLICT (review_id) DO UPDATE
       SET body = EXCLUDED.body, author_user_id = EXCLUDED.author_user_id, updated_at = now()
       WHERE review_replies.removed_at IS NULL
     RETURNING review_id`,
    { replacements: { userId, serverId, reviewId, body }, type: QueryTypes.SELECT },
  );
  if (rows.length > 0) return { kind: 'ok' };

  // Nothing written: either the review isn't there (or isn't this family's,
  // or was removed), or its reply was removed. Only the latter is a 403.
  const [removed] = await userSequelize.query<{ removed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM review_replies rp
       JOIN server_reviews r ON r.id = rp.review_id
       WHERE rp.review_id = CAST(:reviewId AS bigint)
         AND r.server_id IN (${serverFamilySql(':serverId')})
         AND r.removed_at IS NULL
         AND rp.removed_at IS NOT NULL
     ) AS removed`,
    { replacements: { serverId, reviewId }, type: QueryTypes.SELECT },
  );
  return removed?.removed ? { kind: 'removed' } : { kind: 'not_found' };
}

/** Deletes the reply to `reviewId`, if that review is in `serverId`'s family. Returns rows deleted. */
export async function deleteReply(serverId: number, reviewId: string): Promise<number> {
  // RETURNING + SELECT for the count, same reason as deleteMyReview.
  const rows = await userSequelize.query<{ review_id: string }>(
    `DELETE FROM review_replies
     WHERE review_id = CAST(:reviewId AS bigint)
       AND review_id IN (SELECT r.id FROM server_reviews r WHERE r.server_id IN (${serverFamilySql(':serverId')}))
     RETURNING review_id`,
    { replacements: { serverId, reviewId }, type: QueryTypes.SELECT },
  );
  return rows.length;
}
