\c mindustry_stats_dev

-- Prep for copy
SELECT timescaledb_pre_restore();

\c postgres

CREATE DATABASE mindustry_stats_experiment WITH TEMPLATE mindustry_stats_dev;

-- Restore dev first so that can go back up
\c mindustry_stats_dev
SELECT timescaledb_post_restore();

\c mindustry_stats_experiment
SELECT timescaledb_post_restore();


-- get sessions
SELECT * FROM pg_stat_activity;