create table public.migrations
(
    id         serial
        primary key,
    name       varchar(255)                           not null
        unique,
    applied_at timestamp with time zone default now() not null
);

alter table public.migrations
    owner to postgres;

create table public.server_groups
(
    id         serial
        primary key,
    name       varchar(255)                           not null
        unique,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

alter table public.server_groups
    owner to postgres;

create table public.servers
(
    id                  serial
        primary key,
    host                varchar(255)                           not null,
    port                integer                                not null,
    created_at          timestamp with time zone default now() not null,
    updated_at          timestamp with time zone default now() not null,
    last_seen           timestamp with time zone,
    server_group_id     integer                                not null
        constraint fk_server_group
            references public.server_groups,
    country_code        varchar(2),
    inactivity_excluded boolean                  default false not null,
    aggregate_exclude   boolean                  default false not null,
    unique (host, port)
);

alter table public.servers
    owner to postgres;

create index idx_servers_server_group_id
    on public.servers (server_group_id);

create table public.server_motds_registry
(
    id          serial
        primary key,
    server_name text not null,
    description text not null,
    constraint uq_server_motd
        unique (server_name, description)
);

alter table public.server_motds_registry
    owner to postgres;

create table public.server_motds_history
(
    id         serial,
    server_id  integer                                not null
        references public.servers
            on delete cascade,
    motd_id    integer                                not null
        references public.server_motds_registry
            on delete restrict,
    valid_from timestamp with time zone default now() not null,
    valid_to   timestamp with time zone,
    primary key (id, valid_from)
);

alter table public.server_motds_history
    owner to postgres;

create index idx_motd_history_active
    on public.server_motds_history (server_id asc, valid_from desc)
    where (valid_to IS NULL);

create table public.serverlists
(
    id           serial
        primary key,
    name         varchar(255)                           not null,
    url          text                                   not null,
    display_name varchar(255)                           not null,
    created_at   timestamp with time zone default now() not null,
    updated_at   timestamp with time zone default now() not null,
    active       boolean                  default true  not null
);

alter table public.serverlists
    owner to postgres;

create index idx_serverlists_url
    on public.serverlists (url);

create table public.server_source_list
(
    id            serial
        primary key,
    server_id     integer                                not null
        references public.servers
            on delete cascade,
    serverlist_id integer                                not null
        references public.serverlists
            on delete cascade,
    display_name  varchar(255)                           not null,
    first_seen    timestamp with time zone default now() not null,
    last_seen     timestamp with time zone,
    created_at    timestamp with time zone default now() not null,
    updated_at    timestamp with time zone default now() not null,
    unique (server_id, serverlist_id)
);

alter table public.server_source_list
    owner to postgres;

create index idx_server_source_list_server_id
    on public.server_source_list (server_id);

create index idx_server_source_list_serverlist_id
    on public.server_source_list (serverlist_id);

create index idx_server_source_list_last_seen
    on public.server_source_list (last_seen);

create table public.server_current
(
    server_id        integer                  not null
        primary key
        references public.servers
            on delete cascade,
    timestamp        timestamp with time zone not null,
    players          integer,
    max_players      integer,
    wave             integer,
    version          integer,
    version_type     varchar(50),
    ping             integer,
    online           boolean default false    not null,
    motd_registry_id integer,
    map_registry_id  integer
);

alter table public.server_current
    owner to postgres;

create index idx_server_current_timestamp
    on public.server_current (timestamp desc);

create table public.gamemode_registry
(
    id         smallserial
        primary key,
    game_mode  smallint              not null,
    mode_name  text default ''::text not null,
    clean_name text default ''::text not null,
    constraint uq_gamemode
        unique (game_mode, mode_name)
);

alter table public.gamemode_registry
    owner to postgres;

create table public.server_maps_registry
(
    id          serial
        primary key,
    map_name    text     not null,
    game_mode   smallint,
    mode_name   text,
    gamemode_id smallint not null
        references public.gamemode_registry,
    constraint uq_server_map
        unique (map_name, game_mode, mode_name)
);

alter table public.server_maps_registry
    owner to postgres;

create table public.server_stats
(
    server_id        integer                                not null
        references public.servers
            on delete cascade,
    timestamp        timestamp with time zone default now() not null,
    players          integer                  default 0,
    max_players      integer,
    wave             integer,
    version          integer,
    version_type     varchar(50),
    ping             integer,
    online           boolean                  default false not null,
    motd_registry_id integer
        constraint server_stats_server_motds_registry_id_fk
            references public.server_motds_registry,
    map_registry_id  integer
        constraint server_stats_server_maps_registry_id_fk
            references public.server_maps_registry,
    primary key (server_id, timestamp)
);

alter table public.server_stats
    owner to postgres;

create index server_stats_timestamp_idx
    on public.server_stats (timestamp desc);

create index idx_server_maps_registry_gamemode
    on public.server_maps_registry (gamemode_id);

create table public.server_maps_history
(
    id         serial,
    server_id  integer                                not null
        references public.servers
            on delete cascade,
    map_id     integer                                not null
        references public.server_maps_registry
            on delete restrict,
    valid_from timestamp with time zone default now() not null,
    valid_to   timestamp with time zone,
    primary key (id, valid_from)
);

alter table public.server_maps_history
    owner to postgres;

create index idx_map_history_active
    on public.server_maps_history (server_id asc, valid_from desc)
    where (valid_to IS NULL);

create index idx_map_history_map_server
    on public.server_maps_history (map_id, server_id);

create view public.server_stats_5m
            (bucket, server_id, map_registry_id, max_players, min_players, sum_players, samples, online_samples,
             max_wave, avg_ping)
as
SELECT _materialized_hypertable_8.bucket,
       _materialized_hypertable_8.server_id,
       _materialized_hypertable_8.map_registry_id,
       _materialized_hypertable_8.max_players,
       _materialized_hypertable_8.min_players,
       _materialized_hypertable_8.sum_players,
       _materialized_hypertable_8.samples,
       _materialized_hypertable_8.online_samples,
       _materialized_hypertable_8.max_wave,
       _materialized_hypertable_8.avg_ping
FROM _timescaledb_internal._materialized_hypertable_8
WHERE _materialized_hypertable_8.bucket <
      COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(8)),
               '-infinity'::timestamp with time zone)
UNION ALL
SELECT time_bucket('00:05:00'::interval, server_stats."timestamp") AS bucket,
       server_stats.server_id,
       server_stats.map_registry_id,
       max(server_stats.players)                                   AS max_players,
       min(server_stats.players)                                   AS min_players,
       sum(server_stats.players)                                   AS sum_players,
       count(*)                                                    AS samples,
       sum(
               CASE
                   WHEN server_stats.online THEN 1
                   ELSE 0
                   END)                                            AS online_samples,
       max(server_stats.wave)                                      AS max_wave,
       avg(server_stats.ping)                                      AS avg_ping
FROM server_stats
WHERE server_stats.players >= 0
  AND server_stats.players < 1000
  AND server_stats."timestamp" >=
      COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(8)),
               '-infinity'::timestamp with time zone)
GROUP BY (time_bucket('00:05:00'::interval, server_stats."timestamp")), server_stats.server_id,
         server_stats.map_registry_id;

alter table public.server_stats_5m
    owner to postgres;

create view public.server_stats_1h
            (bucket, server_id, max_players, min_players, sum_players, samples, online_samples, max_wave) as
SELECT _materialized_hypertable_9.bucket,
       _materialized_hypertable_9.server_id,
       _materialized_hypertable_9.max_players,
       _materialized_hypertable_9.min_players,
       _materialized_hypertable_9.sum_players,
       _materialized_hypertable_9.samples,
       _materialized_hypertable_9.online_samples,
       _materialized_hypertable_9.max_wave
FROM _timescaledb_internal._materialized_hypertable_9
WHERE _materialized_hypertable_9.bucket <
      COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(9)),
               '-infinity'::timestamp with time zone)
UNION ALL
SELECT time_bucket('01:00:00'::interval, server_stats_5m.bucket) AS bucket,
       server_stats_5m.server_id,
       max(server_stats_5m.max_players)                          AS max_players,
       min(server_stats_5m.min_players)                          AS min_players,
       sum(server_stats_5m.sum_players)                          AS sum_players,
       sum(server_stats_5m.samples)                              AS samples,
       sum(server_stats_5m.online_samples)                       AS online_samples,
       max(server_stats_5m.max_wave)                             AS max_wave
FROM server_stats_5m
WHERE server_stats_5m.bucket >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(9)),
                                         '-infinity'::timestamp with time zone)
GROUP BY (time_bucket('01:00:00'::interval, server_stats_5m.bucket)), server_stats_5m.server_id;

alter table public.server_stats_1h
    owner to postgres;

create view public.server_stats_1h_by_map
            (bucket, server_id, map_registry_id, max_players, sum_players, samples, online_samples) as
SELECT _materialized_hypertable_10.bucket,
       _materialized_hypertable_10.server_id,
       _materialized_hypertable_10.map_registry_id,
       _materialized_hypertable_10.max_players,
       _materialized_hypertable_10.sum_players,
       _materialized_hypertable_10.samples,
       _materialized_hypertable_10.online_samples
FROM _timescaledb_internal._materialized_hypertable_10
WHERE _materialized_hypertable_10.bucket <
      COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(10)),
               '-infinity'::timestamp with time zone)
UNION ALL
SELECT time_bucket('01:00:00'::interval, server_stats_5m.bucket) AS bucket,
       server_stats_5m.server_id,
       server_stats_5m.map_registry_id,
       max(server_stats_5m.max_players)                          AS max_players,
       sum(server_stats_5m.sum_players)                          AS sum_players,
       sum(server_stats_5m.samples)                              AS samples,
       sum(server_stats_5m.online_samples)                       AS online_samples
FROM server_stats_5m
WHERE server_stats_5m.bucket >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(10)),
                                         '-infinity'::timestamp with time zone)
GROUP BY (time_bucket('01:00:00'::interval, server_stats_5m.bucket)), server_stats_5m.server_id,
         server_stats_5m.map_registry_id;

alter table public.server_stats_1h_by_map
    owner to postgres;

create function public.get_server_details(server_id_param integer)
    returns TABLE(detail_id integer, detail_name character varying, detail_host character varying, detail_port integer, detail_last_updated timestamp with time zone, detail_online boolean, detail_timestamp timestamp with time zone, detail_players integer, detail_player_limit integer, detail_wave integer, detail_version integer, detail_version_type character varying, detail_ping integer, detail_display_name text, detail_description text, detail_mode_name text, detail_map_name text, detail_mode smallint, detail_all_maps json, detail_all_motds json, detail_all_time_peak integer, detail_peak_date timestamp with time zone, detail_daily_peak integer, detail_weekly_peak integer, detail_24h_uptime numeric, detail_7d_uptime numeric, detail_motd_id integer, detail_motd_server_id integer, detail_motd_valid_from timestamp with time zone, detail_motd_valid_to timestamp with time zone, detail_motd_server_name text, detail_motd_description text, detail_map_id integer, detail_map_server_id integer, detail_map_valid_from timestamp with time zone, detail_map_valid_to timestamp with time zone, detail_map_map_name text, detail_map_game_mode smallint, detail_motd_mode_name text, server_group_id integer)
    language plpgsql
as
$$
BEGIN
RETURN QUERY
    WITH current_server AS (
                SELECT s.id, sg.name, s.host, s.port, s.updated_at, s.server_group_id, s.aggregate_exclude
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

alter function public.get_server_details(integer) owner to postgres;

