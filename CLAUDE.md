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
Canonical-identity SQL fragments (used by every read that touches a server): `backend/src/repositories/canonicalIdentity.ts`
Bucket-width/tier maths shared by the chart queries: `backend/src/repositories/aggregateTiers.ts`

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

## Server Identity (canonical IDs)

`servers` is an observation stream, not an identity. A server that changes host or port gets a **new** row; the old one is retired (`retired_at` set) and keeps its stats forever. `(host, port)` is unique only among live rows, so an address can be reused.

Which rows are the same server lives in `server_canonical`, a union-find table where every server has exactly one row and a root points at itself. A merge repoints the **whole** losing family onto the target's root in one UPDATE, so depth never exceeds 1 and a single equijoin resolves any member — no recursive CTE, anywhere. Root convention is the oldest `created_at` (there is no `first_seen` column), which is stable across migrations. Merging and unmerging are **manual operator UPDATEs**; there is deliberately no mechanism or UI for them (see the header of `collector/migrations/30_server_identity.sql` for the exact statements).

Rules every read has to follow:
- **Public IDs are canonical IDs.** This was a breaking change; nothing keeps the old raw-ID contract.
- **Stats stay keyed on the raw `server_id`.** Collapsing happens at read time, which is the whole point: a merge never invalidates a continuous aggregate, so retention policies are irrelevant to merge correctness.
- **Collapse aliases with MAX, never SUM.** Both addresses answer for a while either side of an IP change, and summing reports one server's players twice.
- **Family-level properties (`server_group_id`, `aggregate_exclude`) come from the root row**; the address shown to a visitor comes from the family's live member, since the root is the oldest row and therefore the stalest address.
- **Anything counting servers uses `COUNT(DISTINCT canonical_id)`.**

Chart queries are all the same three-step shape: peak per (instant, canonical server) → sum across servers per instant → pick the busiest instant in each coarse bucket, then gapfill. Summing per-server bucket maxima instead would add up peaks that never coexisted.

`server_events` is the annotation stream that drives chart overlays — spans (`ends_at` set: a data-quality era, a global outage) and point events (`ends_at` NULL: version bump, IP change), `server_id` NULL meaning global. Rows are inserted manually; there is no reader or uPlot rendering yet.

## Notable Design Decisions

The app is a monorepo, for simplicity.
The app does not use any dedicated caching layer, so it happens within the app itself.
The goal is efficiency, but not when it takes crazy amount of work. Also somewhat skills development for me, hence the effectively pointless migration from Java to Python to NodeJS, a rewrite (start of this repo), then to Bun then now Go.

The backend often passes data through ApiPacker, which takes arrays of objects and packs them into a 2D array representing it. Nested objects are not flattened. Source is at `common/Packer.ts` which includes both packer and unpacker.

# FYI

`schema.sql` is currently empty, so `collector/migrations` is the only description of the schema until it is regenerated. Otherwise, do not attempt to read `collector/migrations` or especially `backend/migrations_legacy` (legacy means run manually, DB is out of sync with these). Latest schema is included in `schema.sql` at the root of the project. If you want to make changes, do it in `collector/migrations`. You can add "--no-tran" on first line for migrations if they need manual running (like certain CALL statements relating to TimescaleDB).