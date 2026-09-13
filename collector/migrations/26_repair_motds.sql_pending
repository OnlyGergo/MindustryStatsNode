-- 0. Safety net
CREATE TABLE public.server_motds_history_bak AS
SELECT * FROM public.server_motds_history;

CREATE INDEX tmp_motd_repair
    ON public.server_motds_history (server_id, valid_from, id);

-- 1. Chain repair: close every row at the next row's valid_from.
--    Only touches rows that are open or overlap forward.
WITH ordered AS (
    SELECT id, valid_from, valid_to,
           LEAD(valid_from) OVER (PARTITION BY server_id ORDER BY valid_from, id) AS next_from
    FROM public.server_motds_history
)
UPDATE public.server_motds_history h
SET valid_to = o.next_from
    FROM ordered o
WHERE h.id = o.id
  AND h.valid_from = o.valid_from
  AND o.next_from IS NOT NULL
  AND (h.valid_to IS NULL OR h.valid_to > o.next_from);

-- 2. Drop zero-length rows (same-timestamp inserts collapse to valid_to = valid_from)
DELETE FROM public.server_motds_history
WHERE valid_to IS NOT NULL AND valid_to <= valid_from;

-- 3. Collapse consecutive runs of the same motd_id into one row
WITH ordered AS (
    SELECT id, server_id, motd_id, valid_from, valid_to,
           LAG(motd_id) OVER (PARTITION BY server_id ORDER BY valid_from, id) AS prev_motd
    FROM public.server_motds_history
),
     marked AS (
         SELECT *,
                SUM(CASE WHEN prev_motd IS DISTINCT FROM motd_id THEN 1 ELSE 0 END)
                    OVER (PARTITION BY server_id ORDER BY valid_from, id
                    ROWS UNBOUNDED PRECEDING) AS grp
         FROM ordered
     ),
     runs AS (
         SELECT server_id, grp,
                (ARRAY_AGG(id         ORDER BY valid_from, id))[1]           AS keep_id,
    (ARRAY_AGG(valid_from ORDER BY valid_from, id))[1]           AS keep_from,
    (ARRAY_AGG(valid_to   ORDER BY valid_from DESC, id DESC))[1] AS run_end,
    COUNT(*) AS n
FROM marked
GROUP BY server_id, grp
    ),
    extend AS (
UPDATE public.server_motds_history h
SET valid_to = r.run_end
FROM runs r
WHERE h.id = r.keep_id
  AND h.valid_from = r.keep_from
  AND r.n > 1
  AND h.valid_to IS DISTINCT FROM r.run_end
    RETURNING 1
    )
DELETE FROM public.server_motds_history h
    USING marked m, runs r
WHERE h.id = m.id
  AND h.valid_from = m.valid_from
  AND m.server_id = r.server_id
  AND m.grp = r.grp
  AND r.n > 1
  AND m.id <> r.keep_id;