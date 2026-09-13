package repository

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// HistoryEntry is one server's incoming MOTD or map.  Row holds the registry
// row's columns keyed by column name, so the natural key an entry is
// deduplicated under and the key its row is read back under cannot drift apart.
type HistoryEntry struct {
	ServerID int
	Row      map[string]any
}

// historySpec describes one of the two history tables.  Everything that differs
// between MOTDs and maps lives here; bulkSaveHistoryEntries is the shared body.
type historySpec struct {
	// RegistryColumns are the columns forming the registry's natural key (also
	// the ON CONFLICT target).
	RegistryColumns []string
	// PayloadColumns are written on insert but are not part of the natural key,
	// i.e. values functionally determined by it (map -> gamemode_id).  They are
	// not matched on when the IDs are read back, so a row that already exists
	// keeps whatever it was inserted with.
	PayloadColumns []string
	// RegistryTable is the SQL table name for the registry.
	RegistryTable string
	// HistoryTable is the SQL table name for the history.
	HistoryTable string
	// HistoryFkColumn is the foreign-key column on the history table
	// (e.g. 'motd_id', 'map_id').
	HistoryFkColumn string
	// RegistryTypeDef is the column type hint for jsonb_to_recordset
	// (e.g. "server_name text, description text").
	RegistryTypeDef string
	LogTag          string
}

// historyInsertRow is one new open history row.
type historyInsertRow struct {
	ServerID   int       `json:"server_id"`
	RegistryID int       `json:"registry_id"`
	ValidFrom  time.Time `json:"valid_from"`
}

// bulkSaveHistoryEntries is the shared logic for MOTD and map history updates:
//  1. Upsert the registry rows (deduplication).
//  2. Fetch back the registry IDs.
//  3. In one transaction: close old open history rows, bulk-insert new ones.
//
// It returns server_id -> registry_id for every entry, which is what stamps
// motd_registry_id / map_registry_id onto the stats rows.
func (r *Repository) bulkSaveHistoryEntries(
	ctx context.Context,
	spec historySpec,
	incoming []HistoryEntry,
) (map[int]int, error) {
	if len(incoming) == 0 {
		return map[int]int{}, nil
	}

	// At most one entry per server: step 4 closes every open row for a server
	// and inserts one replacement, so two entries for the same server would
	// leave two rows with valid_to IS NULL.  The readers pick one of those
	// arbitrarily, which is how a server ends up stuck on a stale map or MOTD.
	// The newest entry wins, matching the order the collector queued them.
	entries := dedupeByServer(incoming)
	if len(entries) != len(incoming) {
		r.log.Warn(
			spec.LogTag+": collapsed duplicate server entr(ies) in one batch; keeping the newest per server",
			"collapsed", len(incoming)-len(entries),
		)
	}

	keyOf := func(e HistoryEntry) string { return registryKey(e.Row, spec.RegistryColumns) }

	// 1. Deduplicate.
	seen := make(map[string]struct{}, len(entries))
	registryData := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		k := keyOf(e)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		registryData = append(registryData, e.Row)
	}

	insertColumns := append(append([]string{}, spec.RegistryColumns...), spec.PayloadColumns...)
	columnList := strings.Join(insertColumns, ", ")
	keyList := strings.Join(spec.RegistryColumns, ", ")

	registryJSON, err := toJSON(registryData)
	if err != nil {
		return nil, &OperationError{Operation: spec.LogTag, Err: err}
	}

	// 2. Upsert registry.
	_, err = r.exec(ctx, r.pool,
		fmt.Sprintf("%s: upsert %s", spec.LogTag, spec.RegistryTable),
		fmt.Sprintf(`
			INSERT INTO %s (%s)
			SELECT %s
			FROM jsonb_to_recordset($1::jsonb) AS x(%s)
			ON CONFLICT (%s) DO NOTHING
		`, spec.RegistryTable, columnList, columnList, spec.RegistryTypeDef, keyList),
		registryJSON,
	)
	if err != nil {
		return nil, err
	}

	// 3. Fetch registry IDs.
	registryMap, err := r.readRegistryIDs(ctx, spec, registryJSON)
	if err != nil {
		return nil, err
	}

	serverIDs := make([]int, 0, len(entries))
	for _, e := range entries {
		serverIDs = append(serverIDs, e.ServerID)
	}
	now := time.Now()

	// DISTINCT ON guarantees one row per server, so the "current" value a change
	// is judged against is the newest open row rather than whichever one the
	// planner happened to return last.
	currentIDByServer, err := r.readOpenHistory(ctx, spec, serverIDs)
	if err != nil {
		return nil, err
	}

	changed := make([]HistoryEntry, 0, len(entries))
	for _, e := range entries {
		incomingRegistryID, ok := registryMap[keyOf(e)]
		if !ok {
			// The upsert claimed to have run but the row is not readable, so
			// this server's map/MOTD silently stops updating -- log what was
			// actually being looked up rather than the NUL-joined key, which
			// renders as an unreadable run-together string.
			//
			// Under DRY_RUN this is expected for a genuinely new value: the
			// registry insert never ran, so there is nothing to read back.
			level := r.log.Error
			if r.dryRun {
				level = r.log.Debug
			}
			level(
				spec.LogTag+": registry ID not found after upsert; skipping history update",
				"server", e.ServerID,
				"table", spec.RegistryTable,
				"key", describeRegistryKey(e.Row, spec.RegistryColumns),
			)
			continue
		}
		if currentID, open := currentIDByServer[e.ServerID]; !open || currentID != incomingRegistryID {
			changed = append(changed, e)
		}
	}

	// 4. Close old open rows + insert new ones in one transaction.
	//
	// Only the history rotation is conditional.  The registry map is still
	// returned in full below: it is what stamps motd_registry_id /
	// map_registry_id onto each stats row, and a server's MOTD is unchanged on
	// almost every poll cycle -- returning an empty map here left those columns
	// NULL on all but the handful of samples taken in the cycle the MOTD
	// happened to change.
	if len(changed) > 0 {
		if err := r.rotateHistory(ctx, spec, changed, registryMap, keyOf, now); err != nil {
			return nil, err
		}
	}

	result := make(map[int]int, len(entries))
	for _, e := range entries {
		if id, ok := registryMap[keyOf(e)]; ok {
			result[e.ServerID] = id
		}
	}
	return result, nil
}

// dedupeByServer keeps the last entry per server, preserving input order.
func dedupeByServer(entries []HistoryEntry) []HistoryEntry {
	position := make(map[int]int, len(entries))
	out := make([]HistoryEntry, 0, len(entries))
	for _, e := range entries {
		if i, ok := position[e.ServerID]; ok {
			out[i] = e
			continue
		}
		position[e.ServerID] = len(out)
		out = append(out, e)
	}
	return out
}

// readRegistryIDs reads back the IDs for the rows just upserted, keyed by their
// natural key.  A read-back rather than RETURNING: DO NOTHING returns nothing
// for the rows another instance inserted first.
func (r *Repository) readRegistryIDs(ctx context.Context, spec historySpec, registryJSON string) (map[string]int, error) {
	keyList := strings.Join(spec.RegistryColumns, ", ")

	op := fmt.Sprintf("%s: read back %s ids", spec.LogTag, spec.RegistryTable)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s, id
		FROM %s
		WHERE (%s) IN (
			SELECT %s
			FROM jsonb_to_recordset($1::jsonb) AS x(%s)
		)
	`, keyList, spec.RegistryTable, keyList, keyList, spec.RegistryTypeDef), registryJSON)
	if err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	defer rows.Close()

	registryMap := make(map[string]int)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, &OperationError{Operation: op, Err: err}
		}
		if len(values) != len(spec.RegistryColumns)+1 {
			return nil, &OperationError{Operation: op, Err: fmt.Errorf("expected %d columns, got %d", len(spec.RegistryColumns)+1, len(values))}
		}

		row := make(map[string]any, len(spec.RegistryColumns))
		for i, col := range spec.RegistryColumns {
			row[col] = values[i]
		}
		id, err := asInt(values[len(values)-1])
		if err != nil {
			return nil, &OperationError{Operation: op, Err: err}
		}
		registryMap[registryKey(row, spec.RegistryColumns)] = id
	}
	if err := rows.Err(); err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	return registryMap, nil
}

// readOpenHistory returns the newest open history row per server.
func (r *Repository) readOpenHistory(ctx context.Context, spec historySpec, serverIDs []int) (map[int]int, error) {
	op := fmt.Sprintf("%s: read open %s rows", spec.LogTag, spec.HistoryTable)

	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT DISTINCT ON (server_id)
			   server_id, %s as current_id
		FROM %s
		WHERE server_id = ANY($1::int[]) AND valid_to IS NULL
		ORDER BY server_id, valid_from DESC
	`, spec.HistoryFkColumn, spec.HistoryTable), serverIDs)
	if err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	defer rows.Close()

	current := make(map[int]int)
	for rows.Next() {
		var serverID, currentID int
		if err := rows.Scan(&serverID, &currentID); err != nil {
			return nil, &OperationError{Operation: op, Err: err}
		}
		current[serverID] = currentID
	}
	if err := rows.Err(); err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	return current, nil
}

// rotateHistory closes the open rows for the changed servers and opens their
// replacements, in one transaction.
func (r *Repository) rotateHistory(
	ctx context.Context,
	spec historySpec,
	changed []HistoryEntry,
	registryMap map[string]int,
	keyOf func(HistoryEntry) string,
	now time.Time,
) error {
	changedServerIDs := make([]int, 0, len(changed))
	toInsert := make([]historyInsertRow, 0, len(changed))

	for _, e := range changed {
		registryID, ok := registryMap[keyOf(e)]
		if !ok || registryID == 0 {
			// Unreachable while `changed` is filtered by the caller, but the FK
			// column is NOT NULL: emitting the row anyway would fail the whole
			// transaction, closing every server's open row and inserting no
			// replacement.
			r.log.Error(
				spec.LogTag+": registry ID vanished between filter and insert; dropping row",
				"server", e.ServerID,
				"table", spec.RegistryTable,
				"key", describeRegistryKey(e.Row, spec.RegistryColumns),
			)
			continue
		}
		changedServerIDs = append(changedServerIDs, e.ServerID)
		toInsert = append(toInsert, historyInsertRow{ServerID: e.ServerID, RegistryID: registryID, ValidFrom: now})
	}

	if len(toInsert) == 0 {
		return nil
	}

	insertJSON, err := toJSON(toInsert)
	if err != nil {
		return &OperationError{Operation: spec.LogTag, Err: err}
	}

	op := fmt.Sprintf("%s: rotate %s", spec.LogTag, spec.HistoryTable)
	if r.dryRun {
		r.log.Info("[dry-run] would rotate history",
			"table", spec.HistoryTable, "servers", len(changedServerIDs))
	}

	return r.inTx(ctx, op, func(q querier) error {
		_, err := r.exec(ctx, q, op+" (close)", fmt.Sprintf(`
			UPDATE %s
			SET valid_to = $1
			WHERE server_id = ANY($2::int[]) AND valid_to IS NULL
		`, spec.HistoryTable), now, changedServerIDs)
		if err != nil {
			return err
		}

		_, err = r.exec(ctx, q, op+" (open)", fmt.Sprintf(`
			INSERT INTO %s (server_id, %s, valid_from)
			SELECT server_id, registry_id, valid_from
			FROM jsonb_to_recordset($1::jsonb)
				AS x(server_id int, registry_id int, valid_from timestamptz)
		`, spec.HistoryTable, spec.HistoryFkColumn), insertJSON)
		return err
	})
}

// MotdEntry is one server's current MOTD, as the processor observed it.
type MotdEntry struct {
	ServerID    int
	ServerName  string
	Description string
}

// BulkSaveMotds rotates server_motds_history and returns server_id -> registry ID.
func (r *Repository) BulkSaveMotds(ctx context.Context, motds []MotdEntry) (map[int]int, error) {
	entries := make([]HistoryEntry, 0, len(motds))
	for _, m := range motds {
		entries = append(entries, HistoryEntry{
			ServerID: m.ServerID,
			Row: map[string]any{
				"server_name": m.ServerName,
				"description": m.Description,
			},
		})
	}

	return r.bulkSaveHistoryEntries(ctx, historySpec{
		RegistryColumns: []string{"server_name", "description"},
		RegistryTable:   "server_motds_registry",
		HistoryTable:    "server_motds_history",
		HistoryFkColumn: "motd_id",
		RegistryTypeDef: "server_name text, description text",
		LogTag:          "bulkSaveMotds",
	}, entries)
}

// MapEntry is one server's current map.
//
// mode_name rides along with the map (not just the MOTD) because the map
// registry's gamemode link is keyed on (game_mode, mode_name) -- without it
// every new registry row would collapse onto the nameless vanilla gamemode.
type MapEntry struct {
	ServerID int
	MapName  string
	GameMode int
	ModeName string
}

// BulkSaveMaps rotates server_maps_history and returns server_id -> registry ID.
func (r *Repository) BulkSaveMaps(ctx context.Context, maps []MapEntry) (map[int]int, error) {
	if len(maps) == 0 {
		return map[int]int{}, nil
	}

	// Nail the nullable fields down once: they are part of both the map's
	// natural key and the gamemode's, so the two have to agree exactly.
	normalized := make([]MapEntry, 0, len(maps))
	for _, m := range maps {
		if m.MapName == "" {
			m.MapName = "Unknown"
		}
		normalized = append(normalized, m)
	}

	gamemodeIDs, err := r.resolveGamemodeIDs(ctx, normalized)
	if err != nil {
		return nil, err
	}

	// server_maps_registry.gamemode_id is NOT NULL, so an unresolved gamemode
	// would fail the whole batch insert rather than just its own row.
	entries := make([]HistoryEntry, 0, len(normalized))
	for _, m := range normalized {
		gamemodeID, ok := gamemodeIDs[gamemodeKey(m.GameMode, m.ModeName)]
		if !ok {
			r.log.Error("bulkSaveMaps: no gamemode registry ID",
				"game_mode", m.GameMode, "mode_name", m.ModeName)
			continue
		}
		entries = append(entries, HistoryEntry{
			ServerID: m.ServerID,
			Row: map[string]any{
				"map_name":    m.MapName,
				"game_mode":   m.GameMode,
				"mode_name":   m.ModeName,
				"gamemode_id": gamemodeID,
			},
		})
	}

	if len(entries) == 0 {
		return map[int]int{}, nil
	}

	return r.bulkSaveHistoryEntries(ctx, historySpec{
		RegistryColumns: []string{"map_name", "game_mode", "mode_name"},
		// Functionally determined by (game_mode, mode_name), so it never
		// disagrees with the natural key it is stored alongside.
		PayloadColumns:  []string{"gamemode_id"},
		RegistryTable:   "server_maps_registry",
		HistoryTable:    "server_maps_history",
		HistoryFkColumn: "map_id",
		RegistryTypeDef: "map_name text, game_mode smallint, mode_name text, gamemode_id smallint",
		LogTag:          "bulkSaveMaps",
	}, entries)
}

// asInt widens whatever integer type the driver produced for an id column.
func asInt(v any) (int, error) {
	switch n := v.(type) {
	case int:
		return n, nil
	case int16:
		return int(n), nil
	case int32:
		return int(n), nil
	case int64:
		return int(n), nil
	case float64:
		return int(n), nil
	default:
		return 0, fmt.Errorf("expected an integer id, got %T", v)
	}
}
