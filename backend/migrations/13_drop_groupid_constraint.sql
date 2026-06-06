-- 1. Find duplicate pairs (phantom id → original id)
SELECT
    keeper.id as keep_id,
    dupe.id as delete_id
FROM servers keeper
         JOIN servers dupe
              ON keeper.host = dupe.host
                  AND keeper.port = dupe.port
                  AND keeper.id < dupe.id;

-- 2. Migrate stats from phantom to original (ignore conflicts on timestamp)
INSERT INTO server_stats
SELECT
    keeper.id,  -- replace phantom server_id with original
    ss.timestamp, ss.players, ss.max_players, ss.wave,
    ss.version, ss.version_type, ss.ping, ss.online
FROM server_stats ss
         JOIN servers dupe ON ss.server_id = dupe.id
         JOIN servers keeper
              ON keeper.host = dupe.host
                  AND keeper.port = dupe.port
                  AND keeper.id < dupe.id
ON CONFLICT (server_id, timestamp) DO NOTHING;

-- 3. Now safe to delete phantoms (cascades remaining stats)
DELETE FROM servers
WHERE id NOT IN (
    SELECT MIN(id) FROM servers GROUP BY host, port
);

-- 4. Fix the constraint
ALTER TABLE servers DROP CONSTRAINT servers_host_port_group_key;
ALTER TABLE servers ADD CONSTRAINT servers_host_port_key UNIQUE (host, port);