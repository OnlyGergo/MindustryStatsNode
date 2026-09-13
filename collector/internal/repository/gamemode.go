package repository

import (
	"context"
	"fmt"
	"sync"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/mindustry"
)

// gamemodeCache maps (game_mode, mode_name) -> gamemode_registry.id for the
// lifetime of the process.
//
// The mapping is immutable once a row exists, and the whole table is a handful
// of rows, so caching it turns a per-poll-cycle round trip into a map lookup.
// Only pairs that are genuinely new reach the database.
type gamemodeCache struct {
	mu  sync.RWMutex
	ids map[string]int
}

func newGamemodeCache() gamemodeCache {
	return gamemodeCache{ids: make(map[string]int)}
}

func (c *gamemodeCache) get(key string) (int, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	id, ok := c.ids[key]
	return id, ok
}

func (c *gamemodeCache) set(key string, id int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ids[key] = id
}

// snapshot copies the cache so callers can read it without holding the lock.
func (c *gamemodeCache) snapshot() map[string]int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make(map[string]int, len(c.ids))
	for k, v := range c.ids {
		out[k] = v
	}
	return out
}

func gamemodeKey(gameMode int, modeName string) string {
	return fmt.Sprintf("%d\x00%s", gameMode, modeName)
}

// gamemodeRow is one gamemode_registry row.
//
// clean_name is derived here rather than in SQL so the display name stays
// defined in exactly one place (common/Gamemode.ts, ported in
// internal/mindustry); migration 24 seeds the historical rows with a SQL
// translation of the same rule.
type gamemodeRow struct {
	GameMode  int    `json:"game_mode"`
	ModeName  string `json:"mode_name"`
	CleanName string `json:"clean_name"`
}

// resolveGamemodeIDs ensures every (game_mode, mode_name) pair has a
// gamemode_registry row and returns the map holding their IDs.
func (r *Repository) resolveGamemodeIDs(ctx context.Context, maps []MapEntry) (map[string]int, error) {
	seen := make(map[string]struct{}, len(maps))
	missing := make([]gamemodeRow, 0, len(maps))

	for _, m := range maps {
		key := gamemodeKey(m.GameMode, m.ModeName)
		if _, cached := r.gamemodes.get(key); cached {
			continue
		}
		if _, queued := seen[key]; queued {
			continue
		}
		seen[key] = struct{}{}
		missing = append(missing, gamemodeRow{
			GameMode:  m.GameMode,
			ModeName:  m.ModeName,
			CleanName: mindustry.CleanModeName(m.ModeName, m.GameMode),
		})
	}

	if len(missing) == 0 {
		return r.gamemodes.snapshot(), nil
	}

	payload, err := toJSON(missing)
	if err != nil {
		return nil, &OperationError{Operation: "resolveGamemodeIds", Err: err}
	}

	_, err = r.exec(ctx, r.pool, "resolveGamemodeIds: upsert gamemode_registry", `
		INSERT INTO gamemode_registry (game_mode, mode_name, clean_name)
		SELECT game_mode, mode_name, clean_name
		FROM jsonb_to_recordset($1::jsonb) AS x(game_mode smallint, mode_name text, clean_name text)
		ON CONFLICT (game_mode, mode_name) DO NOTHING
	`, payload)
	if err != nil {
		return nil, err
	}

	// Read back rather than using RETURNING: DO NOTHING returns nothing for the
	// rows another instance inserted first.
	const op = "resolveGamemodeIds: read back gamemode_registry ids"
	rows, err := r.pool.Query(ctx, `
		SELECT g.id, g.game_mode, g.mode_name
		FROM gamemode_registry g
				 JOIN jsonb_to_recordset($1::jsonb) AS x(game_mode smallint, mode_name text)
					  ON g.game_mode = x.game_mode AND g.mode_name = x.mode_name
	`, payload)
	if err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id       int
			gameMode int
			modeName string
		)
		if err := rows.Scan(&id, &gameMode, &modeName); err != nil {
			return nil, &OperationError{Operation: op, Err: err}
		}
		r.gamemodes.set(gamemodeKey(gameMode, modeName), id)
	}
	if err := rows.Err(); err != nil {
		return nil, &OperationError{Operation: op, Err: err}
	}

	return r.gamemodes.snapshot(), nil
}
