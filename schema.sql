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

create sequence public.server_ref_seq;

alter sequence public.server_ref_seq
    owner to postgres;

-- An observation stream, not a merged identity: a server that changes address
-- gains a second row here, and the two are stitched together in
-- public.server_canonical.  See collector/migrations/29_server_identity.sql.
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
    retired_at          timestamp with time zone,
    role                text                     default 'game'::text not null
        constraint servers_role_check
            check (role = ANY (ARRAY ['game'::text, 'hub'::text, 'test'::text, 'unknown'::text])),
    display_ref         integer default nextval('public.server_ref_seq') not null
        constraint servers_display_ref_key
            unique
);

alter table public.servers
    owner to postgres;

alter sequence public.server_ref_seq owned by public.servers.display_ref;

create index idx_servers_server_group_id
    on public.servers (server_group_id);

-- An address is unique only among live streams: a retired stream keeps its
-- address so its history stays attributable, and the address is free to be
-- claimed by a new stream.
create unique index uq_server_address_active
    on public.servers (host, port)
    where (retired_at IS NULL);

-- Partial: 'game' is the overwhelming majority and is only ever excluded, never
-- looked up, so the index carries just the exceptions.
create index idx_servers_role
    on public.servers (role)
    where (role <> 'game'::text);

-- Union-find over streams, depth always 1.  Every server has a row; an
-- unmerged stream points at itself, so reads join rather than
-- LEFT JOIN + COALESCE.  Merging never rewrites a server_stats row, which is
-- what keeps the continuous aggregates valid across a merge.
create table public.server_canonical
(
    server_id    integer not null
        primary key
        references public.servers
            on delete cascade,
    canonical_id integer not null
        references public.servers
);

alter table public.server_canonical
    owner to postgres;

create index idx_server_canonical_canonical_id
    on public.server_canonical (canonical_id);

create function public.server_canonical_seed() returns trigger
    language plpgsql
as
$$
BEGIN
    INSERT INTO server_canonical (server_id, canonical_id)
    VALUES (NEW.id, NEW.id)
    ON CONFLICT (server_id) DO NOTHING;
    RETURN NULL;
END;
$$;

alter function public.server_canonical_seed() owner to postgres;

create trigger servers_seed_canonical
    after insert
    on public.servers
    for each row
execute function public.server_canonical_seed();

create function public.server_canonical_check_root() returns trigger
    language plpgsql
as
$$
DECLARE
    target integer;
BEGIN
    SELECT canonical_id INTO target FROM server_canonical WHERE server_id = NEW.server_id;
    IF target IS NULL THEN
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM server_canonical root
        WHERE root.server_id = target
          AND root.canonical_id <> target
    ) THEN
        RAISE EXCEPTION
            'server_canonical: server % points at %, which is itself an alias -- merge onto the family root instead',
            NEW.server_id, target;
    END IF;

    IF target <> NEW.server_id AND EXISTS (
        SELECT 1 FROM server_canonical child
        WHERE child.canonical_id = NEW.server_id
          AND child.server_id <> NEW.server_id
    ) THEN
        RAISE EXCEPTION
            'server_canonical: server % is a family root -- repoint the whole family, not the root alone',
            NEW.server_id;
    END IF;

    RETURN NULL;
END;
$$;

alter function public.server_canonical_check_root() owner to postgres;

create constraint trigger server_canonical_root_only
    after insert or update
    on public.server_canonical
    deferrable initially deferred
    for each row
execute function public.server_canonical_check_root();

-- The chart annotation stream.  ends_at IS NULL is a point event (a version
-- bump, an address change), a set ends_at is a span (a poor-DNS era, an
-- outage).  A null server_id is a global event.
create table public.server_events
(
    id          serial
        primary key,
    server_id   integer
        references public.servers
            on delete cascade,
    kind        text                     not null
        constraint server_events_kind_check
            check (kind = ANY (ARRAY ['address_change'::text, 'version_change'::text, 'data_quality'::text])),
    occurred_at timestamp with time zone not null,
    ends_at     timestamp with time zone
        constraint server_events_span_check
            check ((ends_at IS NULL) OR (ends_at >= occurred_at)),
    detail      jsonb
);

alter table public.server_events
    owner to postgres;

create index idx_server_events_server_occurred
    on public.server_events (server_id, occurred_at desc);

-- The streams behind one identity.
create function public.server_family(canonical_id integer) returns SETOF integer
    stable
    language sql
as
$$
SELECT sc.server_id FROM server_canonical sc WHERE sc.canonical_id = $1;
$$;

alter function public.server_family(integer) owner to postgres;

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


-- One row per identity, with the two halves already resolved: id / display_ref /
-- first_seen come from the canonical root (which owns the identity), while the
-- address, group and country come from the stream the server answers on today
-- (the root holds the address it has already moved off).
create view public.server_identity as
WITH current_stream AS (
    SELECT DISTINCT ON (sc.canonical_id)
        sc.canonical_id,
        s.id AS server_id,
        s.host,
        s.port,
        s.country_code,
        s.server_group_id,
        s.role,
        s.inactivity_excluded
    FROM server_canonical sc
             JOIN servers s ON s.id = sc.server_id
    ORDER BY sc.canonical_id,
             (s.retired_at IS NULL) DESC,
             s.last_seen DESC NULLS LAST,
             s.id DESC
),
     family AS (
         SELECT sc.canonical_id,
                max(s.last_seen)                   AS last_seen,
                max(s.updated_at)                  AS updated_at,
                bool_and(s.retired_at IS NOT NULL) AS retired,
                count(*)                           AS stream_count
         FROM server_canonical sc
                  JOIN servers s ON s.id = sc.server_id
         GROUP BY sc.canonical_id
     )
SELECT root.id                 AS id,
       root.display_ref        AS display_ref,
       root.created_at         AS first_seen,
       cur.server_id           AS current_server_id,
       cur.host                AS host,
       cur.port                AS port,
       cur.country_code        AS country_code,
       cur.server_group_id     AS server_group_id,
       cur.role                AS role,
       cur.inactivity_excluded AS inactivity_excluded,
       fam.last_seen           AS last_seen,
       fam.updated_at          AS updated_at,
       fam.retired             AS retired,
       fam.stream_count        AS stream_count
FROM current_stream cur
         JOIN servers root ON root.id = cur.canonical_id
         JOIN family fam ON fam.canonical_id = cur.canonical_id;

alter view public.server_identity
    owner to postgres;
