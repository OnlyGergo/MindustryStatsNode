# Mindustry Tracker

This is a mindustry tracker for tracking Mindustry servers.
It uses Bun as runtime, does not make use of native executables (due to pg not including properly), and uses TimescaleDB for database.
It uses Go for efficient querying of servers, and writes to database.

`common` is for types and utilities shared between the backend and frontend.
`backend` Bun Elysia server that exposes the SSR frontend and API this handles all reads..
`frontend` is for the frontend web application that displays the tracked data.
`collector` is for the collector service that collects server data - this handles all writes (including DB migrations).

## Workspace + running it
`backend`, `frontend` and `common` are Bun workspaces under the root `package.json`, with one `bun.lock` and one hoisted `node_modules` at the root (`bunfig.toml` sets `linker = "hoisted"`, so the backend and frontend share one copy of elysia/tanstack/react). Install from the root only: `bun install`.
- `bun run dev` (root) - Vite dev server on :4000 plus the backend on :3000 with `bun --watch`. Open **:3000**: the backend proxies every non-API request to Vite (`FRONTEND_DEV_URL`, see `viteDevProxy` in `WebServer.ts`), so pages are SSR'd from source with unminified modules and source maps, while cookies/`SITE_ORIGIN`/OAuth stay on the same origin as production. HMR's websocket connects to :4000 directly.
- `bun run build` (root) - builds the frontend into `frontend/dist`; the backend serves that directly (override with `FRONTEND_DIST`). There is no copying into `backend/public` any more.
- `bun run start` / `bun run test` / `bun run typecheck` (root).
- `build.sh` - release zip with the same layout (root manifest + lockfile, `backend/`, `common/`, `frontend/package.json` + `frontend/dist`); deploy with `bun install --production --frozen-lockfile` then `bun run start`.

## Notable Files / Folders
All connections to read database: `backend/src/repositories/*`
All connections to write database: `collector/internal/repository/*`
All connections to write user-content DB: `backend/src/repositories/user/*`
Canonical-identity SQL fragments (used by every read that touches a server): `backend/src/repositories/canonicalIdentity.ts`
Bucket-width/tier maths shared by the chart queries: `backend/src/repositories/aggregateTiers.ts`
Reviews: write path `backend/src/repositories/user/reviewRepository.ts`, public reads `backend/src/repositories/reviewReadRepository.ts`, routes `backend/src/api/routes/reviews.ts`, shared contracts `common/models/reviews.ts` + aspect list `common/models/ratings.ts`

## Libraries
### Backend
For database, use Sequelize with PostgreSQL.
Raw SQL uses named `replacements`. Two gotchas: an array replacement expands to a bare comma list, so write `IN (:ids)`, not `= ANY(:ids)`; and cast with `CAST(:x AS bigint)`, not `:x::bigint`.
Bun is used, so Elysia is being used as webserver.

The HTTP layer lives in `backend/src/api` instead, and is not a service:
- `WebServer.ts` - transport: rate limit tiers, CORS, static assets, the API, and the TanStack SSR catch-all. `startWebServer()` / `stopWebServer()`.
- `app.ts` - the Elysia app itself (routes + error handling). Exports `api` and `type Api`; the frontend consumes that type via Eden Treaty in `frontend/src/util/api.ts`, so it must stay a chained expression rather than a class.
- `routes/*.ts` - one chained Elysia instance per group.
- `middleware/cache.ts`, `middleware/rateLimit.ts` - spread into a route's hook options (`...withCache({...})`). Do NOT pass them as `use: [...]`, Elysia 1.4 silently ignores beforeHandle/afterHandle supplied that way.

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

## User accounts (Discord login)

The backend has a second Postgres connection, `backend/src/config/userDatabase.ts`, separate from `database.ts`. It authenticates as a role in `app_user_rw` (login user `app_writer`, created once by hand so its password stays out of git — see the header of `collector/migrations/32_users_sessions.sql`) and is the only backend code path allowed to write anywhere. The split mirrors the read/write split above: **the backend writes user-content tables only** (`users`, `user_sessions`, and everything F2+ adds under `repositories/user/*`); **the collector owns every other table and all migrations**, same as always. `app_user_rw` gets SELECT on `servers`/`server_canonical`/`server_groups` for lookups, plus write access only on the tables a migration explicitly grants it. There is no `ALTER DEFAULT PRIVILEGES` — that would silently hand it write access to future collector tables — so every migration that adds a user-content table must carry its own explicit `GRANT`.

Sessions are an opaque 32-byte token, base64url-encoded, held only by the browser in an HttpOnly, SameSite=Lax cookie (`sid`, see `sessionCookieOptions` in `api/auth/plugin.ts`). The DB stores a sha256 hex digest of it, never the raw token. Expiry slides forward 30 days on use, written only when the session has been idle 5+ minutes so browsing doesn't cost a write per request. Every mutation additionally requires `Origin === SITE_ORIGIN` (CSRF defence; a missing Origin fails), enforced by `originGuard.ts` / the `requireOrigin` macro.

Route guards are Elysia 1.4 macros — `optionalUser`, `requireUser`, `requireAdmin`, `requireOrigin` in `api/auth/plugin.ts` — opted into per route via hook options (`{ requireUser: true, ... }`), **never** via `use: [...]`. A global `.derive` was deliberately avoided: it would run a session DB lookup on every static asset and SSR request carrying the cookie, where a macro only pays that cost for routes that ask for it.

Anything a user does that is tied to a server (reviews, ownership, customisation, …) stores the **raw `servers.id` the user saw**, exactly like the stats tables — never the canonical/root id, since a merge would leave a stored root stale. Reads resolve it through `server_canonical` at query time, using the same helpers in `canonicalIdentity.ts`.

## Ratings + reviews

One review per user per server **family**, stored in `server_reviews` against the raw `server_id` the user was looking at. A merge can legitimately leave a user with a row on each alias, so there is no uniqueness constraint; instead "the user's review" is always their **newest** row in the family, on every path:
- **Reads** (`reviewReadRepository.ts`, and the rating CTEs in `getAllServerElements`) use `DISTINCT ON (user_id) … ORDER BY user_id, updated_at DESC, id DESC` over the family, **then** drop `removed_at IS NOT NULL`. That order matters: filtering first would let an older alias review resurface one a moderator removed.
- **Writes** (`upsertReview`) take `pg_advisory_xact_lock(user_id)` (`FOR UPDATE` can't lock a row that doesn't exist yet), refuse with 403 if the newest row is removed, otherwise update it (repointing `server_id` to the current id) and delete the user's other non-removed rows in the family. PUT is a full replace.
- **Anonymity is enforced in SQL**: public queries `CASE … THEN NULL` every identifying column of an anonymous review and never select `user_id`. Only admin endpoints (F7) may return the author.
- Public list/summary use `withCache({ name: 'reviews' })`; every review write, and account deletion (its FK cascade removes reviews), calls `clearCaches('reviews')`. `/mine` is per-user and never cached.
- Ranking: the server list carries `rating` (raw mean, for display), `ratingCount`, and `ratingScore` (Bayesian `(C·m + Σ)/(C + n)`, C = 5, m = site-wide mean, sort only) — see `reviewScoring.ts`.
- Aspect ratings (F9) are fixed nullable columns (`rating_maps`, …). Their SQL, validation and UI are all derived from `REVIEW_ASPECTS` in `common/models/ratings.ts`, so a new aspect is a migration plus one line there — never hand-list the aspect columns.
- Review bodies are plain text (≤ 2000 chars, normalised by `reviewBody.ts`), rendered with React escaping and `whitespace-pre-line`; never `dangerouslySetInnerHTML`. `common/profanity.ts` is a stub until F7.

## Notable Design Decisions

The app is a monorepo, for simplicity.
The app does not use any dedicated caching layer, so it happens within the app itself.
The goal is efficiency, but not when it takes crazy amount of work. Also somewhat skills development for me, hence the effectively pointless migration from Java to Python to NodeJS, a rewrite (start of this repo), then to Bun then now Go.

The backend often passes data through ApiPacker, which takes arrays of objects and packs them into a 2D array representing it. Nested objects are not flattened. Source is at `common/Packer.ts` which includes both packer and unpacker.

# FYI

`schema.sql` is currently empty, so `collector/migrations` is the only description of the schema until it is regenerated. Otherwise, do not attempt to read `collector/migrations` or especially `backend/migrations_legacy` (legacy means run manually, DB is out of sync with these). Latest schema is included in `schema.sql` at the root of the project. If you want to make changes, do it in `collector/migrations`. You can add "--no-tran" on first line for migrations if they need manual running (like certain CALL statements relating to TimescaleDB).

Use EU Commit message format, like `feat: add ` or `fix: ` or `refactor: `