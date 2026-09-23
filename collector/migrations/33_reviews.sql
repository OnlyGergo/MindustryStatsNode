-- Server ratings + reviews (F2).
--
-- server_id is the raw `servers.id` the user was looking at when they wrote
-- the review, never the family root -- same rule as every other user-content
-- table that points at a server (see CLAUDE.md "Server Identity"). A merge
-- can leave a user with a review on each alias of the same family; that is
-- not prevented here, it is resolved at read time by the backend's DISTINCT
-- ON (newest wins) and collapsed to one row on write by upsertReview's
-- find-then-repoint logic. So there is deliberately NO unique constraint on
-- (user_id, server_id) or (user_id, family) -- a family only exists as a
-- join through server_canonical, which this table cannot see, and a raw
-- uniqueness constraint on (user_id, server_id) would still let the same
-- user hold one review per alias.
--
-- removed_at / removed_reason are moderation columns reserved for F7 (no
-- moderation UI yet, but the read/write paths already respect them: a
-- removed review is hidden from public reads and refuses to be silently
-- resurrected by re-submitting).
--
-- Same explicit-GRANT rule as every user-content migration: nothing here is
-- inherited by app_user_rw automatically, so this table's grant has to be
-- spelled out even though 32_users_sessions.sql already granted usage on the
-- schema.

create table if not exists server_reviews (
    id             bigserial primary key,
    user_id        bigint  not null references users (id) on delete cascade,
    -- The raw servers.id the user was looking at, never the family root.
    server_id      integer not null references servers (id) on delete cascade,
    rating         smallint not null check (rating between 1 and 5),
    body           text check (body is null or char_length(body) <= 2000),
    anonymous      boolean not null default false,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    removed_at     timestamptz,
    removed_reason text
);
create index if not exists server_reviews_server_id_idx on server_reviews (server_id);
create index if not exists server_reviews_user_id_idx on server_reviews (user_id);

grant select, insert, update, delete on server_reviews to app_user_rw;
grant usage, select on sequence server_reviews_id_seq to app_user_rw;
