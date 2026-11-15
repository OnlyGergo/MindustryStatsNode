-- ─────────────────────────────────────────────────────────────────────────────
-- 43_server_details_slim.sql
--
-- A cold /server/<id> page could still take 5s+ after 41_server_peaks.sql.
-- What was left was the map/MOTD history get_server_details built on every call:
--
--   * up to 100 maps and 100 MOTDs as JSON, rendered below the fold and
--     shipped twice in the SSR HTML (markup + dehydrated loader data);
--   * a correlated "mode_name at that time" map lookup for EACH of those 100
--     MOTDs, which the history table never even displayed;
--   * every family filter written as `server_id IN (SELECT ... FROM family)`.
--     Against a materialised CTE that is a semi-join the planner may satisfy
--     by walking a whole valid_from index backwards and filtering by
--     server_id, so a server whose last change is old scans most of the table.
--
-- The history now comes from the paginated /map-history and /motd-history
-- endpoints, fetched by the tables after hydration, so the function drops
-- those two columns (hence DROP + CREATE: the row type changes).  Every
-- "newest row of the family" read is a LATERAL per member (families are 1-3
-- rows), which is always an index probe on (server_id, valid_from DESC).
--
-- The rollout is safe in either order: the backend treats the missing history
-- columns as absent, and only reads columns this function still returns.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Indexes ────────────────────────────────────────────────────────────────
-- Only partial (valid_to IS NULL) indexes were ever created on purpose; the
-- full-history ones were the "tmp_" leftovers of legacy migration 18, if they
-- still exist at all.  Replace them with properly named, sorted indexes; the
-- leading (server_id, valid_from) columns are the same, so nothing that used
-- the tmp ones loses its index.
CREATE INDEX IF NOT EXISTS idx_map_history_server_from
    ON server_maps_history (server_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_motd_history_server_from
    ON server_motds_history (server_id, valid_from DESC);

DROP INDEX IF EXISTS tmp_idx_map_history_windows;
DROP INDEX IF EXISTS tmp_idx_motd_history_windows;

-- ─── get_server_details without the history ─────────────────────────────────

drop function if exists get_server_details(integer);

create function get_server_details(server_id_param integer)
    returns TABLE(
                     detail_id integer,
                     detail_name character varying,
                     detail_host character varying,
                     detail_port integer,
                     detail_last_updated timestamp with time zone,
                     detail_online boolean,
                     detail_timestamp timestamp with time zone,
                     detail_players integer,
                     detail_player_limit integer,
                     detail_wave integer,
                     detail_version integer,
                     detail_version_type character varying,
                     detail_ping integer,
                     detail_display_name text,
                     detail_description text,
                     detail_mode_name text,
                     detail_map_name text,
                     detail_mode smallint,
                     detail_all_time_peak integer,
                     detail_peak_date timestamp with time zone,
                     detail_daily_peak integer,
                     detail_weekly_peak integer,
                     detail_24h_uptime numeric,
                     detail_7d_uptime numeric,
        -- All columns from server_motds
                     detail_motd_id integer,
                     detail_motd_server_id integer,
                     detail_motd_valid_from timestamp with time zone,
                     detail_motd_valid_to timestamp with time zone,
                     detail_motd_server_name text,
                     detail_motd_description text,
        -- All columns from server_maps
                     detail_map_id integer,
                     detail_map_server_id integer,
                     detail_map_valid_from timestamp with time zone,
                     detail_map_valid_to timestamp with time zone,
                     detail_map_map_name text,
                     detail_map_game_mode smallint,
                     detail_motd_mode_name text,
                     server_group_id integer,
                     detail_aggregate_exclude boolean
                 )
    language plpgsql
as
$$
BEGIN
    RETURN QUERY
        WITH family AS (
            -- server_canonical never chains (see 30_server_identity.sql), so
            -- every row pointing at server_id_param's root is the family.
            SELECT sc.server_id
            FROM server_canonical sc
            WHERE sc.canonical_id = (
                SELECT canonical_id FROM server_canonical WHERE server_id = server_id_param
            )
        ),
             root AS (
                 -- Family-level identity and properties come from the root.
                 SELECT s.id, sg.name, s.server_group_id, s.aggregate_exclude
                 FROM servers s
                          INNER JOIN server_groups sg ON s.server_group_id = sg.id
                 WHERE s.id = (
                     SELECT canonical_id FROM server_canonical WHERE server_id = server_id_param
                 )
             ),
             live_address AS (
                 -- Same ordering as LIVE_MEMBER_SQL in canonicalIdentity.ts:
                 -- the list and the detail view must show the same address.
                 SELECT s.host, s.port, s.updated_at
                 FROM family f
                          JOIN servers s ON s.id = f.server_id
                 ORDER BY (s.retired_at IS NULL) DESC, s.last_seen DESC NULLS LAST, s.id DESC
                 LIMIT 1
             ),
             current_server AS (
                 SELECT
                     r.id,
                     r.name,
                     COALESCE(la.host, root_s.host)             AS host,
                     COALESCE(la.port, root_s.port)              AS port,
                     COALESCE(la.updated_at, root_s.updated_at)  AS updated_at,
                     r.server_group_id,
                     r.aggregate_exclude
                 FROM root r
                          INNER JOIN servers root_s ON root_s.id = r.id
                          LEFT JOIN live_address la ON true
             ),
             -- The family member holding the freshest snapshot.
             latest_stats AS (
                 SELECT c.players, c.max_players, c.wave, c.version, c.version_type, c.ping, c.online, c.timestamp
                 FROM family f
                          JOIN server_current c ON c.server_id = f.server_id
                 ORDER BY c.timestamp DESC
                 LIMIT 1
             ),
             -- Several aliases can each still have an open row (a move never
             -- closes the old alias's), so the current one is whichever open
             -- row was opened last.  One index probe per member, then pick.
             latest_map AS (
                 SELECT h.id, h.server_id, h.valid_from, h.valid_to, r.map_name, r.game_mode, r.mode_name
                 FROM family f
                          CROSS JOIN LATERAL (
                     SELECT hm.id, hm.server_id, hm.map_id, hm.valid_from, hm.valid_to
                     FROM server_maps_history hm
                     WHERE hm.server_id = f.server_id AND hm.valid_to IS NULL
                     ORDER BY hm.valid_from DESC
                     LIMIT 1
                     ) h
                          JOIN server_maps_registry r ON h.map_id = r.id
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             latest_motd AS (
                 SELECT
                     h.id,
                     h.server_id,
                     h.valid_from,
                     h.valid_to,
                     r.server_name,
                     r.description,
                     -- The family's mode name as of when this MOTD opened:
                     -- one probe per member, newest wins.
                     (
                         SELECT rm.mode_name
                         FROM family f2
                                  CROSS JOIN LATERAL (
                             SELECT hm.map_id, hm.valid_from
                             FROM server_maps_history hm
                             WHERE hm.server_id = f2.server_id
                               AND hm.valid_from <= h.valid_from
                             ORDER BY hm.valid_from DESC
                             LIMIT 1
                             ) m
                                  JOIN server_maps_registry rm ON m.map_id = rm.id
                         ORDER BY m.valid_from DESC
                         LIMIT 1
                     ) AS mode_name
                 FROM family f
                          CROSS JOIN LATERAL (
                     SELECT hm.id, hm.server_id, hm.motd_id, hm.valid_from, hm.valid_to
                     FROM server_motds_history hm
                     WHERE hm.server_id = f.server_id AND hm.valid_to IS NULL
                     ORDER BY hm.valid_from DESC
                     LIMIT 1
                     ) h
                          JOIN server_motds_registry r ON h.motd_id = r.id
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             -- Collapse the family to one row per bucket before aggregating:
             -- MAX across aliases, never SUM (see 41_server_peaks.sql).
             family_stats_1h AS (
                 SELECT
                     s.bucket,
                     MAX(s.max_players)    AS max_players,
                     MAX(s.samples)        AS samples,
                     MAX(s.online_samples) AS online_samples
                 FROM family f
                          JOIN server_stats_1h s ON s.server_id = f.server_id
                 WHERE s.bucket > NOW() - interval '7 days'
                 GROUP BY s.bucket
             ),
             aggregated_stats AS (
                 SELECT
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '24 hours')      AS daily_peak,
                     MAX(max_players)                                                          AS weekly_peak,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '24 hours') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '24 hours'), 0) AS uptime_24h,
                     SUM(online_samples) * 100.0 / NULLIF(SUM(samples), 0)                     AS uptime_7d
                 FROM family_stats_1h
             ),
             -- Maintained by the collector; ties go to when the record was first set.
             all_time AS (
                 SELECT p.all_time_peak, p.peak_at
                 FROM family f
                          JOIN server_peaks p ON p.server_id = f.server_id
                 ORDER BY p.all_time_peak DESC, p.peak_at ASC
                 LIMIT 1
             )
        SELECT
            s.id,
            s.name,
            s.host,
            s.port,
            s.updated_at,
            st.online,
            st.timestamp,
            st.players,
            st.max_players,
            st.wave,
            st.version,
            st.version_type,
            st.ping,
            motd.server_name,
            motd.description,
            motd.mode_name,
            map.map_name,
            map.game_mode,
            atp.all_time_peak,
            atp.peak_at,
            agg.daily_peak,
            agg.weekly_peak,
            agg.uptime_24h,
            agg.uptime_7d,
            -- All motd columns
            motd.id,
            motd.server_id,
            motd.valid_from,
            motd.valid_to,
            motd.server_name,
            motd.description,
            -- All map columns
            map.id,
            map.server_id,
            map.valid_from,
            map.valid_to,
            map.map_name,
            map.game_mode,
            map.mode_name,
            s.server_group_id,
            s.aggregate_exclude
        FROM current_server s
                 LEFT JOIN latest_stats st ON true
                 LEFT JOIN latest_motd motd ON true
                 LEFT JOIN latest_map map ON true
                 LEFT JOIN aggregated_stats agg ON true
                 LEFT JOIN all_time atp ON true;
END;
$$;

alter function get_server_details(integer) owner to postgres;
