package repository_test

// End-to-end cover for the ported write path.  Every statement in the
// repository package is SQL, so unit tests can only check the shaping around
// it; this file runs the real statements against a real Postgres.
//
// Set COLLECTOR_TEST_DSN to a database loaded with schema.sql to run it:
//
//	COLLECTOR_TEST_DSN=postgres://postgres@127.0.0.1:5432/mindustry_test go test ./internal/repository/
//
// TimescaleDB is not required: server_stats is written through plain SQL, and
// the hypertable behaves identically for these statements.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

func newTestRepo(t *testing.T) (*repository.Repository, *pgxpool.Pool) {
	t.Helper()

	dsn := os.Getenv("COLLECTOR_TEST_DSN")
	if dsn == "" {
		t.Skip("COLLECTOR_TEST_DSN is not set; skipping database integration tests")
	}

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	truncate(t, pool)
	return repository.New(pool, false), pool
}

func truncate(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		TRUNCATE server_stats, server_current, server_maps_history, server_motds_history,
				 server_source_list, server_maps_registry, server_motds_registry,
				 gamemode_registry, servers, server_groups, serverlists
		RESTART IDENTITY CASCADE
	`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func scalar[T any](t *testing.T, pool *pgxpool.Pool, sql string, args ...any) T {
	t.Helper()
	var v T
	if err := pool.QueryRow(context.Background(), sql, args...).Scan(&v); err != nil {
		t.Fatalf("query %q: %v", sql, err)
	}
	return v
}

func serverID(t *testing.T, pool *pgxpool.Pool, host string, port int) int {
	t.Helper()
	return scalar[int](t, pool, `SELECT id FROM servers WHERE host = $1 AND port = $2`, host, port)
}

func seedServers(t *testing.T, repo *repository.Repository, servers ...repository.ServerInput) {
	t.Helper()
	if err := repo.BatchUpsertServers(context.Background(), servers); err != nil {
		t.Fatalf("BatchUpsertServers: %v", err)
	}
}

func TestBatchUpsertServers(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo,
		repository.ServerInput{Name: "Network A", Host: "a.example.com", Port: 6567},
		repository.ServerInput{Name: "Network A", Host: "a.example.com", Port: 6567}, // duplicate address
		repository.ServerInput{Name: "Network A", Host: "a2.example.com", Port: 6567},
		repository.ServerInput{Name: "Network B", Host: "b.example.com", Port: 7000},
	)

	if got := scalar[int64](t, pool, `SELECT count(*) FROM servers`); got != 3 {
		t.Errorf("servers = %d, want 3 (the duplicate address collapses)", got)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_groups`); got != 2 {
		t.Errorf("server_groups = %d, want 2", got)
	}

	// Re-running moves a server to its new group rather than inserting again.
	if err := repo.BatchUpsertServers(ctx, []repository.ServerInput{
		{Name: "Network B", Host: "a.example.com", Port: 6567},
	}); err != nil {
		t.Fatalf("BatchUpsertServers (regroup): %v", err)
	}

	if got := scalar[int64](t, pool, `SELECT count(*) FROM servers`); got != 3 {
		t.Errorf("servers = %d after a re-run, want 3", got)
	}
	group := scalar[string](t, pool, `
		SELECT g.name FROM servers s JOIN server_groups g ON g.id = s.server_group_id
		WHERE s.host = 'a.example.com'
	`)
	if group != "Network B" {
		t.Errorf("group = %q, want the upsert to have moved the server", group)
	}
}

func TestRefreshServerSourceList(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	listID := scalar[int](t, pool, `
		INSERT INTO serverlists (name, url, display_name)
		VALUES ('be', 'https://example.com/servers.json', 'BE') RETURNING id
	`)

	seedServers(t, repo,
		repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567},
		repository.ServerInput{Name: "N", Host: "b.example.com", Port: 6567},
	)

	entries := []repository.SourceListEntry{
		{Host: "a.example.com", Port: 6567, ServerListID: listID, DisplayName: "A"},
		{Host: "b.example.com", Port: 6567, ServerListID: listID, DisplayName: "B"},
		{Host: "unknown.example.com", Port: 6567, ServerListID: listID, DisplayName: "gone"},
	}
	if err := repo.RefreshServerSourceList(ctx, entries); err != nil {
		t.Fatalf("RefreshServerSourceList: %v", err)
	}

	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_source_list`); got != 2 {
		t.Errorf("server_source_list = %d rows, want 2 (the unknown address is dropped)", got)
	}

	// A later cycle that no longer lists b: its membership row goes away, and
	// a's display name is refreshed in place.
	if err := repo.RefreshServerSourceList(ctx, []repository.SourceListEntry{
		{Host: "a.example.com", Port: 6567, ServerListID: listID, DisplayName: "A renamed"},
	}); err != nil {
		t.Fatalf("RefreshServerSourceList (prune): %v", err)
	}

	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_source_list`); got != 1 {
		t.Errorf("server_source_list = %d rows, want 1 after the stale row is deleted", got)
	}
	if got := scalar[string](t, pool, `SELECT display_name FROM server_source_list`); got != "A renamed" {
		t.Errorf("display_name = %q, want the upsert to have refreshed it", got)
	}
	if scalar[*time.Time](t, pool, `SELECT last_seen FROM server_source_list`) == nil {
		t.Error("last_seen was not written")
	}
}

func TestBulkSaveMotdsRotatesOnlyOnChange(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567})
	id := serverID(t, pool, "a.example.com", 6567)

	first, err := repo.BulkSaveMotds(ctx, []repository.MotdEntry{
		{ServerID: id, ServerName: "Server", Description: "hello"},
	})
	if err != nil {
		t.Fatalf("BulkSaveMotds: %v", err)
	}
	if first[id] == 0 {
		t.Fatalf("BulkSaveMotds returned no registry id: %v", first)
	}

	// Same MOTD again: the registry id is still returned (it stamps the stats
	// rows) but no history row is rotated.
	second, err := repo.BulkSaveMotds(ctx, []repository.MotdEntry{
		{ServerID: id, ServerName: "Server", Description: "hello"},
	})
	if err != nil {
		t.Fatalf("BulkSaveMotds (unchanged): %v", err)
	}
	if second[id] != first[id] {
		t.Errorf("registry id changed for an unchanged MOTD: %d -> %d", first[id], second[id])
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_motds_history`); got != 1 {
		t.Errorf("server_motds_history = %d rows, want 1 -- an unchanged MOTD must not rotate", got)
	}

	// A changed MOTD closes the open row and opens exactly one replacement.
	third, err := repo.BulkSaveMotds(ctx, []repository.MotdEntry{
		{ServerID: id, ServerName: "Server", Description: "goodbye"},
	})
	if err != nil {
		t.Fatalf("BulkSaveMotds (changed): %v", err)
	}
	if third[id] == first[id] {
		t.Error("a changed MOTD should map to a new registry row")
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_motds_history`); got != 2 {
		t.Errorf("server_motds_history = %d rows, want 2", got)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_motds_history WHERE valid_to IS NULL`); got != 1 {
		t.Errorf("open history rows = %d, want exactly 1 -- readers pick one arbitrarily", got)
	}
	openID := scalar[int](t, pool, `SELECT motd_id FROM server_motds_history WHERE valid_to IS NULL`)
	if openID != third[id] {
		t.Errorf("open row points at %d, want the new registry row %d", openID, third[id])
	}
}

func TestBulkSaveMotdsCollapsesTwoEntriesForOneServer(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567})
	id := serverID(t, pool, "a.example.com", 6567)

	// Two samples for one server in one batch: the newest wins and only one row
	// may be left open.
	result, err := repo.BulkSaveMotds(ctx, []repository.MotdEntry{
		{ServerID: id, ServerName: "old", Description: ""},
		{ServerID: id, ServerName: "new", Description: ""},
	})
	if err != nil {
		t.Fatalf("BulkSaveMotds: %v", err)
	}

	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_motds_history WHERE valid_to IS NULL`); got != 1 {
		t.Errorf("open history rows = %d, want 1", got)
	}
	name := scalar[string](t, pool, `SELECT server_name FROM server_motds_registry WHERE id = $1`, result[id])
	if name != "new" {
		t.Errorf("kept %q, want the newest entry", name)
	}
}

func TestBulkSaveMapsResolvesGamemodes(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo,
		repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567},
		repository.ServerInput{Name: "N", Host: "b.example.com", Port: 6567},
	)
	a := serverID(t, pool, "a.example.com", 6567)
	b := serverID(t, pool, "b.example.com", 6567)

	ids, err := repo.BulkSaveMaps(ctx, []repository.MapEntry{
		{ServerID: a, MapName: "Ground Zero", GameMode: 0, ModeName: ""},
		{ServerID: b, MapName: "Ground Zero", GameMode: 0, ModeName: "[accent]Hexed"},
	})
	if err != nil {
		t.Fatalf("BulkSaveMaps: %v", err)
	}

	// Same map name, different gamemode: two registry rows, not one.
	if ids[a] == ids[b] {
		t.Errorf("both servers mapped to registry id %d; mode_name is part of the key", ids[a])
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM gamemode_registry`); got != 2 {
		t.Errorf("gamemode_registry = %d rows, want 2", got)
	}
	// clean_name is derived in Go from the same rule common/Gamemode.ts uses.
	clean := scalar[string](t, pool, `SELECT clean_name FROM gamemode_registry WHERE mode_name = '[accent]Hexed'`)
	if clean != "Hexed" {
		t.Errorf("clean_name = %q, want the colour markup stripped", clean)
	}
	vanilla := scalar[string](t, pool, `SELECT clean_name FROM gamemode_registry WHERE mode_name = ''`)
	if vanilla != "Survival" {
		t.Errorf("clean_name = %q, want the vanilla name for the ordinal", vanilla)
	}

	gamemodeID := scalar[int](t, pool, `SELECT gamemode_id FROM server_maps_registry WHERE mode_name = '[accent]Hexed'`)
	if gamemodeID == 0 {
		t.Error("server_maps_registry.gamemode_id was not populated")
	}

	// A second cycle with the same pairs must not insert more registry rows.
	if _, err := repo.BulkSaveMaps(ctx, []repository.MapEntry{
		{ServerID: a, MapName: "Ground Zero", GameMode: 0, ModeName: ""},
	}); err != nil {
		t.Fatalf("BulkSaveMaps (repeat): %v", err)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_maps_registry`); got != 2 {
		t.Errorf("server_maps_registry = %d rows, want 2", got)
	}
}

func TestBulkSaveMapsDefaultsAnEmptyName(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567})
	id := serverID(t, pool, "a.example.com", 6567)

	if _, err := repo.BulkSaveMaps(ctx, []repository.MapEntry{{ServerID: id}}); err != nil {
		t.Fatalf("BulkSaveMaps: %v", err)
	}
	if got := scalar[string](t, pool, `SELECT map_name FROM server_maps_registry`); got != "Unknown" {
		t.Errorf("map_name = %q, want %q -- the column is NOT NULL", got, "Unknown")
	}
}

func TestBulkSaveServerStats(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567})
	id := serverID(t, pool, "a.example.com", 6567)

	at := time.UnixMilli(1_700_000_000_000)
	players := int32(7)
	limit := int32(50)
	versionType := "official"

	rows := []repository.StatRow{
		{ServerID: id, Timestamp: at, Players: &players, MaxPlayers: &limit, VersionType: &versionType, Online: true},
		// Same primary key: the collector queued the server twice.
		{ServerID: id, Timestamp: at, Players: &limit, Online: true},
	}
	if err := repo.BulkSaveServerStats(ctx, rows); err != nil {
		t.Fatalf("BulkSaveServerStats: %v", err)
	}

	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_stats`); got != 1 {
		t.Errorf("server_stats = %d rows, want 1", got)
	}
	if got := scalar[int32](t, pool, `SELECT players FROM server_stats`); got != 7 {
		t.Errorf("players = %d, want the first sample", got)
	}
	if got := scalar[int32](t, pool, `SELECT players FROM server_current WHERE server_id = $1`, id); got != 7 {
		t.Errorf("server_current.players = %d, want 7", got)
	}

	// Re-writing the same sample is a no-op, not a failed batch.
	if err := repo.BulkSaveServerStats(ctx, rows[:1]); err != nil {
		t.Fatalf("BulkSaveServerStats (replay): %v", err)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_stats`); got != 1 {
		t.Errorf("server_stats = %d rows after a replay, want 1", got)
	}

	// A newer sample moves server_current forward.
	newer := int32(9)
	if err := repo.BulkSaveServerStats(ctx, []repository.StatRow{
		{ServerID: id, Timestamp: at.Add(time.Minute), Players: &newer, Online: true},
	}); err != nil {
		t.Fatalf("BulkSaveServerStats (newer): %v", err)
	}
	if got := scalar[int32](t, pool, `SELECT players FROM server_current WHERE server_id = $1`, id); got != 9 {
		t.Errorf("server_current.players = %d, want 9", got)
	}

	// An out-of-order sample is still recorded, but must not drag
	// server_current backwards.
	older := int32(1)
	if err := repo.BulkSaveServerStats(ctx, []repository.StatRow{
		{ServerID: id, Timestamp: at.Add(-time.Minute), Players: &older, Online: true},
	}); err != nil {
		t.Fatalf("BulkSaveServerStats (older): %v", err)
	}
	if got := scalar[int32](t, pool, `SELECT players FROM server_current WHERE server_id = $1`, id); got != 9 {
		t.Errorf("server_current.players = %d, want 9 -- an older sample must not win", got)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_stats`); got != 3 {
		t.Errorf("server_stats = %d rows, want 3", got)
	}
}

func TestBulkSaveServerStatsDeduplicatesWithinOneStatement(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567})
	id := serverID(t, pool, "a.example.com", 6567)

	at := time.UnixMilli(1_700_000_000_000)
	older, newer := int32(1), int32(2)

	// Two timestamps for one server in one batch: ON CONFLICT cannot resolve two
	// conflicting rows from the same statement, so server_current picks the
	// newest with DISTINCT ON before the upsert.
	if err := repo.BulkSaveServerStats(ctx, []repository.StatRow{
		{ServerID: id, Timestamp: at, Players: &older, Online: true},
		{ServerID: id, Timestamp: at.Add(time.Minute), Players: &newer, Online: true},
	}); err != nil {
		t.Fatalf("BulkSaveServerStats: %v", err)
	}

	if got := scalar[int32](t, pool, `SELECT players FROM server_current WHERE server_id = $1`, id); got != 2 {
		t.Errorf("server_current.players = %d, want the newest sample in the batch", got)
	}
}

func TestBulkSaveServerStatsOfflineRow(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567})
	id := serverID(t, pool, "a.example.com", 6567)

	zero := int32(0)
	if err := repo.BulkSaveServerStats(ctx, []repository.StatRow{
		{ServerID: id, Timestamp: time.UnixMilli(1_700_000_000_000), Players: &zero, Online: false},
	}); err != nil {
		t.Fatalf("BulkSaveServerStats: %v", err)
	}

	if got := scalar[bool](t, pool, `SELECT online FROM server_stats`); got {
		t.Error("online = true for an offline sample")
	}
	if got := scalar[int32](t, pool, `SELECT players FROM server_stats`); got != 0 {
		t.Errorf("players = %d, want the column default of 0", got)
	}
	if scalar[*int32](t, pool, `SELECT max_players FROM server_stats`) != nil {
		t.Error("max_players should stay NULL for an offline sample")
	}
}

func TestBulkUpdateLastSeenAndCountryCodes(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo,
		repository.ServerInput{Name: "N", Host: "a.example.com", Port: 6567},
		repository.ServerInput{Name: "N", Host: "b.example.com", Port: 6567},
	)
	a := serverID(t, pool, "a.example.com", 6567)
	b := serverID(t, pool, "b.example.com", 6567)

	if err := repo.BulkUpdateLastSeen(ctx, []int{a}); err != nil {
		t.Fatalf("BulkUpdateLastSeen: %v", err)
	}
	if scalar[*time.Time](t, pool, `SELECT last_seen FROM servers WHERE id = $1`, a) == nil {
		t.Error("last_seen was not stamped on the server that answered")
	}
	if scalar[*time.Time](t, pool, `SELECT last_seen FROM servers WHERE id = $1`, b) != nil {
		t.Error("last_seen was stamped on a server that did not answer")
	}

	if err := repo.BulkUpdateCountryCodes(ctx, []repository.CountryUpdate{
		{ServerID: a, CountryCode: "DE"},
	}); err != nil {
		t.Fatalf("BulkUpdateCountryCodes: %v", err)
	}
	if got := scalar[*string](t, pool, `SELECT country_code FROM servers WHERE id = $1`, a); got == nil || *got != "DE" {
		t.Errorf("country_code = %v, want DE", got)
	}

	// Writing the same code again touches no row.
	before := scalar[time.Time](t, pool, `SELECT updated_at FROM servers WHERE id = $1`, a)
	if err := repo.BulkUpdateCountryCodes(ctx, []repository.CountryUpdate{
		{ServerID: a, CountryCode: "DE"},
	}); err != nil {
		t.Fatalf("BulkUpdateCountryCodes (unchanged): %v", err)
	}
	if after := scalar[time.Time](t, pool, `SELECT updated_at FROM servers WHERE id = $1`, a); !after.Equal(before) {
		t.Error("an unchanged country code should not touch the row")
	}
}

func TestGetServersReturnsGroupNames(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	seedServers(t, repo, repository.ServerInput{Name: "Network A", Host: "a.example.com", Port: 6567})
	_ = pool

	servers, err := repo.GetServers(ctx)
	if err != nil {
		t.Fatalf("GetServers: %v", err)
	}
	if len(servers) != 1 {
		t.Fatalf("GetServers returned %d servers, want 1", len(servers))
	}
	if servers[0].Name != "Network A" || servers[0].Host != "a.example.com" || servers[0].Port != 6567 {
		t.Errorf("server = %+v", servers[0])
	}
}

func TestGetAllServerLists(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, `
		INSERT INTO serverlists (name, url, display_name)
		VALUES ('be', 'https://example.com/servers.json', 'BE')
	`); err != nil {
		t.Fatalf("seed serverlists: %v", err)
	}

	lists, err := repo.GetAllServerLists(ctx)
	if err != nil {
		t.Fatalf("GetAllServerLists: %v", err)
	}
	if len(lists) != 1 || lists[0].URL != "https://example.com/servers.json" {
		t.Errorf("lists = %+v", lists)
	}
}

func TestDryRunWritesNothing(t *testing.T) {
	_, pool := newTestRepo(t)
	ctx := context.Background()

	dry := repository.New(pool, true)
	if !dry.DryRun() {
		t.Fatal("DryRun() = false")
	}

	if err := dry.BatchUpsertServers(ctx, []repository.ServerInput{
		{Name: "N", Host: "a.example.com", Port: 6567},
	}); err != nil {
		t.Fatalf("BatchUpsertServers: %v", err)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM servers`); got != 0 {
		t.Errorf("servers = %d rows, want 0 under DRY_RUN", got)
	}

	if err := dry.BulkSaveServerStats(ctx, []repository.StatRow{
		{ServerID: 1, Timestamp: time.UnixMilli(1_700_000_000_000), Online: true},
	}); err != nil {
		t.Fatalf("BulkSaveServerStats: %v", err)
	}
	if got := scalar[int64](t, pool, `SELECT count(*) FROM server_stats`); got != 0 {
		t.Errorf("server_stats = %d rows, want 0 under DRY_RUN", got)
	}

	// The read paths still run, which is what makes the dry run a useful check.
	if _, err := dry.GetServers(ctx); err != nil {
		t.Fatalf("GetServers under DRY_RUN: %v", err)
	}
}
