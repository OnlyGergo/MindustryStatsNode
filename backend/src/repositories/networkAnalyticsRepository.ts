// ─────────────────────────────────────────────────────────────────────────────
// networkAnalyticsRepository.ts
// Read-only analytics for one network (server group): activity profile and
// gamemode/map/version/country breakdown.  Membership is the same rule
// getNetworkDetails uses: families whose ROOT has server_group_id = :groupId
// and NOT aggregate_exclude.  Aliases collapse with MAX, never SUM, and
// anything counting servers counts DISTINCT canonical ids.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import type {
    NetworkActivityCell,
    NetworkBreakdown,
} from '../../../common/models/networkAnalytics.js';
import { MAX_REALISTIC_PLAYERCOUNT } from '../const.js';
import { liveMemberSql } from './canonicalIdentity.js';

const GROUP_SERVERS_CTE = `
        group_servers AS (
            SELECT sc.server_id, sc.canonical_id
            FROM server_canonical sc
            JOIN servers root ON root.id = sc.canonical_id
            WHERE root.server_group_id = :groupId AND NOT root.aggregate_exclude
        )`;

/**
 * Average network players by (ISO weekday, hour), UTC.
 *
 * Uses the MEAN (sum_players / samples) of each hour bucket rather than the
 * peak: the question is "when is it busy on average", and averaging peaks would
 * overstate every cell.  Per hour: MAX across a family's aliases, SUM across
 * families = network players that hour; then AVG per (dow, hour) over the window.
 * Hours with no data are absent rather than zero.
 */
export async function getNetworkActivity(groupId: number, days: number): Promise<NetworkActivityCell[]> {
    const rows: any[] = await sequelize.query(`
        WITH ${GROUP_SERVERS_CTE},
        fam_hour AS (
            SELECT gs.canonical_id, st.bucket,
                   MAX(st.sum_players::float8 / NULLIF(st.samples, 0)) AS mean_players
            FROM server_stats_1h st
            JOIN group_servers gs ON gs.server_id = st.server_id
            WHERE st.bucket > NOW() - make_interval(days => CAST(:days AS int))
            GROUP BY gs.canonical_id, st.bucket
        ),
        net_hour AS (
            SELECT bucket, SUM(mean_players) AS players
            FROM fam_hour
            WHERE mean_players IS NOT NULL
            GROUP BY bucket
        )
        SELECT CAST(EXTRACT(ISODOW FROM bucket AT TIME ZONE 'UTC') AS int) AS dow,
               CAST(EXTRACT(HOUR   FROM bucket AT TIME ZONE 'UTC') AS int) AS hour,
               AVG(players)::float8 AS avg
        FROM net_hour
        GROUP BY 1, 2
        ORDER BY 1, 2
    `, { replacements: { groupId, days }, type: QueryTypes.SELECT });

    return rows.map((r) => ({ dow: Number(r.dow), hour: Number(r.hour), avg: Number(r.avg) || 0 }));
}

/** Modes, top maps, version spread and countries for one network. */
export async function getNetworkBreakdown(groupId: number): Promise<NetworkBreakdown> {
    const familyScope = `sc.canonical_id IN (SELECT root.id FROM servers root WHERE root.server_group_id = :groupId AND NOT root.aggregate_exclude)`;
    const replacements = { groupId, maxRealisticPlayerCount: MAX_REALISTIC_PLAYERCOUNT };

    const [modes, maps, versions, countries] = await Promise.all([
        // Online families only. Players are MAX across the family's answering
        // aliases; the map/mode/version come from the freshest alias, same
        // tie-break as latest_stats in getAllServerElements.
        sequelize.query(`
            WITH ${GROUP_SERVERS_CTE},
            fam_now AS (
                SELECT DISTINCT ON (gs.canonical_id)
                       gs.canonical_id, cur.map_registry_id,
                       MAX(cur.players) OVER (PARTITION BY gs.canonical_id) AS players
                FROM group_servers gs
                JOIN server_current cur ON cur.server_id = gs.server_id
                WHERE cur.online
                  AND cur.timestamp > NOW() - INTERVAL '1 hour'
                  AND cur.players >= 0 AND cur.players < :maxRealisticPlayerCount
                ORDER BY gs.canonical_id, cur.timestamp DESC
            )
            SELECT COALESCE(gr.clean_name, 'Unknown') AS mode,
                   COUNT(DISTINCT f.canonical_id) AS servers,
                   COALESCE(SUM(f.players), 0)    AS players
            FROM fam_now f
            LEFT JOIN server_maps_registry mr ON mr.id = f.map_registry_id
            LEFT JOIN gamemode_registry gr    ON gr.id = mr.gamemode_id
            GROUP BY 1
            ORDER BY players DESC, servers DESC, mode
        `, { replacements, type: QueryTypes.SELECT }),

        // Player-hours per map over 7 days. Each (server, hour) row of the
        // by-map aggregate is weighted by its share of that server's samples in
        // the hour, so a map held for 20 of 60 minutes gets a third of the
        // hour's mean. Aliases then collapse with MAX per (family, hour, map).
        sequelize.query(`
            WITH ${GROUP_SERVERS_CTE},
            per_raw AS (
                SELECT st.server_id, st.bucket, st.map_registry_id,
                       st.sum_players::float8
                         / NULLIF(SUM(st.samples) OVER (PARTITION BY st.server_id, st.bucket), 0) AS contribution
                FROM server_stats_1h_by_map st
                WHERE st.bucket > NOW() - INTERVAL '7 days'
                  AND st.server_id IN (SELECT server_id FROM group_servers)
            ),
            per_family AS (
                SELECT gs.canonical_id, r.bucket, r.map_registry_id, MAX(r.contribution) AS contribution
                FROM per_raw r
                JOIN group_servers gs ON gs.server_id = r.server_id
                WHERE r.contribution IS NOT NULL
                GROUP BY gs.canonical_id, r.bucket, r.map_registry_id
            )
            SELECT mr.map_name AS "mapName", gr.clean_name AS mode,
                   SUM(pf.contribution)::float8 AS "playerHours"
            FROM per_family pf
            JOIN server_maps_registry mr   ON mr.id = pf.map_registry_id
            LEFT JOIN gamemode_registry gr ON gr.id = mr.gamemode_id
            GROUP BY pf.map_registry_id, mr.map_name, gr.clean_name
            ORDER BY "playerHours" DESC, mr.map_name
            LIMIT 10
        `, { replacements, type: QueryTypes.SELECT }),

        sequelize.query(`
            WITH ${GROUP_SERVERS_CTE},
            fam_now AS (
                SELECT DISTINCT ON (gs.canonical_id)
                       gs.canonical_id, cur.version, cur.version_type
                FROM group_servers gs
                JOIN server_current cur ON cur.server_id = gs.server_id
                WHERE cur.online AND cur.timestamp > NOW() - INTERVAL '1 hour'
                ORDER BY gs.canonical_id, cur.timestamp DESC
            )
            SELECT version, version_type AS "versionType", COUNT(DISTINCT canonical_id) AS servers
            FROM fam_now
            GROUP BY version, version_type
            ORDER BY servers DESC, version DESC NULLS LAST
        `, { replacements, type: QueryTypes.SELECT }),

        // Country of each family's LIVE member (the root is the stalest row).
        sequelize.query(`
            WITH live AS (${liveMemberSql(familyScope)})
            SELECT country_code AS "countryCode", COUNT(DISTINCT canonical_id) AS servers
            FROM live
            GROUP BY country_code
            ORDER BY servers DESC, country_code NULLS LAST
        `, { replacements, type: QueryTypes.SELECT }),
    ]) as [any[], any[], any[], any[]];

    return {
        modes: modes.map((r: any) => ({ mode: r.mode, servers: Number(r.servers), players: Number(r.players) || 0 })),
        maps: maps.map((r: any) => ({ mapName: r.mapName, mode: r.mode ?? null, playerHours: Number(r.playerHours) || 0 })),
        versions: versions.map((r: any) => ({
            version: r.version ?? null, versionType: r.versionType ?? null, servers: Number(r.servers),
        })),
        countries: countries.map((r: any) => ({ countryCode: r.countryCode ?? null, servers: Number(r.servers) })),
    };
}
