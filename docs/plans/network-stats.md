# Network detail view: make it useful

## Context
`NetworkDetail.tsx` is a proof of concept. It shows the name, active/total, "top server" with its raw host:port and a Hide button, three peaks and one history chart. A network is a `server_groups` row, and its members are the families whose root has `server_group_id = :groupId` and `NOT aggregate_exclude`. Everything is served by `getNetworkDetails` (`backend/src/repositories/serverRepository.ts:356`) at `/api/networks/:id/details`, plus `/history`.

Data that already exists but is unused here: per-server `server_current` (players, max_players, wave, version, ping, map, motd), `server_stats_1h` / `_5m` (peaks, samples, online_samples, avg_ping), `servers.country_code`, `server_maps_history`, `server_motds_history`, `server_reviews` and ratings, `server_source_list` (which lists each server appears on).

## Proposed additions (ranked by value / effort)

**Tier 1: core, do these first**
1. **Member server list (the big one).** A sortable list of the network's servers: name, players/limit, map, mode, wave, ping, country flag, rating. Each row links to `/server/$serverId`. This replaces "first IP", since the top server becomes just the first row. Reuse `ServerItem.tsx` and the existing `ServerElement` type. Add `GET /api/networks/:id/servers`, reusing the `getAllServerElements` query filtered by group, rather than a new query shape. Offline or inactive servers go in a collapsed section.
2. **Headline stats row.** Players online now (SUM across families, using MAX within a family), servers online, share of the site's total players, and 24h average. This replaces the single "top server players" number.
3. **Drop the Host/Hide control.** Show the top server as a link to its page with its player count. It's the one thing the user already called a proof of concept.

**Tier 2: analytics that suit this app**
4. **Per-server stacked chart.** Contributions of the top N servers over the chosen range, in uPlot, with the rest as "other". It shows which server drives the network. Needs a new history endpoint grouped by canonical id (peak per instant per server, as in the chart-query convention).
5. **Activity profile.** Average players by hour of day / weekday (a heatmap or bars), from `server_stats_1h`. It shows when the network is busy.
6. **Gamemode and map breakdown.** Servers or players per mode, and the most-played maps, from `server_current` plus `server_maps_registry`. Uses `gamemode_registry.clean_name`.
7. **Uptime / reliability.** `online_samples / samples` over 24h and 7d for the network, and per server in the list. `ServerDetails` already has an uptime shape to copy.
8. **Peak with date.** Add `allTimeDate` to the peaks, as `ServerDetails` already does for servers.

**Tier 3: nice to have**
9. **Aggregate rating** across the network's servers, with the review count. It uses the same family rating CTE as `getAllServerElements`. Per-server ratings show in the list from item 1.
10. **Geography.** Countries and a version spread (for example the build most servers run). Cheap, since `country_code` and `version` are already selected.
11. **Trend deltas.** Change versus the previous 7 days on the headline numbers.
12. **Events and sources.** Show `server_events` annotations on the chart (no reader exists yet, per CLAUDE.md), and the server lists the network appears on.

## Implementation outline
- **Common:** extend `NetworkDetails` in `common/models/serverData.ts` (`playersNow`, `onlineServers`, `siteShare`, `allTimeDate`, `uptime`, `countries`). Add a `NetworkServers` type, or reuse `ServerElement[]` through `ApiPacker`.
- **Backend:** extend the `getNetworkDetails` CTEs. Reuse the existing `group_servers` / `group_families` / `latest_stats` CTEs, and keep the MAX-not-SUM and `COUNT(DISTINCT canonical_id)` rules. Add `/:id/servers`, plus `/:id/breakdown` and `/:id/activity` for tier 2, all in `routes/networks.ts` with `withCache` spread into the hook options. Chart routes take their window from `resolveRange()`.
- **Frontend:** split `NetworkDetail.tsx` into small components (`NetworkStatsRow`, `NetworkServerList`, `NetworkBreakdown`) under `components/detail/`. The new endpoints load through hooks. Tier 1 can go through the route loader, and tier 2 should load lazily client-side so the SSR payload stays small.
- **Order:** ship tier 1 as one change, then add tier 2 items one at a time.

## Verification
- `bun run typecheck` and `bun run test`.
- Run `bun run dev`, open :3000, and check networks with different shapes: 404ru (id 20880, 45 servers), XCore (31), one with no players now (FrostHeaven, 25) and a one-server network.
- Check the new queries against the DB (DBHub) for sums: the network's players now must equal the sum of the per-family MAX values.
- Check mobile layout, since the detail view uses the CSS-driven list/detail swap.
