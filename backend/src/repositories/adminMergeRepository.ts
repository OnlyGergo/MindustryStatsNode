// ─────────────────────────────────────────────────────────────────────────────
// adminMergeRepository.ts
// Read side of the admin merge page: suggested merges, existing merged
// families, and single-family lookups. Writes live in
// user/serverMergeRepository.ts.
//
// Everything here works on FAMILIES (canonical ids), never raw rows, since a
// merge always folds a whole family into another.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { canonicalJoin, canonicalOfSql, LIVE_MEMBER_SQL } from './canonicalIdentity.js';
import type { MergedFamily, MergeFamily, MergeReason, MergeSuggestion } from '../../../common/models/admin.js';

const SUGGESTION_LIMIT = 100;

const ms = (d: Date | string | null): number | null => (d == null ? null : new Date(d).getTime());

/** Newest open MOTD name across each family, same rule as getAllServerElements. */
const FAMILY_NAMES_SQL = `
    SELECT DISTINCT ON (sc.canonical_id)
           sc.canonical_id,
           r.server_name AS name
    FROM server_motds_history h
    ${canonicalJoin('sc', 'h')}
    JOIN server_motds_registry r ON h.motd_id = r.id
    WHERE h.valid_to IS NULL
    ORDER BY sc.canonical_id, h.valid_from DESC
`;

/**
 * One row per family: live address, display name, the span it was observed
 * over, and `norm`, the name with Mindustry colour tags and whitespace
 * stripped, which is what "same name" compares.
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
                   lm.host, lm.port, n.name,
                   NULLIF(lower(regexp_replace(regexp_replace(n.name, '\\[[^\\]]*\\]', '', 'g'), '\\s+', '', 'g')), '') AS norm
            FROM fam
            JOIN live_members lm ON lm.canonical_id = fam.id
            LEFT JOIN names n    ON n.canonical_id = fam.id
        )`;
}

interface FamilyRow {
    id: number;
    name: string | null;
    host: string;
    port: number;
    first_seen: Date | null;
    last_seen: Date | null;
    member_count: number | string;
}

function toFamily(prefix: string, row: Record<string, any>): MergeFamily {
    return {
        id: Number(row[`${prefix}id`]),
        name: row[`${prefix}name`] ?? null,
        host: row[`${prefix}host`],
        port: Number(row[`${prefix}port`]),
        firstSeen: ms(row[`${prefix}first_seen`]),
        lastSeen: ms(row[`${prefix}last_seen`]),
        memberCount: Number(row[`${prefix}member_count`]),
    };
}

/**
 * Pairs of families that look like the same server: the same name, or the
 * same host where the two were never online at the same time (a port move).
 * A shared host alone is too weak — hosting providers run dozens of servers
 * on one IP — so a same-host pair that overlapped in time is not suggested.
 * The older family is always the target, since it keeps the root anyway.
 */
export async function getMergeSuggestions(): Promise<MergeSuggestion[]> {
    const cols = (alias: string) =>
        ['id', 'name', 'host', 'port', 'first_seen', 'last_seen', 'member_count']
            .map(c => `${alias}.${c} AS ${alias}_${c}`).join(', ');

    const rows: any[] = await sequelize.query(`
        WITH ${familiesSql()},
        candidates AS (
            -- Two equijoins rather than one OR'd join, so each can hash.
            SELECT a.id AS a_id, b.id AS b_id FROM f a JOIN f b ON a.norm = b.norm AND a.id < b.id
            UNION
            SELECT a.id, b.id FROM f a JOIN f b ON a.host = b.host AND a.id < b.id
        ),
        pairs AS (
            -- target = the older family (it keeps the root), source = the newer one
            SELECT CASE WHEN b.first_seen IS NULL OR a.first_seen <= b.first_seen THEN a.id ELSE b.id END AS t_id,
                   CASE WHEN b.first_seen IS NULL OR a.first_seen <= b.first_seen THEN b.id ELSE a.id END AS s_id,
                   COALESCE(a.norm = b.norm, FALSE) AS same_name,
                   a.host = b.host                  AS same_host,
                   COALESCE(a.last_seen < b.first_seen OR b.last_seen < a.first_seen, FALSE) AS disjoint
            FROM candidates c
            JOIN f a ON a.id = c.a_id
            JOIN f b ON b.id = c.b_id
            WHERE NOT EXISTS (
                SELECT 1 FROM server_merge_dismissals d
                WHERE d.server_a = c.a_id AND d.server_b = c.b_id
            )
        )
        SELECT ${cols('t')}, ${cols('s')}, p.same_name, p.same_host, p.disjoint,
               (CASE WHEN p.same_name THEN 3 ELSE 0 END
              + CASE WHEN p.same_host THEN 2 ELSE 0 END
              + CASE WHEN p.disjoint  THEN 2 ELSE 0 END) AS score
        FROM pairs p
        JOIN f t ON t.id = p.t_id
        JOIN f s ON s.id = p.s_id
        WHERE p.same_name OR p.disjoint
        ORDER BY score DESC, GREATEST(t.last_seen, s.last_seen) DESC NULLS LAST
        LIMIT :limit
    `, { replacements: { limit: SUGGESTION_LIMIT }, type: QueryTypes.SELECT });

    return rows.map(row => {
        const reasons: MergeReason[] = [];
        if (row.same_name) reasons.push('same_name');
        if (row.same_host) reasons.push('same_host');
        return {
            target: toFamily('t_', row),
            source: toFamily('s_', row),
            reasons,
            disjoint: row.disjoint,
            score: Number(row.score),
        };
    });
}

/** Summary of the family `serverId` belongs to (any member id works), or null. */
export async function getMergeFamily(serverId: number): Promise<MergeFamily | null> {
    const rows = await sequelize.query<FamilyRow>(`
        WITH ${familiesSql(`sc.canonical_id = ${canonicalOfSql(':serverId')}`)}
        SELECT id, name, host, port, first_seen, last_seen, member_count FROM f
    `, { replacements: { serverId }, type: QueryTypes.SELECT });

    const [row] = rows;
    return row ? toFamily('', row) : null;
}

/** Every family with more than one member, i.e. every merge currently in effect. */
export async function getMergedFamilies(): Promise<MergedFamily[]> {
    const rows: any[] = await sequelize.query(`
        WITH merged AS (
            SELECT canonical_id FROM server_canonical GROUP BY canonical_id HAVING COUNT(*) > 1
        ),
        names AS (${FAMILY_NAMES_SQL})
        SELECT sc.canonical_id, n.name, s.id, s.host, s.port, s.created_at, s.last_seen, s.retired_at
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
            family = { id, name: row.name ?? null, members: [] };
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
