# Review: leaderboard, Wrapped, network peaks (staging, 2026-11-01)

Scope: `00073f5..2b05d83` (leaderboard data layer, scheduler, page, Wrapped) plus the
collector `network-peaks` loop from `perf/networks` (not on master yet).

Fixed in the same commit as this note: `wrapped.$year.tsx` declared `head` before
`loader`, which breaks TanStack's loader-data inference (`data` possibly undefined).
Moved `head` after `loader`, like the other `$param` routes.

## Should fix

1. **Network-peaks rebuild may never run.** `peaks.Run` uses `time.NewTicker(RebuildInterval)`
   (24h) and the first rebuild waits a whole interval. Every collector restart resets it,
   so if you deploy/restart more often than daily, the full rebuild never fires and peaks
   that a merge/regroup/exclude should have lowered stay high forever. Fix: store the last
   rebuild time (or check `now - last >= interval` on the refresh tick), or run one rebuild
   shortly after boot.
2. **24h window compares ~23h to 24h at the scheduled slots.** Windows end at `now()`. At
   07:00:00.x the 07:00 bucket has no samples yet, so `cur` has 23 full hours and `prev`
   has 24. The 24h tab is biased down by about 4% (7d by about 0.6%), so movers/losers
   skew. At other times the current partial hour counts as a full hour (`sum/samples`
   is a mean). Fix: floor `end` to the hour in `rebuildLeaderboard` (and Wrapped's
   year-to-date end), and fire slots at about :05 so the last hour has landed.
3. **Wrapped polling refetches the whole server list every 5s.** `router.invalidate()`
   marks *every* match invalid, and `invalid` overrides `shouldReload: false` /
   `staleTime: Infinity` (router-core `load-client.js`), so `_browse`'s `/api/servers`
   loader reruns on every poll. Fix:
   `router.invalidate({ filter: (m) => m.routeId === Route.id })`.
4. **Wrapped ignores merges.** Merges call `requestLeaderboardRebuild()`, but the Wrapped
   cache isn't touched, and final years are cached for the life of the process, so a
   merged family stays split in past years until a restart. Expose a `clear()` from
   the Wrapped service and call it in `mergeResponse`.

## Design questions

- **Why the 12-hour scheduler, and why build on boot?** The report lives only in
  memory, so after a restart there's nothing to serve until a build runs. Without the
  boot build, `/leaderboard` would return 503 for up to 12h. That part makes sense.
  The 12h cadence doesn't fit a 24h tab, though: it can be half a window stale
  ("updated 11h ago"). The data is hourly anyway, so cadence could follow window
  length: 24h hourly, 7d every few hours, 30d every 12h. Downsides of the boot build:
  `bun --watch` in dev reruns about 15 heavy queries on every save, and each extra
  backend instance builds its own copy. Consider skipping it when
  `NODE_ENV !== 'production'` (or an env flag).
- **Why Wrapped is lazy + 503 + poll.** A year of `server_stats_1h(_by_map)` scans takes
  too long to hold an SSR request open, so the first request starts the build and
  the page polls. That's a reasonable choice. It's not required by client-side
  routing. Since final years never change, the collector could write them to a
  table once instead, which would survive restarts.
- **Network peaks in the collector.** Fine where it is (only the collector writes), but it
  moved the unbounded all-history scan from the request path into a daily job. It doesn't
  remove it. Membership only changes on merge/unmerge/regroup/exclude, so a targeted
  `refresh_network_peaks_for(group_id)` called from `merge_server_families` /
  `unmerge_server` (already SECURITY DEFINER) would make the daily full rebuild unnecessary.
  The hourly-MAX-then-SUM peak still adds family peaks that may not coexist within the hour.
  That's inherited from the old query, but worth knowing.

## Minor

- Newcomers include servers with 0 player-hours in the window (sorted last, but they still
  fill the top 10 on quiet windows). Filter `ph > 0`.
- Records: any brand-new server's first peak counts as an all-time record, so
  newcomers crowd the 24h records list. Consider excluding roots created in the window.
- Leaderboard "warming up" state doesn't poll, but Wrapped's does. Make them consistent.
- Wrapped climbers floor is a hard-coded `50`. Move it next to `NOISE_FLOOR_PH`.
- Wrapped builds aren't capped across years: three cold years requested together means
  3 x 4 concurrent heavy queries alongside a leaderboard build.

## Good

Coalescing + "exactly one more build" on merge is correct and tested; map player-hours
collapsing by name before the alias MAX fixes a real double count; consistent MAX-not-SUM
and root-row network/exclusion throughout; `retainSearchParams(BROWSE_SEARCH_KEYS)` fix is right.
