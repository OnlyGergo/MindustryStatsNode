// ─────────────────────────────────────────────────────────────────────────────
// moderationRepository.ts
// The admin side of reviews (F7): the report queue, and remove / restore /
// edit. On the user-content connection, since it writes; its reads are
// admin-only, so this is also the one place an anonymous review's author is
// ever selected.
//
// An admin edit deliberately leaves updated_at alone. updated_at decides which
// of a user's alias rows is "their review" (newest wins, see 33_reviews.sql),
// so bumping it on an older alias row could swap the review that counts.
//
// Owner replies (F5) are moderated here too: remove / restore only, since a
// reply has an accountable, named author who can rewrite it themselves.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes, type Transaction } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { discordAvatarUrl } from '../../api/auth/discordAvatar.js';
import { discordProfileUrl } from '../../../../common/models/auth.js';
import type {
  AdminReply, AdminReport, AdminReview, AdminReviewPage, AdminUser, ModerationView, ReportReason, ReportStatus,
} from '../../../../common/models/reviews.js';

// Fixed fragments keyed by the validated view enum; never built from raw input.
const VIEWS: Record<ModerationView, { where: string; orderBy: string }> = {
  // Oldest outstanding report first, so nothing sits at the bottom forever.
  open: {
    where: `EXISTS (SELECT 1 FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'open')`,
    orderBy: `(SELECT min(rr.created_at) FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'open') ASC, r.id ASC`,
  },
  removed: {
    where: `r.removed_at IS NOT NULL`,
    orderBy: `r.removed_at DESC, r.id DESC`,
  },
  dismissed: {
    where: `EXISTS (SELECT 1 FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'dismissed')`,
    orderBy: `(SELECT max(rr.handled_at) FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'dismissed') DESC NULLS LAST, r.id DESC`,
  },
};

interface UserColumns {
  id: string | number;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}

function userColumnsSql(alias: string, prefix: string): string {
  return `${alias}.id AS "${prefix}Id", ${alias}.discord_id AS "${prefix}DiscordId", ${alias}.username AS "${prefix}Username",
          ${alias}.global_name AS "${prefix}GlobalName", ${alias}.avatar_hash AS "${prefix}AvatarHash"`;
}

function toAdminUser(row: Record<string, unknown>, prefix: string): AdminUser | null {
  const u = {
    id: row[`${prefix}Id`],
    discordId: row[`${prefix}DiscordId`],
    username: row[`${prefix}Username`],
    globalName: row[`${prefix}GlobalName`],
    avatarHash: row[`${prefix}AvatarHash`],
  } as Partial<UserColumns>;
  if (u.id == null || !u.discordId) return null;
  return {
    id: String(u.id),
    discordId: u.discordId,
    name: u.globalName ?? u.username ?? 'Unknown',
    avatarUrl: discordAvatarUrl(u.discordId, u.avatarHash ?? null),
    profileUrl: discordProfileUrl(u.discordId),
  };
}

interface ReviewRow extends Record<string, unknown> {
  id: string | number;
  serverId: number;
  host: string;
  port: number;
  rating: number;
  body: string | null;
  anonymous: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  removedAt: string | Date | null;
  removedReason: string | null;
  replyBody: string | null;
  replyUpdatedAt: string | Date | null;
  replyRemovedAt: string | Date | null;
  replyRemovedReason: string | null;
  total: string | number;
}

interface ReportRow extends Record<string, unknown> {
  id: string | number;
  reviewId: string | number;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  createdAt: string | Date;
}

function toAdminReply(row: ReviewRow): AdminReply | null {
  const author = toAdminUser(row, 'replyAuthor');
  if (row.replyBody == null || !author) return null;
  return {
    body: row.replyBody,
    updatedAt: new Date(row.replyUpdatedAt!).getTime(),
    author,
    removedAt: row.replyRemovedAt ? new Date(row.replyRemovedAt).getTime() : null,
    removedReason: row.replyRemovedReason,
  };
}

async function selectReviews(
  where: string,
  orderBy: string,
  replacements: Record<string, unknown>,
  options: { paged?: boolean; transaction?: Transaction } = {},
): Promise<{ total: number; reviews: AdminReview[] }> {
  const rows = await userSequelize.query<ReviewRow>(
    `SELECT r.id, sc.canonical_id AS "serverId", s.host, s.port,
            r.rating, r.body, r.anonymous,
            r.created_at AS "createdAt", r.updated_at AS "updatedAt",
            r.removed_at AS "removedAt", r.removed_reason AS "removedReason",
            ${userColumnsSql('a', 'author')},
            ${userColumnsSql('m', 'remover')},
            rp.body AS "replyBody", rp.updated_at AS "replyUpdatedAt",
            rp.removed_at AS "replyRemovedAt", rp.removed_reason AS "replyRemovedReason",
            ${userColumnsSql('ra', 'replyAuthor')},
            count(*) OVER () AS total
     FROM server_reviews r
     JOIN users a ON a.id = r.user_id
     JOIN servers s ON s.id = r.server_id
     JOIN server_canonical sc ON sc.server_id = r.server_id
     LEFT JOIN users m ON m.id = r.removed_by
     LEFT JOIN review_replies rp ON rp.review_id = r.id
     LEFT JOIN users ra ON ra.id = rp.author_user_id
     WHERE ${where}
     ORDER BY ${orderBy}
     ${options.paged ? 'LIMIT :limit OFFSET :offset' : ''}`,
    { replacements, type: QueryTypes.SELECT, transaction: options.transaction },
  );
  if (rows.length === 0) return { total: 0, reviews: [] };

  const reportRows = await userSequelize.query<ReportRow>(
    `SELECT rr.id, rr.review_id AS "reviewId", rr.reason, rr.note, rr.status, rr.created_at AS "createdAt",
            ${userColumnsSql('u', 'reporter')}
     FROM review_reports rr
     JOIN users u ON u.id = rr.reporter_id
     WHERE rr.review_id IN (:ids)
     ORDER BY rr.created_at ASC, rr.id ASC`,
    { replacements: { ids: rows.map((r) => r.id) }, type: QueryTypes.SELECT, transaction: options.transaction },
  );

  const reportsByReview = new Map<string, AdminReport[]>();
  for (const row of reportRows) {
    const list = reportsByReview.get(String(row.reviewId)) ?? [];
    list.push({
      id: String(row.id),
      reason: row.reason,
      note: row.note,
      status: row.status,
      createdAt: new Date(row.createdAt).getTime(),
      reporter: toAdminUser(row, 'reporter')!,
    });
    reportsByReview.set(String(row.reviewId), list);
  }

  return {
    total: parseInt(String(rows[0]!.total), 10),
    reviews: rows.map((row) => ({
      id: String(row.id),
      serverId: row.serverId,
      serverAddress: `${row.host}:${row.port}`,
      rating: row.rating,
      body: row.body,
      anonymous: row.anonymous,
      createdAt: new Date(row.createdAt).getTime(),
      updatedAt: new Date(row.updatedAt).getTime(),
      author: toAdminUser(row, 'author')!,
      removedAt: row.removedAt ? new Date(row.removedAt).getTime() : null,
      removedReason: row.removedReason,
      removedBy: toAdminUser(row, 'remover'),
      reply: toAdminReply(row),
      reports: reportsByReview.get(String(row.id)) ?? [],
    })),
  };
}

export async function getModerationQueue(view: ModerationView, page: number, perPage: number): Promise<AdminReviewPage> {
  const { where, orderBy } = VIEWS[view];
  const { total, reviews } = await selectReviews(where, orderBy, { limit: perPage, offset: (page - 1) * perPage }, { paged: true });
  return { total, page, perPage, reviews };
}

export type ModerationAction =
  | { action: 'remove'; reason: string }
  | { action: 'restore' }
  | { action: 'edit'; body: string | null };

/** Applies `change` to review `reviewId`; null if there is no such review. */
export async function moderateReview(reviewId: string, adminId: string, change: ModerationAction): Promise<AdminReview | null> {
  return userSequelize.transaction(async (transaction) => {
    let sql: string;
    let replacements: Record<string, unknown> = { reviewId, adminId };
    switch (change.action) {
      case 'remove':
        // A second remove only rewrites the reason; the original time and admin stand.
        sql = `UPDATE server_reviews
               SET removed_reason = :reason,
                   removed_by = CASE WHEN removed_at IS NULL THEN CAST(:adminId AS bigint) ELSE removed_by END,
                   removed_at = COALESCE(removed_at, now())
               WHERE id = :reviewId RETURNING id`;
        replacements = { ...replacements, reason: change.reason };
        break;
      case 'restore':
        sql = `UPDATE server_reviews SET removed_at = NULL, removed_reason = NULL, removed_by = NULL
               WHERE id = :reviewId RETURNING id`;
        break;
      case 'edit':
        sql = `UPDATE server_reviews SET body = :body WHERE id = :reviewId RETURNING id`;
        replacements = { ...replacements, body: change.body };
        break;
    }

    const updated = await userSequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
    if (updated.length === 0) return null;

    // Removing or editing is acting on the reports; a restore leaves their history alone.
    if (change.action !== 'restore') {
      await userSequelize.query(
        `UPDATE review_reports SET status = 'actioned', handled_by = :adminId, handled_at = now()
         WHERE review_id = :reviewId AND status = 'open'`,
        { replacements: { reviewId, adminId }, type: QueryTypes.UPDATE, transaction },
      );
    }

    const { reviews } = await selectReviews('r.id = :reviewId', 'r.id', { reviewId }, { transaction });
    return reviews[0] ?? null;
  });
}

/** Dismisses every open report on `reviewId`, keeping the review as it is. Returns how many were open. */
export async function dismissReports(reviewId: string, adminId: string): Promise<number> {
  const rows = await userSequelize.query(
    `UPDATE review_reports SET status = 'dismissed', handled_by = :adminId, handled_at = now()
     WHERE review_id = :reviewId AND status = 'open'
     RETURNING id`,
    { replacements: { reviewId, adminId }, type: QueryTypes.SELECT },
  );
  return rows.length;
}

export type ReplyModeration = { action: 'remove'; reason: string } | { action: 'restore' };

/** Removes or restores the reply on `reviewId`; null if the review has no reply. Reports are about the review, so they're left alone. */
export async function moderateReply(reviewId: string, adminId: string, change: ReplyModeration): Promise<AdminReview | null> {
  return userSequelize.transaction(async (transaction) => {
    const sql = change.action === 'remove'
      ? `UPDATE review_replies
         SET removed_reason = :reason,
             removed_by = CASE WHEN removed_at IS NULL THEN CAST(:adminId AS bigint) ELSE removed_by END,
             removed_at = COALESCE(removed_at, now())
         WHERE review_id = :reviewId RETURNING review_id`
      : `UPDATE review_replies SET removed_at = NULL, removed_reason = NULL, removed_by = NULL
         WHERE review_id = :reviewId RETURNING review_id`;
    const updated = await userSequelize.query(sql, {
      replacements: { reviewId, adminId, reason: change.action === 'remove' ? change.reason : null },
      type: QueryTypes.SELECT,
      transaction,
    });
    if (updated.length === 0) return null;

    const { reviews } = await selectReviews('r.id = :reviewId', 'r.id', { reviewId }, { transaction });
    return reviews[0] ?? null;
  });
}
