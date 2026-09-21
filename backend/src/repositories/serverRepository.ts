// ─────────────────────────────────────────────────────────────────────────────
// serverRepository.ts
// Server and network read/write operations.
// Raw SQL is intentional — Sequelize is used only as a connection/transaction
// layer so TimescaleDB extensions remain accessible.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import {
    ServerGroup,
} from '../models/index.js';
import {
    GameMode,
    type ServerDetails,
    type ServerElement,
    type ServerMapData,
    type ServerMotdData,
} from '../../../common/models/serverData.js';
import { QueryTypes } from 'sequelize';
import {
    type NetworkDetails,
} from '../../../common/models/RepositoryTypes.js';
import {CURRENT_DATA_FRESH_THRESHOLD, MAX_REALISTIC_PLAYERCOUNT} from "../const.js";
import { LIVE_MEMBER_SQL, canonicalJoin, serverFamilySql } from './canonicalIdentity.js';

// ─── Servers ─────────────────────────────────────────────────────────────────

/** Returns all server and network/group IDs, for sitemap generation. */
export async function getSitemapIds(): Promise<{ serverIds: number[]; networkIds: number[] }> {
    const [servers, serverGroups] = await Promise.all([
        // One row per real server, not per observation: server_canonical has
        // exactly one row per servers row, but many of those share a
        // canonical_id, and the sitemap must list a server once regardless of
        // how many address changes it has been through.
        sequelize.query(
            `SELECT DISTINCT canonical_id FROM server_canonical`,
            { type: QueryTypes.SELECT }
        ),
        ServerGroup.findAll({ raw: true, attributes: ['id'] }),
    ]);

    return {
        serverIds: (servers as any[]).map((s) => s.canonical_id),
        networkIds: serverGroups.map((g: any) => g.id),
    };
}

/** Returns all servers with their latest stats, map, and MOTD in one query. */
export async function getAllServerElements(hoursBack: number = 36): Promise<ServerElement[]> {
    const rows: any[] = await sequelize.query(`
        WITH live_members AS (
            -- One row per FAMILY: this is the already-reduced row set every
            -- other CTE below joins onto, per canonical id.
            ${LIVE_MEMBER_SQL}
        ),
        family_meta AS (
            -- last_seen/updated_at collapse across the whole family with MAX,
            -- same reasoning as the player-count rule: a retired alias's
            -- stale timestamp must never shadow the live member's.
            SELECT sc.canonical_id, MAX(s.last_seen) AS last_seen, MAX(s.updated_at) AS updated_at
            FROM server_canonical sc
            JOIN servers s ON s.id = sc.server_id
            GROUP BY sc.canonical_id
        ),
        latest_motds AS (
            -- One row per FAMILY, not per server_id: across a family several
            -- members can each have an open (valid_to IS NULL) row at once,
            -- because an alias's row is never closed when the server moves
            -- to a new address. The newest valid_from across the family wins.
            SELECT DISTINCT ON (sc.canonical_id)
                sc.canonical_id,
                r.server_name  AS "serverName",
                r.description,
                h.valid_from
            FROM server_motds_history h
            ${canonicalJoin('sc', 'h')}
            JOIN server_motds_registry r ON h.motd_id = r.id
            WHERE h.valid_to IS NULL
            ORDER BY sc.canonical_id, h.valid_from DESC
        ),
        latest_maps AS (
            SELECT DISTINCT ON (sc.canonical_id)
                sc.canonical_id,
                r.map_name   AS "mapName",
                r.game_mode  AS mode,
                r.mode_name  AS "modeName",
                h.valid_from
            FROM server_maps_history h
            ${canonicalJoin('sc', 'h')}
            JOIN server_maps_registry r ON h.map_id = r.id
            WHERE h.valid_to IS NULL
            ORDER BY sc.canonical_id, h.valid_from DESC
        ),
        latest_stats AS (
            -- The family member with the freshest server_current row wins --
            -- during a migration the old address can still answer polls a
            -- beat after the new one takes over, so "newest timestamp"
            -- (not "root" or "live member") is the honest tie-break.
            SELECT DISTINCT ON (sc.canonical_id)
                sc.canonical_id, cur.timestamp, cur.players, cur.max_players, cur.wave,
                cur.version, cur.version_type, cur.ping, cur.online
            FROM server_current cur
            ${canonicalJoin('sc', 'cur')}
            WHERE cur.timestamp > NOW() - interval '1 hour' * :hoursBack
              AND cur.players >= 0 AND cur.players < :maxRealisticPlayerCount
            ORDER BY sc.canonical_id, cur.timestamp DESC
        )
        SELECT
            lm.canonical_id AS id, sg.name, root.server_group_id AS "groupId",
            lm.host, lm.port, lm.country_code,
            fam.updated_at AS "lastUpdated", fam.last_seen,
            stats.online, stats.timestamp, stats.players,
            stats.max_players AS "playerLimit",
            stats.wave, stats.version, stats.version_type AS "versionType", stats.ping,
            motds."serverName", motds.description,
            maps."modeName", maps."mapName", maps.mode, root.aggregate_exclude AS "aggregateExclude"
        FROM live_members lm
        -- Family-level properties (group, exclusion) come from the ROOT row,
        -- so a merge can never leave half a family in a different group or
        -- excluded state than the other half.
        JOIN servers root             ON root.id = lm.canonical_id
        LEFT JOIN server_groups sg    ON root.server_group_id = sg.id
        LEFT JOIN family_meta fam     ON fam.canonical_id = lm.canonical_id
        LEFT JOIN latest_stats stats  ON stats.canonical_id = lm.canonical_id
        LEFT JOIN latest_motds motds  ON motds.canonical_id = lm.canonical_id
        LEFT JOIN latest_maps  maps   ON maps.canonical_id  = lm.canonical_id
        ORDER BY sg.name, lm.host, lm.port
    `, { replacements: { hoursBack, maxRealisticPlayerCount: MAX_REALISTIC_PLAYERCOUNT }, type: QueryTypes.SELECT });

    return rows.map((row): ServerElement => {
        const element: ServerElement = {
            id:          row.id,
            name:        row.name,
            groupId:     row.groupId,
            host:        row.host,
            port:        row.port,
            online:      row.online ?? false,
            lastSeen:    row.last_seen,
            lastUpdated: row.lastUpdated ? new Date(row.lastUpdated).getTime() : Date.now(),
            countryCode: row.country_code ?? null,
            // Was reading row.aggregate_exclude, which the SELECT never
            // produces (it's aliased "aggregateExclude") -- so this was
            // always undefined and fell through to the `?? false` default.
            aggregateExclude: row.aggregateExclude ?? false,
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

/** Full detail for a single server — delegates to the get_server_details() DB function. */
export async function getServer(serverId: number): Promise<(ServerElement & ServerDetails) | undefined> {
    const [result]: any = await sequelize.query(
        `SELECT * FROM get_server_details($1)`,
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
        aggregateExclude: result.detail_aggregate_exclude,
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

export async function getMapHistory(
    serverId: number,
    page: number    = 1,
    perPage: number = 20
): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * perPage;
    // serverId is a canonical id; history has to be read across the whole
    // family or an address change would silently truncate a server's past
    // (the old rows are still there, just under a different raw server_id).
    const family = serverFamilySql(':serverId');

    const [[{ count }], data]: any = await Promise.all([
        sequelize.query(
            `SELECT COUNT(*) AS count FROM server_maps_history WHERE server_id IN (${family})`,
            { replacements: { serverId }, type: QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT h.id, h.server_id, h.valid_from, h.valid_to,
                    r.map_name, r.game_mode, r.mode_name
             FROM server_maps_history h
             JOIN server_maps_registry r ON h.map_id = r.id
             WHERE h.server_id IN (${family})
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
    // Same family-wide reasoning as getMapHistory.
    const family = serverFamilySql(':serverId');

    const [[{ count }], data]: any = await Promise.all([
        sequelize.query(
            `SELECT COUNT(*) AS count FROM server_motds_history WHERE server_id IN (${family})`,
            { replacements: { serverId }, type: QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT h.id, h.server_id, h.valid_from, h.valid_to,
                    r.server_name, r.description
             FROM server_motds_history h
             JOIN server_motds_registry r ON h.motd_id = r.id
             WHERE h.server_id IN (${family})
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
 */
export async function getNetworkDetails(groupId: number): Promise<NetworkDetails | undefined> {
    const [row]: any = await sequelize.query(`
        WITH group_servers AS (
            -- Every raw server_id whose FAMILY belongs to this group and isn't
            -- excluded, canonical_id alongside. Mirrors familyMembersSql's
            -- join/predicate shape (root.*, not the raw row's own columns) --
            -- family membership is a root-level property, so an alias always
            -- inherits its root's group/exclusion rather than carrying its own.
            SELECT sc.server_id, sc.canonical_id
            FROM server_canonical sc
            JOIN servers root ON root.id = sc.canonical_id
            WHERE root.server_group_id = :groupId AND NOT root.aggregate_exclude
        ),
        group_families AS (
            -- Distinct family list once, so canonical_id-level joins below
            -- don't fan out across every raw alias in the family.
            SELECT DISTINCT canonical_id FROM group_servers
        ),
        latest_stats AS (
            -- Collapse to one row per FAMILY with MAX, never SUM: during an
            -- address migration both the old and new address can answer for
            -- a while, and summing would double-count one real server. The
            -- hour bound keeps long-dead servers from counting as active.
            SELECT gs.canonical_id, MAX(cur.players) AS players
            FROM group_servers gs
            JOIN server_current cur ON cur.server_id = gs.server_id
            WHERE cur.timestamp > NOW() - INTERVAL '1 hour'
            GROUP BY gs.canonical_id
        ),
        peaks AS (
            -- Hourly continuous aggregate: max() is decomposable, so
            -- max(max_players) is the same number the raw scan produced, without
            -- walking (and decompressing) every chunk back to day one. This
            -- already collapses aliases correctly -- MAX over the union of a
            -- group's raw members equals MAX over each family then MAX of those.
            SELECT
                MAX(max_players) FILTER (WHERE bucket > NOW() - interval '1 day')  AS daily_peak,
                MAX(max_players) FILTER (WHERE bucket > NOW() - interval '7 days') AS weekly_peak,
                MAX(max_players)                                                   AS all_time_peak
            FROM server_stats_1h
            WHERE server_id IN (SELECT server_id FROM group_servers)
        ),
        top_server AS (
            -- Canonical id + the family's LIVE address (what a visitor would
            -- actually connect to), player count MAX'd across the family.
            SELECT lm.canonical_id AS id, lm.host, lm.port, ls.players, sg2.name AS server_name
            FROM group_families gf
            JOIN (${LIVE_MEMBER_SQL}) lm ON lm.canonical_id = gf.canonical_id
            JOIN server_groups sg2       ON sg2.id = :groupId
            LEFT JOIN latest_stats ls    ON ls.canonical_id = gf.canonical_id
            ORDER BY ls.players DESC NULLS LAST
            LIMIT 1
        )
        SELECT
            sg.id,
            sg.name,
            (SELECT COUNT(*)                                   FROM group_families) AS total_servers,
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
