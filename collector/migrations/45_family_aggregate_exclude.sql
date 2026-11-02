-- ─────────────────────────────────────────────────────────────────────────────
-- 45_family_aggregate_exclude.sql
--
-- servers.aggregate_exclude was a per-ROW flag on an observation stream, but
-- it is a property of the server (the family). Reads disagreed about which row
-- counted:
--
--   * /api/servers, get_server_details, the network scopes and the global
--     charts read the ROOT row only;
--   * the leaderboard and Wrapped excluded a family if ANY member was flagged.
--
-- The flag is set by hand on whichever row someone was looking at, usually the
-- live member. The root is the OLDEST row, though, so a flagged alias left its
-- family "not excluded" on every root-only path: /api/servers reported false,
-- and its players still reached the global and network totals.
--
-- Exclusion now lives at family level in aggregate_excluded_families, keyed
-- on the family ROOT (= server_canonical.canonical_id, the public id). A row
-- present means the family is excluded. Every read uses the same rule.
--
-- Keeping the key a current root:
--   * merge_server_families: if either family was excluded, the merged family
--     is (any-member semantics, same as the old strict rule).
--   * unmerge_server: the detached server and the remaining family both keep
--     the flag. Splitting a hub off a family does not make either half a game
--     server; an admin unflags the half that should count again.
--   * set_aggregate_exclude(any member id, bool) resolves to the root, under
--     the same lock, so nobody has to know which row the root is.
--
-- Seeding uses the any-member rule: a family is excluded if any of its rows
-- was flagged. That is what the leaderboard/Wrapped already showed, and what
-- whoever set the flag meant.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists aggregate_excluded_families (
    canonical_id integer primary key references servers (id) on delete cascade,
    excluded_at  timestamptz not null default now()
);

insert into aggregate_excluded_families (canonical_id)
select distinct sc.canonical_id
from server_canonical sc
join servers s on s.id = sc.server_id
where s.aggregate_exclude
on conflict do nothing;

-- Read-only for the backend's user-content role: it already reads servers and
-- server_canonical for lookups, and writes only through the function below.
grant select on aggregate_excluded_families to app_user_rw;

-- ─── Setter ─────────────────────────────────────────────────────────────────
-- Usage by hand: SELECT set_aggregate_exclude(<any member id>, true);
create or replace function set_aggregate_exclude(member_id integer, exclude boolean)
    returns integer
    language plpgsql
    security definer
    set search_path = public, pg_temp
as $$
declare
    root integer;
begin
    perform pg_advisory_xact_lock(hashtext('server_canonical_merge'));

    select canonical_id into root from server_canonical where server_id = member_id;
    if root is null then
        raise exception 'server not found' using errcode = 'no_data_found';
    end if;

    if exclude then
        insert into aggregate_excluded_families (canonical_id) values (root)
        on conflict do nothing;
    else
        delete from aggregate_excluded_families where canonical_id = root;
    end if;

    return root;
end;
$$;

revoke all on function set_aggregate_exclude(integer, boolean) from public;
grant execute on function set_aggregate_exclude(integer, boolean) to app_user_rw;

-- ─── Merge / unmerge carry the flag ─────────────────────────────────────────
-- Same bodies as 40_admin_server_merge.sql, plus the bookkeeping above.

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

    -- Either side excluded => the merged family is excluded.
    if exists (select 1 from aggregate_excluded_families where canonical_id = drop_root) then
        insert into aggregate_excluded_families (canonical_id) values (keep_root)
        on conflict do nothing;
        delete from aggregate_excluded_families where canonical_id = drop_root;
    end if;

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
    excluded boolean;
begin
    perform pg_advisory_xact_lock(hashtext('server_canonical_merge'));

    select canonical_id into root from server_canonical where server_id = member_id;
    if root is null then
        raise exception 'server not found' using errcode = 'no_data_found';
    end if;

    excluded := exists (select 1 from aggregate_excluded_families where canonical_id = root);

    if root <> member_id then
        update server_canonical set canonical_id = server_id where server_id = member_id;
        -- The detached member is now its own root; the family keeps its row.
        if excluded then
            insert into aggregate_excluded_families (canonical_id) values (member_id)
            on conflict do nothing;
        end if;
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
        -- The detached old root keeps its row; the re-rooted family gets one.
        if excluded then
            insert into aggregate_excluded_families (canonical_id) values (new_root)
            on conflict do nothing;
        end if;
    end if;
end;
$$;

-- ─── get_server_details reads the family flag ───────────────────────────────
-- Same body as 43_server_details_slim.sql; only the root CTE changes (the row
-- type is unchanged, so CREATE OR REPLACE is enough). plpgsql bodies are not
-- dependency-tracked, so the column drop below would succeed without this and
-- every /server/<id> page would then fail at call time.

create or replace function get_server_details(server_id_param integer)
    returns TABLE(
                     detail_id integer,
                     detail_name character varying,
                     detail_host character varying,
                     detail_port integer,
                     detail_last_updated timestamp with time zone,
                     detail_online boolean,
                     detail_timestamp timestamp with time zone,
                     detail_players integer,
                     detail_player_limit integer,
                     detail_wave integer,
                     detail_version integer,
                     detail_version_type character varying,
                     detail_ping integer,
                     detail_display_name text,
                     detail_description text,
                     detail_mode_name text,
                     detail_map_name text,
                     detail_mode smallint,
                     detail_all_time_peak integer,
                     detail_peak_date timestamp with time zone,
                     detail_daily_peak integer,
                     detail_weekly_peak integer,
                     detail_24h_uptime numeric,
                     detail_7d_uptime numeric,
                     detail_motd_id integer,
                     detail_motd_server_id integer,
                     detail_motd_valid_from timestamp with time zone,
                     detail_motd_valid_to timestamp with time zone,
                     detail_motd_server_name text,
                     detail_motd_description text,
                     detail_map_id integer,
                     detail_map_server_id integer,
                     detail_map_valid_from timestamp with time zone,
                     detail_map_valid_to timestamp with time zone,
                     detail_map_map_name text,
                     detail_map_game_mode smallint,
                     detail_motd_mode_name text,
                     server_group_id integer,
                     detail_aggregate_exclude boolean
                 )
    language plpgsql
as
$$
BEGIN
    RETURN QUERY
        WITH family AS (
            SELECT sc.server_id
            FROM server_canonical sc
            WHERE sc.canonical_id = (
                SELECT canonical_id FROM server_canonical WHERE server_id = server_id_param
            )
        ),
             root AS (
                 -- Family-level identity comes from the root; exclusion from
                 -- aggregate_excluded_families, keyed on that root.
                 SELECT s.id, sg.name, s.server_group_id,
                        EXISTS (SELECT 1 FROM aggregate_excluded_families x WHERE x.canonical_id = s.id) AS aggregate_exclude
                 FROM servers s
                          INNER JOIN server_groups sg ON s.server_group_id = sg.id
                 WHERE s.id = (
                     SELECT canonical_id FROM server_canonical WHERE server_id = server_id_param
                 )
             ),
             live_address AS (
                 SELECT s.host, s.port, s.updated_at
                 FROM family f
                          JOIN servers s ON s.id = f.server_id
                 ORDER BY (s.retired_at IS NULL) DESC, s.last_seen DESC NULLS LAST, s.id DESC
                 LIMIT 1
             ),
             current_server AS (
                 SELECT
                     r.id,
                     r.name,
                     COALESCE(la.host, root_s.host)             AS host,
                     COALESCE(la.port, root_s.port)              AS port,
                     COALESCE(la.updated_at, root_s.updated_at)  AS updated_at,
                     r.server_group_id,
                     r.aggregate_exclude
                 FROM root r
                          INNER JOIN servers root_s ON root_s.id = r.id
                          LEFT JOIN live_address la ON true
             ),
             latest_stats AS (
                 SELECT c.players, c.max_players, c.wave, c.version, c.version_type, c.ping, c.online, c.timestamp
                 FROM family f
                          JOIN server_current c ON c.server_id = f.server_id
                 ORDER BY c.timestamp DESC
                 LIMIT 1
             ),
             latest_map AS (
                 SELECT h.id, h.server_id, h.valid_from, h.valid_to, r.map_name, r.game_mode, r.mode_name
                 FROM family f
                          CROSS JOIN LATERAL (
                     SELECT hm.id, hm.server_id, hm.map_id, hm.valid_from, hm.valid_to
                     FROM server_maps_history hm
                     WHERE hm.server_id = f.server_id AND hm.valid_to IS NULL
                     ORDER BY hm.valid_from DESC
                     LIMIT 1
                     ) h
                          JOIN server_maps_registry r ON h.map_id = r.id
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             latest_motd AS (
                 SELECT
                     h.id,
                     h.server_id,
                     h.valid_from,
                     h.valid_to,
                     r.server_name,
                     r.description,
                     (
                         SELECT rm.mode_name
                         FROM family f2
                                  CROSS JOIN LATERAL (
                             SELECT hm.map_id, hm.valid_from
                             FROM server_maps_history hm
                             WHERE hm.server_id = f2.server_id
                               AND hm.valid_from <= h.valid_from
                             ORDER BY hm.valid_from DESC
                             LIMIT 1
                             ) m
                                  JOIN server_maps_registry rm ON m.map_id = rm.id
                         ORDER BY m.valid_from DESC
                         LIMIT 1
                     ) AS mode_name
                 FROM family f
                          CROSS JOIN LATERAL (
                     SELECT hm.id, hm.server_id, hm.motd_id, hm.valid_from, hm.valid_to
                     FROM server_motds_history hm
                     WHERE hm.server_id = f.server_id AND hm.valid_to IS NULL
                     ORDER BY hm.valid_from DESC
                     LIMIT 1
                     ) h
                          JOIN server_motds_registry r ON h.motd_id = r.id
                 ORDER BY h.valid_from DESC
                 LIMIT 1
             ),
             family_stats_1h AS (
                 SELECT
                     s.bucket,
                     MAX(s.max_players)    AS max_players,
                     MAX(s.samples)        AS samples,
                     MAX(s.online_samples) AS online_samples
                 FROM family f
                          JOIN server_stats_1h s ON s.server_id = f.server_id
                 WHERE s.bucket > NOW() - interval '7 days'
                 GROUP BY s.bucket
             ),
             aggregated_stats AS (
                 SELECT
                     MAX(max_players) FILTER (WHERE bucket > NOW() - interval '24 hours')      AS daily_peak,
                     MAX(max_players)                                                          AS weekly_peak,
                     SUM(online_samples) FILTER (WHERE bucket > NOW() - interval '24 hours') * 100.0 /
                     NULLIF(SUM(samples) FILTER (WHERE bucket > NOW() - interval '24 hours'), 0) AS uptime_24h,
                     SUM(online_samples) * 100.0 / NULLIF(SUM(samples), 0)                     AS uptime_7d
                 FROM family_stats_1h
             ),
             all_time AS (
                 SELECT p.all_time_peak, p.peak_at
                 FROM family f
                          JOIN server_peaks p ON p.server_id = f.server_id
                 ORDER BY p.all_time_peak DESC, p.peak_at ASC
                 LIMIT 1
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
            atp.all_time_peak,
            atp.peak_at,
            agg.daily_peak,
            agg.weekly_peak,
            agg.uptime_24h,
            agg.uptime_7d,
            motd.id,
            motd.server_id,
            motd.valid_from,
            motd.valid_to,
            motd.server_name,
            motd.description,
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
                 LEFT JOIN aggregated_stats agg ON true
                 LEFT JOIN all_time atp ON true;
END;
$$;

alter function get_server_details(integer) owner to postgres;

-- ─── refresh_network_peaks reads the family flag ────────────────────────────
-- Same body as 44_network_peaks.sql; only the exclusion predicate changes.

CREATE OR REPLACE FUNCTION refresh_network_peaks(p_since TIMESTAMPTZ)
    RETURNS INTEGER
    LANGUAGE plpgsql
AS $$
DECLARE
    changed INTEGER := 0;
    n       INTEGER;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS pg_temp.network_peaks_best (
        server_group_id INTEGER PRIMARY KEY,
        all_time_peak   INTEGER     NOT NULL,
        peak_at         TIMESTAMPTZ NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE pg_temp.network_peaks_best;

    INSERT INTO pg_temp.network_peaks_best (server_group_id, all_time_peak, peak_at)
    SELECT DISTINCT ON (inst.group_id) inst.group_id, inst.total, inst.bucket
    FROM (
        SELECT fam.group_id, fam.bucket, SUM(fam.players) AS total
        FROM (
            -- Membership comes from the ROOT row, exclusion from the family table.
            SELECT root.server_group_id AS group_id, sc.canonical_id, st.bucket,
                   MAX(st.max_players) AS players
            FROM server_stats_1h st
            JOIN server_canonical sc ON sc.server_id = st.server_id
            JOIN servers root        ON root.id = sc.canonical_id
            WHERE root.server_group_id IS NOT NULL
              AND sc.canonical_id NOT IN (SELECT canonical_id FROM aggregate_excluded_families)
              AND (p_since IS NULL OR st.bucket >= p_since)
            GROUP BY root.server_group_id, sc.canonical_id, st.bucket
        ) fam
        GROUP BY fam.group_id, fam.bucket
    ) inst
    WHERE inst.total IS NOT NULL
    ORDER BY inst.group_id, inst.total DESC, inst.bucket ASC;

    IF p_since IS NULL THEN
        DELETE FROM network_peaks np
        WHERE NOT EXISTS (SELECT 1 FROM pg_temp.network_peaks_best b WHERE b.server_group_id = np.server_group_id);
        GET DIAGNOSTICS changed = ROW_COUNT;

        INSERT INTO network_peaks (server_group_id, all_time_peak, peak_at)
        SELECT server_group_id, all_time_peak, peak_at FROM pg_temp.network_peaks_best
        ON CONFLICT (server_group_id) DO UPDATE
            SET all_time_peak = EXCLUDED.all_time_peak,
                peak_at       = EXCLUDED.peak_at
            WHERE (network_peaks.all_time_peak, network_peaks.peak_at)
                  IS DISTINCT FROM (EXCLUDED.all_time_peak, EXCLUDED.peak_at);
    ELSE
        INSERT INTO network_peaks (server_group_id, all_time_peak, peak_at)
        SELECT server_group_id, all_time_peak, peak_at FROM pg_temp.network_peaks_best
        ON CONFLICT (server_group_id) DO UPDATE
            SET all_time_peak = EXCLUDED.all_time_peak,
                peak_at       = EXCLUDED.peak_at
            WHERE EXCLUDED.all_time_peak > network_peaks.all_time_peak
               OR (EXCLUDED.all_time_peak = network_peaks.all_time_peak
                   AND EXCLUDED.peak_at < network_peaks.peak_at);
    END IF;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN changed + n;
END;
$$;

-- ─── Drop the per-row column ────────────────────────────────────────────────
alter table servers drop column aggregate_exclude;

-- Families that were only flagged on an alias were counted in network peaks
-- until now; rebuild them under the new rule.
SELECT refresh_network_peaks(NULL);
