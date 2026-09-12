-- ─────────────────────────────────────────────────────────────────────────────
-- 30_server_details_canonical.sql
--
-- Makes get_server_details() speak identities instead of observation streams
-- (migration 29).  server_id_param is now a *canonical* id, and every CTE that
-- used `server_id = server_id_param` widens to the whole family:
--
--   * address / group / country come from server_identity, i.e. from the stream
--     the server is answering on *today* — the canonical root holds the address
--     the server has already moved off.
--   * the map / MOTD timelines are the union of the family's, so a migration
--     does not truncate the history at the switchover.
--   * peaks and uptime take the per-bucket MAX across the family rather than
--     the SUM.  The two streams of a migrating server overlap while the old
--     address keeps answering, and summing there would invent players; MAX is
--     also what the chart queries do, so the peak on the page and the peak on
--     the graph agree.
--
-- The signature and the column list are unchanged, so nothing else has to move
-- in step.
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
        WITH family AS (
            SELECT server_id FROM server_family(server_id_param) AS server_id
        ),
             current_server AS (
                 SELECT si.id, sg.name, si.host, si.port, si.updated_at, si.server_group_id
                 FROM server_identity si
                          INNER JOIN server_groups sg ON si.server_group_id = sg.id
                 WHERE si.id = server_id_param
             ),
             -- One row per stream, kept up to date by the collector; after a
             -- migration the retired stream's row goes stale, so the newest
             -- sample in the family wins.
             latest_stats AS (
                 SELECT players, max_players, wave, version, version_type, ping, online, timestamp
                 FROM server_current
                 WHERE server_id IN (SELECT server_id FROM family)
                 ORDER BY timestamp DESC
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
                     -- Point-in-time lookup to preserve the mode_name contract
                     (
                         SELECT rm.mode_name
                         FROM server_maps_history hm
                                  JOIN server_maps_registry rm ON hm.map_id = rm.id
                         WHERE hm.server_id IN (SELECT server_id FROM family)
                           AND hm.valid_from <= h.valid_from
                         ORDER BY hm.valid_from DESC
                         LIMIT 1
                     ) as mode_name
                 FROM server_motds_history h
                          JOIN server_motds_registry r ON h.motd_id = r.id
                 WHERE h.server_id IN (SELECT server_id FROM family) AND h.valid_to IS NULL
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
                 WHERE h.server_id IN (SELECT server_id FROM family) AND h.valid_to IS NULL
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             -- Collapse the family to one row per hour first, then aggregate:
             -- max() over the streams is the identity's player count, and the
             -- sample counters follow the same rule so an overlap cannot push
             -- the uptime ratio past what any single stream reported.
             family_hours AS (
                 SELECT bucket,
                        MAX(max_players)    AS max_players,
                        MAX(samples)        AS samples,
                        MAX(online_samples) AS online_samples
                 FROM server_stats_1h
                 WHERE server_id IN (SELECT server_id FROM family)
                 GROUP BY bucket
             ),
             aggregated_stats AS (
                 SELECT
                     MAX(max_players)                                                          AS all_time_peak,
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '24 hours')      AS daily_peak,
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '7 days')        AS weekly_peak,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '24 hours') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '24 hours'), 0) AS uptime_24h,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '7 days') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '7 days'), 0)   AS uptime_7d
                 FROM family_hours
             ),
             peak_bucket AS (
                 SELECT bucket AS peak_timestamp
                 FROM family_hours
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
                          WHERE h.server_id IN (SELECT server_id FROM family)
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
                                  WHERE hm.server_id IN (SELECT server_id FROM family)
                                    AND hm.valid_from <= h.valid_from
                                  ORDER BY hm.valid_from DESC
                                  LIMIT 1
                              ) as mode_name
                          FROM server_motds_history h
                                   JOIN server_motds_registry r ON h.motd_id = r.id
                          WHERE h.server_id IN (SELECT server_id FROM family)
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
