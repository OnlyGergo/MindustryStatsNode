-- merge_server_families now moves the absorbed root's server_events onto the
-- surviving root.
--
-- Migration 40 repointed the losing family in server_canonical but left that
-- family's server_events (keyed on the losing root, which is now an ordinary
-- member) where they were. unmerge_server assumes a family's annotations hang
-- off its root: detaching a root moves its address_change events to the new
-- root, and detaching a plain member only deletes the event the merge wrote
-- for it. So after a merge the old root's events were orphaned on a non-root
-- member, and a later unmerge of that member would neither carry them back nor
-- clean them up.
--
-- The merge is the reverse of that re-rooting: every event on drop_root moves
-- to keep_root, EXCEPT the address_change the merge writes below, which is
-- inserted afterwards and deliberately stays keyed on keep_root with
-- from_server_id = drop_root, exactly what unmerge_server looks for. Moving
-- first and inserting second keeps that ordering unambiguous. Events with
-- server_id NULL (global) are untouched. Signature, SECURITY DEFINER,
-- search_path and grants are unchanged from migration 40; otherwise the body
-- is identical.

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

    -- The absorbed family's annotations follow its root to the new root.
    update server_events set server_id = keep_root where server_id = drop_root;

    insert into server_events (server_id, kind, occurred_at, detail)
    select keep_root, 'address_change', s.created_at,
           jsonb_build_object('from_server_id', drop_root, 'host', s.host, 'port', s.port)
    from servers s
    where s.id = drop_root;

    return keep_root;
end;
$$;

revoke all on function merge_server_families(integer, integer) from public;
grant execute on function merge_server_families(integer, integer) to app_user_rw;
