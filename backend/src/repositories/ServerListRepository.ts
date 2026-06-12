// ─────────────────────────────────────────────────────────────────────────────
// serverListRepository.ts
// Manages serverlists, the server_source_list join table, and admin queries
// (inactive servers, per-list stats).
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database';
import { Server, ServerList, ServerSourceList } from '../models/index';
import { QueryTypes } from 'sequelize';
import {InactiveServerInfo, ServerListStats} from "../../../common/models/RepositoryTypes"

// ─── Serverlist CRUD ──────────────────────────────────────────────────────────

export async function getOrCreateServerList(
    url:          string,
    name:         string,
    display_name: string
): Promise<ServerList> {
    const [serverList] = await ServerList.findOrCreate({
        where:    { url },
        defaults: { name, display_name },
    });
    return serverList;
}

export async function getAllServerLists(): Promise<ServerList[]> {
    return ServerList.findAll();
}

// ─── Source list sync ─────────────────────────────────────────────────────────

/**
 * Replaces the server_source_list rows for the given serverlists with exactly
 * the supplied set of servers.
 *
 * Previously this performed N individual upserts inside a loop.  Now it does:
 *   - 1 SELECT  to build the server host|port → id map
 *   - 1 bulk INSERT … ON CONFLICT DO UPDATE
 *   - 1 DELETE  for rows no longer present
 * All inside a single transaction.
 */
export async function refreshServerSourceList(
    servers: Array<{
        host:          string;
        port:          number;
        serverlist_id: number;
        display_name:  string;
    }>
): Promise<void> {
    if (servers.length === 0) return;

    await sequelize.transaction(async t => {
        // 1. Build host|port → server_id map
        const serverRows: any[] = await Server.findAll({
            attributes: ['id', 'host', 'port'],
            transaction: t,
        });

        const serverIdByKey = new Map<string, number>(
            serverRows.map((s: any) => [`${s.host}|${s.port}`, s.id])
        );

        // 2. Resolve server IDs, drop any with unknown host/port
        const records = servers
            .map(s => {
                const server_id = serverIdByKey.get(`${s.host}|${s.port}`);
                if (server_id === null || server_id === undefined) return null;
                return {
                    server_id,
                    serverlist_id: s.serverlist_id,
                    display_name:  s.display_name,
                    last_seen:     new Date().toISOString(),
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

        if (records.length === 0) return;

        // 3. Bulk upsert in one INSERT … ON CONFLICT DO UPDATE
        await sequelize.query(`
            INSERT INTO server_source_list (server_id, serverlist_id, display_name, last_seen)
            SELECT server_id, serverlist_id, display_name, last_seen::timestamptz
            FROM jsonb_to_recordset(:records::jsonb)
                AS x(server_id int, serverlist_id int, display_name text, last_seen text)
            ON CONFLICT (server_id, serverlist_id) DO UPDATE
                SET display_name = EXCLUDED.display_name,
                    last_seen    = EXCLUDED.last_seen
        `, {
            replacements: { records: JSON.stringify(records) },
            type:         QueryTypes.INSERT,
            transaction:  t,
        });

        // 4. Delete rows no longer in the incoming data for the affected lists
        const affectedListIds  = [...new Set(records.map(r => r.serverlist_id))];
        const expectedPairs    = new Set(records.map(r => `${r.server_id}|${r.serverlist_id}`));

        const existing: any[] = await ServerSourceList.findAll({
            where:       { serverlist_id: affectedListIds },
            transaction: t,
        });

        const deleteIds = existing
            .filter((r: any) => !expectedPairs.has(`${r.server_id}|${r.serverlist_id}`))
            .map((r: any) => r.id);

        if (deleteIds.length > 0) {
            await ServerSourceList.destroy({ where: { id: deleteIds }, transaction: t });
        }
    });
}

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
        WHERE s.last_seen IS NOT NULL
          AND s.last_seen < NOW() - INTERVAL '14 days'
        GROUP BY s.id, s.host, s.port, s.last_seen, s.inactivity_excluded
        ORDER BY s.last_seen DESC NULLS LAST
    `, { type: QueryTypes.SELECT });

    return rows.map(row => ({
        id:                   row.id,
        host:                 row.host,
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