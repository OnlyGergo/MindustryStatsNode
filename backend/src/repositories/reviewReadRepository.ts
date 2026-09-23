// ─────────────────────────────────────────────────────────────────────────────
// reviewReadRepository.ts
// Public reads of server_reviews, on the read connection (sequelize) -- this
// is a public-facing read, same split as every other repository outside
// repositories/user/*.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';
import { serverFamilySql } from './canonicalIdentity.js';
import { discordAvatarUrl } from '../api/auth/discordAvatar.js';
import { discordProfileUrl } from '../../../common/models/auth.js';
import { aspectSummaryColumnsSql, rowToAspectSummaries, type AspectSummaryColumnRow } from './reviewAspects.js';
import type { PublicReview, ReviewPage, ReviewSort, ReviewSummary } from '../../../common/models/reviews.js';

/**
 * One review per user per family: a merge can leave a user with a review on
 * each alias, and only their newest one counts. Dedupe FIRST, then drop
 * removed, so an older surviving alias review cannot resurface a moderated
 * one. Written once as a function (not a constant) since it's parameterised
 * on the placeholder name the caller's own replacements use.
 */
function familyReviewsCte(serverIdParam: string): string {
  return `
    family_reviews AS (
        SELECT * FROM (
            SELECT DISTINCT ON (r.user_id) r.*
            FROM server_reviews r
            WHERE r.server_id IN (${serverFamilySql(serverIdParam)})
            ORDER BY r.user_id, r.updated_at DESC, r.id DESC
        ) newest
        WHERE newest.removed_at IS NULL
    )
  `;
}

export async function getReviewSummary(serverId: number): Promise<ReviewSummary> {
  const [row] = await sequelize.query<{
    count: number;
    average: number | null;
    r1: number; r2: number; r3: number; r4: number; r5: number;
  } & AspectSummaryColumnRow>(
    `WITH ${familyReviewsCte(':serverId')}
     SELECT
       count(*)::int          AS count,
       avg(rating)::float8    AS average,
       count(*) FILTER (WHERE rating = 1)::int AS r1,
       count(*) FILTER (WHERE rating = 2)::int AS r2,
       count(*) FILTER (WHERE rating = 3)::int AS r3,
       count(*) FILTER (WHERE rating = 4)::int AS r4,
       count(*) FILTER (WHERE rating = 5)::int AS r5,
       ${aspectSummaryColumnsSql()}
     FROM family_reviews`,
    { replacements: { serverId }, type: QueryTypes.SELECT },
  );

  return {
    count: row?.count ?? 0,
    average: row?.average ?? null,
    histogram: [row?.r1 ?? 0, row?.r2 ?? 0, row?.r3 ?? 0, row?.r4 ?? 0, row?.r5 ?? 0],
    // Same aggregate query, so a missing row only happens if the query itself
    // errored -- rowToAspectSummaries' own ?? fallbacks cover that case too.
    aspects: rowToAspectSummaries(row ?? ({} as AspectSummaryColumnRow)),
  };
}

// Picked from this fixed map, keyed by the already-validated ReviewSort enum
// -- never build ORDER BY from raw user input.
const SORT_ORDER_BY: Record<ReviewSort, string> = {
  newest: 'fr.updated_at DESC, fr.id DESC',
  highest: 'fr.rating DESC, fr.updated_at DESC, fr.id DESC',
  lowest: 'fr.rating ASC, fr.updated_at DESC, fr.id DESC',
};

interface ReviewPageRow {
  id: number | string;
  rating: number;
  body: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  discordId: string | null;
  username: string | null;
  globalName: string | null;
  avatarHash: string | null;
  total: string | number;
}

export async function getReviewPage(
  serverId: number,
  page: number,
  perPage: number,
  sort: ReviewSort,
): Promise<ReviewPage> {
  const offset = (page - 1) * perPage;
  const orderBy = SORT_ORDER_BY[sort];

  const rows = await sequelize.query<ReviewPageRow>(
    `WITH ${familyReviewsCte(':serverId')}
     SELECT
       fr.id, fr.rating, fr.body,
       fr.created_at AS "createdAt", fr.updated_at AS "updatedAt",
       -- Anonymity enforced in SQL, not in the mapper below: an anonymous
       -- review's user_id is never selected, and every identifying column
       -- collapses to NULL right here.
       CASE WHEN fr.anonymous THEN NULL ELSE u.discord_id   END AS "discordId",
       CASE WHEN fr.anonymous THEN NULL ELSE u.username     END AS username,
       CASE WHEN fr.anonymous THEN NULL ELSE u.global_name   END AS "globalName",
       CASE WHEN fr.anonymous THEN NULL ELSE u.avatar_hash   END AS "avatarHash",
       count(*) OVER () AS total
     FROM family_reviews fr
     LEFT JOIN users u ON u.id = fr.user_id
     ORDER BY ${orderBy}
     LIMIT :perPage OFFSET :offset`,
    { replacements: { serverId, perPage, offset }, type: QueryTypes.SELECT },
  );

  // count(*) OVER () rides on the page's own rows, so a page past the end has
  // none to carry it; only then is the total worth a second query.
  let total = rows.length > 0 ? parseInt(String(rows[0]!.total), 10) : 0;
  if (rows.length === 0 && page > 1) {
    const [countRow] = await sequelize.query<{ total: number }>(
      `WITH ${familyReviewsCte(':serverId')} SELECT count(*)::int AS total FROM family_reviews`,
      { replacements: { serverId }, type: QueryTypes.SELECT },
    );
    total = countRow?.total ?? 0;
  }

  const reviews: PublicReview[] = rows.map((row) => ({
    id: String(row.id),
    rating: row.rating,
    body: row.body,
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
    author: row.discordId
      ? {
          name: row.globalName ?? row.username ?? 'Unknown',
          avatarUrl: discordAvatarUrl(row.discordId, row.avatarHash),
          profileUrl: discordProfileUrl(row.discordId),
        }
      : null,
  }));

  return { total, page, perPage, reviews };
}
