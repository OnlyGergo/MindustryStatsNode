-- ─────────────────────────────────────────────────────────────────────────────
-- 23_server_details_from_aggregates.sql
--
-- Rewrites get_server_details() so the server detail page stops doing two
-- unbounded scans of the server's entire history on every load:
--
--   * latest_stats  was an `ORDER BY timestamp DESC LIMIT 1` over server_stats
--                   with no time bound -> now a primary key lookup on
--                   server_current (migration 22).
--   * combined_stats computed six aggregates with `MAX(players) OVER ()` and
--                   friends over `WHERE server_id = server_id_param` only, i.e.
--                   a full per-server scan of the raw hypertable -> now read
--                   from the hourly continuous aggregate (migration 21), which
--                   is ~6M rows/year instead of ~50M and never decompresses.
--
-- Behaviour notes:
--   * detail_peak_date is now the hour bucket the all-time peak fell in, not
--     the exact sample timestamp.  The UI renders it as a date.
--   * The peaks and the uptime ratios now only count samples that passed the
--     players sanity filter baked into server_stats_5m, which is the same
--     filter every chart already applied.
--
-- Everything else about the function — its signature, its column list and the
-- map / MOTD CTEs — is unchanged from migration 20.
-- ─────────────────────────────────────────────────────────────────────────────

drop function get_server_details;

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
                     detail_all_maps json,
                     detail_all_motds json,
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
                     server_group_id integer
                 )
    language plpgsql
as
$$
BEGIN
    RETURN QUERY
        WITH current_server AS (
            SELECT s.id, sg.name, s.host, s.port, s.updated_at, s.server_group_id
            FROM servers s
                     INNER JOIN server_groups sg ON s.server_group_id = sg.id
            WHERE s.id = server_id_param
        ),
             -- One row per server, kept up to date by the collector.
             latest_stats AS (
                 SELECT players, max_players, wave, version, version_type, ping, online, timestamp
                 FROM server_current
                 WHERE server_id = server_id_param
             ),
             latest_motd AS (
                 SELECT
                     h.id,
                     h.server_id,
                     h.valid_from,
                     h.valid_to,
                     r.server_name,
                     r.description,
                     -- Point-in-time lookup to preserve the mode_name contract
                     (
                         SELECT rm.mode_name
                         FROM server_maps_history hm
                                  JOIN server_maps_registry rm ON hm.map_id = rm.id
                         WHERE hm.server_id = h.server_id
                           AND hm.valid_from <= h.valid_from
                         ORDER BY hm.valid_from DESC
                         LIMIT 1
                     ) as mode_name
                 FROM server_motds_history h
                          JOIN server_motds_registry r ON h.motd_id = r.id
                 WHERE h.server_id = server_id_param AND h.valid_to IS NULL
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             latest_map AS (
                 SELECT
                     h.id,
                     h.server_id,
                     h.valid_from,
                     h.valid_to,
                     r.map_name,
                     r.game_mode,
                     r.mode_name
                 FROM server_maps_history h
                          JOIN server_maps_registry r ON h.map_id = r.id
                 WHERE h.server_id = server_id_param AND h.valid_to IS NULL
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             -- Peaks and uptime come from the hourly continuous aggregate: max() is
             -- decomposable so max(max_players) is exact, and the uptime ratios
             -- are just sums of the per-bucket sample counters.
             aggregated_stats AS (
                 SELECT
                     MAX(max_players)                                                          AS all_time_peak,
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '24 hours')      AS daily_peak,
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '7 days')        AS weekly_peak,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '24 hours') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '24 hours'), 0) AS uptime_24h,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '7 days') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '7 days'), 0)   AS uptime_7d
                 FROM server_stats_1h
                 WHERE server_id = server_id_param
             ),
             -- Cheap: the aggregate's (server_id, bucket) index makes this a
             -- bounded scan of one server's hourly rows.
             peak_bucket AS (
                 SELECT bucket AS peak_timestamp
                 FROM server_stats_1h
                 WHERE server_id = server_id_param
                 ORDER BY max_players DESC NULLS LAST, bucket DESC
                 LIMIT 1
             ),
             all_maps AS (
                 SELECT json_agg(
                                json_build_object(
                                        'id', id,
                                        'serverId', server_id,
                                        'validFrom', extract(epoch from valid_from) * 1000,
                                        'validTo', CASE WHEN valid_to IS NOT NULL THEN extract(epoch from valid_to) * 1000 ELSE NULL END,
                                        'mapName', map_name,
                                        'gameMode', game_mode,
                                        'modeName', mode_name
                                ) ORDER BY valid_from
                        ) as all_maps_json
                 FROM (
                          SELECT h.id, h.server_id, h.valid_from, h.valid_to, r.map_name, r.game_mode, r.mode_name
                          FROM server_maps_history h
                                   JOIN server_maps_registry r ON h.map_id = r.id
                          WHERE h.server_id = server_id_param
                          ORDER BY h.valid_from DESC
                          LIMIT 100
                      ) all_map_records
             ),
             all_motds AS (
                 SELECT json_agg(
                                json_build_object(
                                        'id', id,
                                        'serverId', server_id,
                                        'validFrom', extract(epoch from valid_from) * 1000,
                                        'validTo', CASE WHEN valid_to IS NOT NULL THEN extract(epoch from valid_to) * 1000 ELSE NULL END,
                                        'serverName', server_name,
                                        'description', description,
                                        'modeName', mode_name
                                ) ORDER BY valid_from
                        ) as all_motds_json
                 FROM (
                          SELECT
                              h.id,
                              h.server_id,
                              h.valid_from,
                              h.valid_to,
                              r.server_name,
                              r.description,
                              -- Dynamic subquery to pull the active mode_name from maps timeline
                              (
                                  SELECT rm.mode_name
                                  FROM server_maps_history hm
                                           JOIN server_maps_registry rm ON hm.map_id = rm.id
                                  WHERE hm.server_id = h.server_id
                                    AND hm.valid_from <= h.valid_from
                                  ORDER BY hm.valid_from DESC
                                  LIMIT 1
                              ) as mode_name
                          FROM server_motds_history h
                                   JOIN server_motds_registry r ON h.motd_id = r.id
                          WHERE h.server_id = server_id_param
                          ORDER BY h.valid_from DESC
                          LIMIT 100
                      ) all_motd_records
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
            COALESCE(am.all_maps_json, '[]'::json),
            COALESCE(amt.all_motds_json, '[]'::json),
            agg.all_time_peak,
            pk.peak_timestamp,
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
            s.server_group_id
        FROM current_server s
                 LEFT JOIN latest_stats st ON true
                 LEFT JOIN latest_motd motd ON true
                 LEFT JOIN latest_map map ON true
                 LEFT JOIN all_maps am ON true
                 LEFT JOIN all_motds amt ON true
                 LEFT JOIN aggregated_stats agg ON true
                 LEFT JOIN peak_bucket pk ON true;
END;
$$;

alter function get_server_details(integer) owner to postgres;