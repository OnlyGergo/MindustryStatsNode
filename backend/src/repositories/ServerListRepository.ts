// ─────────────────────────────────────────────────────────────────────────────
// serverListRepository.ts
// Manages serverlists, the server_source_list join table, and admin queries
// (inactive servers, per-list stats).
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type InactiveServerInfo, type ServerListStats} from "../../../common/models/RepositoryTypes.js"

// ─── Admin / reporting queries ────────────────────────────────────────────────

/** Servers not seen in the last 14 days, with their associated serverlists. */
export async function getInactiveServers(): Promise<InactiveServerInfo[]> {
    const rows: any[] = await sequelize.query(`
        SELECT
            s.id,
            s.host,
            s.port,
            s.last_seen,
            s.inactivity_excluded,
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
        FROM servers s
        LEFT JOIN server_source_list ssl ON s.id = ssl.server_id
        LEFT JOIN serverlists sl         ON ssl.serverlist_id = sl.id
        LEFT JOIN server_groups sg       ON sg.id = s.server_group_id
        WHERE s.last_seen IS NOT NULL
          AND s.last_seen < NOW() - INTERVAL '14 days'
        GROUP BY s.id, s.host, s.port, s.last_seen, s.inactivity_excluded, sg.name
        ORDER BY s.last_seen DESC NULLS LAST
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
        SELECT
            sl.id,
            sl.display_name,
            sl.url,
            COUNT(DISTINCT ssl.server_id) AS total_servers,
            COUNT(DISTINCT ssl.server_id)
                FILTER (WHERE s.last_seen IS NOT NULL
                          AND s.last_seen >= NOW() - INTERVAL '14 days') AS active_servers
        FROM serverlists sl
        LEFT JOIN server_source_list ssl ON sl.id = ssl.serverlist_id
        LEFT JOIN servers s              ON ssl.server_id = s.id
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