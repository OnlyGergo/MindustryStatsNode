// ─────────────────────────────────────────────────────────────────────────────
// adminHubRepository.ts
// Read side of the admin hub page: families that look like hubs/lobbies by
// keyword, and families already marked. "Hub" means the family is in
// aggregate_excluded_families; writes live in user/hubRepository.ts.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { canonicalJoin, canonicalOfSql, EXCLUDED_FAMILIES_SQL, LIVE_MEMBER_SQL, notExcludedRootSql } from './canonicalIdentity.js';
import { hubKeywordPattern } from '../../../common/hubKeywords.js';
import type { HubFamily, HubMatchField } from '../../../common/models/admin.js';

const SUGGESTION_LIMIT = 200;

const ms = (d: Date | string | null): number | null => (d == null ? null : new Date(d).getTime());

/** Strips Mindustry colour tags so `[accent]Hub` matches. */
const stripTags = (col: string) => `regexp_replace(${col}, '\\[[^\\]]*\\]', '', 'g')`;

/**
 * One row per family whose root satisfies `rootFilter` (sees `root`): live
 * address, newest open MOTD (name + description), current map, and which of
 * those contain a hub keyword.
 */
function hubFamiliesSql(rootFilter: string): string {
    return `
        WITH fam AS (
            SELECT sc.canonical_id AS id, MAX(s.last_seen) AS last_seen
            FROM server_canonical sc
            JOIN servers s    ON s.id = sc.server_id
            JOIN servers root ON root.id = sc.canonical_id
            WHERE ${rootFilter}
            GROUP BY sc.canonical_id
        ),
        live_members AS (${LIVE_MEMBER_SQL}),
        motds AS (
            SELECT DISTINCT ON (sc.canonical_id)
                   sc.canonical_id, r.server_name AS name, r.description
            FROM server_motds_history h
            ${canonicalJoin('sc', 'h')}
            JOIN server_motds_registry r ON r.id = h.motd_id
            WHERE h.valid_to IS NULL AND sc.canonical_id IN (SELECT id FROM fam)
            ORDER BY sc.canonical_id, h.valid_from DESC
        ),
        maps AS (
            SELECT DISTINCT ON (sc.canonical_id)
                   sc.canonical_id, r.map_name
            FROM server_maps_history h
            ${canonicalJoin('sc', 'h')}
            JOIN server_maps_registry r ON r.id = h.map_id
            WHERE h.valid_to IS NULL AND sc.canonical_id IN (SELECT id FROM fam)
            ORDER BY sc.canonical_id, h.valid_from DESC
        )
        SELECT fam.id, fam.last_seen, lm.host, lm.port,
               m.name, m.description, mp.map_name,
               COALESCE(${stripTags('m.name')} ~* :pattern, FALSE)        AS name_match,
               COALESCE(${stripTags('m.description')} ~* :pattern, FALSE) AS description_match,
               COALESCE(${stripTags('mp.map_name')} ~* :pattern, FALSE)   AS map_match
        FROM fam
        JOIN live_members lm ON lm.canonical_id = fam.id
        LEFT JOIN motds m    ON m.canonical_id = fam.id
        LEFT JOIN maps mp    ON mp.canonical_id = fam.id`;
}

function toHubFamily(row: any): HubFamily {
    const matches: HubMatchField[] = [];
    if (row.name_match) matches.push('name');
    if (row.description_match) matches.push('description');
    if (row.map_match) matches.push('map');
    return {
        id: Number(row.id),
        name: row.name ?? null,
        description: row.description ?? null,
        mapName: row.map_name ?? null,
        host: row.host,
        port: Number(row.port),
        lastSeen: ms(row.last_seen),
        matches,
    };
}

/**
 * Unmarked, undismissed families with a hub keyword in their name, MOTD
 * description or current map. Most matching fields first, then most recent.
 */
export async function getHubSuggestions(): Promise<HubFamily[]> {
    const rows = await sequelize.query(`
        SELECT * FROM (${hubFamiliesSql(`
            ${notExcludedRootSql('root')}
            AND NOT EXISTS (SELECT 1 FROM server_hub_dismissals d WHERE d.server_id = root.id)`)}
        ) x
        WHERE name_match OR description_match OR map_match
        ORDER BY (CAST(name_match AS int) + CAST(description_match AS int) + CAST(map_match AS int)) DESC,
                 last_seen DESC NULLS LAST
        LIMIT :limit
    `, { replacements: { pattern: hubKeywordPattern(), limit: SUGGESTION_LIMIT }, type: QueryTypes.SELECT });
    return rows.map(toHubFamily);
}

/** Every family currently marked as a hub. */
export async function getMarkedHubs(): Promise<HubFamily[]> {
    const rows = await sequelize.query(`
        SELECT * FROM (${hubFamiliesSql(`root.id IN (${EXCLUDED_FAMILIES_SQL})`)}) x
        ORDER BY last_seen DESC NULLS LAST
    `, { replacements: { pattern: hubKeywordPattern() }, type: QueryTypes.SELECT });
    return rows.map(toHubFamily);
}

/** The family `serverId` belongs to (any member id works), for the manual form, or null. */
export async function getHubFamily(serverId: number): Promise<(HubFamily & { isHub: boolean }) | null> {
    const rows: any[] = await sequelize.query(`
        SELECT x.*, x.id IN (${EXCLUDED_FAMILIES_SQL}) AS is_hub
        FROM (${hubFamiliesSql(`root.id = ${canonicalOfSql(':serverId')}`)}) x
    `, { replacements: { pattern: hubKeywordPattern(), serverId }, type: QueryTypes.SELECT });
    const [row] = rows;
    return row ? { ...toHubFamily(row), isHub: !!row.is_hub } : null;
}
