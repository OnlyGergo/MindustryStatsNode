// Package repository is the write path against Postgres/TimescaleDB.
//
// The SQL is a straight port of backend/src/repositories/*.ts: same statements,
// same jsonb_to_recordset shapes, issued through pgx instead of Sequelize's raw
// query wrapper.  Nothing here "improves" a query -- parity with the TS writer
// is what makes the cutover safe to reason about.
package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
)

// querier is satisfied by both the pool and a transaction, so a statement can
// be written once and run either way.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Repository holds the pool and the dry-run switch.  It is safe for concurrent
// use.
type Repository struct {
	pool   *pgxpool.Pool
	dryRun bool
	log    *slog.Logger

	gamemodes gamemodeCache
}

func New(pool *pgxpool.Pool, dryRun bool) *Repository {
	return &Repository{
		pool:      pool,
		dryRun:    dryRun,
		log:       logging.New("Repository"),
		gamemodes: newGamemodeCache(),
	}
}

// DryRun reports whether writes are being logged instead of executed.
func (r *Repository) DryRun() bool { return r.dryRun }

// exec runs a statement that changes data.  Under DRY_RUN it logs what would
// have been written and reports zero rows affected, which is migration step 8's
// "everything except the final write".
func (r *Repository) exec(ctx context.Context, q querier, op, sql string, args ...any) (pgconn.CommandTag, error) {
	if r.dryRun {
		r.log.Info("[dry-run] skipping write", "operation", op, "sql", condense(sql), "args", describeArgs(args))
		return pgconn.CommandTag{}, nil
	}
	tag, err := q.Exec(ctx, sql, args...)
	if err != nil {
		return tag, &OperationError{Operation: op, Err: err}
	}
	return tag, nil
}

// inTx runs fn inside a transaction, rolling back on error.
//
// Under DRY_RUN no transaction is opened: every write inside is skipped anyway,
// and an open transaction that only reads would just hold a snapshot for no
// reason.
func (r *Repository) inTx(ctx context.Context, op string, fn func(q querier) error) error {
	if r.dryRun {
		return fn(r.pool)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return &OperationError{Operation: op, Err: fmt.Errorf("begin transaction: %w", err)}
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op once committed

	if err := fn(tx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return &OperationError{Operation: op, Err: fmt.Errorf("commit transaction: %w", err)}
	}
	return nil
}

// OperationError names the write that failed, the way withDbContext tagged the
// TS errors -- so a log line says which write of how many rows broke.
type OperationError struct {
	Operation string
	Err       error
}

func (e *OperationError) Error() string { return e.Operation + " failed: " + e.Err.Error() }
func (e *OperationError) Unwrap() error { return e.Err }

// toJSON renders the payload for a jsonb_to_recordset parameter.
func toJSON(v any) (string, error) {
	// Postgres never sees these strings as HTML, and the default escaping only
	// makes a logged payload harder to read.
	var sb strings.Builder
	enc := json.NewEncoder(&sb)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", fmt.Errorf("encode rows as json: %w", err)
	}
	return strings.TrimRight(sb.String(), "\n"), nil
}

const maxSQLLength = 300

// condense collapses a statement onto one line, as errors.ts's condenseSql did.
func condense(sql string) string {
	flat := strings.Join(strings.Fields(sql), " ")
	if len(flat) > maxSQLLength {
		return flat[:maxSQLLength] + "..."
	}
	return flat
}

const maxArgLength = 500

// describeArgs keeps a dry-run log line readable when the payload is a JSON
// document holding thousands of rows.
func describeArgs(args []any) string {
	rendered := make([]string, 0, len(args))
	for _, arg := range args {
		s := fmt.Sprint(arg)
		if len(s) > maxArgLength {
			s = fmt.Sprintf("%s... (%d bytes)", s[:maxArgLength], len(s))
		}
		rendered = append(rendered, s)
	}
	return strings.Join(rendered, ", ")
}

// normalize maps a value to its registry-key form: null and empty string are
// the same thing, everything else is its string rendering.  Port of the
// `normalize` helper in serverRepository.ts.
func normalize(val any) string {
	switch v := val.(type) {
	case nil:
		return ""
	case string:
		return v
	case *string:
		if v == nil {
			return ""
		}
		return *v
	case []byte:
		return string(v)
	default:
		return fmt.Sprint(v)
	}
}

// registryKey builds a registry row's natural key.
//
// NUL is the separator because it cannot occur in a Mindustry server name,
// description or map name (poller strings are sanitised).  A printable
// separator ('|' in particular, a staple of server names) would let two
// different column tuples collapse onto one key, and every entry sharing a key
// is handed the same registry ID -- i.e. one server silently inherits
// another's MOTD.
func registryKey(row map[string]any, columns []string) string {
	parts := make([]string, len(columns))
	for i, col := range columns {
		parts[i] = normalize(row[col])
	}
	return strings.Join(parts, "\x00")
}

// describeRegistryKey is the human-readable form of a registry key, for logs.
func describeRegistryKey(row map[string]any, columns []string) string {
	if row == nil {
		return "<unknown>"
	}
	parts := make([]string, 0, len(columns))
	for _, col := range columns {
		parts = append(parts, fmt.Sprintf("%s=%q", col, normalize(row[col])))
	}
	return strings.Join(parts, ", ")
}
