-- This builds the index without locking the table.
-- If it fails (e.g., duplicate data), it won't break the table.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS server_stats_new_pk
    ON public.server_stats (server_id, timestamp);

-- After done

BEGIN;
-- 1. Drop the old PK and ID column
-- Replace 'server_stats_pkey' if your constraint name is different
ALTER TABLE public.server_stats DROP CONSTRAINT IF EXISTS server_stats_pkey;

-- 2. Use the index we just built as the new PK
ALTER TABLE public.server_stats ADD PRIMARY KEY USING INDEX server_stats_new_pk;

-- 3. Drop the redundant ID column
ALTER TABLE public.server_stats DROP COLUMN IF EXISTS id;

-- 4. Enable Compression Settings
ALTER TABLE public.server_stats SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'server_id',
    timescaledb.compress_orderby = 'timestamp DESC'
    );
COMMIT;

-- Finally, compress existing chunks

-- 1. Add the policy for 1 day
SELECT add_compression_policy('public.server_stats', INTERVAL '1 day');

-- 2. Optional: Check how much space you are saving as it works
-- Run this every few minutes to watch the 'total_size' drop.
SELECT
    *
FROM hypertable_compression_stats('public.server_stats');