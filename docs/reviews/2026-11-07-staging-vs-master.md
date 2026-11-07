# Review: staging vs master (2026-11-07)

Scope: `origin/master...origin/staging` at `6e79588` (23 commits, 105 files): leaderboard +
Wrapped, network peaks, server-details slim, family-level aggregate exclusion (45), hubs
admin, merge suggestions v2 + resolved IP (47), primary-only polling, SSR server list
markup, global page SSR, mobile list perf.

Checks run: the new bun tests (39 pass), `go test` for collector/processor/config (pass),
`tsc --noEmit` for backend and frontend (clean apart from the generated `version_build`).
Nothing was run against a real DB.

The follow-ups from `2026-11-01-leaderboard-wrapped-network-peaks.md` (rebuild on start,
scoped Wrapped polling, `invalidateWrapped`) are all in and look right.

## Should fix

1. **Reliability board inflated to ~100% for merged families** (`getReliable`,
   `leaderboardRepository.ts`). Since `GetServers` polls only the primary member between
   daily sweeps, a non-primary alias has about one sample a day. If it answered,
   its per-raw-server uptime is 1/1 = 100%, and `MAX(uptime)` across aliases picks
   it. Every merged family with two live members tops the board. Fix: collapse per
   (family, bucket) first, as `get_server_details` does (`MAX(online_samples)`,
   `MAX(samples)`), and then sum per family.
2. **Migration 45 drops `servers.aggregate_exclude` with no safe deploy order.** The
   deployed master backend reads `root.aggregate_exclude` (server list, network
   pages, charts). The staging backend needs `aggregate_excluded_families`. Whichever
   side goes first, the site breaks until the other lands. Either deploy the collector
   and backend together, accepting a short outage, or move the `DROP COLUMN` into a
   later migration that runs after the new backend is live.
3. **`same_day` merge suggestions fire for every brand-new server on a shared
   host/MOTD.** `abs(s.first_seen - t.last_seen) <= 1 day`: `t.last_seen` is about now for
   any live family, so for its first day a new server pairs with every live family on
   the same host or with the same network description. That scores 5, the same as
   `same_endpoint`. Require `t.last_seen < now() - <a poll interval or two>` (t has
   actually gone quiet), or `t.last_seen <= s.last_seen`.

## Worth a look

- **`get_server_details`'s `live_address` ordering wasn't updated.** It still uses
  retired → last_seen, but `liveMemberSql` and `GetServers` now use retired → online →
  hostname-over-IP → last_seen, and the comments say these must agree. Right after the
  daily sweep, the detail page can show the IP row while the list shows the domain.
  Put the same `server_current` join and ORDER BY into the function, in a new migration.
- **`POST /api/admin/leaderboard/rebuild` awaits three window builds in the request.**
  `WebServer.ts` sets no `idleTimeout`, and Bun's default is 10s. A slow 30d build can
  get its connection closed, so the admin sees an error even though the build
  finishes. Either return 202 and let the page poll `generatedAt`, or raise the
  timeout for that route.
- **Wrapped "records" are "current all-time peak set in that year".** For a finished year,
  a record later beaten disappears, and the final report is built once, at whatever
  point that happens. If "best moment of the year" is meant, use the year's own max
  from `server_stats_1h`.
- **Static SSR list:** group headers in the unhydrated markup have no click handler, so
  expand/collapse does nothing until `/api/servers` lands. Fine if that's fast; maybe
  `cursor: default` on headers until then.

## Minor / nits

- `host ~ '^[0-9.]+$'` (in 3 places) treats IPv6 literals as hostnames. That's harmless,
  but the "hostname over IP" intent isn't met for v6.
- Hub dismissals are keyed on the root at the time, so they're lost on a merge that
  changes the root. This is documented, same as merge dismissals.
- Still open from 11-01: newcomers with 0 player-hours fill quiet windows, and new
  servers crowd the 24h records.
- Some commits are authored as `--global` (someone ran `git config user.name --global …`
  with the arguments the wrong way round). Check `git config user.name` on that machine.

## Good

- Moving exclusion to the family (`aggregate_excluded_families` + SECURITY DEFINER setter,
  merge/unmerge carrying the flag, `get_server_details` updated before the column drop)
  is the right model and fixes a real inconsistency.
- History pagination via LATERAL per member, slim `get_server_details`, and the bounded
  14-day `fam_1h` + `network_peaks` remove the unbounded scans from SSR paths.
- `per_server_key` → MAX by name before summing maps fixes a real double count.
- SSR list as unhydrated markup + summary-only loader data is a neat trick and well
  commented; `useApi` first-fetch-before-config is a good catch.
- Good test coverage on the pure parts (pivot, ranking maths, scheduler coalescing,
  Wrapped cache lifecycle).
