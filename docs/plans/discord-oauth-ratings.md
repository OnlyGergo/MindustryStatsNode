# Discord OAuth, Ratings, Ownership & Admin: Feature Plan

## Context
The tracker is read-only today. Every backend route is a GET, and there is no auth, session, cookie or user code anywhere. The goal is to add Discord login, with the minimum data needed to function, so we can build:
- 1–5 star ratings with an optional review
- per-server customisation by owners
- an admin panel for you

Owner replies, announcements, moderation, network rollups and aspect ratings come after that. Each feature below is its own branch/PR, in dependency order. **F0–F2 are the core.** F3 + F5 give you per-server customisation. The rest are extras.

Decisions already made: 1–5 stars. Owners own a network (all its servers) or a lone server. You assign ownership in the admin panel. Images go on a local disk volume.

### Architectural rules (apply to every feature)
1. **Backend writes only to user-content tables.** Migrations stay in `collector/migrations` (next is `32_`, run by `collector/internal/db/migrate.go`, each file in a transaction).
   - Backend gets a second connection, `backend/src/config/userDatabase.ts` (a copy of `database.ts`, using env `USERDB_USER`/`USERDB_PASSWORD`).
   - That connection logs in as a role in `app_user_rw`, which has:
     - SELECT on the tables it needs for lookups (`servers`, `server_canonical`, `server_groups`)
     - write access only on the new tables, with an **explicit GRANT in every migration**
   - **No `ALTER DEFAULT PRIVILEGES`.** It would also grant write access on future collector tables.
   - The login user is created once by hand, so the password stays out of git: `CREATE USER app_writer PASSWORD '…' IN ROLE app_user_rw`.
   - Migration 32 creates the NOLOGIN role in a `DO $$ … IF NOT EXISTS` block, because roles are cluster-global.
2. **Identity follows the stats rule.** Anything keyed to a server stores the **raw `servers.id` the user saw**, and reads resolve it through `server_canonical` (helpers in `backend/src/repositories/canonicalIdentity.ts`).
   - This covers reviews, per-server owners, customisations and announcements.
   - Never store "the root". A merge into an older family changes the root, and stored roots would go stale.
   - Network-level rows use `server_group_id`, read from the family root as usual.
3. **Sessions:** an opaque 32-byte token in a cookie.
   - Cookie `sid`: HttpOnly, SameSite=Lax, Secure except in dev.
   - The DB stores a sha256 of the token, expires after 30 days, and slides the expiry forward on use. No JWT.
   - Every mutation also requires `Origin === SITE_ORIGIN` (CSRF).
   - OAuth `state` and the PKCE verifier go in a short-lived signed cookie, using Elysia's built-in cookie `secrets` (no extra package).
4. **Auth plugin:** `backend/src/api/auth/plugin.ts`.
   - `.derive({as:'global'})` resolves `user | null`.
   - `.macro({ requireUser, requireAdmin })` handles route guards.
   - Mount it with `.use(authPlugin)` at the top of the `api` chain in `backend/src/api/app.ts`, which keeps `type Api` intact for Eden.
   - Routes opt in by putting `requireUser: true` in their hook options. **Never** pass guards via `use: [...]` (the Elysia 1.4 pitfall in CLAUDE.md).
   - `isAdmin` = Discord ID is in env `ADMIN_DISCORD_IDS`.
   - Admins pass every owner check, so you can edit every server.
5. **Caching:**
   - Anything that depends on the user never uses `withCache`.
   - Public lists (reviews, announcements, customisation) use `withCache({ name })` with a short TTL. Writes call the existing `clearCaches(name)` in `backend/src/api/middleware/cache.ts`.
   - SSR stays anonymous. The frontend gets the user from `/api/auth/me` on the client, via a new `AuthContext` modelled on `frontend/src/context/SidebarContext.tsx`.
6. **Rate limits:** add `auth` and `write` tiers in `WebServer.ts`, ahead of the generic `api` tier (first match wins).
7. **Anonymity:** public payloads for anonymous reviews contain no user id, Discord id, name or avatar. Only admin endpoints return the author.
8. **Frontend mutations** use the typed Eden client at `frontend/src/util/api.ts`, which is currently unused. Its first real use is here.

---

## F0: Foundations (core)
> **Done.** Deviation: guards are opt-in macros (`optionalUser`/`requireUser`/`requireAdmin`/`requireOrigin`) instead of a global `.derive`, so static/SSR requests never pay for a session lookup. `requireOrigin` runs in `transform`, which Elysia runs before every macro `resolve`, so a cross-origin mutation is refused before the session is touched. The sliding expiry re-issues the cookie too.

- **Migration `32_users_sessions.sql`:**
  - `users(id bigserial, discord_id varchar(32) unique, username, global_name, avatar_hash, created_at, updated_at)`
  - `user_sessions(token_hash char(64) pk, user_id fk cascade, expires_at, last_seen_at)` with indexes on user_id and expires_at
  - the role, plus its GRANTs
- **Config:** extend `backend/src/config/env.ts` (zod) with `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SITE_ORIGIN`, `COOKIE_SECRET`, `ADMIN_DISCORD_IDS`, `USERDB_USER`, `USERDB_PASSWORD` and `UPLOAD_DIR`. Also update `backend/.env.example`.
- **New files:**
  - `config/userDatabase.ts`
  - `repositories/user/sessionRepository.ts`: create, resolve with sliding expiry and lazy delete when expired, delete, deleteAllForUser
  - `repositories/user/userRepository.ts`: upsertFromDiscord, deleteUser
  - `api/auth/plugin.ts`
  - `api/auth/originGuard.ts`
- **CLAUDE.md:** document the second connection and role, the "backend writes user content only" split, the session model, and the raw-id rule for user tables. Also remove the stale `backend/src/state/serversList.ts` reference; that file does not exist.
- **Verify:**
  - Run the migration on a dev DB. Confirm `app_writer` can't `INSERT INTO servers`.
  - Insert a session row by hand and hit a stub route: 401 with no cookie, 403 with a bad Origin.

## F1: Discord OAuth (core)
> **Done.** The `oauth` state cookie (state + PKCE verifier + sanitised `next`, path `/api/auth`) is signed with Elysia's `signCookie`/`unsignCookie` by hand: the automatic `sign` option throws before the handler, which would skip clearing the cookie on a tampered value. Logging in over an existing session deletes the old one. `/me` answers an empty body when logged out (Elysia's `null`), which Eden hands back as falsy `data`.

- **Dependency:** `arctic` (pure JS; does the Discord PKCE/state/token exchange). Scope `identify` only.
- **`backend/src/api/routes/auth.ts`** (prefix `/api/auth`), with `.use(authRoutes)` added in `app.ts`:
  - `GET /discord`: sets the signed state/verifier cookie (5 min), then redirects (302) to Discord. Takes an optional `?next=`, which is only allowed as a same-origin path.
  - `GET /discord/callback`: checks state, exchanges the code, calls `GET https://discord.com/api/users/@me`, upserts the user, creates the session, sets the cookie and redirects. If Discord returns `?error=`, redirect home.
  - `POST /logout` (requireUser + origin): deletes the session and clears the cookie.
  - `GET /me`: returns `{id, discordId, username, globalName, avatarUrl, isAdmin, owns: {networks[], servers[]}}` or `null`. Not cached.
  - `DELETE /me` (requireUser + origin): deletes the account and cascades. This covers UK GDPR erasure; reviews are deleted along with it.
- **Profile link** is derived, never stored: `https://discord.com/users/{discord_id}`. The avatar URL comes from the CDN, with a default-avatar fallback of `(id >> 22) % 6`.
- **Frontend:**
  - `frontend/src/context/AuthContext.tsx`, wrapped next to `SidebarProvider` in `frontend/src/routes/__root.tsx`
  - In `frontend/src/components/navbar/NavBar.tsx`: a "Log in with Discord" link, or an avatar menu with Logout and, for admins, Admin.
- **Verify:** do a full round trip in the browser. `document.cookie` must not show `sid`. `/me` returns null → user → null across logout. A tampered state gets a 400.

## F2: Ratings + reviews (core)
The review text is the comment; one review per user per server family.
- **Migration `33_reviews.sql`:** `server_reviews(id, user_id fk cascade, server_id int fk servers, rating smallint check 1–5, body text null, anonymous bool, created_at, updated_at, removed_at null, removed_reason null)`, indexed on server_id and user_id.
- **Write path, `repositories/user/reviewRepository.ts`:**
  - Inside the transaction, take `pg_advisory_xact_lock(user_id)` first. `FOR UPDATE` can't lock a row that doesn't exist yet.
  - Then look for an existing review by this user on any member of the family (`familyMembersSql`). Update it, repointing `server_id` to the current id, or insert a new one.
  - Body: at most 2000 characters, trimmed. Run the profanity check (a stub until F7).
- **Read path, `repositories/reviewReadRepository.ts`** (on the read connection):
  - Scope to the family, then `DISTINCT ON (user_id) … ORDER BY user_id, updated_at DESC`. This dedupes reviews that survive a merge. Filter `removed_at IS NULL`.
  - Summary: avg, count, and a 1–5 histogram.
  - Ranking score: Bayesian `(C·m + Σ)/(C + n)` with C≈5 and m = the site-wide mean. Use it for sorting only; always display the raw average.
- **Routes, `api/routes/reviews.ts`**, under `/api/servers/:id/reviews`:
  - `GET /`: paged, sort = newest|highest|lowest, `withCache({name:'reviews', ttl 30s})`
  - `GET /summary`: cached
  - `GET /mine`: requireUser, not cached
  - `PUT /`: requireUser + origin + write tier; body `{rating: t.Integer({minimum:1,maximum:5}), body?, anonymous?}`
  - `DELETE /`: the user's own review
  - Writes call `clearCaches('reviews')`.
- **Server-list ranking:** add `rating`/`ratingCount` to `ServerElement` (`common/models/serverData.ts`) and the list query, plus a "Top rated" option in `SortDropdown`.
- **Frontend:** new `components/detail/StarRating.tsx`, `ReviewSummary.tsx`, `ReviewList.tsx` and `ReviewForm.tsx`, mounted in `components/detail/ServerDetail.tsx`.
  - The form prefills from `/mine` and shows a login prompt when logged out.
  - Anonymous reviews render as "Anonymous".
- **Verify:**
  - Two accounts review the same server. A re-submit updates rather than duplicates.
  - Do a manual merge (the statement in the `30_server_identity.sql` header) with one account holding a review on each alias. The list shows one review for that account, and the average counts it once.

## F3: Admin panel shell + ownership
Needed before F4–F6.
- **Migration `34_owners.sql`:** `owners(id, user_id fk cascade, server_group_id null fk, server_id null fk, created_at, created_by)`.
  - `CHECK` that exactly one target is set.
  - Partial unique indexes on `(user_id, server_group_id)` and `(user_id, server_id)`. This allows several co-owners.
- **Read, `repositories/ownershipRepository.ts`:** `canManageServer(userId, rawServerId)` = admin, OR owns the family root's `server_group_id`, OR owns any member of the family. Also `getOwnedTargets(userId)`, which feeds `/me`.
- **`api/routes/admin.ts`** (prefix `/api/admin`, `requireAdmin` on everything, origin check on writes):
  - `GET /users?q=`: search users who have logged in, by name or Discord ID
  - `GET/POST/DELETE /owners`
  - Later features add their queues to this file.
- **Frontend:** a `routes/admin.tsx` layout with tabs (Owners, and later Images, Announcements, Reports). It redirects if `!me.isAdmin`; the server enforces this anyway.
- **Verify:** a non-admin gets 403 from the API. Assigning a network makes `canManageServer` true for every server in it, including after a merge.

## F4: Per-server customisation (core for you)
Covers the theme accent and background image.
- **Migration `35_customisation.sql`:**
  - `customisations(id, server_group_id null, server_id null, accent_color char(7) null, background_image_id null, updated_by, updated_at)`, with CHECK exactly-one-target and a unique index per target
  - `uploaded_images(id uuid, uploader_id, kind, mime, bytes, status pending|approved|rejected, reviewed_by, reviewed_at, reject_reason, created_at)`
  - A server's settings override its network's defaults.
- **Upload, `api/routes/owner.ts`:**
  - `POST /api/owner/images`: requireUser + origin + write tier, multipart, and the uploader must own at least one target. Size limit: the target is ≤2 MB, but it should be set once in config.
  - `lib/imageValidation.ts` sniffs magic bytes (PNG / JPEG / WebP only; **no SVG**, which can carry scripts). It reads width and height from the header, capped at 3840×2160, with no decoding (no native dependencies).
  - Files are written to `UPLOAD_DIR/<uuid>.<ext>` with a server-generated name and status `pending`.
- **Setting, `PUT /api/owner/customisation`:**
  - Body `{target:{networkId}|{serverId}, accentColor?, backgroundImageId?}`.
  - `accentColor` must match `/^#[0-9a-f]{6}$/i`, which blocks CSS injection. It applies immediately.
  - The background can only be set to an image with status **approved**. The UI shows "awaiting approval" until then.
- **Serving:** `GET /uploads/:id` streams the file only if it is approved; admins can also see pending ones. Send the sniffed `Content-Type`, `X-Content-Type-Options: nosniff` and a long cache lifetime (the ids are immutable).
- **Admin:** `GET /api/admin/images?status=pending`, `POST /api/admin/images/:id/approve|reject`. Rejection deletes the file.
- **Read:** `GET /api/servers/:id/customisation` (cached, name `customisation`). The frontend applies it as scoped CSS variables and a background on the `ServerDetail.tsx` wrapper, e.g. `style={{'--color-accent': …}}`, with a dark overlay to keep text readable. The global `index.css` is never touched.
- **Owner UI:** a "Customise" panel on the server page (and network page, for network defaults), shown when `me` can manage it.
- **Verify:** a renamed `.exe` gets rejected. A pending image returns 404 publicly. Once approved, the background shows on every server in the network, and a per-server override wins.

## F5: Owner replies (Google Maps style)
- **Migration `36_review_replies.sql`:** `review_replies(review_id pk/fk cascade, author_user_id, body, created_at, updated_at, removed_at)`. That is one reply per review.
- **Routes:** `PUT` / `DELETE /api/servers/:id/reviews/:reviewId/reply`. Checks: `canManageServer`, and the review must belong to that family. Writes call `clearCaches('reviews')`.
- **UI:** the reply renders under its review as "Response from the owner", with the owner's name shown. Managers get an inline reply box.

## F6: Announcements
- **Migration `37_announcements.sql`:** `announcements(id, server_group_id null, server_id null, author_user_id, title, body, status pending|approved|rejected, starts_at, ends_at null, reviewed_by, created_at)`, with CHECK exactly-one-target.
- **Display:** a network announcement shows on **every server page in that network**, but never on the network page itself.
- **Routes:** the owner can use `POST/DELETE /api/owner/announcements`. Admins get a queue with approve/reject. `GET /api/servers/:id/announcements` returns approved, currently active announcements (cached).
- **UI:** `components/detail/AnnouncementBanner.tsx`, mounted in `ServerDetail.tsx` only. The body is plain text, with line breaks kept and no markdown or HTML, which avoids XSS.

## F7: Reports, moderation, profanity filter
- **Word list:** vendor LDNOOBW `en` into `common/profanity/en.txt`, with its licence (CC-BY-4.0), and add `common/profanity.ts` so the client can pre-warn.
  - Matching lowercases the text, folds leetspeak (0→o, 1→i, 3→e, @→a, $→s), and checks **whole words** plus multi-word phrases. That avoids the Scunthorpe problem.
- **Policy:** a match **rejects the write with 422** and a friendly message. This applies to review bodies, replies and announcements.
  - A "negative sentiment" filter is left out on purpose. A negative review is valid feedback, and reports cover the abusive ones.
- **Migration `38_reports.sql`:** `review_reports(id, review_id fk cascade, reporter_id, reason enum spam|abuse|offtopic|other, note, status open|dismissed|actioned, handled_by, created_at)`, with unique `(review_id, reporter_id)`.
- **Routes:**
  - `POST /api/servers/:id/reviews/:reviewId/report` (requireUser)
  - Admin: `GET /api/admin/reports`, `POST /api/admin/reports/:id/dismiss`
  - Admin: `PATCH /api/admin/reviews/:id` for edit / remove / restore. Remove is a soft delete via `removed_at`. The admin view shows the real author of anonymous reviews.
  - Optional: auto-hide a review once it has ≥3 open reports, pending your decision.
- **UI:** a report button on review cards, and a Reports tab in the admin panel.

## F8: Network aggregate (read-only)
- `GET /api/networks/:id/reviews` and `/summary` (cached). This covers every family whose root has `server_group_id = :id`, deduped per family as in F2, and each review is tagged with its server's name.
- In `components/detail/NetworkDetail.tsx`: a summary plus a read-only list, with no form. Each item links to its server page.

## F9: Aspect ratings
- **Migration:** add nullable `rating_maps`, `rating_moderation` and `rating_lag` columns (smallint, check 1–5) to `server_reviews`. That's three fixed columns rather than an EAV table. Keep the aspect list in `common/models/ratings.ts` so a fourth aspect only means a migration plus one line.
- **Summary:** `AVG(x) FILTER (WHERE x IS NOT NULL)` and a count per aspect.
- **UI:** an optional collapsible "Rate specifics" section in `ReviewForm`, and breakdown bars in `ReviewSummary`.

---

## Delegation (per your request)
For each feature: I (Opus) write a tight spec from the section above, a **Sonnet** worker implements it on its own branch, then I review the diff. A **Haiku** worker handles mechanical bits: vendoring the word list, `.env.example`, boilerplate route/schema wiring.

Opus reviews F0 and the F2 read/write SQL in depth, because the identity, dedupe and security rules live there.

## Verification (every feature)
- `bunx tsc --noEmit -p backend`, plus `bun run build` and `bun run lint` in `frontend`. There are no TS tests today, so add `bun test` unit tests for the pure pieces: image sniffing, the profanity matcher, Bayesian scoring, origin checks.
- `go test ./...` in `collector` to confirm the migrations apply.
- Run the stack locally (the `run` skill) with a dev Discord app whose redirect URI is `http://localhost:<port>/api/auth/discord/callback`, and walk through each feature's "Verify" line in a browser via Playwright.
- Security pass (`/security-review`) on F0, F1, F4 and F7 before merging.

## Open items (decide later; they don't block F0–F2)
- Whether you want auto-hide at N reports (F7).
- Image size cap: the default is 2 MB and 3840×2160.
