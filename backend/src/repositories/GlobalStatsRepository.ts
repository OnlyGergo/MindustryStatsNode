import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type GamemodeHistoryEntry, type GamemodeInfo, type ServerShareEntry } from '../../../common/models/GlobalStatsTypes.js';
import {
    PLAYER_FILTER_REPLACEMENTS,
    aggregateExcludeSql,
    pickAggregateSource,
    playerFilterSql,
    type AggregateSource,
} from './aggregateTiers.js';

interface RawGamemodeHistoryRow {
    timestamp: number;
    clean_name: string;
    players: number | null;
}

interface RawGamemodeListRow {
    id: number;
    clean_name: string;
    server_count: number;
}

interface RawServerShareRow {
    timestamp: number;
    server_id: number;
    server_group_id: number;
    server_name: string;
    group_name: string;
    players: number | null;
}

/**
 * Range bounds shared by both builders.
 *
 * The end bound is exclusive but pushed out by one bucket so the bucket that is
 * currently filling up is still returned.
 */
function rangeBounds(startDate?: number, endDate?: number): { rangeStart: string; rangeEnd: string } {
    const fixedWindow = startDate != null && endDate != null;

    return {
        rangeStart: fixedWindow
            ? "time_bucket(:bucketSeconds * INTERVAL '1 second', to_timestamp(:startDate / 1000.0))"
            : "time_bucket(:bucketSeconds * INTERVAL '1 second', NOW() - interval '1 hour' * :hoursBack)",
        rangeEnd: fixedWindow
            ? "(time_bucket(:bucketSeconds * INTERVAL '1 second', to_timestamp(:endDate / 1000.0)) + :bucketSeconds * INTERVAL '1 second')"
            : "(time_bucket(:bucketSeconds * INTERVAL '1 second', NOW()) + :bucketSeconds * INTERVAL '1 second')",
    };
}

/**
 * Expression for the "instant" a cross-server total is summed over.
 *
 * Summing player counts only means anything if the rows being summed describe
 * the same moment.  The continuous aggregates already come pre-bucketed, so
 * their own bucket column is the finest honest instant available.  The raw
 * hypertable does not: every server is polled on its own schedule, so summing
 * by raw timestamp would put roughly one server in each "instant".  On that
 * path the rows get bucketed to the requested width first -- which on the raw
 * path is also the coarse width, so the peak-instant step below collapses to an
 * identity and full resolution is preserved.
 */
function fineBucketExpr(source: AggregateSource, alias: string): string {
    return source.needsPlayerFilter
        ? `time_bucket(:bucketSeconds * INTERVAL '1 second', ${alias}.${source.timeColumn})`
        : `${alias}.${source.timeColumn}`;
}

/** The coarse bucket a fine instant belongs to. */
const COARSE_OF = (col: string) => `time_bucket(:bucketSeconds * INTERVAL '1 second', ${col})`;

/**
 * Builds the SQL for bucketed gamemode history query.
 * Returns player counts grouped by gamemode per time bucket.
 *
 * Reads from the map-keyed continuous aggregates (see aggregateTiers.ts); the
 * gamemode is resolved from server_maps_registry at read time, so correcting a
 * map's classification takes effect immediately instead of needing years of
 * materialised data rebuilt.
 *
 * ── Why the shape is peak-instant rather than max-then-sum ──────────────────
 * The previous shape took MAX(players) per server across the whole coarse
 * bucket and then summed across servers.  Servers do not peak simultaneously,
 * so that summed a set of maxima that never coexisted: the wider the bucket,
 * the more the reported "peak" exceeded any concurrency that actually occurred,
 * until it plateaued once every server had hit its daily max inside one bucket.
 * A 24h bucket could report roughly double the real figure.
 *
 * It also keyed the per-server peak on gamemode_id, so a server that changed
 * mode inside the bucket contributed its peak once per mode.
 *
 * The order is now inverted.  Servers are deduplicated at the source's own
 * resolution (before gamemode is chosen, which kills the double count), summed
 * across servers per instant, and only then is the single busiest instant in
 * each coarse bucket selected.  What the chart plots is therefore a real
 * moment: the stacked total at each point is a concurrency figure that genuinely
 * happened, and every mode's slice is that same moment's breakdown, so the
 * series stay mutually consistent.
 */
function buildGamemodeHistoryQuery(
    hoursBack: number,
    bucketMinutes: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const source = pickAggregateSource(bucketMinutes);
    const time = source.timeColumn;
    const players = source.playersColumn;
    const fine = fineBucketExpr(source, 'src');
    const { rangeStart, rangeEnd } = rangeBounds(startDate, endDate);

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const conditions = [
        `src.${time} >= ${rangeStart}`,
        `src.${time} < ${rangeEnd}`,
        aggregateExcludeSql('src'),
        playerFilterSql(source, 'src'),
    ].filter((c): c is string => c != null);

    const query = `
        WITH per_server AS (
            -- One row per (instant, server).  Grouping stops here -- gamemode is
            -- NOT part of the key -- so a server that ran two maps, or two
            -- modes, inside one source bucket still contributes exactly one
            -- player count.  The mode it was running at its own peak is carried
            -- along so the row can still be attributed.
            --
            -- Most groups hold a single row (a server rarely changes map within
            -- one source bucket), so the ordered array_agg is close to free and
            -- avoids the full sort a DISTINCT ON would force.
            SELECT ${fine} AS fine_bucket,
                   src.server_id,
                   (array_agg(smr.gamemode_id ORDER BY src.${players} DESC))[1] AS gamemode_id,
                   MAX(src.${players}) AS players
            FROM ${source.mapTable} src
                     JOIN server_maps_registry smr ON src.map_registry_id = smr.id
            WHERE ${conditions.join('\n              AND ')}
            GROUP BY 1, 2
        ),
        per_instant AS (
            -- Cross-server total per mode, per instant.  Every row summed here
            -- describes the same moment, which is what makes the sum meaningful.
            SELECT fine_bucket, gamemode_id, SUM(players) AS players
            FROM per_server
            GROUP BY 1, 2
        ),
        peak_instant AS (
            -- The busiest instant inside each coarse bucket, decided on the
            -- global total across all modes.  One instant wins per bucket, so
            -- the per-mode slices reported below are a coherent snapshot rather
            -- than each mode's independent high-water mark.
            SELECT DISTINCT ON (${COARSE_OF('t.fine_bucket')}) t.fine_bucket
            FROM (
                SELECT fine_bucket, SUM(players) AS total
                FROM per_instant
                GROUP BY 1
            ) t
            ORDER BY ${COARSE_OF('t.fine_bucket')}, t.total DESC, t.fine_bucket
        )
        SELECT extract(epoch FROM g.gf_bucket) * 1000 AS timestamp,
               gr.clean_name,
               -- Gaps are NULL and SUM skips them, so a bucket only comes back
               -- NULL when every variant of the mode was idle -- which is the
               -- gap the chart wants to draw.
               SUM(g.players) AS players
        FROM (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           pin.fine_bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   pin.gamemode_id,
                   -- Exactly one instant survives per coarse bucket, so this
                   -- SUM passes the value through; it is here to satisfy the
                   -- gapfill grouping, not to combine anything.
                   SUM(pin.players) AS players
            FROM per_instant pin
                     JOIN peak_instant pk ON pk.fine_bucket = pin.fine_bucket
            GROUP BY gf_bucket, pin.gamemode_id
        ) g
        -- Name resolution last: one hash join against a table small enough to
        -- stay permanently resident, over the already-reduced result.  Merging
        -- on the display name here is what folds the colour-code variants of a
        -- mode back into a single series.
        JOIN gamemode_registry gr ON g.gamemode_id = gr.id
        GROUP BY g.gf_bucket, gr.clean_name
        ORDER BY g.gf_bucket, gr.clean_name
    `;

    const replacements = {
        ...timeParams,
        ...PLAYER_FILTER_REPLACEMENTS,
        bucketSeconds: source.bucketMinutes * 60,
    };
    return { query, replacements };
}

/**
 * Builds the SQL for bucketed server share query for a specific gamemode.
 * Returns player counts per server with group info.
 *
 * Same peak-instant shape as the history query, and deliberately so: this chart
 * is a breakdown of one of that chart's series, so both have to pick the same
 * moment inside a bucket or the share chart's total will not reconcile with the
 * mode's line.  Each server's value is what it had at the busiest instant for
 * this mode inside the bucket, not its independent high-water mark.
 *
 * modeId identifies a display name (a clean_name), not a single registry row --
 * see the gamemode filter below.
 */
function buildServerShareQuery(
    modeId: number,
    hoursBack: number,
    bucketMinutes: number,
    startDate?: number,
    endDate?: number
): { query: string; replacements: Record<string, unknown> } {
    const source = pickAggregateSource(bucketMinutes);
    const time = source.timeColumn;
    const players = source.playersColumn;
    const fine = fineBucketExpr(source, 'src');
    const { rangeStart, rangeEnd } = rangeBounds(startDate, endDate);

    const timeParams =
        startDate != null && endDate != null
            ? { startDate, endDate }
            : { hoursBack };

    const conditions = [
        // Not `= :modeInt`: the history chart merges every registry row sharing
        // a clean_name into one series, and the dropdown hands back a single
        // representative ID for that merged series, so the share query has to
        // widen it back out to the whole family.  A vanilla mode is the extreme
        // case -- (0, ''), (0, 'Survival') and (0, '[accent]Survival') are three
        // registry rows that all display as Survival -- and filtering on one of
        // them returned one variant's servers instead of the mode's.
        `smr.gamemode_id IN (
             SELECT variant.id
             FROM gamemode_registry variant
             JOIN gamemode_registry picked ON picked.id = :modeInt
             WHERE variant.clean_name = picked.clean_name
         )`,
        `src.${time} >= ${rangeStart}`,
        `src.${time} < ${rangeEnd}`,
        // Matches the history chart's scope.  Without this an excluded server
        // would appear in the breakdown of a mode whose line does not count it.
        aggregateExcludeSql('src'),
        playerFilterSql(source, 'src'),
    ].filter((c): c is string => c != null);

    const query = `
        WITH per_server AS (
            -- Peak per (instant, server): a server that flipped between two
            -- variants of this mode inside one source bucket counts once.
            SELECT ${fine} AS fine_bucket,
                   src.server_id,
                   MAX(src.${players}) AS players
            FROM ${source.mapTable} src
                     JOIN server_maps_registry smr ON src.map_registry_id = smr.id
            WHERE ${conditions.join('\n              AND ')}
            GROUP BY 1, 2
        ),
        peak_instant AS (
            -- Busiest instant for this mode inside each coarse bucket.
            SELECT DISTINCT ON (${COARSE_OF('t.fine_bucket')}) t.fine_bucket
            FROM (
                SELECT fine_bucket, SUM(players) AS total
                FROM per_server
                GROUP BY 1
            ) t
            ORDER BY ${COARSE_OF('t.fine_bucket')}, t.total DESC, t.fine_bucket
        ),
        bucketed_stats AS (
            SELECT time_bucket_gapfill(
                           :bucketSeconds * INTERVAL '1 second',
                           ps.fine_bucket,
                           ${rangeStart},
                           ${rangeEnd}
                   ) AS gf_bucket,
                   ps.server_id,
                   -- One surviving instant per bucket; gaps stay NULL, and a
                   -- server absent at the winning instant is a gap for that
                   -- bucket, which is the honest answer.
                   MAX(ps.players) AS players
            FROM per_server ps
                     JOIN peak_instant pk ON pk.fine_bucket = ps.fine_bucket
            GROUP BY gf_bucket, ps.server_id
        )
        SELECT
            extract(epoch FROM bs.gf_bucket) * 1000 AS timestamp,
            bs.server_id,
            s.server_group_id,
            '' AS server_name,
            sg.name AS group_name,
            bs.players
        FROM bucketed_stats bs
                 -- Join the metadata AFTER the heavy lifting is done
                 JOIN servers s ON bs.server_id = s.id
                 JOIN server_groups sg ON s.server_group_id = sg.id
        ORDER BY bs.gf_bucket, bs.server_id;
    `;

    const replacements = {
        ...timeParams,
        ...PLAYER_FILTER_REPLACEMENTS,
        bucketSeconds: source.bucketMinutes * 60,
        modeInt: modeId,
    };
    return { query, replacements };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get global player history grouped by mode_name
 */
export async function getGlobalGamemodeHistory(
    hoursBack: number = 24,
    bucketMinutes: number = 1,
    startDate?: number,
    endDate?: number
): Promise<GamemodeHistoryEntry[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1;
    }

    const { query, replacements } = buildGamemodeHistoryQuery(
        hoursBack,
        bucketMinutes,
        startDate,
        endDate
    );

    const rows = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as RawGamemodeHistoryRow[];

    // clean_name is stored already stripped and already backed off to the
    // vanilla name, so there is nothing left to do per row here.
    return rows.map(r => ({
        timestamp: Number(r.timestamp),
        modeName:  r.clean_name || 'Unknown',
        cleanName: r.clean_name || 'Unknown',
        players:   r.players == null ? null : Number(r.players)
    }));
}

/**
 * Get list of all gamemodes with server counts
 */
export async function getGamemodeList(): Promise<GamemodeInfo[]> {
    // One entry per display name, matching how the history chart groups its
    // series.  The old shape grouped on (clean_name, id) and then picked the
    // busiest row per name with DISTINCT ON, which both under-counted servers
    // (only the winning variant's) and handed the client an ID that stood for a
    // single registry row rather than the mode as a whole.  MIN(id) is a stable
    // representative of the family; getServerShareByGamemode expands it again.
    const query = `
      SELECT MIN(gr.id) AS id,
        gr.clean_name,
        COUNT(DISTINCT smh.server_id) AS server_count
      FROM gamemode_registry gr
        JOIN server_maps_registry smr ON smr.gamemode_id = gr.id
        JOIN server_maps_history smh ON smh.map_id = smr.id
      GROUP BY gr.clean_name
      ORDER BY gr.clean_name;
    `;

    const rows = await sequelize.query(query, {
        type: QueryTypes.SELECT
    }) as RawGamemodeListRow[];

    return rows.map(r => {
      return {
            modeId: Number(r.id),
            cleanModeName: r.clean_name,
            serverCount: Number(r.server_count),
        };
    });
}

/**
 * Get server share for a specific gamemode
 */
export async function getServerShareByGamemode(
    modeId: number,
    hoursBack: number = 24,
    bucketMinutes: number = 1,
    startDate?: number,
    endDate?: number
): Promise<ServerShareEntry[]> {
    if (bucketMinutes < 1) {
        bucketMinutes = 1;
    }

    const { query, replacements } = buildServerShareQuery(
        modeId,
        hoursBack,
        bucketMinutes,
        startDate,
        endDate
    );

    const rows = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
    }) as RawServerShareRow[];

    return rows.map(r => ({
        timestamp: Number(r.timestamp),
        serverId: Number(r.server_id),
        serverGroupId: Number(r.server_group_id),
        serverName: r.server_name,
        groupName: r.group_name,
        players: r.players == null ? null : Number(r.players)
    }));
}