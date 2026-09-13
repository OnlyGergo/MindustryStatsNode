// Package db owns the pgx pool and the startup checks initDatabase() performed
// on the TS side.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
)

// New builds the pool with the same sizing the Sequelize pool used.
func New(ctx context.Context, cfg config.DBConfig) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}

	poolCfg.MaxConns = cfg.MaxConns
	poolCfg.MinConns = cfg.MinConns
	poolCfg.MaxConnIdleTime = 10 * time.Second
	poolCfg.ConnConfig.ConnectTimeout = 30 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}
	return pool, nil
}

// Init authenticates, warns when TimescaleDB is missing and runs the pending
// migrations -- initDatabase() from backend/src/config/database.ts, which the
// collector now owns.
func Init(ctx context.Context, pool *pgxpool.Pool, cfg config.Config) error {
	log := logging.New("Database")

	// current_database() rather than the configured name: with DATABASE_URL set,
	// the two can disagree, and the log should say what was actually reached.
	var database string
	if err := pool.QueryRow(ctx, "SELECT current_database()").Scan(&database); err != nil {
		return fmt.Errorf("connect to database %q: %w", cfg.DB.Name, err)
	}
	log.Info("Connected to database successfully", "database", database)

	var hasTimescale bool
	err := pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')",
	).Scan(&hasTimescale)
	if err != nil {
		return fmt.Errorf("check for timescaledb extension: %w", err)
	}
	if !hasTimescale {
		log.Warn("TimescaleDB extension is not installed or enabled. Some features may not work correctly.")
	}

	return RunMigrations(ctx, pool, cfg.MigrationsDir, cfg.DryRun)
}
