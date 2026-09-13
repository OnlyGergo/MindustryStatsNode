package db

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
)

// manualMarker is the "--no-tran" first line: those migrations touch things a
// transaction cannot (TimescaleDB CALL statements) and are run by hand.
const manualMarker = "--no-tran"

// undefinedTableCode is SQLSTATE 42P01.
const undefinedTableCode = "42P01"

// ErrManualMigration is returned when a pending migration has to be run by
// hand.  database.ts exited the process here; the caller decides instead.
type ErrManualMigration struct{ Path string }

func (e *ErrManualMigration) Error() string {
	return fmt.Sprintf("migration %s requires manual running, please run it now", e.Path)
}

// RunMigrations applies every .sql file in dir that is not yet recorded in
// public.migrations, in filename order.  Port of runMigrations() from
// backend/src/config/database.ts, which relied on the same 0001_/0002_ naming
// convention for ordering.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool, dir string, dryRun bool) error {
	log := logging.New("Database")

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations directory %q: %w", dir, err)
	}

	var files []string
	for _, entry := range entries {
		// Anything not ending in .sql is deliberately parked (e.g. a
		// ".sql_pending" file) and must not run.
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	if len(files) == 0 {
		log.Info("No migration files found.")
		return nil
	}

	// Ensure the tracking table exists (in case this runs against a fresh db).
	if !dryRun {
		_, err = pool.Exec(ctx, `
			create table if not exists public.migrations
			(
				id         serial primary key,
				name       varchar(255) not null unique,
				applied_at timestamp with time zone default now() not null
			)
		`)
		if err != nil {
			return fmt.Errorf("create migrations table: %w", err)
		}
	}

	applied, err := appliedMigrations(ctx, pool)
	if err != nil {
		// Under DRY_RUN the tracking table was not created, so a fresh database
		// legitimately has none: report every migration as pending instead of
		// refusing to start.
		var pgErr *pgconn.PgError
		if dryRun && errors.As(err, &pgErr) && pgErr.Code == undefinedTableCode {
			log.Info("[dry-run] no migrations table yet; treating every migration as pending")
			applied = map[string]struct{}{}
		} else {
			return err
		}
	}

	var pending []string
	for _, file := range files {
		if _, done := applied[file]; !done {
			pending = append(pending, file)
		}
	}

	if len(pending) == 0 {
		log.Info("No pending migrations.")
		return nil
	}

	for _, file := range pending {
		path := filepath.Join(dir, file)
		sql, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", path, err)
		}

		if strings.HasPrefix(string(sql), manualMarker) {
			return &ErrManualMigration{Path: path}
		}

		if dryRun {
			log.Info("[dry-run] would apply migration", "migration", file, "bytes", len(sql))
			continue
		}

		if err := applyMigration(ctx, pool, file, string(sql)); err != nil {
			return err
		}
		log.Info("Applied migration", "migration", file)
	}

	if dryRun {
		log.Info("[dry-run] pending migrations left unapplied", "count", len(pending))
		return nil
	}

	log.Info("Applied migrations", "count", len(pending))
	return nil
}

func appliedMigrations(ctx context.Context, pool *pgxpool.Pool) (map[string]struct{}, error) {
	applied := make(map[string]struct{})

	rows, err := pool.Query(ctx, "SELECT name FROM public.migrations")
	if err != nil {
		return nil, fmt.Errorf("read applied migrations: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("read applied migrations: %w", err)
		}
		applied[name] = struct{}{}
	}
	return applied, rows.Err()
}

func applyMigration(ctx context.Context, pool *pgxpool.Pool, name, sql string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", name, err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op once committed

	if _, err := tx.Exec(ctx, sql); err != nil {
		return fmt.Errorf("migration %s failed: %w", name, err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO public.migrations (name) VALUES ($1)", name); err != nil {
		return fmt.Errorf("record migration %s: %w", name, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", name, err)
	}
	return nil
}
