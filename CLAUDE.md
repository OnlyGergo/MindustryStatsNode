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
All-time peaks: `server_peaks` (one row per raw server, only ever goes up), written by `upsertServerPeaks` in `collector/internal/repository/servers.go` alongside `server_current`; `get_server_details` (latest in `collector/migrations/43_server_details_slim.sql`) reads it and only scans the last 7 days of `server_stats_1h` for daily/weekly peaks + uptime. It returns no map/MOTD history: the detail tables fetch `/map-history` and `/motd-history` after hydration. Family reads of `server_*_history` go through a LATERAL per member on `(server_id, valid_from DESC)`, never `server_id IN (family) ORDER BY valid_from`
Ownership (F3): admin-only writes `backend/src/repositories/user/ownerRepository.ts`, reads + `canManageServer` `backend/src/repositories/ownershipRepository.ts`, routes `backend/src/api/routes/admin.ts`, UI `/admin/owners`
Customisation (F4): owner routes `backend/src/api/routes/owner.ts`, image serving `backend/src/api/routes/uploads.ts`, sniffing/stripping `backend/src/api/lib/imageValidation.ts`, writes `backend/src/repositories/user/{customisationRepository,imageRepository,uploadStorage}.ts`, reads `backend/src/repositories/customisationReadRepository.ts`, contracts `common/models/customisation.ts`, UI `components/detail/CustomisePanel.tsx` + `/admin/images`
Reviews: write path `backend/src/repositories/user/reviewRepository.ts` (owner replies: `reviewReplyRepository.ts`), public reads `backend/src/repositories/reviewReadRepository.ts`, routes `backend/src/api/routes/reviews.ts`, shared contracts `common/models/reviews.ts` + aspect list `common/models/ratings.ts`

## Libraries
### Backend
For database, use Sequelize with PostgreSQL.
Raw SQL uses named `replacements`. Two gotchas: an array replacement expands to a bare comma list, so write `IN (:ids)`, not `= ANY(:ids)`; and cast with `CAST(:x AS bigint)`, not `:x::bigint`.
Bun is used, so Elysia is being used as webserver.

The HTTP layer lives in `backend/src/api` instead, and is not a service:
- `WebServer.ts` - transport: rate limit tiers, CORS, static assets, the API, and the TanStack SSR catch-all. `startWebServer()` / `stopWebServer()`.
- `app.ts` - the Elysia app itself (routes + error handling). Exports `api` and `type Api`; the frontend consumes that type via Eden Treaty in `frontend/src/util/api.ts`, so it must stay a chained expression rather than a class.
- `routes/*.ts` - one chained Elysia instance per group.
- Client IPs come from `api/lib/clientIp.ts`: X-Forwarded-For is only believed from `TRUSTED_PROXY_IPS` (default loopback; `TRUSTED_PROXY_EXTRA_HOPS=1` for Caddy behind Cloudflare). Only a loopback request *without* X-Forwarded-For (SSR self-fetches) skips rate limiting; anything reaching the app around the proxy is logged as a warning.
- Chart routes must take `startDate`/`endDate` from `resolveRange()`'s return value, never straight from the query: it validates and clamps the window (max 400 days) so the bucket width and window always agree.
- CORS allows `SITE_ORIGIN` only (with credentials); there is no `CORS_ORIGIN` setting, since the frontend is same-origin.
- `middleware/cache.ts`: a hit never extends an entry's TTL (Elysia runs `afterHandle` after a `beforeHandle` short-circuit too, so the hook must skip it), concurrent misses on one key share one handler run, and per-caller headers (`x-ratelimit-*`, `access-control-*`, `vary`) are never stored. `staleWhileRevalidate: { staleMs, refresh }` serves an expired entry instantly and refreshes it in the background (used on `/api/servers`, which every SSR page waits on, and `/servers/:id/details`); pass the route's own handler as `refresh`.
- `middleware/cache.ts`, `middleware/rateLimit.ts` - spread into a route's hook options (`...withCache({...})`). Do NOT pass them as `use: [...]`, Elysia 1.4 silently ignores beforeHandle/afterHandle supplied that way.

The server related services, pass data between eachother:
ServerCollectorService does collections daily, but every few minutes it requeues all servers, ServerDiscoveryService pings them, and places responses into a queue for ServerProcessorService to process and insert into database in efficient batches.

## Frontend
Tanstack Start Router is used for routing and SSR.
To get data hooks are used. A typed Eden Treaty client is available at `frontend/src/util/api.ts`; the existing hooks still hand-fetch against `common/models` types and can be migrated onto it incrementally.
uPlot is the only chart library (Chart.js is gone). Every chart goes through `frontend/src/hooks/useUPlot.ts`: it builds one instance per `shape` key and hands new data/visibility over with `setData`/`setSeries` instead of rebuilding, and owns resize, the tooltip (`util/chartTooltip.ts`) and touch handling; render it in `components/UPlotFrame.tsx`. Axes, range options and series/share maths live in `util/chartHelpers.ts`. Chart data is fetched through `hooks/useChartData.ts` (per-URL in-memory cache with the server's 5 min TTL, shared in-flight requests, stale responses dropped, previous data kept while a new range loads); put per-response transforms in its `parse` so they run once per fetch.

## Server Identity (canonical IDs)

`servers` is an observation stream, not an identity. A server that changes host or port gets a **new** row; the old one is retired (`retired_at` set) and keeps its stats forever. `(host, port)` is unique only among live rows, so an address can be reused.

Which rows are the same server lives in `server_canonical`, a union-find table where every server has exactly one row and a root points at itself. A merge repoints the **whole** losing family onto the target's root in one UPDATE, so depth never exceeds 1 and a single equijoin resolves any member — no recursive CTE, anywhere. Root convention is the oldest `created_at` (there is no `first_seen` column), which is stable across migrations. Merging and unmerging happen on `/admin/merges` (`frontend/src/components/admin/MergesAdmin.tsx`, routes at the bottom of `backend/src/api/routes/admin.ts`). The backend never writes `server_canonical` directly: it calls the SECURITY DEFINER functions `merge_server_families(source, target)` / `unmerge_server(id)` from `collector/migrations/40_admin_server_merge.sql` (the statements from the header of `30_server_identity.sql`, older root always survives), which is all `app_user_rw` may do to the identity layer. Suggestions (same colour-stripped name, or same host never online together) are read-side in `backend/src/repositories/adminMergeRepository.ts`; rejected pairs go in `server_merge_dismissals`. Every merge/unmerge calls `clearCaches()` (all stores).

Rules every read has to follow:
- **Public IDs are canonical IDs.** This was a breaking change; nothing keeps the old raw-ID contract.
- **Stats stay keyed on the raw `server_id`.** Collapsing happens at read time, which is the whole point: a merge never invalidates a continuous aggregate, so retention policies are irrelevant to merge correctness.
- **Collapse aliases with MAX, never SUM.** Both addresses answer for a while either side of an IP change, and summing reports one server's players twice.
- **Family-level properties (`server_group_id`, `aggregate_exclude`) come from the root row**; the address shown to a visitor comes from the family's live member, since the root is the oldest row and therefore the stalest address.
- **Anything counting servers uses `COUNT(DISTINCT canonical_id)`.**

Chart queries are all the same three-step shape: peak per (instant, canonical server) → sum across servers per instant → pick the busiest instant in each coarse bucket, then gapfill. Summing per-server bucket maxima instead would add up peaks that never coexisted.

`server_events` is the annotation stream that drives chart overlays — spans (`ends_at` set: a data-quality era, a global outage) and point events (`ends_at` NULL: version bump, IP change), `server_id` NULL meaning global. Rows are inserted manually and keyed on the raw `server_id` like every other table; merge/unmerge never touch it, so the (not yet written) reader must resolve events through `server_canonical` and show a family's events together. There is no reader or uPlot rendering yet.

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
- Owner replies (F5): one per review in `review_replies` (PK `review_id`), written by `repositories/user/reviewReplyRepository.ts` via `PUT`/`DELETE /api/servers/:id/reviews/:reviewId/reply`. The route checks `canManageServer`; the SQL also scopes the review to the URL's family, so owning server A never lets you reply on server B. Replies are never anonymous and are returned inside the cached public list, so writes `clearCaches('reviews')`.
- Review bodies are plain text (≤ 2000 chars, normalised by `reviewBody.ts`), rendered with React escaping and `whitespace-pre-line`; never `dangerouslySetInnerHTML`. Every user-written public text (review bodies, owner replies, and F6's announcements) is checked with `containsProfanity` from `common/profanity.ts` and refused with a 422. It matches whole words/phrases only, over the vendored LDNOOBW list in `common/profanity/en.ts` (CC-BY-4.0, don't edit it; exceptions go in `ALLOWED`). The forms run the same check to warn before submitting.

## Moderation (F7)
- Reports: `review_reports`, one per (review, reporter), filed via `POST /api/servers/:id/reviews/:reviewId/report` (`repositories/user/reportRepository.ts`).
- Queue and actions: the `/reports` and `/reviews/:id…` routes in `api/routes/admin.ts`, over `repositories/user/moderationRepository.ts`. That repository is the only place an anonymous review's author is selected.
- Remove is a soft delete (`removed_at`/`removed_reason`/`removed_by`, on reviews and on replies); restore clears it. Remove/edit mark a review's open reports `actioned`; dismiss marks them `dismissed`. Every action that changes a public row calls `clearCaches('reviews')`.
- An admin edit never bumps `updated_at`, because that column decides which alias row is the user's review.
- `DISCORD_REPORTS_WEBHOOK_URL` must point at a moderators-only channel: report notifications name the author even of an anonymous review.
- UI: the `Reports` tab (`routes/admin/reports.tsx` → `components/admin/ReportsAdmin.tsx`), plus Report/Remove actions on review cards (`components/detail/ReviewActions.tsx`).

## Ownership + admin panel

`owners` rows grant one user either a whole network (`server_group_id`) or one server family (`server_id`, the raw id the admin entered); a CHECK enforces exactly one, and several users may co-own a target. Owners are assigned **only by admins** at `/admin/owners` (`/api/admin/owners`); there is deliberately no self-service claim flow. `canManageServer(user, rawServerId)` is the one check later features use: admin, OR owns the family root's `server_group_id`, OR owns any member of the family, so both survive merges. `/api/auth/me` reports `owns` as network ids + public canonical server ids. Every `/api/admin/*` route is `requireAdmin` (writes also `requireOrigin`) and never cached; new admin sections are a child route under `frontend/src/routes/admin/` plus one entry in `ADMIN_TABS` in `admin.tsx`.

## Customisation + uploads
A network or server family can set an accent colour and a background image (`customisations`, one row per target, raw `server_id` like every user-content table). The public read merges **field by field**: the family's newest server row, then the family ROOT's network row; the network page shows the network row alone. Saving is a full replace (both fields null deletes the row so the network shows through) and collapses the family to one row under `pg_advisory_xact_lock(4001, canonical_id)`, same newest-row-wins idea as reviews.

Uploads (`uploaded_images`) are PNG/JPEG/WebP only, never SVG. The format is sniffed from magic bytes, dimensions read from the header, and EXIF/XMP/text plus anything after the end marker stripped, all in pure JS (no decoding, no native deps); only the stripped bytes are written to `UPLOAD_DIR/<uuid>.<ext>`, with a server-generated name. Limits come from env (`UPLOAD_MAX_BYTES`, `UPLOAD_MAX_WIDTH`, `UPLOAD_MAX_HEIGHT`; defaults 2 MiB, 3840x2160), and an uploader may hold 10 pending images. An image starts `pending`; `GET /uploads/:id` serves it publicly only once approved (immutable cache, `nosniff`, sandbox CSP) and looks the session up only for pending ones, which admins alone can see — everything else is a plain 404. A background may only be set to an approved image uploaded for the same target (same network, or same server family). Rejecting, including taking down an approved image, deletes the file and un-sets it everywhere. Public reads are `withCache({ name: 'customisation' })`; every customisation write and every approve/reject calls `clearCaches('customisation')`.

The frontend applies it as scoped CSS variables on the detail page wrapper (`util/customisation.ts`, which re-validates the colour and the `/uploads/<uuid>` URL before they reach a style attribute); `index.css` is never touched.

## Notable Design Decisions

The app is a monorepo, for simplicity.
The app does not use any dedicated caching layer, so it happens within the app itself.
The goal is efficiency, but not when it takes crazy amount of work. Also somewhat skills development for me, hence the effectively pointless migration from Java to Python to NodeJS, a rewrite (start of this repo), then to Bun then now Go.

The backend often passes data through ApiPacker, which takes arrays of objects and packs them into a 2D array representing it. Nested objects are not flattened. Source is at `common/Packer.ts` which includes both packer and unpacker.

# FYI

`schema.sql` is currently empty, so `collector/migrations` is the only description of the schema until it is regenerated. Otherwise, do not attempt to read `collector/migrations` or especially `backend/migrations_legacy` (legacy means run manually, DB is out of sync with these). Latest schema is included in `schema.sql` at the root of the project. If you want to make changes, do it in `collector/migrations`. You can add "--no-tran" on first line for migrations if they need manual running (like certain CALL statements relating to TimescaleDB).

Use EU Commit message format, like `feat: add ` or `fix: ` or `refactor: `

When setting up, you won't have timescaledb, but most things will work fine on just the postgres you have.
Ensure you are up to date with GitHub, pull, fetch and do anything reasonable to ensure you are closest as possible to latest, as someties the environment setup doesn't ensure this unfortunately, and it resuts in redoing work to merge...