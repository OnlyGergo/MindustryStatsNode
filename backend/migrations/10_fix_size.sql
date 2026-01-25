SELECT
       total_bytes / 1024 / 1024 AS total_mb,
       index_bytes / 1024 / 1024 AS index_mb
FROM hypertable_detailed_size('server_stats');

REINDEX TABLE server_stats;



SELECT * FROM timescaledb_information.chunks WHERE hypertable_name =