--no-tran
-- ─────────────────────────────────────────────────────────────────────────────
-- 21_continuous_aggregates.sql
--
-- Every chart endpoint used to run `time_bucket(...) ... GROUP BY bucket`
-- directly against the raw `server_stats` hypertable.  On compressed chunks
-- that forces TimescaleDB to decompress every row in range before it can
-- bucket anything (there is no pushdown for arbitrary time_bucket grouping),
-- so a 12-month global chart decompressed ~50M rows to produce ~300 points.
--
-- All four chart queries reduce to the same base shape:
--     per (bucket, server_id, map_registry_id) -> max players
-- so one base continuous aggregate plus two rollups serve everything.
--
-- NOTE: the `players` sanity filter (MAX_REALISTIC_PLAYERCOUNT in
--       backend/src/const.ts) is baked into the base aggregate below.  If that
--       constant ever changes, this view has to be recreated and rebuilt.
--
-- NOTE: run this file statement by statement.  `CALL refresh_continuous_aggregate`
--       cannot run inside a transaction block, so do not wrap it in BEGIN/COMMIT
--       (i.e. do not use `psql -1`).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Base: 5-minute resolution, keyed by server + map ────────────────────────
-- Grouped by map_registry_id rather than by a resolved gamemode on purpose:
-- re-classifying a mode later then does not invalidate years of materialised
-- data.  Cardinality barely increases, since a server usually only has one map
-- per 5-minute bucket.
--
-- sum_players + samples are stored instead of avg(players) so that the hourly
-- rollups below can recompute a correct weighted average (avg is not
-- decomposable, sum and count are).
CREATE MATERIALIZED VIEW server_stats_5m
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('5 minutes', timestamp)     AS bucket,
    server_id,
    map_registry_id,
    max(players)                            AS max_players,
    min(players)                            AS min_players,
    sum(players)                            AS sum_players,
    count(*)                                AS samples,
    sum(CASE WHEN online THEN 1 ELSE 0 END) AS online_samples,
    max(wave)                               AS max_wave,
    avg(ping)                               AS avg_ping
FROM server_stats
WHERE players >= 0 AND players < 1000       -- MAX_REALISTIC_PLAYERCOUNT
GROUP BY bucket, server_id, map_registry_id
WITH NO DATA;


-- ─── Rollup: hourly, server-only ─────────────────────────────────────────────
-- Serves the global / network / per-server long-range charts.
--
-- Nested aggregates need TimescaleDB >= 2.9.  If your version refuses
-- real-time aggregation on a nested aggregate, drop the option:
--     ALTER MATERIALIZED VIEW server_stats_1h        SET (timescaledb.materialized_only = true);
--     ALTER MATERIALIZED VIEW server_stats_1h_by_map SET (timescaledb.materialized_only = true);
-- The hourly views only serve ranges of a week or more, where up to an hour of
-- materialisation lag on the newest bucket is invisible on the chart.
-- ~679 servers x 24h x 365 = ~6M rows/year, versus ~50M/year raw.
CREATE MATERIALIZED VIEW server_stats_1h
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('1 hour', bucket) AS bucket,
    server_id,
    max(max_players)              AS max_players,
    min(min_players)              AS min_players,
    sum(sum_players)              AS sum_players,
    sum(samples)                  AS samples,
    sum(online_samples)           AS online_samples,
    max(max_wave)                 AS max_wave
FROM server_stats_5m
GROUP BY 1, 2
WITH NO DATA;


-- ─── Rollup: hourly, keyed by map ────────────────────────────────────────────
-- Serves the gamemode / server-share charts on long ranges.  Kept on
-- map_registry_id (rather than resolving game_mode at materialisation time via
-- a JOIN, which needs TimescaleDB >= 2.10 anyway) so the registry stays the
-- single source of truth for mode classification and can be corrected later
-- without rebuilding the aggregate.  The registry join happens at read time.
CREATE MATERIALIZED VIEW server_stats_1h_by_map
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
    time_bucket('1 hour', bucket) AS bucket,
    server_id,
    map_registry_id,
    max(max_players)              AS max_players,
    sum(sum_players)              AS sum_players,
    sum(samples)                  AS samples,
    sum(online_samples)           AS online_samples
FROM server_stats_5m
GROUP BY 1, 2, 3
WITH NO DATA;


-- ─── Refresh policies ────────────────────────────────────────────────────────
-- end_offset keeps the policy away from the most recent data; the gap is
-- covered by real-time aggregation (materialized_only = false), which unions
-- the not-yet-materialised tail in at query time, so the live view stays live.
SELECT add_continuous_aggregate_policy('server_stats_5m',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('server_stats_1h',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes');

SELECT add_continuous_aggregate_policy('server_stats_1h_by_map',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes');


-- ─── Backfill ────────────────────────────────────────────────────────────────
-- These decompress the whole history once.  On a ~50M row hypertable the full
-- refresh takes a while and holds resources, so prefer running it in windows,
-- oldest first, one statement at a time, e.g.:
--
--   CALL refresh_continuous_aggregate('server_stats_5m', '2026-01-01', '2026-02-01');
--   CALL refresh_continuous_aggregate('server_stats_5m', '2026-02-01', '2026-03-01');
--   ...
--
-- (a loop is not possible here: refresh_continuous_aggregate cannot run inside
--  a transaction block, which includes DO blocks).
--
-- The rollups must be refreshed after the base view, since they read from it.
CALL refresh_continuous_aggregate('server_stats_5m',        null, NULL);
CALL refresh_continuous_aggregate('server_stats_1h',        NULL, NULL);
CALL refresh_continuous_aggregate('server_stats_1h_by_map', NULL, NULL);


-- ─── Read-path indexes ───────────────────────────────────────────────────────
-- TimescaleDB creates (group-by column, bucket DESC) indexes for each grouping
-- column automatically.  The global charts scan by bucket alone, so give them a
-- plain time index as well.
CREATE INDEX IF NOT EXISTS idx_server_stats_5m_bucket
    ON server_stats_5m (bucket DESC);

CREATE INDEX IF NOT EXISTS idx_server_stats_1h_bucket
    ON server_stats_1h (bucket DESC);

CREATE INDEX IF NOT EXISTS idx_server_stats_1h_by_map_bucket
    ON server_stats_1h_by_map (bucket DESC);
