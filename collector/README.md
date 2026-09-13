# collector

The Go write path for Mindustry Tracker. It owns discovery, polling, geoip and
every database write, plus the SQL migrations. The TypeScript backend keeps the
API and SSR reads; both processes talk to the same Postgres/TimescaleDB and the
schema is unchanged.

```
discovery loop (24h)  ─┐
collection loop (5min) ├─► Postgres  ◄── TS backend (reads only)
processor / batch writer ┘
```

## Build and run

```bash
go build -o collector ./cmd/collector
./collector
```

Run it from the repository root (or set `MIGRATIONS_DIR`) so it finds
`backend/migrations`, and give it the same `.env` the backend uses — `.env`,
`backend/.env` and `../backend/.env` are all read, and `ENV_FILE` overrides
that search.

## Configuration

Same variable names the TypeScript services read, so a deployment keeps its
existing `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `5432` / `mindustry_stats` / `postgres` / — | Database connection; `DATABASE_URL` overrides all five |
| `DB_POOL_MAX` / `DB_POOL_MIN` | `20` / `5` | Pool sizing, matching the Sequelize pool |
| `SERVER_LIST_INTERVAL_MS` | `86400000` | Discovery cycle |
| `DATA_COLLECTION_INTERVAL_MS` | `300000` | How often the whole server list is re-queued |
| `SERVER_COLLECTION_INTERVAL_MS` | `1000` | Rate-limit window (p-queue's `interval`) |
| `COLLECTION_CONCURRENCY` | `max(4, cores × 1.5)` | Workers; at most `2 ×` this many queries start per window |
| `MINDUSTRY_TIMEOUT_MS` | `1000` | UDP response deadline |
| `QUEUE_POLL_TIMEOUT_MS` | `10000` | How often the result queue is drained and written |
| `RAW_QUEUE_CAPACITY` | `100000` | Bound on the queue between pollers and writer |
| `MIGRATIONS_DIR` | first of `backend/migrations`, `../backend/migrations`, `migrations` | SQL migrations |
| `GEOIP_MMDB_PATH` | `./geoip/country.mmdb` | Country database, refreshed out of band; re-opened at the end of every discovery cycle |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DRY_RUN` | `false` | See below |

A migration whose first line is `--no-tran` has to be run by hand: the
collector reports it and exits without starting, exactly as `database.ts` did.

A missing mmdb is not fatal — lookups return no country code until a readable
file appears.

## Dry run

`DRY_RUN=true` runs every loop and every read but executes no statement that
changes data, logging what it would have written instead. This is the
validation pass to run before the cutover: let it complete a discovery cycle
and several collection cycles, and diff its intent against what the TS writer
is doing live. It touches no production data.

Two things read differently under a dry run, both expected: registry rows for
genuinely new MOTDs/maps cannot be read back (the insert never ran), so those
history updates are skipped, and `refreshServerSourceList` resolves nothing
against an empty `servers` table.

## Tests

```bash
go test ./...
```

The repository package also carries integration tests that run the real SQL.
They skip unless `COLLECTOR_TEST_DSN` points at a database loaded with
`schema.sql` (TimescaleDB not required):

```bash
COLLECTOR_TEST_DSN=postgres://postgres@127.0.0.1:5432/mindustry_test go test ./internal/repository/
```