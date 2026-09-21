-- Server identity rework.
--
-- `servers` becomes an observation stream, not a merged identity: a physical
-- server that changes host/port, or that gets re-registered for whatever
-- reason, produces a *new* row rather than mutating the old one in place.
-- "Which rows are actually the same server" is a separate, explicit layer:
--
--   * server_canonical is a union-find (disjoint-set) table with eager path
--     compression, so every server_id always resolves to its root in a
--     single lookup/join with no recursion. A root points at itself.
--   * Merges are a manual, operator-driven decision: repoint the *whole*
--     losing family onto the target's root in one UPDATE, so depth never
--     exceeds 1 (no chains to walk, no recursive CTE ever needed):
--
--       -- WITH root AS (SELECT canonical_id FROM server_canonical WHERE server_id = :targetId)
--       -- UPDATE server_canonical sc SET canonical_id = (SELECT canonical_id FROM root)
--       --  WHERE sc.canonical_id = (SELECT canonical_id FROM server_canonical WHERE server_id = :sourceId);
--
--     Root choice convention: prefer the row with the oldest created_at
--     (first seen) as the surviving root when merging two families.
--     An approved merge also gets an annotation at the alias's first
--     sighting, so the chart can show where the address changed:
--
--       -- INSERT INTO server_events (server_id, kind, occurred_at, detail)
--       -- SELECT :targetId, 'address_change', s.created_at,
--       --        jsonb_build_object('from_server_id', :sourceId,
--       --                           'host', s.host, 'port', s.port)
--       -- FROM servers s WHERE s.id = :sourceId;
--   * Unmerge is just repointing one row back at itself:
--       -- UPDATE server_canonical SET canonical_id = server_id WHERE server_id = :id;
--   * None of this ever invalidates a continuous aggregate. Aggregates key
--     off the raw server_id, not the canonical id, so merges/unmerges are
--     purely a resolution-time concern for readers (JOIN server_canonical)
--     and never trigger a re-materialization.
--
-- server_events is a free-form annotation stream (address changes, version
-- changes, data-quality notes, ...) for operators/UI to explain observation
-- gaps or discontinuities without needing to encode that into the identity
-- graph itself.

-- 1. Observation stream: an address is only unique among *active*
--    (non-retired) rows, so it can be reused once the old row is retired.
alter table servers
    drop constraint if exists servers_host_port_key;

-- Belt and braces: if the address uniqueness was ever created as a bare unique
-- index rather than a constraint, the drop above is a silent no-op and the old
-- index would keep refusing the second observation row for a reused address.
drop index if exists servers_host_port_key;

alter table servers
    add column if not exists retired_at timestamptz;

drop index if exists uq_server_address_active;
create unique index uq_server_address_active on servers (host, port) where retired_at is null;

-- 3. Identity resolution: union-find with eager path compression.
-- Every server has exactly one row here; a root points at itself.
create table if not exists server_canonical (
    server_id    integer primary key references servers on delete cascade,
    canonical_id integer not null references servers
);
create index if not exists server_canonical_canonical_id_idx on server_canonical (canonical_id);

insert into server_canonical (server_id, canonical_id)
select id, id
from servers
on conflict (server_id) do nothing;

-- Load-bearing: backend stats queries INNER JOIN server_canonical to resolve
-- identity, so a server row without a matching server_canonical row would
-- silently vanish from every chart/listing that joins through it. This
-- trigger guarantees every newly inserted server immediately gets a
-- self-pointing row, so it is always resolvable from the moment it exists.
create or replace function server_canonical_self_ref() returns trigger as $$
begin
    insert into server_canonical (server_id, canonical_id)
    values (new.id, new.id)
    on conflict (server_id) do nothing;
    return null;
end;
$$ language plpgsql;

drop trigger if exists servers_canonical_self_ref on servers;
create trigger servers_canonical_self_ref
    after insert on servers
    for each row
    execute function server_canonical_self_ref();

-- 4. Annotation stream: free-form events, either scoped to a server or
-- global (server_id NULL), point-in-time or a span (ends_at set).
create table if not exists server_events (
    id          serial primary key,
    server_id   integer references servers on delete cascade, -- NULL = global event
    kind        text not null,                                -- address_change | version_change | data_quality
    occurred_at timestamptz not null,
    ends_at     timestamptz,                                  -- NULL = point event, set = span
    detail      jsonb
);
create index if not exists server_events_server_id_occurred_at_idx on server_events (server_id, occurred_at desc);
