\c mindustry_stats_live
SELECT timescaledb_pre_restore();

\c mindustry_stats_dev
SELECT timescaledb_pre_restore();

drop database if exists mindustry_stats_dev_old;

\c postgres

CREATE DATABASE mindustry_stats_dev WITH TEMPLATE mindustry_stats_live;

-- Restore dev first so that can go back up
\c mindustry_stats_live
SELECT timescaledb_post_restore();

\c mindustry_stats_dev
SELECT timescaledb_post_restore();

-- select all sessions
SELECT * FROM pg_stat_activity;