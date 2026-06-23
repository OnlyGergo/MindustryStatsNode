-- 1. Turn off the automatic compression policy temporarily


-- 2. Decompress any existing compressed chunks
SELECT decompress_chunk(c, true)
FROM show_chunks('server_stats') c;

ALTER TABLE server_stats SET (timescaledb.compress = false);

SELECT remove_compression_policy('server_stats');
alter table server_stats
    add motd_registry_id integer null
        constraint server_stats_server_motds_registry_id_fk
            references server_motds_registry (id);

alter table server_stats
    add map_registry_id integer null
        constraint server_stats_server_maps_registry_id_fk
            references server_maps_registry (id);

SELECT add_compression_policy('server_stats', INTERVAL '7 days'); -- Adjust interval as needed



-- Temporary indexes to speed up the migration
CREATE INDEX CONCURRENTLY tmp_idx_motd_history_windows
    ON server_motds_history (server_id, valid_from, valid_to);

CREATE INDEX CONCURRENTLY tmp_idx_map_history_windows
    ON server_maps_history (server_id, valid_from, valid_to);



-- Ran up to here



-- 1. Backfill MOTD Registry IDs (Optimized for Index Range Scans)
UPDATE server_stats ss
SET motd_registry_id = mh.motd_id
FROM server_motds_history mh
WHERE ss.server_id = mh.server_id
  AND ss.timestamp >= mh.valid_from
  AND ss.timestamp < COALESCE(mh.valid_to, '3000-01-01 00:00:00+00');

-- 2. Backfill Map Registry IDs (Optimized for Index Range Scans)
UPDATE server_stats ss
SET map_registry_id = mah.map_id
FROM server_maps_history mah
WHERE ss.server_id = mah.server_id
  AND ss.timestamp >= mah.valid_from
  AND ss.timestamp < COALESCE(mah.valid_to, '3000-01-01 00:00:00+00');