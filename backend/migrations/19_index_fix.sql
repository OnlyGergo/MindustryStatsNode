CREATE INDEX idx_map_history_active
    ON server_maps_history (server_id, valid_from DESC)
    WHERE valid_to IS NULL;

CREATE INDEX idx_motd_history_active
    ON server_motds_history (server_id, valid_from DESC)
    WHERE valid_to IS NULL;

ALTER TABLE server_stats SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'server_id',
    timescaledb.compress_orderby   = 'timestamp DESC'
    );

CREATE INDEX idx_server_stats_map_registry_id
    ON server_stats (map_registry_id, timestamp DESC);

CREATE INDEX idx_map_history_map_server
    ON server_maps_history (map_id, server_id);