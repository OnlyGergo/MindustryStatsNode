-- ─────────────────────────────────────────────────────────────────────────────
-- 44_network_peaks.sql
--
-- getNetworkDetails (backend/src/repositories/serverRepository.ts) found a
-- network's all-time peak by walking the network's ENTIRE server_stats_1h
-- history on every cold /network/<id> page, which grows forever and is the
-- one unbounded scan on that page's SSR path.  Same fix as 41_server_peaks.sql:
-- keep the maximum in a table and read it.
--
-- A network peak is not a per-sample maximum, though: it is the busiest
-- hourly instant, where an instant is the SUM across families of each
-- family's hourly MAX (MAX across aliases, never SUM).  That needs every
-- member's bucket for the hour, so the collector cannot fold it in per batch
-- like upsertServerPeaks.  Instead refresh_network_peaks recomputes it from
-- the hourly aggregate:
--
--   * refresh_network_peaks(since) - incremental: only buckets >= since, and a
--     row is replaced only when beaten.  The collector runs this every few
--     minutes over the last few hours (the current hour's bucket keeps rising
--     until it closes, so it is re-read until then).
--   * refresh_network_peaks(NULL)  - full rebuild: every bucket, rows replaced
--     outright and networks with no data dropped.  The collector runs this
--     daily, because membership is read at refresh time: a merge (two aliases
--     summed as separate families before it), a server moving group or a
--     newly excluded server changes the historic answer, and an
--     only-goes-up row would never come back down.
--
-- Ties keep the EARLIEST hour, like server_peaks; the old query picked the
-- most recent one.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS network_peaks (
    server_group_id INTEGER PRIMARY KEY REFERENCES server_groups(id) ON DELETE CASCADE,
    all_time_peak   INTEGER     NOT NULL,
    peak_at         TIMESTAMPTZ NOT NULL
);

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
        -- Per instant: SUM across families = network concurrency then.
        SELECT fam.group_id, fam.bucket, SUM(fam.players) AS total
        FROM (
            -- Per FAMILY and hour: MAX across aliases.  Membership and
            -- exclusion come from the ROOT row, as everywhere else.
            SELECT root.server_group_id AS group_id, sc.canonical_id, st.bucket,
                   MAX(st.max_players) AS players
            FROM server_stats_1h st
            JOIN server_canonical sc ON sc.server_id = st.server_id
            JOIN servers root        ON root.id = sc.canonical_id
            WHERE root.server_group_id IS NOT NULL
              AND NOT root.aggregate_exclude
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

-- ─── Seed ───────────────────────────────────────────────────────────────────
-- One-off full scan, the same one the collector repeats daily.
SELECT refresh_network_peaks(NULL);
