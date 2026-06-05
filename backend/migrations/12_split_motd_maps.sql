-- 1a. Deduplicated MOTD Registry
create table server_motds_registry
(
    id          serial primary key,
    server_name text not null,
    description text not null,
    constraint uq_server_motd unique (server_name, description)
);

-- 1b. MOTD History (State Tracking)
create table server_motds_history
(
    id         serial,
    server_id  integer                                not null
        references servers
            on delete cascade,
    motd_id    integer                                not null
        references server_motds_registry
            on delete restrict, -- Prevents deleting a registry item actively used in history
    valid_from timestamp with time zone default now() not null,
    valid_to   timestamp with time zone,
    primary key (id, valid_from)
);

-- 2a. Deduplicated Map Registry
create table server_maps_registry
(
    id         serial primary key,
    map_name   text     not null,
    game_mode  smallint,
    mode_name  text,
    constraint uq_server_map unique (map_name, game_mode, mode_name)
);

-- 2b. Map History (State Tracking)
create table server_maps_history
(
    id         serial,
    server_id  integer                                not null
        references servers
            on delete cascade,
    map_id     integer                                not null
        references server_maps_registry
            on delete restrict,
    valid_from timestamp with time zone default now() not null,
    valid_to   timestamp with time zone,
    primary key (id, valid_from)
);


-- migrate existing MOTD data to the new structure
BEGIN;

-- ==========================================
-- 1. POPULATE MOTD REGISTRY & HISTORY
-- ==========================================

-- Extract unique text combinations (handling potential nulls from old layout)
INSERT INTO server_motds_registry (server_name, description)
SELECT DISTINCT COALESCE(server_name, 'Unknown'), COALESCE(description, '')
FROM server_motds
ON CONFLICT (server_name, description) DO NOTHING;

-- Populate history while preserving original structural IDs
INSERT INTO server_motds_history (server_id, motd_id, valid_from, valid_to)
SELECT m.server_id, r.id, m.valid_from, m.valid_to
FROM server_motds m
         JOIN server_motds_registry r
              ON COALESCE(m.server_name, 'Unknown') = r.server_name
                  AND COALESCE(m.description, '') = r.description;

-- ==========================================
-- 2. POPULATE MAP REGISTRY & HISTORY (With mode_name backfill)
-- ==========================================

-- Extract unique maps and attempt a point-in-time link to capture historical mode_names
INSERT INTO server_maps_registry (map_name, game_mode, mode_name)
SELECT DISTINCT
    sm.map_name,
    sm.game_mode,
    (
        SELECT motd.mode_name
        FROM server_motds motd
        WHERE motd.server_id = sm.server_id
          AND motd.valid_from <= sm.valid_from
        ORDER BY motd.valid_from DESC
        LIMIT 1
    ) as mode_name
FROM server_maps sm
ON CONFLICT (map_name, game_mode, mode_name) DO NOTHING;

-- Populate history tracking
INSERT INTO server_maps_history (server_id, map_id, valid_from, valid_to)
SELECT sm.server_id, r.id, sm.valid_from, sm.valid_to
FROM server_maps sm
         JOIN server_maps_registry r
              ON sm.map_name = r.map_name
                  AND COALESCE(sm.game_mode, -1) = COALESCE(r.game_mode, -1)
                  -- Re-evaluate identical point-in-time mapping logic to match the registry ID cleanly
                  AND COALESCE((
                                   SELECT motd.mode_name
                                   FROM server_motds motd
                                   WHERE motd.server_id = sm.server_id
                                     AND motd.valid_from <= sm.valid_from
                                   ORDER BY motd.valid_from DESC
                                   LIMIT 1
                               ), '') = COALESCE(r.mode_name, '');

-- ==========================================
-- 3. SAFELY RENAME OLD TABLES (Backup safety net)
-- ==========================================
ALTER TABLE server_maps RENAME TO backup_server_maps;
ALTER TABLE server_motds RENAME TO backup_server_motds;

COMMIT;


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
                     detail_motd_mode_name text
                 )
    language plpgsql
as
$$
BEGIN
    RETURN QUERY
        WITH current_server AS (
            SELECT s.id, sg.name, s.host, s.port, s.updated_at
            FROM servers s
                     INNER JOIN server_groups sg ON s.server_group_id = sg.id
            WHERE s.id = server_id_param
        ),
             latest_stats AS (
                 SELECT players, max_players, wave, version, version_type, ping, online, timestamp
                 FROM server_stats
                 WHERE server_id = server_id_param
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
             -- Optimized: Combined history queries with window functions and single scan
             combined_stats AS (
                 SELECT
                     players,
                     timestamp,
                     online,
                     -- Use window functions to get peaks in single scan
                     MAX(players) OVER () as all_time_peak,
                     FIRST_VALUE(timestamp) OVER (ORDER BY players DESC, timestamp DESC) as peak_timestamp,
                     MAX(CASE WHEN timestamp > NOW() - interval '24 hours' THEN players END) OVER () as daily_peak,
                     MAX(CASE WHEN timestamp > NOW() - interval '7 days' THEN players END) OVER () as weekly_peak,
                     -- Calculate uptime percentages
                     COUNT(CASE WHEN online = true AND timestamp > NOW() - interval '24 hours' THEN 1 END) OVER () * 100.0 /
                     NULLIF(COUNT(CASE WHEN timestamp > NOW() - interval '24 hours' THEN 1 END) OVER (), 0) as uptime_24h,
                     COUNT(CASE WHEN online = true AND timestamp > NOW() - interval '7 days' THEN 1 END) OVER () * 100.0 /
                     NULLIF(COUNT(CASE WHEN timestamp > NOW() - interval '7 days' THEN 1 END) OVER (), 0) as uptime_7d
                 FROM server_stats
                 WHERE server_id = server_id_param
             ),
             aggregated_stats AS (
                 SELECT DISTINCT
                     all_time_peak,
                     peak_timestamp,
                     daily_peak,
                     weekly_peak,
                     uptime_24h,
                     uptime_7d
                 FROM combined_stats
             ),
             all_maps AS (
                 SELECT json_agg(
                                json_build_object(
                                        'id', id,
                                        'serverId', server_id,
                                        'validFrom', extract(epoch from valid_from) * 1000,
                                        'validTo', CASE WHEN valid_to IS NOT NULL THEN extract(epoch from valid_to) * 1000 ELSE NULL END,
                                        'mapName', map_name,
                                        'gameMode', game_mode
                                ) ORDER BY valid_from
                        ) as all_maps_json
                 FROM (
                          SELECT h.id, h.server_id, h.valid_from, h.valid_to, r.map_name, r.game_mode
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
            agg.peak_timestamp,
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
            map.mode_name
        FROM current_server s
                 LEFT JOIN latest_stats st ON true
                 LEFT JOIN latest_motd motd ON true
                 LEFT JOIN latest_map map ON true
                 LEFT JOIN all_maps am ON true
                 LEFT JOIN all_motds amt ON true
                 LEFT JOIN aggregated_stats agg ON true;
END;
$$;

alter function get_server_details(integer) owner to postgres;