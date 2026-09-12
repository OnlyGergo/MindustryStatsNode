// ─────────────────────────────────────────────────────────────────────────────
// serverListRepository.ts
// Manages serverlists, the server_source_list join table, and admin queries
// (inactive servers, per-list stats).
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type InactiveServerInfo, type ServerListStats} from "../../../common/models/RepositoryTypes.js"

// ─── Admin / reporting queries ────────────────────────────────────────────────

/**
 * Identities not seen in the last 14 days, with their associated serverlists.
 *
 * Per identity rather than per observation stream (migration 29): the last_seen
 * that decides "inactive" is the family's newest, so a server that moved
 * address is not reported dead on the strength of the address it left, and the
 * serverlists are the union of the family's memberships.
 */
export async function getInactiveServers(): Promise<InactiveServerInfo[]> {
    const rows: any[] = await sequelize.query(`
        SELECT
            si.id,
            si.host,
            si.port,
            si.last_seen,
            si.inactivity_excluded,
            sg.name as group_name,
            COALESCE(
                -- DISTINCT (and therefore jsonb, which json cannot do for lack
                -- of an equality operator): every stream of a family is usually
                -- in the same list, and the page wants that list once.
                jsonb_agg(DISTINCT
                    jsonb_build_object(
                        'id',           sl.id,
                        'display_name', sl.display_name,
                        'url',          sl.url
                    )
                ) FILTER (WHERE sl.id IS NOT NULL),
                '[]'::jsonb
            ) AS server_lists
        FROM server_identity si
        JOIN server_canonical sc         ON sc.canonical_id = si.id
        LEFT JOIN server_source_list ssl ON ssl.server_id = sc.server_id
        LEFT JOIN serverlists sl         ON ssl.serverlist_id = sl.id
        LEFT JOIN server_groups sg       ON sg.id = si.server_group_id
        WHERE si.last_seen IS NOT NULL
          AND si.last_seen < NOW() - INTERVAL '14 days'
        GROUP BY si.id, si.host, si.port, si.last_seen, si.inactivity_excluded, sg.name
        ORDER BY si.last_seen DESC NULLS LAST
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

/**
 * Per-serverlist counts and active-server percentage.
 *
 * Counted over canonical ids: a list that carries both addresses of a server
 * that moved is listing one server (migration 29), and the identity counts as
 * active as soon as any of its streams was seen recently — which after a move
 * is the new one.
 */
export async function getServerListStats(): Promise<ServerListStats[]> {
    const rows: any[] = await sequelize.query(`
        SELECT
            sl.id,
            sl.display_name,
            sl.url,
            COUNT(DISTINCT sc.canonical_id) AS total_servers,
            COUNT(DISTINCT sc.canonical_id)
                FILTER (WHERE s.last_seen IS NOT NULL
                          AND s.last_seen >= NOW() - INTERVAL '14 days') AS active_servers
        FROM serverlists sl
        LEFT JOIN server_source_list ssl ON sl.id = ssl.serverlist_id
        LEFT JOIN servers s              ON ssl.server_id = s.id
        LEFT JOIN server_canonical sc    ON sc.server_id = s.id
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