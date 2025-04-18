CREATE OR REPLACE FUNCTION get_server_details(server_id_param INTEGER)
RETURNS TABLE(
    detail_id INTEGER,
    detail_name VARCHAR(255),
    detail_host VARCHAR(255),
    detail_port INTEGER,
    detail_last_updated TIMESTAMPTZ,
    detail_online BOOLEAN,
    detail_timestamp TIMESTAMPTZ,
    detail_players INTEGER,
    detail_player_limit INTEGER,
    detail_wave INTEGER,
    detail_version INTEGER,
    detail_version_type VARCHAR(50),
    detail_ping INTEGER,
    detail_display_name VARCHAR(255),
    detail_description TEXT,
    detail_mode_name VARCHAR(100),
    detail_map_name VARCHAR(255),
    detail_mode SMALLINT,
    detail_map_history JSON,
    detail_motd_history JSON,
    detail_all_time_peak INTEGER,
    detail_peak_date TIMESTAMPTZ,
    detail_daily_peak INTEGER,
    detail_weekly_peak INTEGER,
    detail_24h_uptime NUMERIC,
    detail_7d_uptime NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH current_server AS (
        SELECT s.id, sg.name, host, port, s.updated_at
        FROM servers s
        INNER JOIN server_groups sg ON s.server_group_id = sg.id
        WHERE s.id = server_id_param
    ),
    latest_stats AS (
        SELECT players,
               max_players as "playerLimit",
               wave,
               version,
               version_type as "versionType",
               ping,
               online, timestamp
        FROM server_stats
        WHERE server_id = server_id_param
        ORDER BY timestamp DESC
        LIMIT 1
    ),
    latest_motd AS (
        SELECT server_name as "serverName", description, mode_name as "modeName"
        FROM server_motds
        WHERE server_id = server_id_param AND valid_to IS NULL
        ORDER BY valid_from DESC
        LIMIT 1
    ),
    latest_map AS (
        SELECT map_name as "mapName", game_mode as mode
        FROM server_maps
        WHERE server_id = server_id_param AND valid_to IS NULL
        ORDER BY valid_from DESC
        LIMIT 1
    ),
    map_history AS (
        SELECT json_agg(
            json_build_object(
                'timestamp', extract(epoch from valid_from) * 1000,
                'mapName', map_name,
                'gameMode', game_mode
            )
            ORDER BY valid_from DESC
        ) as map_history_json
        FROM server_maps
        WHERE server_id = server_id_param
        GROUP BY server_id
        LIMIT 50
    ),
    motd_history AS (
        SELECT json_agg(
            json_build_object(
                'timestamp', extract(epoch from valid_from) * 1000,
                'name', server_name,
                'motd', description,
                'modeName', mode_name
            )
            ORDER BY valid_from DESC
        ) as motd_history_json
        FROM server_motds
        WHERE server_id = server_id_param
        GROUP BY server_id
        LIMIT 50
    ),
    player_peaks AS (
        SELECT
            MAX(players) as all_time_peak,
            (SELECT timestamp
             FROM server_stats
             WHERE server_id = server_id_param AND players = (SELECT MAX(players) FROM server_stats WHERE server_id = server_id_param)
             ORDER BY timestamp DESC LIMIT 1) as all_time_peak_date,
            (SELECT MAX(players)
             FROM server_stats
             WHERE server_id = server_id_param AND timestamp > NOW() - interval '24 hours') as daily_peak,
            (SELECT MAX(players)
             FROM server_stats
             WHERE server_id = server_id_param AND timestamp > NOW() - interval '7 days') as weekly_peak
        FROM server_stats
        WHERE server_id = server_id_param
    ),
    uptime_stats AS (
        SELECT
            (COUNT(CASE WHEN online = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as last_24h_uptime,
            (SELECT (COUNT(CASE WHEN online = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))
             FROM server_stats
             WHERE server_id = server_id_param AND timestamp > NOW() - interval '7 days') as last_7d_uptime
        FROM server_stats
        WHERE server_id = server_id_param
          AND timestamp > NOW() - interval '24 hours'
    )
    SELECT
        s.id,
        s.name,
        s.host,
        s.port,
        s.updated_at as "lastUpdated",
        st.online,
        st.timestamp,
        st.players,
        st."playerLimit",
        st.wave,
        st.version,
        st."versionType",
        st.ping,
        m."serverName",
        m.description,
        m."modeName",
        map."mapName",
        map.mode,
        COALESCE(mh.map_history_json, '[]'::json) as map_history,
        COALESCE(mth.motd_history_json, '[]'::json) as motd_history,
        p.all_time_peak,
        p.all_time_peak_date,
        p.daily_peak,
        p.weekly_peak,
        u.last_24h_uptime,
        u.last_7d_uptime
    FROM current_server s
        LEFT JOIN latest_stats st ON true
        LEFT JOIN latest_motd m ON true
        LEFT JOIN latest_map map ON true
        LEFT JOIN map_history mh ON true
        LEFT JOIN motd_history mth ON true
        LEFT JOIN player_peaks p ON true
        LEFT JOIN uptime_stats u ON true;
END;
$$ LANGUAGE plpgsql;