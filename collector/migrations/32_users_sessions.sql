-- Discord login: users, sessions, and the role the backend's second
-- connection uses to reach them.
--
-- The backend writes only to user-content tables (this one, and every
-- migration after it that adds one). Everything else -- servers, stats,
-- server_canonical, and every migration in this directory -- stays owned by
-- the collector, which is the only process that runs migrations at all.
--
-- That split is enforced with a real role, not just convention:
--
--   * app_user_rw is a NOLOGIN role (roles are cluster-global, so it is
--     created once, idempotently, rather than per-database).  It gets
--     SELECT on the handful of tables user-content reads need to resolve
--     against (servers, server_canonical, server_groups), and write access
--     only on the tables this migration explicitly grants it -- never via
--     `ALTER DEFAULT PRIVILEGES`, which would also hand it write access to
--     every future collector table without anyone deciding that.
--   * Every later user-content migration MUST carry its own explicit GRANT
--     for whatever it creates. Nothing here reaches forward automatically.
--   * The actual login user is created once by hand, so its password never
--     touches git:
--
--       -- CREATE USER app_writer PASSWORD '...' IN ROLE app_user_rw;
--
--     backend/src/config/userDatabase.ts authenticates as app_writer (or
--     whatever USERDB_USER is set to) and is the only backend code path
--     allowed to write here.

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'app_user_rw') then
        create role app_user_rw nologin;
    end if;
end $$;

create table if not exists users (
    id           bigserial primary key,
    discord_id   varchar(32) not null unique,
    username     varchar(64) not null,
    global_name  varchar(64),
    avatar_hash  varchar(64),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists user_sessions (
    token_hash   char(64) primary key,
    user_id      bigint not null references users (id) on delete cascade,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    last_seen_at timestamptz not null default now()
);
create index if not exists user_sessions_user_id_idx on user_sessions (user_id);
create index if not exists user_sessions_expires_at_idx on user_sessions (expires_at);

grant usage on schema public to app_user_rw;
grant select on servers, server_canonical, server_groups to app_user_rw;
grant select, insert, update, delete on users, user_sessions to app_user_rw;
grant usage, select on sequence users_id_seq to app_user_rw;
