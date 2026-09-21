package repository

import (
	"context"
	"fmt"
	"time"
)

// ServerListRecord is one row of `serverlists`: a source of server addresses.
type ServerListRecord struct {
	ID          int
	Name        string
	URL         string
	DisplayName string
	Active      bool
}

// SourceListEntry is one (server, serverlist) membership discovered this cycle.
type SourceListEntry struct {
	Host         string
	Port         int
	ServerListID int
	DisplayName  string
	Active       bool
}

// sourceListRow is the resolved form written to server_source_list.
type sourceListRow struct {
	ServerID     int       `json:"server_id"`
	ServerListID int       `json:"serverlist_id"`
	DisplayName  string    `json:"display_name"`
	LastSeen     time.Time `json:"last_seen"`
}

// GetAllServerLists returns every configured serverlist source.
func (r *Repository) GetAllServerLists(ctx context.Context) ([]ServerListRecord, error) {
	const op = "getAllServerLists"

	rows, err := r.pool.Query(ctx, `
		SELECT id, name, url, display_name, active
		FROM serverlists
		WHERE active = true
		ORDER BY id
	`)
	if err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	defer rows.Close()

	var lists []ServerListRecord
	for rows.Next() {
		var l ServerListRecord
		if err := rows.Scan(&l.ID, &l.Name, &l.URL, &l.DisplayName, &l.Active); err != nil {
			return nil, &OperationError{Operation: op, Err: err}
		}
		lists = append(lists, l)
	}
	if err := rows.Err(); err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	return lists, nil
}

// RefreshServerSourceList replaces the server_source_list rows for the given
// serverlists with exactly the supplied set of servers.
//
// Port of refreshServerSourceList: one SELECT to build the host|port -> id map,
// one bulk INSERT ... ON CONFLICT DO UPDATE, one DELETE for the rows no longer
// present, all inside a single transaction.
func (r *Repository) RefreshServerSourceList(ctx context.Context, servers []SourceListEntry) error {
	if len(servers) == 0 {
		return nil
	}

	return r.inTx(ctx, "refreshServerSourceList", func(q querier) error {
		// 1. Build host|port -> server_id map.
		serverIDByKey, err := r.serverIDsByAddress(ctx, q)
		if err != nil {
			return err
		}

		// 2. Resolve server IDs, drop any with unknown host/port.
		now := time.Now()
		records := make([]sourceListRow, 0, len(servers))
		for _, s := range servers {
			serverID, ok := serverIDByKey[fmt.Sprintf("%s|%d", s.Host, s.Port)]
			if !ok {
				continue
			}
			records = append(records, sourceListRow{
				ServerID:     serverID,
				ServerListID: s.ServerListID,
				DisplayName:  s.DisplayName,
				LastSeen:     now,
			})
		}

		if len(records) == 0 {
			// Under DRY_RUN the servers upsert never ran, so a first-run
			// database legitimately resolves nothing.
			r.log.Warn("refreshServerSourceList: no discovered server resolved to a row", "candidates", len(servers))
			return nil
		}

		payload, err := toJSON(records)
		if err != nil {
			return &OperationError{Operation: "refreshServerSourceList", Err: err}
		}

		// 3. Bulk upsert in one INSERT ... ON CONFLICT DO UPDATE.
		_, err = r.exec(ctx, q, "refreshServerSourceList: upsert", `
			INSERT INTO server_source_list (server_id, serverlist_id, display_name, last_seen)
			SELECT server_id, serverlist_id, display_name, last_seen
			FROM jsonb_to_recordset($1::jsonb)
				AS x(server_id int, serverlist_id int, display_name text, last_seen timestamptz)
			ON CONFLICT (server_id, serverlist_id) DO UPDATE
				SET display_name = EXCLUDED.display_name,
					last_seen    = EXCLUDED.last_seen
		`, payload)
		if err != nil {
			return err
		}

		// 4. Delete rows no longer in the incoming data for the affected lists.
		return r.deleteStaleSourceRows(ctx, q, records)
	})
}

func (r *Repository) serverIDsByAddress(ctx context.Context, q querier) (map[string]int, error) {
	const op = "refreshServerSourceList: read servers"

	// retired_at IS NULL: once retired rows exist, a host|port can name two rows,
	// and an unfiltered map would non-deterministically resolve discovered
	// addresses onto whichever one the query happened to return last -- possibly
	// the dead one.
	rows, err := q.Query(ctx, `SELECT id, host, port FROM servers WHERE retired_at IS NULL`)
	if err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	defer rows.Close()

	serverIDByKey := make(map[string]int)
	for rows.Next() {
		var (
			id   int
			host string
			port int
		)
		if err := rows.Scan(&id, &host, &port); err != nil {
			return nil, &OperationError{Operation: op, Err: err}
		}
		serverIDByKey[fmt.Sprintf("%s|%d", host, port)] = id
	}
	if err := rows.Err(); err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	return serverIDByKey, nil
}

// deleteStaleSourceRows removes memberships the incoming data no longer claims,
// for the serverlists it covers.
func (r *Repository) deleteStaleSourceRows(ctx context.Context, q querier, records []sourceListRow) error {
	const op = "refreshServerSourceList: delete stale rows"

	expected := make(map[[2]int]struct{}, len(records))
	listIDSeen := make(map[int]struct{})
	affectedListIDs := make([]int, 0)
	for _, rec := range records {
		expected[[2]int{rec.ServerID, rec.ServerListID}] = struct{}{}
		if _, ok := listIDSeen[rec.ServerListID]; !ok {
			listIDSeen[rec.ServerListID] = struct{}{}
			affectedListIDs = append(affectedListIDs, rec.ServerListID)
		}
	}

	rows, err := q.Query(ctx, `
		SELECT id, server_id, serverlist_id
		FROM server_source_list
		WHERE serverlist_id = ANY($1::int[])
	`, affectedListIDs)
	if err != nil {
		return &OperationError{Operation: op, Err: err}
	}

	var deleteIDs []int
	for rows.Next() {
		var id, serverID, serverListID int
		if err := rows.Scan(&id, &serverID, &serverListID); err != nil {
			rows.Close()
			return &OperationError{Operation: op, Err: err}
		}
		if _, ok := expected[[2]int{serverID, serverListID}]; !ok {
			deleteIDs = append(deleteIDs, id)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return &OperationError{Operation: op, Err: err}
	}

	if len(deleteIDs) == 0 {
		return nil
	}

	if r.dryRun {
		r.log.Info("[dry-run] would delete stale server_source_list rows", "rows", len(deleteIDs))
	}

	_, err = r.exec(ctx, q, op, `
		DELETE FROM server_source_list WHERE id = ANY($1::int[])
	`, deleteIDs)
	return err
}
