// ─────────────────────────────────────────────────────────────────────────────
// reviewRepository.ts
// Write path for server_reviews, on the user-content connection (userSequelize)
// ONLY -- this table is user content, same split as userRepository.ts.
//
// One review per user per FAMILY, not per raw server_id: after a merge, a
// user can hold a review on each alias of the same server. upsertReview
// resolves that down to a single row every time it runs, so the count never
// grows without bound, but it deliberately does NOT rely on a DB constraint
// to do it -- see the header of 33_reviews.sql for why.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { serverFamilySql } from '../canonicalIdentity.js';
import type { MyReview } from '../../../../common/models/reviews.js';

export interface ReviewInput {
  rating: number;
  body: string | null;
  anonymous: boolean;
}

export type UpsertReviewResult =
  | { kind: 'not_found' }
  | { kind: 'removed' }
  | { kind: 'ok'; review: MyReview };

const REVIEW_COLUMNS = `id, rating, body, anonymous,
       created_at AS "createdAt", updated_at AS "updatedAt", removed_at AS "removedAt"`;

interface ReviewRow {
  id: number | string;
  rating: number;
  body: string | null;
  anonymous: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  removedAt: string | Date | null;
}

function toMyReview(row: ReviewRow): MyReview {
  return {
    id: String(row.id),
    rating: row.rating,
    body: row.body,
    anonymous: row.anonymous,
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
    removed: row.removedAt != null,
  };
}

/**
 * Full-replace upsert: the caller's review of `serverId`'s family becomes
 * exactly `input`, and `serverId` becomes the row's new server_id (repointed
 * to whichever alias the user was looking at when they submitted).
 */
export async function upsertReview(
  userId: string,
  serverId: number,
  input: ReviewInput,
): Promise<UpsertReviewResult> {
  return userSequelize.transaction(async (transaction) => {
    // Nothing else in the codebase needs an advisory lock -- every other
    // write either has a natural unique key to upsert against (users.discord_id)
    // or doesn't need read-then-write at all. Here, `FOR UPDATE` alone can't
    // stop two concurrent first-time PUTs from both taking the "no existing
    // row" branch and inserting: there's no row yet for FOR UPDATE to lock.
    // The lock is keyed on the user, not the server, so it also serialises a
    // user's concurrent PUTs across different aliases of the same family.
    await userSequelize.query(`SELECT pg_advisory_xact_lock(CAST(:userId AS bigint))`, {
      replacements: { userId },
      type: QueryTypes.SELECT,
      transaction,
    });

    const family = await userSequelize.query(`SELECT 1 FROM server_canonical WHERE server_id = :serverId`, {
      replacements: { serverId },
      type: QueryTypes.SELECT,
      transaction,
    });
    if (family.length === 0) return { kind: 'not_found' };

    // Every row this user has anywhere in the family, newest first. More
    // than one is normal after a merge (one per alias); the newest is "the
    // user's review of this server", same row the read path's DISTINCT ON picks.
    const existing = await userSequelize.query<{ id: number | string; removed_at: string | Date | null }>(
      `SELECT id, removed_at FROM server_reviews
       WHERE user_id = :userId AND server_id IN (${serverFamilySql(':serverId')})
       ORDER BY updated_at DESC, id DESC
       FOR UPDATE`,
      { replacements: { userId, serverId }, type: QueryTypes.SELECT, transaction },
    );

    const [newest, ...rest] = existing;

    // A moderator's removal must not be bypassable by just submitting again.
    if (newest && newest.removed_at != null) return { kind: 'removed' };

    if (newest) {
      const [updated] = await userSequelize.query<ReviewRow>(
        `UPDATE server_reviews
         SET server_id = :serverId, rating = :rating, body = :body, anonymous = :anonymous, updated_at = now()
         WHERE id = :id
         RETURNING ${REVIEW_COLUMNS}`,
        {
          replacements: { serverId, rating: input.rating, body: input.body, anonymous: input.anonymous, id: newest.id },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      // Superseded duplicates from a merge -- everything else this user had
      // in the family, now folded into the row we just updated. Removed rows
      // are left alone: they're the moderation record, not a duplicate.
      const otherIds = rest.map((r) => r.id);
      if (otherIds.length > 0) {
        // IN (:otherIds), not `= ANY(:otherIds)`: Sequelize's named-replacement
        // array substitution inlines a bare comma list ("ANY(1, 2)"), which
        // ANY() can't parse -- IN(...) is the form that actually works here.
        await userSequelize.query(`DELETE FROM server_reviews WHERE id IN (:otherIds) AND removed_at IS NULL`, {
          replacements: { otherIds },
          type: QueryTypes.DELETE,
          transaction,
        });
      }

      return { kind: 'ok', review: toMyReview(updated!) };
    }

    const [inserted] = await userSequelize.query<ReviewRow>(
      `INSERT INTO server_reviews (user_id, server_id, rating, body, anonymous)
       VALUES (:userId, :serverId, :rating, :body, :anonymous)
       RETURNING ${REVIEW_COLUMNS}`,
      {
        replacements: { userId, serverId, rating: input.rating, body: input.body, anonymous: input.anonymous },
        type: QueryTypes.SELECT,
        transaction,
      },
    );

    return { kind: 'ok', review: toMyReview(inserted!) };
  });
}

/** The caller's review of `serverId`'s family, including a removed one (removed: true). */
export async function getMyReview(userId: string, serverId: number): Promise<MyReview | null> {
  // Per-user, so this is safe to read from userSequelize too, same as
  // sessionRepository/userRepository -- there's no cross-user aggregation here.
  const rows = await userSequelize.query<ReviewRow>(
    `SELECT ${REVIEW_COLUMNS} FROM server_reviews
     WHERE user_id = :userId AND server_id IN (${serverFamilySql(':serverId')})
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    { replacements: { userId, serverId }, type: QueryTypes.SELECT },
  );

  const row = rows[0];
  return row ? toMyReview(row) : null;
}

/** Erases every row this user has in the family, removed ones included -- a user may always delete their own content. */
export async function deleteMyReview(userId: string, serverId: number): Promise<number> {
  // RETURNING id + QueryTypes.SELECT rather than QueryTypes.DELETE: pg's
  // driver doesn't surface a row count through Sequelize's DELETE query type
  // (it comes back as an empty array), so the deleted ids are counted instead.
  const rows = await userSequelize.query<{ id: number | string }>(
    `DELETE FROM server_reviews WHERE user_id = :userId AND server_id IN (${serverFamilySql(':serverId')}) RETURNING id`,
    { replacements: { userId, serverId }, type: QueryTypes.SELECT },
  );
  return rows.length;
}
