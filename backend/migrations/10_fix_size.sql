-- 1. Cap the values (Sanity check for Mindustry limits)
UPDATE public.server_stats
SET
    players = LEAST(players, 32767),
    max_players = LEAST(max_players, 32767),
    wave = LEAST(wave, 32767),
    ping = LEAST(ping, 32767),
    version = LEAST(version, 32767)
WHERE players > 32767 OR max_players > 32767 OR wave > 32767 OR ping > 32767 OR version > 32767;

-- 2. Drop the old PK and ID column
-- Note: Replace 'server_stats_pkey' with your actual PK name if different
ALTER TABLE public.server_stats DROP CONSTRAINT server_stats_pkey;
ALTER TABLE public.server_stats DROP COLUMN id;

-- 3. Add a new PK (Necessary for unique identification without 'id')
ALTER TABLE public.server_stats ADD PRIMARY KEY (server_id, timestamp);

-- 4. Downsize types (The USING clause is good practice)
ALTER TABLE public.server_stats
    ALTER COLUMN players TYPE smallint USING players::smallint,
    ALTER COLUMN max_players TYPE smallint USING max_players::smallint,
    ALTER COLUMN wave TYPE smallint USING wave::smallint,
    ALTER COLUMN version TYPE smallint USING version::smallint,
    ALTER COLUMN version_type TYPE TEXT USING version_type::TEXT,
    ALTER COLUMN ping TYPE smallint USING ping::smallint;

-- 5. Enable Compression
ALTER TABLE public.server_stats SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'server_id',
    timescaledb.compress_orderby = 'timestamp DESC'
    );

-- 6. Add policy and run manual compression for existing data
SELECT add_compression_policy('public.server_stats', INTERVAL '1 day');

-- This force-compresses everything older than 1 day immediately
SELECT compress_chunk(c) FROM show_chunks('public.server_stats', older_than => INTERVAL '1 day') c;

-- 7. Reclaim Disk Space
VACUUM FULL public.server_stats;