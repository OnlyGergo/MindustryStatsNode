-- Admin merge UI: the merge/unmerge statements from the header of
-- 30_server_identity.sql, wrapped so the backend can run them.
--
-- server_canonical stays a collector-owned table: app_user_rw gets NO write
-- grant on it. Instead it may EXECUTE two
-- SECURITY DEFINER functions (running as the migration owner) that encode the
-- exact operator statements and nothing else, so the backend can merge and
-- unmerge but cannot write arbitrary rows into the identity layer.
--
--   merge_server_families(source, target)
--     Folds two families into one. Either argument may be any member id. The
--     surviving root is the one with the oldest created_at (the root
--     convention), whichever side the admin picked as the target, and the
--     whole losing family is repointed in one UPDATE so depth stays at 1.
--
--   unmerge_server(id)
--     Detaches one member back into a family of its own. Detaching the root
--     re-roots the remaining members onto their oldest row (still depth 1).
--
-- server_events is untouched by both: events stay on the raw server_id they
-- were recorded against and a reader resolves them through server_canonical,
-- like every other table, so merge/unmerge need no event bookkeeping.
--
-- Both serialise on one advisory lock, so two concurrent admin merges can
-- never interleave and leave a member pointing at a non-root.

create or replace function merge_server_families(source_id integer, target_id integer)
    returns integer
    language plpgsql
    security definer
    set search_path = public, pg_temp
as $$
declare
    src_root  integer;
    tgt_root  integer;
    keep_root integer;
    drop_root integer;
begin
    perform pg_advisory_xact_lock(hashtext('server_canonical_merge'));

    select canonical_id into src_root from server_canonical where server_id = source_id;
    select canonical_id into tgt_root from server_canonical where server_id = target_id;
    if src_root is null or tgt_root is null then
        raise exception 'server not found' using errcode = 'no_data_found';
    end if;
    if src_root = tgt_root then
        raise exception 'servers are already in the same family' using errcode = 'unique_violation';
    end if;

    select id into keep_root
    from servers
    where id in (src_root, tgt_root)
    order by created_at asc nulls last, id asc
    limit 1;
    drop_root := case when keep_root = src_root then tgt_root else src_root end;

    update server_canonical set canonical_id = keep_root where canonical_id = drop_root;

    return keep_root;
end;
$$;

create or replace function unmerge_server(member_id integer)
    returns void
    language plpgsql
    security definer
    set search_path = public, pg_temp
as $$
declare
    root     integer;
    new_root integer;
begin
    perform pg_advisory_xact_lock(hashtext('server_canonical_merge'));

    select canonical_id into root from server_canonical where server_id = member_id;
    if root is null then
        raise exception 'server not found' using errcode = 'no_data_found';
    end if;

    if root <> member_id then
        update server_canonical set canonical_id = server_id where server_id = member_id;
    else
        select s.id into new_root
        from server_canonical sc
        join servers s on s.id = sc.server_id
        where sc.canonical_id = member_id and sc.server_id <> member_id
        order by s.created_at asc nulls last, s.id asc
        limit 1;
        if new_root is null then
            raise exception 'server is not merged with anything' using errcode = 'unique_violation';
        end if;
        update server_canonical set canonical_id = new_root
        where canonical_id = member_id and server_id <> member_id;
    end if;
end;
$$;

revoke all on function merge_server_families(integer, integer) from public;
revoke all on function unmerge_server(integer) from public;
grant execute on function merge_server_families(integer, integer) to app_user_rw;
grant execute on function unmerge_server(integer) to app_user_rw;

-- Suggestions the admin has rejected, so they stop resurfacing. Keyed on the
-- two family roots at the time (raw ids, smaller first); if a later merge
-- changes a root the pair may be suggested again, which is the right call.
create table if not exists server_merge_dismissals (
    server_a     integer not null references servers on delete cascade,
    server_b     integer not null references servers on delete cascade,
    dismissed_by bigint references users on delete set null,
    dismissed_at timestamptz not null default now(),
    primary key (server_a, server_b),
    check (server_a < server_b)
);

grant select, insert, delete on server_merge_dismissals to app_user_rw;
