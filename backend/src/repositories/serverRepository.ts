// ─────────────────────────────────────────────────────────────────────────────
// serverRepository.ts
// Server and network read/write operations.
// Raw SQL is intentional — Sequelize is used only as a connection/transaction
// layer so TimescaleDB extensions remain accessible.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import {
    GameMode,
    type ServerDetails,
    type ServerElement,
    type ServerMapData,
    type ServerMotdData,
} from '../../../common/models/serverData.js';
import { QueryTypes } from 'sequelize';
import { type NetworkDetails } from '../../../common/models/RepositoryTypes.js';
import {CURRENT_DATA_FRESH_THRESHOLD, MAX_REALISTIC_PLAYERCOUNT} from "../const.js";

// ─── Servers ─────────────────────────────────────────────────────────────────

/**
 * Returns all server and network/group IDs, for sitemap generation.
 *
 * Identities, not streams: /server/:id takes a canonical id, so the alias rows
 * of a server that has moved address are not pages of their own.  Retired
 * identities (every stream in the family dead) and non-'game' roles are left
 * out — they are still reachable, just not worth asking a crawler to index.
 */
export async function getSitemapIds(): Promise<{ serverIds: number[]; networkIds: number[] }> {
    // Networks are derived from the listable identities rather than read off
    // server_groups: a group whose only members are hubs, test servers or
    // retired streams renders an empty page, and advertising it in the sitemap
    // asks a crawler to index nothing.
    const [servers, serverGroups] = await Promise.all([
        sequelize.query(
            `SELECT si.id
             FROM server_identity si
             WHERE si.role = 'game'
               AND NOT si.retired
             ORDER BY si.id`,
            { type: QueryTypes.SELECT }
        ) as Promise<{ id: number }[]>,
        sequelize.query(
            `SELECT DISTINCT si.server_group_id AS id
             FROM server_identity si
             WHERE si.role = 'game'
               AND NOT si.retired
             ORDER BY id`,
            { type: QueryTypes.SELECT }
        ) as Promise<{ id: number }[]>,
    ]);

    return {
        serverIds: servers.map((s) => s.id),
        networkIds: serverGroups.map((g) => g.id),
    };
}

/**
 * Returns all listed server identities with their latest stats, map, and MOTD
 * in one query.
 *
 * One row per identity, not per observation stream (migration 29).  Address,
 * group and country come from server_identity — i.e. from the stream the server
 * answers on today — while the stats, MOTD and map are taken across the whole
 * family with the newest sample winning: after a migration the retired stream's
 * rows go stale but do not disappear, and DISTINCT ON over the family is what
 * keeps the listing showing the live ones.
 *
 * Hubs and test servers are left out (they mirror other servers' player counts),
 * as are identities whose every stream is retired.
 */
export async function getAllServerElements(hoursBack: number = 36): Promise<ServerElement[]> {
    const rows: any[] = await sequelize.query(`
        WITH latest_motds AS (
            SELECT DISTINCT ON (sc.canonical_id)
                sc.canonical_id,
                r.server_name  AS "serverName",
                r.description
            FROM server_motds_history h
            JOIN server_motds_registry r ON h.motd_id = r.id
            JOIN server_canonical sc     ON sc.server_id = h.server_id
            WHERE h.valid_to IS NULL
            ORDER BY sc.canonical_id, h.valid_from DESC
        ),
        latest_maps AS (
            SELECT DISTINCT ON (sc.canonical_id)
                sc.canonical_id,
                r.map_name   AS "mapName",
                r.game_mode  AS mode,
                r.mode_name  AS "modeName"
            FROM server_maps_history h
            JOIN server_maps_registry r ON h.map_id = r.id
            JOIN server_canonical sc    ON sc.server_id = h.server_id
            WHERE h.valid_to IS NULL
            ORDER BY sc.canonical_id, h.valid_from DESC
        ),
        latest_stats AS (
            -- One row per stream, upserted by bulkSaveServerStats() each poll
            -- cycle, so this is a small table scan instead of a DISTINCT ON
            -- across every chunk of the hypertable.  The DISTINCT ON here is
            -- over the family, picking the freshest of an identity's streams.
            SELECT DISTINCT ON (sc.canonical_id)
                   sc.canonical_id, c.timestamp, c.players, c.max_players, c.wave,
                   c.version, c.version_type, c.ping, c.online
            FROM server_current c
            JOIN server_canonical sc ON sc.server_id = c.server_id
            WHERE c.timestamp > NOW() - interval '1 hour' * :hoursBack
              AND c.players >= 0 AND c.players < :maxRealisticPlayerCount
            ORDER BY sc.canonical_id, c.timestamp DESC
        )
        SELECT
            si.id, si.display_ref AS "displayRef",
            sg.name, si.server_group_id AS "groupId",
            si.host, si.port, si.country_code,
            si.updated_at AS "lastUpdated", si.last_seen,
            stats.online, stats.timestamp, stats.players,
            stats.max_players AS "playerLimit",
            stats.wave, stats.version, stats.version_type AS "versionType", stats.ping,
            motds."serverName", motds.description,
            maps."modeName", maps."mapName", maps.mode
        FROM server_identity si
        LEFT JOIN latest_stats stats ON si.id = stats.canonical_id
        LEFT JOIN latest_motds motds ON si.id = motds.canonical_id
        LEFT JOIN latest_maps  maps  ON si.id = maps.canonical_id
        LEFT JOIN server_groups sg   ON si.server_group_id = sg.id
        WHERE si.role = 'game'
          AND NOT si.retired
        ORDER BY sg.name, si.host, si.port
    `, { replacements: { hoursBack, maxRealisticPlayerCount: MAX_REALISTIC_PLAYERCOUNT }, type: QueryTypes.SELECT });

    return rows.map((row): ServerElement => {
        const element: ServerElement = {
            id:          row.id,
            displayRef:  row.displayRef,
            name:        row.name,
            groupId:     row.groupId,
            host:        row.host,
            port:        row.port,
            online:      row.online ?? false,
            lastSeen:    row.last_seen,
            lastUpdated: row.lastUpdated ? new Date(row.lastUpdated).getTime() : Date.now(),
            countryCode: row.country_code ?? null,
        };

        // currentData is current - only populate if "fresh" aka 5 minutes
        if (row.timestamp && row.timestamp > new Date(Date.now() - CURRENT_DATA_FRESH_THRESHOLD).getTime()) {
            element.currentData = {
                ping:        row.ping        ?? 0,
                host:        row.host,
                port:        row.port,
                serverName:  row.serverName  ?? 'Unknown',
                mapName:     row.mapName     ?? 'Unknown',
                players:     row.players     ?? 0,
                wave:        row.wave        ?? 0,
                version:     row.version     ?? 0,
                versionType: row.versionType ?? 'Unknown',
                mode:        row.mode        ?? 0,
                playerLimit: row.playerLimit ?? 0,
                description: row.description ?? '',
                modeName:    row.modeName    ?? '',
                online:      row.online      ?? false,
            };
        }

        return element;
    });
}

/**
 * Full detail for a single server identity — delegates to the
 * get_server_details() DB function, which takes a canonical id and is
 * family-aware (migration 30).  An alias id returns nothing, which the route
 * turns into a 404: aliases are not addressable.
 *
 * display_ref is not in the function's column list and that list is fixed, so
 * it is joined on here rather than fetched in a second round trip.  The join is
 * also what makes an unknown id come back empty even if the function itself
 * ever stopped being strict about it.
 */
export async function getServer(serverId: number): Promise<(ServerElement & ServerDetails) | undefined> {
    const [result]: any = await sequelize.query(
        `SELECT d.*, si.display_ref AS detail_display_ref
         FROM get_server_details($1) d
         JOIN server_identity si ON si.id = $1`,
        { bind: [serverId], type: 'SELECT' as any }
    );

    if (!result) return undefined;

    const allMaps: ServerMapData[] = (result.detail_all_maps ?? []).map((m: any) => ({
        id:        m.id,
        serverId:  m.serverId,
        validFrom: new Date(m.validFrom),
        validTo:   m.validTo ? new Date(m.validTo) : null,
        mapName:   m.mapName,
        gameMode:  m.gameMode as GameMode,
        modeName:  m.modeName,
    }));

    const allMotds: ServerMotdData[] = (result.detail_all_motds ?? []).map((m: any) => ({
        id:          m.id,
        serverId:    m.serverId,
        validFrom:   new Date(m.validFrom),
        validTo:     m.validTo ? new Date(m.validTo) : null,
        serverName:  m.serverName,
        description: m.description,
        modeName:    m.modeName,
    }));

    const currentMotd = allMotds.find(m => m.validTo === null) ?? allMotds[0] ?? null;
    const currentMap  = allMaps.find(m => m.validTo === null)  ?? allMaps[0]  ?? null;

    const detail: ServerElement & ServerDetails = {
        id:          result.detail_id,
        displayRef:  result.detail_display_ref,
        name:        result.detail_name,
        host:        result.detail_host,
        port:        result.detail_port,
        online:      result.detail_online ?? false,
        lastUpdated: result.detail_last_updated?.getTime() ?? Date.now(),
        groupId:     result.server_group_id,
        playerPeaks: {
            allTime:     result.detail_all_time_peak ?? 0,
            allTimeDate: result.detail_peak_date     ?? new Date(),
            daily:       result.detail_daily_peak    ?? 0,
            weekly:      result.detail_weekly_peak   ?? 0,
        },
        uptime: {
            last24h: parseFloat(result.detail_24h_uptime) || 0,
            last7d:  parseFloat(result.detail_7d_uptime)  || 0,
        },
        allMaps,
        allMotds,
        currentMotd,
        currentMap,
    };

    if (result.detail_timestamp != null &&
        result.detail_timestamp > new Date(Date.now() - CURRENT_DATA_FRESH_THRESHOLD).getTime()) {
        detail.currentData = {
            ping:        result.detail_ping         ?? 0,
            host:        result.detail_host,
            port:        result.detail_port,
            serverName:  result.detail_display_name ?? currentMotd?.serverName  ?? 'Unknown',
            mapName:     result.detail_map_name     ?? currentMap?.mapName      ?? 'Unknown',
            players:     result.detail_players      ?? 0,
            wave:        result.detail_wave         ?? 0,
            version:     result.detail_version      ?? 0,
            versionType: result.detail_version_type ?? 'Unknown',
            mode:        (result.detail_mode ?? currentMap?.gameMode ?? 0) as GameMode,
            playerLimit: result.detail_player_limit ?? 0,
            description: result.detail_description  ?? currentMotd?.description ?? '',
            modeName:    result.detail_mode_name    ?? currentMotd?.modeName    ?? '',
            online:      result.detail_online       ?? false,
        };
    }

    return detail;
}

// ─── Map / MOTD history reads ─────────────────────────────────────────────────
//
// Both take a canonical id and return the union of the family's rows, ordered
// by valid_from across the whole union rather than per stream, so a migration
// does not truncate the timeline at the switchover or interleave it wrongly.
// The COUNT is taken over the same set the page is drawn from — server_family()
// in both halves — so the pager cannot promise pages that do not exist.

export async function getMapHistory(
    serverId: number,
    page: number    = 1,
    perPage: number = 20
): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * perPage;

    const [[{ count }], data]: any = await Promise.all([
        sequelize.query(
            `SELECT COUNT(*) AS count FROM server_maps_history
             WHERE server_id IN (SELECT server_family(:serverId))`,
            { replacements: { serverId }, type: QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT h.id, h.server_id, h.valid_from, h.valid_to,
                    r.map_name, r.game_mode, r.mode_name
             FROM server_maps_history h
             JOIN server_maps_registry r ON h.map_id = r.id
             WHERE h.server_id IN (SELECT server_family(:serverId))
             ORDER BY h.valid_from DESC
             LIMIT :perPage OFFSET :offset`,
            { replacements: { serverId, perPage, offset }, type: QueryTypes.SELECT }
        ),
    ]);

    return { data, total: parseInt(count, 10) };
}

export async function getMotdHistory(
    serverId: number,
    page: number    = 1,
    perPage: number = 20
): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * perPage;

    const [[{ count }], data]: any = await Promise.all([
        sequelize.query(
            `SELECT COUNT(*) AS count FROM server_motds_history
             WHERE server_id IN (SELECT server_family(:serverId))`,
            { replacements: { serverId }, type: QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT h.id, h.server_id, h.valid_from, h.valid_to,
                    r.server_name, r.description
             FROM server_motds_history h
             JOIN server_motds_registry r ON h.motd_id = r.id
             WHERE h.server_id IN (SELECT server_family(:serverId))
             ORDER BY h.valid_from DESC
             LIMIT :perPage OFFSET :offset`,
            { replacements: { serverId, perPage, offset }, type: QueryTypes.SELECT }
        ),
    ]);

    return { data, total: parseInt(count, 10) };
}

// ─── Network (server group) ───────────────────────────────────────────────────

/**
 * Returns aggregate stats for a network in a single query.
 * Previously this was 4 separate round-trips; the bug where activeServers
 * equalled totalServers is also fixed here.
 *
 * Everything is counted per identity (migration 29): a server that changed
 * address is one member of the network, not two, and the id handed back for the
 * top server is its canonical id so the link on the page resolves.  Hubs and
 * test servers are excluded — a hub in a network would be reported as its
 * busiest server while only mirroring the others.
 */
export async function getNetworkDetails(groupId: number): Promise<NetworkDetails | undefined> {
    const [row]: any = await sequelize.query(`
        WITH group_identities AS (
            -- One row per identity by construction, so COUNT(*) over it is the
            -- COUNT(DISTINCT canonical_id) the totals want.
            SELECT si.id, si.host, si.port
            FROM server_identity si
            WHERE si.server_group_id = :groupId
              AND si.role = 'game'
        ),
        group_streams AS (
            -- Back down to raw stream ids: server_current and server_stats_1h
            -- are keyed by stream, and a retired alias still holds the history
            -- it collected before the move.
            SELECT sc.server_id, sc.canonical_id
            FROM server_canonical sc
            JOIN group_identities gi ON gi.id = sc.canonical_id
        ),
        latest_stats AS (
            -- server_current holds exactly one row per stream; the hour bound
            -- keeps long-dead servers from counting towards active_servers, and
            -- the DISTINCT ON keeps an identity that is mid-migration from
            -- counting as two active servers.
            SELECT DISTINCT ON (gs.canonical_id)
                   gs.canonical_id, c.players, c.timestamp
            FROM server_current c
            JOIN group_streams gs ON gs.server_id = c.server_id
            WHERE c.timestamp > NOW() - INTERVAL '1 hour'
            ORDER BY gs.canonical_id, c.timestamp DESC
        ),
        peaks AS (
            -- Hourly continuous aggregate: max() is decomposable, so
            -- max(max_players) is the same number the raw scan produced, without
            -- walking (and decompressing) every chunk back to day one.
            --
            -- The family collapse and the network peak are the same operator
            -- here, so they fold into one MAX: the per-identity step the chart
            -- queries need before they SUM would not change any of these three
            -- numbers.
            SELECT
                MAX(h.max_players) FILTER (WHERE h.bucket > NOW() - interval '1 day')  AS daily_peak,
                MAX(h.max_players) FILTER (WHERE h.bucket > NOW() - interval '7 days') AS weekly_peak,
                MAX(h.max_players)                                                     AS all_time_peak
            FROM server_stats_1h h
            JOIN group_streams gs ON gs.server_id = h.server_id
        ),
        top_server AS (
            SELECT gi.id, gi.host, gi.port, ls.players, sg2.name AS server_name
            FROM group_identities gi
            JOIN server_groups sg2 ON sg2.id = :groupId
            LEFT JOIN latest_stats ls ON ls.canonical_id = gi.id
            ORDER BY ls.players DESC NULLS LAST
            LIMIT 1
        )
        SELECT
            sg.id,
            sg.name,
            (SELECT COUNT(*)                                   FROM group_identities) AS total_servers,
            (SELECT COUNT(*) FROM latest_stats WHERE players > 0)                 AS active_servers,
            (SELECT daily_peak    FROM peaks)                                      AS daily_peak,
            (SELECT weekly_peak   FROM peaks)                                      AS weekly_peak,
            (SELECT all_time_peak FROM peaks)                                      AS all_time_peak,
            (SELECT id          FROM top_server)                                   AS top_server_id,
            (SELECT host        FROM top_server)                                   AS top_server_host,
            (SELECT port        FROM top_server)                                   AS top_server_port,
            (SELECT players     FROM top_server)                                   AS top_server_players,
            (SELECT server_name FROM top_server)                                   AS top_server_name
        FROM server_groups sg
        WHERE sg.id = :groupId
    `, { replacements: { groupId }, type: QueryTypes.SELECT });

    if (!row) return undefined;

    return {
        id:   row.id,
        name: row.name,
        playerPeaks: {
            allTime: row.all_time_peak ?? 0,
            daily:   row.daily_peak   ?? 0,
            weekly:  row.weekly_peak  ?? 0,
        },
        topServer: row.top_server_id
            ? {
                id:      row.top_server_id,
                host:    row.top_server_host,
                port:    row.top_server_port,
                players: row.top_server_players ?? 0,
                name:    row.top_server_name,
            }
            : null,
        activeServers: parseInt(row.active_servers, 10) || 0,
        totalServers:  parseInt(row.total_servers,  10) || 0,
    };
}
