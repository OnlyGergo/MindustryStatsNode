// ─────────────────────────────────────────────────────────────────────────────
// adminMergeRepository.ts
// Read side of the admin merge page: suggested merges, existing merged
// families, and the full family list the manual picker searches. Writes live in
// user/serverMergeRepository.ts.
//
// Everything here works on FAMILIES (canonical ids), never raw rows, since a
// merge always folds a whole family into another.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { canonicalJoin, LIVE_MEMBER_SQL } from './canonicalIdentity.js';
import type { MergedFamily, MergeFamily, MergeReason, MergeSuggestion } from '../../../common/models/admin.js';

/**
 * Plenty: the page filters and searches client side, so a tight cap would hide
 * the pairs a filter is looking for. The WHERE below keeps this well short of n².
 */
const SUGGESTION_LIMIT = 2000;

/** "Same day" = the newer family appeared within this long either side of the older one's last sighting. */
const SAME_DAY_SECONDS = 24 * 60 * 60;

const ms = (d: Date | string | null): number | null => (d == null ? null : new Date(d).getTime());

/** Newest open MOTD (name + description) across each family, same rule as getAllServerElements. */
const FAMILY_NAMES_SQL = `
    SELECT DISTINCT ON (sc.canonical_id)
           sc.canonical_id,
           r.server_name AS name,
           r.description
    FROM server_motds_history h
    ${canonicalJoin('sc', 'h')}
    JOIN server_motds_registry r ON h.motd_id = r.id
    WHERE h.valid_to IS NULL
    ORDER BY sc.canonical_id, h.valid_from DESC
`;

/** Lowercased, Mindustry colour tags and whitespace stripped, '' as NULL: what "same" compares. */
const normSql = (col: string) =>
    `NULLIF(lower(regexp_replace(regexp_replace(${col}, '\\[[^\\]]*\\]', '', 'g'), '\\s+', '', 'g')), '')`;

/**
 * One row per family: live address, display name + description, the span it
 * was observed over, and the normalised name/description the suggestions match on.
 */
function familiesSql(familyFilter = 'TRUE'): string {
    return `
        fam AS (
            SELECT sc.canonical_id AS id,
                   MIN(s.created_at) AS first_seen,
                   MAX(s.last_seen)  AS last_seen,
                   COUNT(*)          AS member_count
            FROM server_canonical sc
            JOIN servers s ON s.id = sc.server_id
            WHERE ${familyFilter}
            GROUP BY sc.canonical_id
        ),
        live_members AS (${LIVE_MEMBER_SQL}),
        names AS (${FAMILY_NAMES_SQL}),
        f AS (
            SELECT fam.id, fam.first_seen, fam.last_seen, fam.member_count,
                   lm.host, lm.port, n.name, n.description,
                   ${normSql('n.name')} AS norm,
                   ${normSql('n.description')} AS desc_norm
            FROM fam
            JOIN live_members lm ON lm.canonical_id = fam.id
            LEFT JOIN names n    ON n.canonical_id = fam.id
        )`;
}

const FAMILY_COLUMNS = ['id', 'name', 'description', 'host', 'port', 'first_seen', 'last_seen', 'member_count'];

function toFamily(prefix: string, row: Record<string, any>): MergeFamily {
    return {
        id: Number(row[`${prefix}id`]),
        name: row[`${prefix}name`] ?? null,
        description: row[`${prefix}description`] ?? null,
        host: row[`${prefix}host`],
        port: Number(row[`${prefix}port`]),
        firstSeen: ms(row[`${prefix}first_seen`]),
        lastSeen: ms(row[`${prefix}last_seen`]),
        memberCount: Number(row[`${prefix}member_count`]),
    };
}

/**
 * Pairs of families that look like the same server: the same name, or a
 * shared host or description where the two were never online together or
 * handed over within a day. A shared host or description alone is too weak —
 * hosting providers run dozens of servers on one IP, and a network gives all
 * its servers one description — so those only count with the timing to back
 * them. Every reason is returned as a tag; the page filters on them.
 * The older family is always the target, since it keeps the root anyway.
 */
export async function getMergeSuggestions(): Promise<MergeSuggestion[]> {
    const cols = (alias: string) => FAMILY_COLUMNS.map(c => `${alias}.${c} AS ${alias}_${c}`).join(', ');

    const rows: any[] = await sequelize.query(`
        WITH ${familiesSql()},
        candidates AS (
            -- Separate equijoins rather than one OR'd join, so each can hash.
            SELECT a.id AS a_id, b.id AS b_id FROM f a JOIN f b ON a.norm = b.norm AND a.id < b.id
            UNION
            SELECT a.id, b.id FROM f a JOIN f b ON a.host = b.host AND a.id < b.id
            UNION
            SELECT a.id, b.id FROM f a JOIN f b ON a.desc_norm = b.desc_norm AND a.id < b.id
        ),
        ordered AS (
            -- target = the older family (it keeps the root), source = the newer one
            SELECT CASE WHEN b.first_seen IS NULL OR a.first_seen <= b.first_seen THEN a.id ELSE b.id END AS t_id,
                   CASE WHEN b.first_seen IS NULL OR a.first_seen <= b.first_seen THEN b.id ELSE a.id END AS s_id
            FROM candidates c
            JOIN f a ON a.id = c.a_id
            JOIN f b ON b.id = c.b_id
            WHERE NOT EXISTS (
                SELECT 1 FROM server_merge_dismissals d
                WHERE d.server_a = c.a_id AND d.server_b = c.b_id
            )
        ),
        pairs AS (
            SELECT o.t_id, o.s_id,
                   COALESCE(t.norm = s.norm, FALSE)           AS same_name,
                   COALESCE(t.desc_norm = s.desc_norm, FALSE) AS same_motd,
                   t.host = s.host                            AS same_host,
                   COALESCE(t.last_seen < s.first_seen OR s.last_seen < t.first_seen, FALSE) AS disjoint,
                   -- The handover: the newer one turned up within a day of the older one's
                   -- last sighting, on either side (a short gap or a short overlap).
                   COALESCE(abs(EXTRACT(EPOCH FROM (s.first_seen - t.last_seen))) <= ${SAME_DAY_SECONDS}, FALSE) AS same_day
            FROM ordered o
            JOIN f t ON t.id = o.t_id
            JOIN f s ON s.id = o.s_id
        )
        SELECT ${cols('t')}, ${cols('s')}, p.same_name, p.same_motd, p.same_host, p.disjoint, p.same_day,
               (CASE WHEN p.same_name THEN 3 ELSE 0 END
              + CASE WHEN p.same_day  THEN 3 ELSE 0 END
              + CASE WHEN p.same_motd THEN 2 ELSE 0 END
              + CASE WHEN p.same_host THEN 2 ELSE 0 END
              + CASE WHEN p.disjoint  THEN 1 ELSE 0 END) AS score
        FROM pairs p
        JOIN f t ON t.id = p.t_id
        JOIN f s ON s.id = p.s_id
        WHERE p.same_name OR ((p.same_host OR p.same_motd) AND (p.disjoint OR p.same_day))
        ORDER BY score DESC, GREATEST(t.last_seen, s.last_seen) DESC NULLS LAST
        LIMIT :limit
    `, { replacements: { limit: SUGGESTION_LIMIT }, type: QueryTypes.SELECT });

    return rows.map(row => {
        const reasons: MergeReason[] = [];
        if (row.same_name) reasons.push('same_name');
        if (row.same_day) reasons.push('same_day');
        if (row.same_motd) reasons.push('same_motd');
        if (row.same_host) reasons.push('same_host');
        if (row.disjoint) reasons.push('disjoint');
        return {
            target: toFamily('t_', row),
            source: toFamily('s_', row),
            reasons,
            score: Number(row.score),
        };
    });
}

/** Every family, newest sighting first: what the manual merge picker searches client side. */
export async function getAllMergeFamilies(): Promise<MergeFamily[]> {
    const rows: any[] = await sequelize.query(`
        WITH ${familiesSql()}
        SELECT ${FAMILY_COLUMNS.join(', ')} FROM f
        ORDER BY last_seen DESC NULLS LAST, id DESC
    `, { type: QueryTypes.SELECT });
    return rows.map(row => toFamily('', row));
}

/** Every family with more than one member, i.e. every merge currently in effect. */
export async function getMergedFamilies(): Promise<MergedFamily[]> {
    const rows: any[] = await sequelize.query(`
        WITH merged AS (
            SELECT canonical_id FROM server_canonical GROUP BY canonical_id HAVING COUNT(*) > 1
        ),
        names AS (${FAMILY_NAMES_SQL})
        SELECT sc.canonical_id, n.name, n.description, s.id, s.host, s.port, s.created_at, s.last_seen, s.retired_at
        FROM merged m
        JOIN server_canonical sc ON sc.canonical_id = m.canonical_id
        JOIN servers s           ON s.id = sc.server_id
        LEFT JOIN names n        ON n.canonical_id = m.canonical_id
        ORDER BY sc.canonical_id, s.created_at, s.id
    `, { type: QueryTypes.SELECT });

    const families = new Map<number, MergedFamily>();
    for (const row of rows) {
        const id = Number(row.canonical_id);
        let family = families.get(id);
        if (!family) {
            family = { id, name: row.name ?? null, description: row.description ?? null, members: [] };
            families.set(id, family);
        }
        family.members.push({
            id: Number(row.id),
            host: row.host,
            port: Number(row.port),
            createdAt: ms(row.created_at),
            lastSeen: ms(row.last_seen),
            retiredAt: ms(row.retired_at),
            isRoot: Number(row.id) === id,
        });
    }
    return [...families.values()];
}
