// ─────────────────────────────────────────────────────────────────────────────
// serverListRepository.ts
// Manages serverlists, the server_source_list join table, and admin queries
// (inactive servers, per-list stats).
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type InactiveServerInfo, type ServerListStats} from "../../../common/models/RepositoryTypes.js"
import { LIVE_MEMBER_SQL } from './canonicalIdentity.js';

// ─── Admin / reporting queries ────────────────────────────────────────────────

/** Servers not seen in the last 14 days, with their associated serverlists. */
export async function getInactiveServers(): Promise<InactiveServerInfo[]> {
    const rows: any[] = await sequelize.query(`
        WITH family_meta AS (
            -- Family-wide freshness: an alias's own last_seen can be stale
            -- once the server has moved to a new address the collector polls
            -- instead, so MAX across every raw member is the only honest
            -- "when was this real server last seen" answer.
            SELECT sc.canonical_id, MAX(s.last_seen) AS last_seen
            FROM server_canonical sc
            JOIN servers s ON s.id = sc.server_id
            GROUP BY sc.canonical_id
        ),
        inactive_families AS (
            SELECT canonical_id, last_seen
            FROM family_meta
            WHERE last_seen IS NOT NULL AND last_seen < NOW() - INTERVAL '14 days'
        ),
        live_members AS (
            ${LIVE_MEMBER_SQL}
        )
        SELECT
            fam.canonical_id AS id,
            lm.host,
            lm.port,
            fam.last_seen,
            -- inactivity_excluded is a family-level property, same rule as
            -- aggregate_exclude: it comes from the ROOT row so a merge can't
            -- leave half a family opted out of this report.
            root.inactivity_excluded,
            sg.name as group_name,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id',           sl.id,
                        'display_name', sl.display_name,
                        'url',          sl.url
                    )
                ) FILTER (WHERE sl.id IS NOT NULL),
                '[]'::json
            ) AS server_lists
        FROM inactive_families fam
        JOIN live_members lm          ON lm.canonical_id = fam.canonical_id
        JOIN servers root             ON root.id = fam.canonical_id
        LEFT JOIN server_groups sg    ON sg.id = root.server_group_id
        -- A list membership attached to any alias still belongs to the
        -- server, so memberships are gathered across the whole family, not
        -- just the live member's own server_source_list rows.
        LEFT JOIN server_canonical sc    ON sc.canonical_id = fam.canonical_id
        LEFT JOIN server_source_list ssl ON ssl.server_id = sc.server_id
        LEFT JOIN serverlists sl         ON ssl.serverlist_id = sl.id
        GROUP BY fam.canonical_id, lm.host, lm.port, fam.last_seen, root.inactivity_excluded, sg.name
        ORDER BY fam.last_seen DESC NULLS LAST
    `, { type: QueryTypes.SELECT });

    return rows.map(row => ({
        id:                   row.id,
        host:                 row.host,
        group_name:           row.group_name,
        port:                 row.port,
        lastSeen:             row.last_seen ? new Date(row.last_seen).getTime() : null,
        serverLists:          row.server_lists ?? [],
        inactivity_excluded:  row.inactivity_excluded,
    }));
}

/** Per-serverlist counts and active-server percentage. */
export async function getServerListStats(): Promise<ServerListStats[]> {
    const rows: any[] = await sequelize.query(`
        WITH family_meta AS (
            -- Same family-wide freshness rule as getInactiveServers: a list
            -- membership attached to a since-retired alias should still
            -- count as active if the server's current address is checking in.
            SELECT sc.canonical_id, MAX(s.last_seen) AS last_seen
            FROM server_canonical sc
            JOIN servers s ON s.id = sc.server_id
            GROUP BY sc.canonical_id
        )
        SELECT
            sl.id,
            sl.display_name,
            sl.url,
            COUNT(DISTINCT sc.canonical_id) AS total_servers,
            COUNT(DISTINCT sc.canonical_id)
                FILTER (WHERE fam.last_seen IS NOT NULL
                          AND fam.last_seen >= NOW() - INTERVAL '14 days') AS active_servers
        FROM serverlists sl
        LEFT JOIN server_source_list ssl ON sl.id = ssl.serverlist_id
        LEFT JOIN server_canonical sc    ON sc.server_id = ssl.server_id
        LEFT JOIN family_meta fam        ON fam.canonical_id = sc.canonical_id
        GROUP BY sl.id, sl.display_name, sl.url
        ORDER BY sl.display_name
    `, { type: QueryTypes.SELECT });

    return rows.map(row => {
        const total  = parseInt(row.total_servers,  10) || 0;
        const active = parseInt(row.active_servers, 10) || 0;
        return {
            id:               row.id,
            display_name:     row.display_name,
            url:              row.url,
            total_servers:    total,
            active_servers:   active,
            active_percentage: total > 0 ? Math.round((active / total) * 100) : 0,
        };
    });
}