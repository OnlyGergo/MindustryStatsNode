-- get_server_details becomes canonical-identity-aware.
--
-- servers is now an observation stream (30_server_identity.sql): an address
-- change produces a *new* servers row, not an in-place update, and
-- server_canonical resolves "which rows are actually the same server" as a
-- separate union-find layer with eager path compression (depth never
-- exceeds 1, so every lookup below is a single join, never a recursive
-- walk). The public-facing id is the canonical (root) id, but this function
-- can be handed any member id -- it resolves through server_canonical
-- either way -- so every per-server lookup below becomes a per-*family*
-- lookup instead.

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
                     server_group_id integer,
                     detail_aggregate_exclude boolean
                 )
    language plpgsql
as
$$
BEGIN
    RETURN QUERY
        WITH family AS (
            -- One level of indirection is always enough: server_canonical
            -- never chains (a merge repoints the whole losing family onto
            -- the target's root in one UPDATE), so resolving
            -- server_id_param's root and pulling every server_id that
            -- points at that same root is the complete alias family.
            SELECT sc.server_id
            FROM server_canonical sc
            WHERE sc.canonical_id = (
                SELECT canonical_id FROM server_canonical WHERE server_id = server_id_param
            )
        ),
             root AS (
                 -- Family-level identity: the public id (always the root,
                 -- i.e. the oldest observation, so a merge never changes
                 -- what an already-bookmarked url means) plus the
                 -- properties that belong to the server as a whole rather
                 -- than to any one alias's address.
                 SELECT s.id, sg.name, s.server_group_id, s.aggregate_exclude
                 FROM servers s
                          INNER JOIN server_groups sg ON s.server_group_id = sg.id
                 WHERE s.id = (
                     SELECT canonical_id FROM server_canonical WHERE server_id = server_id_param
                 )
             ),
             live_address AS (
                 -- The address a visitor actually needs: whichever family
                 -- member is still active, preferring the one most
                 -- recently observed. The root is the *oldest* row (stable
                 -- identity), not necessarily the one still answering
                 -- today, so it is deliberately not used for host/port.
                 --
                 -- Retired rows sort last rather than being filtered out, so
                 -- a family whose every member has been retired still reports
                 -- the last address it was seen on instead of falling back to
                 -- the oldest one.  This is the same ordering the list view
                 -- uses (LIVE_MEMBER_SQL in canonicalIdentity.ts); the two
                 -- must agree or a server's address would change as you
                 -- clicked into it.
                 SELECT host, port, updated_at
                 FROM servers
                 WHERE id IN (SELECT server_id FROM family)
                 ORDER BY (retired_at IS NULL) DESC, last_seen DESC NULLS LAST, id DESC
                 LIMIT 1
             ),
             current_server AS (
                 SELECT
                     r.id,
                     r.name,
                     -- Falls back to the root's own (possibly retired)
                     -- address only once every alias in the family has
                     -- been retired.
                     COALESCE(la.host, root_s.host)             AS host,
                     COALESCE(la.port, root_s.port)              AS port,
                     COALESCE(la.updated_at, root_s.updated_at)  AS updated_at,
                     r.server_group_id,
                     r.aggregate_exclude
                 FROM root r
                          INNER JOIN servers root_s ON root_s.id = r.id
                          LEFT JOIN live_address la ON true
             ),
             -- One row for the whole family, not one per alias: pick
             -- whichever member currently holds the freshest snapshot
             -- instead of joining N rows into the result.
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
                     -- Point-in-time lookup to preserve the mode_name
                     -- contract, widened to the whole family: a MOTD
                     -- opened on an alias just before an IP change still
                     -- needs to resolve its mode name from the family's
                     -- map timeline, not just that one alias's.
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
                 -- An alias's open row is never closed just because the
                 -- server moved addresses, so several family members can
                 -- each still have one; the real "current" MOTD is
                 -- whichever of those open rows was opened last.
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
             -- Collapse the family to one row per bucket *before*
             -- aggregating anything. During an IP migration two aliases
             -- can both report samples in the same hourly bucket for what
             -- is really one physical server: MAX(max_players) across the
             -- family is correct there, because SUMing would double-count
             -- a single server's players. The uptime counters
             -- (samples / online_samples) legitimately sum *across
             -- buckets*, but must not sum across *aliases within* a
             -- bucket for the same reason -- two overlapping aliases each
             -- reporting "1/1 online" in the same hour would otherwise
             -- read as "2/2", and with enough overlap the ratio could
             -- exceed 100%. Collapsing per bucket first (MAX, not SUM)
             -- guarantees each bucket contributes a single sample stream
             -- before the ratio is ever built.
             family_stats_1h AS (
                 SELECT
                     bucket,
                     MAX(max_players)    AS max_players,
                     MAX(samples)        AS samples,
                     MAX(online_samples) AS online_samples
                 FROM server_stats_1h
                 WHERE server_id IN (SELECT server_id FROM family)
                 GROUP BY bucket
             ),
             -- Peaks and uptime come from the hourly continuous aggregate:
             -- max() is decomposable so max(max_players) is exact, and the
             -- uptime ratios are just sums of the (now per-bucket
             -- collapsed) sample counters.
             aggregated_stats AS (
                 SELECT
                     MAX(max_players)                                                          AS all_time_peak,
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '24 hours')      AS daily_peak,
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '7 days')        AS weekly_peak,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '24 hours') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '24 hours'), 0) AS uptime_24h,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '7 days') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '7 days'), 0)   AS uptime_7d
                 FROM family_stats_1h
             ),
             -- Still cheap: server_stats_1h's (server_id, bucket) index
             -- keeps the family_stats_1h scan bounded to this family's
             -- rows, and a handful of aliases means a handful of extra
             -- rows, not a table scan.
             peak_bucket AS (
                 SELECT bucket AS peak_timestamp
                 FROM family_stats_1h
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
                              -- Dynamic subquery to pull the active
                              -- mode_name from the family's map timeline,
                              -- not just this one alias's.
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
            s.server_group_id,
            s.aggregate_exclude
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
