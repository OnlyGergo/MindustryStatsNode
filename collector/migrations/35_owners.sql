-- Server/network ownership (F3).
--
-- An owner row grants one user management rights over EITHER a whole network
-- (server_group_id) OR a single server family (server_id) -- never both, never
-- neither. Several users may co-own the same target; the partial unique indexes
-- only stop the same user being assigned the same target twice.
--
-- server_id is the raw `servers.id` the admin assigned, never a resolved root
-- (same rule as server_reviews, see CLAUDE.md "Server Identity"). The backend's
-- canManageServer() resolves it through server_canonical at read time, so an
-- owner of any member of a family manages the whole family, and a later merge
-- or unmerge is picked up without touching this table.
--
-- Rows are written only by admins, through the backend's /api/admin/owners
-- (there is no self-service claim flow). created_by records which admin did it
-- and is kept, as NULL, if that admin's account is later deleted.
--
-- Same explicit-GRANT rule as every user-content migration: nothing here is
-- inherited by app_user_rw automatically.

create table if not exists owners (
    id              bigserial primary key,
    user_id         bigint  not null references users (id) on delete cascade,
    server_group_id integer references server_groups (id) on delete cascade,
    -- The raw servers.id the admin assigned, never the family root.
    server_id       integer references servers (id) on delete cascade,
    created_at      timestamptz not null default now(),
    created_by      bigint references users (id) on delete set null,
    constraint owners_exactly_one_target check (num_nonnulls(server_group_id, server_id) = 1)
);

create unique index if not exists owners_user_group_uq
    on owners (user_id, server_group_id) where server_group_id is not null;
create unique index if not exists owners_user_server_uq
    on owners (user_id, server_id) where server_id is not null;
-- canManageServer() looks up by target, not just by user.
create index if not exists owners_server_group_id_idx on owners (server_group_id) where server_group_id is not null;
create index if not exists owners_server_id_idx on owners (server_id) where server_id is not null;

grant select, insert, update, delete on owners to app_user_rw;
grant usage, select on sequence owners_id_seq to app_user_rw;
