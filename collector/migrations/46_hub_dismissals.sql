-- Admin hub page (/admin/hubs): suggestions the admin has rejected ("not a
-- hub"), so they stop resurfacing. Marking itself needs nothing new: it goes
-- through set_aggregate_exclude from 45_family_aggregate_exclude.sql.
--
-- Keyed on the family root at the time; if a later merge changes the root the
-- family may be suggested again, same as server_merge_dismissals.
create table if not exists server_hub_dismissals (
    server_id    integer not null primary key references servers on delete cascade,
    dismissed_by bigint references users on delete set null,
    dismissed_at timestamptz not null default now()
);

grant select, insert, delete on server_hub_dismissals to app_user_rw;
