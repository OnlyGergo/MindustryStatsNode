-- ─────────────────────────────────────────────────────────────────────────────
-- 22_server_current.sql
--
-- "Latest value per server" was being answered with `DISTINCT ON (server_id)`
-- over the `server_stats` hypertable in three separate places
-- (getAllServerElements, getNetworkDetails, get_server_details).  Two of them
-- had no time predicate at all, so they touched every chunk back to day one.
--
-- This table holds exactly one row per server — the most recent sample — and is
-- upserted once per poll cycle by bulkSaveServerStats().  679 rows, primary key
-- lookups, no hypertable involved.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS server_current (
    server_id        INTEGER PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    timestamp        TIMESTAMPTZ NOT NULL,
    players          INTEGER,
    max_players      INTEGER,
    wave             INTEGER,
    version          INTEGER,
    version_type     VARCHAR(50),
    ping             INTEGER,
    online           BOOLEAN NOT NULL DEFAULT FALSE,
    motd_registry_id INTEGER,
    map_registry_id  INTEGER
);

-- getNetworkDetails counts "active" servers over a group; it filters on
-- recency + players, so keep a partial index for the online rows.
CREATE INDEX IF NOT EXISTS idx_server_current_timestamp
    ON server_current (timestamp DESC);

-- ─── Seed from the hypertable ────────────────────────────────────────────────
-- One-off: after this, the application keeps the table current.  Bounded to the
-- last 7 days so this does not turn into the very full-history scan the table
-- exists to remove; servers with nothing newer simply have no row, which the
-- read paths already treat as "no current data".
INSERT INTO server_current (
    server_id, timestamp, players, max_players, wave,
    version, version_type, ping, online, motd_registry_id, map_registry_id
)
SELECT DISTINCT ON (server_id)
    server_id, timestamp, players, max_players, wave,
    version, version_type, ping, online, motd_registry_id, map_registry_id
FROM server_stats
WHERE timestamp > NOW() - INTERVAL '7 days'
ORDER BY server_id, timestamp DESC
ON CONFLICT (server_id) DO UPDATE
    SET timestamp        = EXCLUDED.timestamp,
        players          = EXCLUDED.players,
        max_players      = EXCLUDED.max_players,
        wave             = EXCLUDED.wave,
        version          = EXCLUDED.version,
        version_type     = EXCLUDED.version_type,
        ping             = EXCLUDED.ping,
        online           = EXCLUDED.online,
        motd_registry_id = EXCLUDED.motd_registry_id,
        map_registry_id  = EXCLUDED.map_registry_id
    WHERE server_current.timestamp <= EXCLUDED.timestamp;
