# Mindustry Tracker

This is a mindustry tracker for tracking Mindustry servers.
It uses Bun as runtime, does not make use of native executables (due to pg not including properly), and uses TimescaleDB for database.
It uses Go for efficient querying of servers, and writes to database.

`common` is for types and utilities shared between the backend and frontend.
`backend` Bun Elysia server that exposes the SSR frontend and API this handles all reads..
`frontend` is for the frontend web application that displays the tracked data.
`collector` is for the collector service that collects server data - this handles all writes (including DB migrations).

## Notable Files / Folders
All connections to read database: `backend/src/repositories/*`
All connections to write database: `collector/internal/repository/*`

## Libraries
### Backend
For database, use Sequelize with PostgreSQL.
Bun is used, so Elysia is being used as webserver.

The HTTP layer lives in `backend/src/api` instead, and is not a service:
- `WebServer.ts` - transport: rate limit tiers, CORS, static assets, the API, and the TanStack SSR catch-all. `startWebServer()` / `stopWebServer()`.
- `app.ts` - the Elysia app itself (routes + error handling). Exports `api` and `type Api`; the frontend consumes that type via Eden Treaty in `frontend/src/util/api.ts`, so it must stay a chained expression rather than a class.
- `routes/*.ts` - one chained Elysia instance per group.
- `middleware/cache.ts`, `middleware/rateLimit.ts` - spread into a route's hook options (`...withCache({...})`). Do NOT pass them as `use: [...]`, Elysia 1.4 silently ignores beforeHandle/afterHandle supplied that way.

The live server snapshot shared between the processor and the API is `backend/src/state/serversList.ts`.

The server related services, pass data between eachother:
ServerCollectorService does collections daily, but every few minutes it requeues all servers, ServerDiscoveryService pings them, and places responses into a queue for ServerProcessorService to process and insert into database in efficient batches.

## Frontend
Tanstack Start Router is used for routing and SSR.
To get data hooks are used. A typed Eden Treaty client is available at `frontend/src/util/api.ts`; the existing hooks still hand-fetch against `common/models` types and can be migrated onto it incrementally.
uPlot is used for graphs, Chart.js too, but moving away from it. For tooltips use `frontend/src/util/chartTooltip.ts` and a useful helper is at `frontend/src/util/chartHelpers.ts`.

## Server Identity

`servers` is an *observation stream* table, not a list of servers. A server that changes address (a new IP, a
re-pointed DNS name) gains a second row; `UNIQUE (host, port)` only holds among live streams
(`WHERE retired_at IS NULL`), so a retired stream keeps its address and its history stays attributable.

Streams are stitched into an **identity** by `server_canonical` (union-find, depth always 1, every server has a row —
an unmerged one points at itself). Merging never rewrites a `server_stats` row, which is the whole point: rewriting
`server_id` on history would invalidate every continuous aggregate, and chunks already dropped by a retention policy
could not be rewritten at all. A merge is one UPDATE, and it is reversible.

**Merges are manual** — there is deliberately no UI or automatic detection. The SQL for merge, unmerge and the
follow-up retire/annotate is written out in the comments of `collector/migrations/29_server_identity.sql`. Two
deferred constraint triggers keep the structure honest: you cannot merge onto an alias, and you cannot demote a root
that still has aliases.

Reading rules, in order — getting them the wrong way round is the easy mistake:
- Peak per raw `server_id` first (the existing per-server dedup), *then* collapse via `server_canonical` with
  `MAX` — **never SUM across aliases**: the two streams of a migrating server overlap while the old address still
  answers, and summing there invents players. Only after that do you sum across *different* servers.
- Anything counting servers uses `COUNT(DISTINCT canonical_id)`.
- Joins to `servers` / `server_groups` for display metadata happen on the canonical id, at the end, over the reduced
  row set.

The `server_identity` view resolves the two halves of an identity so no query has to re-derive them: `id`,
`display_ref` and `first_seen` come from the canonical **root** (which owns the identity), while `host`, `port`,
`country_code`, `server_group_id` and `role` come from the **current** live stream — after a migration the root holds
the address the server has already left. `server_family(canonical_id)` returns the stream ids behind one identity.

`role` (`game` | `hub` | `test` | `unknown`) keeps hubs and test servers in the same table without polluting default
listings or aggregate stats — a hub mirrors other servers' player counts, so counting it double counts players. It is
filtered cheaply: the partial index only covers the exceptions. Non-`game` servers are still polled.

`display_ref` is a public sequential id, numbered in first-seen order. Nothing routes on it; the API takes and returns
canonical `servers.id` everywhere.

`server_events` is the chart annotation stream — `ends_at IS NULL` is a point event (version bump, address change)
drawn as a dashed line, a set `ends_at` is a span (a poor-DNS era, an outage) drawn as a band, and a NULL `server_id`
is a global event. Colour stays reserved for series identity; annotations are bands and lines.

## Notable Design Decisions

The app is a monorepo, for simplicity.
The app does not use any dedicated caching layer, so it happens within the app itself.
The goal is efficiency, but not when it takes crazy amount of work. Also somewhat skills development for me, hence the effectively pointless migration from Java to Python to NodeJS, a rewrite (start of this repo), then to Bun then now Go.

The backend often passes data through ApiPacker, which takes arrays of objects and packs them into a 2D array representing it. Nested objects are not flattened. Source is at `common/Packer.ts` which includes both packer and unpacker.

# FYI

Do not attempt to read `collector/migrations` or especially `backend/migrations_legacy` (legacy means run manually, DB is out of sync with these). Latest schema is included in `schema.sql` at the root of the project. If you want to make changes, do it in `collector/migrations`. You can add "--no-tran" on first line for migrations if they need manual running (like certain CALL statements relating to TimescaleDB).