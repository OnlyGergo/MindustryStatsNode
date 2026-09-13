package repository

import (
	"context"
	"fmt"
	"time"
)

// ServerRecord is common/models/RepositoryTypes.ts's ServerRecord, trimmed to
// the columns the collector actually polls with.
type ServerRecord struct {
	ID   int
	Host string
	Port int
	Name string
}

// ServerInput is one discovered server: a group name plus an address.
type ServerInput struct {
	Name string `json:"name"`
	Host string `json:"host"`
	Port int    `json:"port"`
}

// StatRow is one server_stats sample.  Nullable columns are pointers so an
// absent value is written as NULL rather than as a zero, matching the DEFAULT
// Sequelize's bulkCreate emitted for an undefined field.
type StatRow struct {
	ServerID       int       `json:"server_id"`
	Timestamp      time.Time `json:"timestamp"`
	Players        *int32    `json:"players"`
	MaxPlayers     *int32    `json:"max_players"`
	Wave           *int32    `json:"wave"`
	Version        *int32    `json:"version"`
	VersionType    *string   `json:"version_type"`
	Ping           *int32    `json:"ping"`
	Online         bool      `json:"online"`
	MotdRegistryID *int      `json:"motd_registry_id"`
	MapRegistryID  *int      `json:"map_registry_id"`
}

// GetServers returns every server with its group name, which is what the
// collector queues.
//
// serverRepository.ts read both tables and joined them in JS; one LEFT JOIN is
// the same result set with one round trip.
func (r *Repository) GetServers(ctx context.Context) ([]ServerRecord, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.id, s.host, s.port, COALESCE(g.name, 'Unknown') AS name
		FROM servers s
		LEFT JOIN server_groups g ON g.id = s.server_group_id
		ORDER BY s.id
	`)
	if err != nil {
		return nil, &OperationError{Operation: "getServers", Err: err}
	}
	defer rows.Close()

	var servers []ServerRecord
	for rows.Next() {
		var s ServerRecord
		if err := rows.Scan(&s.ID, &s.Host, &s.Port, &s.Name); err != nil {
			return nil, &OperationError{Operation: "getServers", Err: err}
		}
		servers = append(servers, s)
	}
	if err := rows.Err(); err != nil {
		return nil, &OperationError{Operation: "getServers", Err: err}
	}
	return servers, nil
}

// BatchUpsertServers upserts servers and their groups reliably.
// Port of batchUpsertServers.
func (r *Repository) BatchUpsertServers(ctx context.Context, servers []ServerInput) error {
	if len(servers) == 0 {
		return nil
	}

	// 1. Deduplicate servers by host + port (first entry wins, as the TS reduce did).
	seen := make(map[string]struct{}, len(servers))
	deduplicated := make([]ServerInput, 0, len(servers))
	for _, s := range servers {
		key := fmt.Sprintf("%s|%d", s.Host, s.Port)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduplicated = append(deduplicated, s)
	}

	// 2. Extract strictly unique group names, keeping discovery order so the
	//    payload is reproducible between runs.
	type groupRow struct {
		Name string `json:"name"`
	}
	seenGroups := make(map[string]struct{}, len(deduplicated))
	groupObjects := make([]groupRow, 0, len(deduplicated))
	for _, s := range deduplicated {
		if _, ok := seenGroups[s.Name]; ok {
			continue
		}
		seenGroups[s.Name] = struct{}{}
		groupObjects = append(groupObjects, groupRow{Name: s.Name})
	}

	groupsJSON, err := toJSON(groupObjects)
	if err != nil {
		return &OperationError{Operation: "batchUpsertServers", Err: err}
	}
	serversJSON, err := toJSON(deduplicated)
	if err != nil {
		return &OperationError{Operation: "batchUpsertServers", Err: err}
	}

	return r.inTx(ctx, "batchUpsertServers", func(q querier) error {
		// Step 1: Ensure all server groups exist.
		if len(groupObjects) > 0 {
			_, err := r.exec(ctx, q, "batchUpsertServers: insert server_groups", `
				INSERT INTO server_groups (name)
				SELECT name
				FROM jsonb_to_recordset($1::jsonb) AS x(name text)
				ON CONFLICT (name) DO NOTHING
			`, groupsJSON)
			if err != nil {
				return err
			}
		}

		// Step 2: Insert servers joining against the updated server_groups table.
		_, err := r.exec(ctx, q, "batchUpsertServers: insert servers", `
			WITH server_data AS (
				SELECT * FROM jsonb_to_recordset($1::jsonb)
					AS x(name text, host text, port int)
			)
			INSERT INTO servers (host, port, server_group_id)
			SELECT sd.host, sd.port, g.id
			FROM server_data sd
			LEFT JOIN server_groups g ON g.name = sd.name
			ON CONFLICT (host, port) DO UPDATE
				SET server_group_id = EXCLUDED.server_group_id,
					updated_at      = NOW()
		`, serversJSON)
		return err
	})
}

// BulkUpdateLastSeen stamps last_seen on the servers that answered this cycle.
//
// The Server model carries Sequelize timestamps, so its update also moved
// updated_at; the explicit assignment below keeps that behaviour.
func (r *Repository) BulkUpdateLastSeen(ctx context.Context, serverIDs []int) error {
	if len(serverIDs) == 0 {
		return nil
	}
	_, err := r.exec(ctx, r.pool, "bulkUpdateLastSeen", `
		UPDATE servers
		SET last_seen = $1, updated_at = $1
		WHERE id = ANY($2::int[])
	`, time.Now(), serverIDs)
	return err
}

// CountryUpdate pairs a server with the country its address resolved to.
type CountryUpdate struct {
	ServerID    int    `json:"server_id"`
	CountryCode string `json:"country_code"`
}

// BulkUpdateCountryCodes writes servers.country_code for the servers that
// answered, skipping rows whose code has not changed.
//
// The geoip lookup existed on the TS side but its result was never persisted,
// which is why the column is empty; migration step 11 lists country_code
// populating as something to verify after the cutover, so the Go writer stores
// it.
func (r *Repository) BulkUpdateCountryCodes(ctx context.Context, updates []CountryUpdate) error {
	if len(updates) == 0 {
		return nil
	}

	payload, err := toJSON(updates)
	if err != nil {
		return &OperationError{Operation: "bulkUpdateCountryCodes", Err: err}
	}

	_, err = r.exec(ctx, r.pool, "bulkUpdateCountryCodes", `
		UPDATE servers s
		SET country_code = x.country_code,
			updated_at   = NOW()
		FROM jsonb_to_recordset($1::jsonb) AS x(server_id int, country_code varchar(2))
		WHERE s.id = x.server_id
		  AND s.country_code IS DISTINCT FROM x.country_code
	`, payload)
	return err
}

// dedupeStatsByPrimaryKey drops rows that collide on server_stats' primary key,
// (server_id, timestamp).
//
// The collector re-queues every server on a fixed interval without waiting for
// the previous sweep to drain, so a slow cycle can put two samples for one
// server into the same batch.  When they land in the same millisecond they are
// the same observation, and an unguarded INSERT would abort over it -- losing
// every other server's sample in the batch too.
func dedupeStatsByPrimaryKey(batch []StatRow) []StatRow {
	type key struct {
		serverID int
		millis   int64
	}

	seen := make(map[key]struct{}, len(batch))
	rows := make([]StatRow, 0, len(batch))
	for _, stat := range batch {
		k := key{serverID: stat.ServerID, millis: stat.Timestamp.UnixMilli()}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		rows = append(rows, stat)
	}
	return rows
}

// BulkSaveServerStats writes the samples and keeps server_current in step.
func (r *Repository) BulkSaveServerStats(ctx context.Context, batch []StatRow) error {
	if len(batch) == 0 {
		return nil
	}

	rows := dedupeStatsByPrimaryKey(batch)
	if len(rows) != len(batch) {
		r.log.Warn(
			"bulkSaveServerStats: dropped sample(s) colliding on (server_id, timestamp) -- the collector queued a server twice",
			"dropped", len(batch)-len(rows),
		)
	}

	servers := make(map[int]struct{}, len(rows))
	for _, row := range rows {
		servers[row.ServerID] = struct{}{}
	}

	payload, err := toJSON(rows)
	if err != nil {
		return &OperationError{Operation: "bulkSaveServerStats", Err: err}
	}

	if r.dryRun {
		r.log.Info("[dry-run] would write server_stats", "rows", len(rows), "servers", len(servers))
	}

	// server_stats and server_current have to agree: without the transaction a
	// failure between them leaves the read paths serving a "latest" sample the
	// hypertable has no row for.
	//
	// ON CONFLICT DO NOTHING guards the cross-batch case the in-memory dedupe
	// cannot see (a restart replaying a sample, or a second instance): the
	// colliding row is the same observation, so skipping it is right, and it
	// keeps one duplicate from discarding the whole batch.
	return r.inTx(ctx, "bulkSaveServerStats", func(q querier) error {
		_, err := r.exec(ctx, q, "bulkSaveServerStats", `
			INSERT INTO server_stats (
				server_id, timestamp, players, max_players, wave,
				version, version_type, ping, online, motd_registry_id, map_registry_id
			)
			SELECT
				server_id, timestamp, players, max_players, wave,
				version, version_type, ping, online, motd_registry_id, map_registry_id
			FROM jsonb_to_recordset($1::jsonb) AS x(
				server_id int, timestamp timestamptz, players int, max_players int, wave int,
				version int, version_type varchar(50), ping int, online boolean,
				motd_registry_id int, map_registry_id int
			)
			ON CONFLICT DO NOTHING
		`, payload)
		if err != nil {
			return err
		}
		return r.upsertServerCurrent(ctx, q, rows)
	})
}

// currentRow is upsertServerCurrent's payload: the same columns, with the
// nullable ones coalesced exactly as the TS mapping did.
type currentRow struct {
	ServerID       int       `json:"server_id"`
	Timestamp      time.Time `json:"timestamp"`
	Players        int32     `json:"players"`
	MaxPlayers     *int32    `json:"max_players"`
	Wave           *int32    `json:"wave"`
	Version        *int32    `json:"version"`
	VersionType    *string   `json:"version_type"`
	Ping           *int32    `json:"ping"`
	Online         bool      `json:"online"`
	MotdRegistryID *int      `json:"motd_registry_id"`
	MapRegistryID  *int      `json:"map_registry_id"`
}

// upsertServerCurrent keeps server_current in step with the hypertable.
//
// server_current holds the newest sample per server so the read paths never
// have to answer "latest value per server" with a DISTINCT ON over
// server_stats.  Rows are deduplicated inside the batch first (ON CONFLICT
// cannot resolve two conflicting rows from the same statement) and the update
// is guarded on the timestamp, so an out-of-order batch cannot move a server
// backwards in time.
func (r *Repository) upsertServerCurrent(ctx context.Context, q querier, batch []StatRow) error {
	rows := make([]currentRow, 0, len(batch))
	for _, stat := range batch {
		if stat.ServerID == 0 || stat.Timestamp.IsZero() {
			continue
		}
		players := int32(0)
		if stat.Players != nil {
			players = *stat.Players
		}
		rows = append(rows, currentRow{
			ServerID:       stat.ServerID,
			Timestamp:      stat.Timestamp,
			Players:        players,
			MaxPlayers:     stat.MaxPlayers,
			Wave:           stat.Wave,
			Version:        stat.Version,
			VersionType:    stat.VersionType,
			Ping:           stat.Ping,
			Online:         stat.Online,
			MotdRegistryID: stat.MotdRegistryID,
			MapRegistryID:  stat.MapRegistryID,
		})
	}

	if len(rows) == 0 {
		return nil
	}

	payload, err := toJSON(rows)
	if err != nil {
		return &OperationError{Operation: "upsertServerCurrent", Err: err}
	}

	_, err = r.exec(ctx, q, "upsertServerCurrent", `
		INSERT INTO server_current (
			server_id, timestamp, players, max_players, wave,
			version, version_type, ping, online, motd_registry_id, map_registry_id
		)
		SELECT DISTINCT ON (x.server_id)
			x.server_id, x.timestamp, x.players, x.max_players, x.wave,
			x.version, x.version_type, x.ping, x.online, x.motd_registry_id, x.map_registry_id
		FROM jsonb_to_recordset($1::jsonb) AS x(
			server_id int, timestamp timestamptz, players int, max_players int, wave int,
			version int, version_type varchar(50), ping int, online boolean,
			motd_registry_id int, map_registry_id int
		)
		ORDER BY x.server_id, x.timestamp DESC
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
			WHERE server_current.timestamp <= EXCLUDED.timestamp
	`, payload)
	return err
}
