-- Review reports + moderation audit (F7).
--
-- One report per (review, reporter): reporting again is a no-op, so a single
-- user cannot flood the queue. Reports are keyed on the review row itself,
-- not the server, so the raw-id rule doesn't come into it; the review row
-- already carries the raw server_id.
--
-- Statuses: 'open' is the admin queue; 'dismissed' means the admin kept the
-- review as it was; 'actioned' means the admin removed or edited it. Handling
-- a review moves all of its open reports at once.
--
-- reason/status are text + CHECK rather than enum types, so adding a reason
-- later is a constraint swap instead of an ALTER TYPE.
--
-- server_reviews and review_replies gain removed_by (removed_at/removed_reason
-- came with 33 and 38) so a soft delete records which admin did it. Both user references are SET
-- NULL rather than CASCADE: deleting an admin's account must not delete the
-- moderation record, or un-remove reviews they removed.
--
-- Explicit GRANTs as always; nothing here is inherited by app_user_rw.

alter table server_reviews
    add column if not exists removed_by bigint references users (id) on delete set null;
alter table review_replies
    add column if not exists removed_by bigint references users (id) on delete set null;

create table if not exists review_reports (
    id          bigserial primary key,
    review_id   bigint not null references server_reviews (id) on delete cascade,
    reporter_id bigint not null references users (id) on delete cascade,
    reason      text   not null check (reason in ('spam', 'abuse', 'offtopic', 'other')),
    note        text   check (note is null or char_length(note) <= 500),
    status      text   not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
    handled_by  bigint references users (id) on delete set null,
    handled_at  timestamptz,
    created_at  timestamptz not null default now(),
    unique (review_id, reporter_id)
);
-- The unique constraint's index already leads on review_id, which covers the
-- per-review lookups; this one is for the admin queue's "open, oldest first".
create index if not exists review_reports_open_idx on review_reports (created_at) where status = 'open';
create index if not exists review_reports_reporter_id_idx on review_reports (reporter_id);

grant select, insert, update, delete on review_reports to app_user_rw;
grant usage, select on sequence review_reports_id_seq to app_user_rw;
