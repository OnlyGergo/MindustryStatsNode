# Retheme: token-driven theme matching the palette preview

## Context
The look of the site has drifted. Colours live in three places:
- an `@theme` block in `frontend/src/index.css`, with orange `#ff6b35`
- hardcoded oranges and greys in the charts and tooltip (`#f97316`, `rgb(249,115,22)`, `#9ca3af`, `#a3a3a3`)
- stray Tailwind palette classes such as `text-green-400`, `from-stone-900` and `bg-[#5865F2]`

There is no shared panel, stat tile or segmented control. `Stat`, `Section` and `WindowTabs` are each copied 2–3 times.

Boxes leave blank spots for two reasons:
- Fixed `grid-cols-N` grids get item counts that don't fit them. For example, `NetworkStatsRow` puts 7 tiles in 4 columns, and `InactiveServersDetail` gets a data-driven count in 4 columns.
- Equal-height grid pairs stretch the shorter card. For example, the server page's Peaks/Uptime pair.

Stars render at 16–26px.

**Goal:** reimplement the uploaded palette preview's design in our existing Tailwind v4 stack.
- Every colour comes from 13 CSS variables.
- A theme is a plain object of those tokens. The 8 presets ship, with `moth` as the default.
- A theme applies on a wrapper element, so a page or network can override the site theme.
- Charts read the variables, so nothing re-renders on a theme change.
- Layout and panels match the preview, with no blank spots and smaller stars.
- Data fetching and routing stay as they are.
- `THEME.md` documents all of it.

**Phase 2 (not now):** a palette picker for admins (site-wide) and owners (per network or server). For now, behaviour stays as today: one site theme (moth) plus the owner's accent colour override.

**Decisions:**
- **Font:** Barlow and Barlow Semi Condensed via Google Fonts `<link>`. MindustryIcons stays first in the stack for the glyphs.
- **Multi-series charts:** keep the stable per-name hash hue. Saturation and lightness come from the theme's `--acc`, clamped so Graphite isn't grey-on-grey.
- **AnimatedBackground:** removed, giving a flat `var(--bg)`.
- **Mobile/desktop switch:** stays at the existing `split` breakpoint (950px), not the preview's 820px.
- **Server page heatmap:** none. There is no per-server activity endpoint, and fetching stays unchanged. Server-level activity would be a later backend task.

## Token model
**Source of truth: `common/theme.ts` (new).** It lives in `common` so phase 2's backend can validate stored preset ids. It holds:
- `THEME_TOKENS`: `bg surf surf2 bd tx dim acc acc2 onacc good bad sidebg topbg`.
- `type Theme = Record<Token,string> & { id, name, note }`.
- `PRESETS`: the 8 PALS entries copied verbatim (moth, moss, mint, violet, rose, glacier, brass, graphite).
- `DEFAULT_THEME_ID = 'moth'`.
- `lum(hex)`: the preview's WCAG luminance.
- `onAccentFor(hex)`: returns `#111111` when `lum > .4`, else `#ffffff`.
- `withAccent(theme, hex)`: replaces `acc` and re-derives `onacc`.
- `themeVars(theme)`: returns `{ '--bg': …, … }`, ready for a `style` attribute.

The preset hexes, and `themeVars(moth)` rendered onto `<html>`, are the **only** place token values exist. `index.css` holds no hex.

**`frontend/src/index.css` is rewritten:**
- `@theme inline { --color-*: initial; --color-bg: var(--bg); --color-surf: var(--surf); … --color-onacc: var(--onacc); … }`.
  - This gives `bg-surf`, `text-dim`, `border-bd`, `bg-acc/12` and so on.
  - Clearing the default palette means `text-red-400` simply stops existing.
  - `transparent`, `current`, and white/black (re-added as `--color-white`/`--color-black`) remain.
- `--font-sans: MindustryIcons, Barlow, system-ui, …` and `--font-head: 'Barlow Semi Condensed', Barlow, …`.
- `--radius: 5px`. `--breakpoint-split: 950px` is kept.
- **Derived block on `:root, [data-theme]`:**
  - `--top` = `color-mix(acc 62%, #fff)` (hottest heatmap cell). This mix is the one literal allowed in CSS.
  - `--grid` = `color-mix(bd 80%, bg)`.
  - `--track` = `var(--surf2)`.
  - `--acc-soft` = 12%, `--acc-hover` = 18%, `--acc-line` = 40% (the scrollbar thumb).
  - **Gotcha, which goes in THEME.md:** derived custom properties resolve where they are *declared*. Any element that overrides tokens must carry `data-theme`, or the derived values keep the parent's colours.
- `.chart-tip` is the uPlot tooltip, styled with `var()`. It replaces the inline hex styles in `chartTooltip.ts`.
- `.btn-discord` is the one brand exception, kept in CSS rather than in a component.

### Macro classes (`@utility` / `@layer components`)
These names follow the preview. Old names are removed, not aliased.

| Class | Meaning |
|---|---|
| `panel` | surf background, bd border, radius, `p-2.5 px-3`, `min-w-0` |
| `panel-head` / `panel-title` | title row (flex, wrap, gap); title in `font-head` |
| `panel-row` | `flex flex-wrap gap-3 items-start`. **This fixes the blank spots.** |
| `panel-sm` / `panel-md` / `panel-lg` / `panel-full` | flex `1 1 240px` / `1 1 320px` / `1.3 1 400px` / `1 1 100%` |
| `strip` / `strip-cell` / `strip-label` / `strip-value` | stat strip: `flex flex-wrap gap-px bg-bd` on the container, `flex-1 basis-[8.5rem] bg-surf` on cells. The 1px gaps become grid lines, and the last row grows to fill, so there are no holes for any count. |
| `btn` / `btn-acc` / `btn-fill` | replace `button-secondary` / `button-accent` |
| `ib` | 34px square icon button (graph button) |
| `seg` / `seg-btn` | segmented control. `aria-pressed:` gives the `acc` fill with `onacc` text. |
| `pill-good` / `pill-bad` / `tag` | status pill, outline tag |
| `track` / `track-fill` / `track-fill-2` | bar tracks (acc / acc2) |
| `label-caps` | 10px uppercase, tracking .06em, dim |
| `field` | text input (surf2 background, bd border) |
| `logo` | striped acc/bg square |

### Small React primitives (new `frontend/src/components/ui/`)
Only the four that are copy-pasted today:
- `Panel.tsx`: title, controls, size, children.
- `StatStrip.tsx`: `items: {label, value, sub?, tone?}[]`.
- `Segmented.tsx`: options, value, onChange. Replaces `WindowTabs`, the NetworkActivity 7d/28d/90d buttons, the NetworkServerList sort chips and the HistoryRangeControls presets.
- `PageHead.tsx`: title, sub, right.

## Charts
**New `frontend/src/util/themeColors.ts`:**
- `cssToken(el, name)`: `getComputedStyle(el).getPropertyValue('--'+name).trim()`, read off `u.root`, so a scoped theme works.
- `alpha(hex, a)`: returns rgba.
- `modeHue(name)`: the existing `stringToHue`, moved here.
- `seriesColor(el, hue)`: JS HSL using `--acc`'s saturation and lightness, clamped to S 35–80%, L 50–70%. Used for canvas.
- `seriesCss(hue)`: `hsl(from var(--acc) <hue> clamp(35,s,80) clamp(50,l,70))`, the same maths in CSS, for DOM legend swatches. It is SSR-safe.
- Canvas cannot resolve `var()` or be relied on for `color-mix`, so the canvas path is always concrete strings computed in JS.

**`util/chartHelpers.ts`:**
- Axis `stroke`, `grid.stroke` and `ticks.stroke` become uPlot **functions** `(u) => cssToken(u.root,'dim'|'grid')`.
- Series `stroke`/`fill` also become functions: `getModeColor`/`getModeFill`/`shareColor` turn into `(u)=>…` builders. "Other" uses `--dim`.
- uPlot calls these on every draw, so `setData` and a resize pick up a new theme automatically.
- The axis font becomes Barlow.

**`hooks/useUPlot.ts`:** one listener for a `theme-change` window event, which calls `u.redraw(false)`. This is the only re-render hook, and it is central rather than per chart. `useBodyCustomisations` dispatches the event after applying vars.

**Per-chart changes:**
- `PlayerHistoryChart.tsx`: `--acc` line, `alpha(acc,.1)` fill, `--grid`, and an offline band of `alpha(bad,.1)`. The `COLOR`/`OFFLINE_*` constants go.
- `GamemodeChart.tsx`: `AGG_COLOR` becomes `--acc`.
- `NetworkServerShareChart.tsx`: the `labelColor` duplicate is deleted in favour of the shared helper.
- `ChartSidebarLegend.tsx`: swatches use `seriesCss`.
- `NetworkActivity.tsx` heatmap: keeps `color-mix(var(--acc) N%, transparent)`, with `var(--top)` when the fraction is above 0.92, matching the preview's legend.
- `chartTooltip.ts`: class names only. Title and total use `.chart-tip` CSS on `var(--acc)`.

## Customisation (phase-1 behaviour, made token-based)
`util/customisation.ts` `customisationStyle(c)` returns:
- `{'--acc': hex, '--onacc': onAccentFor(hex)}`
- with a background image: an overlay gradient of `color-mix(var(--bg) 82%, transparent)`, plus `--surf`/`--surf2` set to `alpha(PRESETS.moth.surf, .85)`. These are concrete values, because `--surf: color-mix(var(--surf)…)` would be a cycle.

`hooks/useBodyCustomisations.ts`:
- keeps applying to `<body>`, which is the wrapper element
- now also sets `data-theme`, so the derived values recompute
- fires `theme-change`

`CustomisePanel.tsx` `FALLBACK_COLOR` becomes `PRESETS[0].acc`.

## Layout (matches the preview; routing unchanged)
**Shell:**
- `__root.tsx`: `<html data-theme style={themeVars(moth)}>`, Google Fonts preconnect and link, and `theme-color` from the preset.
- `vite.config.ts`: manifest colours imported from `common/theme.ts`.
- `AppShell.tsx`: `bg-bg`, and `AnimatedBackground.tsx` is deleted.
- `TopBar.tsx` / `NavMenu.tsx`: sticky `bg-topbg` bar, `logo` + name + version, nav buttons with an inset `acc` underline when active, mobile page title.
- `BottomDock.tsx`: `bg-topbg`, icon above label (servers / clock / bars / trophy SVGs from the preview), active item in `text-acc`.

**Sidebar:**
- `ServerListPanel.tsx`: `bg-sidebg`, `split:w-80` (was `w-3/12 min-w-sm`), with the collapse rail kept.
- `ServerStatsSummary`: counts row, online in `text-good` and players in `text-acc`. Centred and larger on mobile.
- `ServerListControls`: `field` search, plus the toggles and sort as `btn` chips.

**Server groups:**
- `ServerGroup.tsx`: big player number (`font-head text-acc`) on the left, then name and "x/y online", then the `ib` graph link, then the chevron (rotates when expanded). Selected: `bg-surf2` with an inset 3px acc bar.
- On mobile each group is a `panel` card with margin. Expanded body is `bg-bg`.

**Server rows:**
- `ServerItem.tsx`: country-code `tag`, name, description, map, and on the right the `pill-good`/`pill-bad` "Online · ping", the rating, and players `/ cap` in `font-head`.
- `FlatServerList.tsx` and `StaticServerList.tsx` keep their markup contract: the `data-server`/`data-group` attributes stay.

**Stars:** `StarRating.tsx`. Compact list goes 16→12px, display 16/14→14/12, input 26/18→22/16.

**Pages:** `DetailShell` main is `p-3.5 px-4 flex flex-col gap-3`.

`ServerDetail.tsx`:
- `PageHead` with the network › server title and a big `font-head` player count on the right.
- A chip line: pill, players/ping, CopyButton, ShareButton.
- One `StatStrip` merging map, wave, mode, version, peaks and uptimes. This replaces the 4-tile grid and the uneven Peaks/Uptime pair.
- Then `panel-row`: history (`panel-lg`), maps.
- Reviews, map history and MOTD history become `Panel`s.

`NetworkDetail.tsx`:
- `PageHead` (name, "Network", NetworkSources "Listed on", Share), then `StatStrip`. `NetworkStatsRow` becomes 10 items, with the peaks folded in.
- Row of [history `panel-lg`, heatmap `panel-md`].
- Row of [gamemodes, maps (`track-fill-2`), versions/countries, servers].
- Server share chart as its own panel.
- `NetworkBreakdown`'s `Section`/`Chip` helpers are replaced by `Panel` and `tag`.

`GlobalStatsChart.tsx` + legend:
- `PageHead`, then a `label-caps` "Timeframe"/"View" with `Segmented`.
- `StatStrip`, then a `panel-row` with the chart (`flex-[3_1_520px]`) and the legend (`panel-sm`).
- The fixed `lg:h-[60vh]` is kept on the chart canvas only.

Leaderboard:
- `HeadlineCards` becomes `StatStrip`, and `WindowTabs` becomes `Segmented`.
- The Wrapped link is a `btn-fill`.
- `RankTable` uses a CSS grid row with `--cols`, `text-good`/`text-bad` arrows and a `track` mini bar.

`InactiveServersDetail.tsx`: list stats become flex-wrap grow cells (no `lg:grid-cols-4` holes), and the table gets `tag` / `btn-acc` / `btn` styling.

`WrappedPage.tsx`: the `Card`/`Big` grids become `panel-row`, so a missing `winnerBest` no longer leaves a hole.

Reviews (`ReviewSummary/List/Form/Reply/Actions`), `CustomisePanel`, `EmptyState`, `AccountMenu`, `Tooltip`, `ToggleButton`, `SortDropdown`, `SearchBar`, `CopyButton`, `ShareButton`, `BottomSheet`, the admin pages and `TabNav` get the token rename plus `panel`/`btn`/`seg` where it is a direct swap. No layout redesign for admin.

## Execution order (waterfall; one commit per phase to `staging`)
0. Pull and fetch `staging`. Copy this plan to `docs/plans/retheme.md`. Commit as `docs: add retheme plan` and push.
1. **Tokens and core.** Add `common/theme.ts` and its test (`lum`/`onAccentFor`/`themeVars` keys). Rewrite `index.css` with tokens, derived values and macro classes. Update `__root.tsx` and `vite.config.ts`. Delete `frontend/tailwind.config.ts` (it is dead config, since `index.css` has no `@config`). Commit as `feat: theme tokens and presets`.
2. **Mechanical rename** with a throwaway sed script in the scratchpad:

   | Old | New |
   |---|---|
   | `bg-surface-primary` / `-secondary` | `bg-surf` |
   | `bg-surface-tertiary` | `bg-surf2` |
   | `text-primary` | `text-tx` |
   | `text-secondary` / `-tertiary` | `text-dim` |
   | `text-accent` | `text-acc` |
   | `bg-accent` | `bg-acc` |
   | `bg-accent-muted` / `-hover` | `bg-acc/12` / `bg-acc/18` |
   | `border-subtle` / `-default` | `border-bd` |
   | `border-accent` | `border-acc/40` |
   | `*-status-online` / `*-offline` | `good` / `bad` equivalents |
   | `button-secondary` / `button-accent` | `btn` / `btn-acc` |
   | `card-base` | `panel` |

   The remaining palette classes are fixed by hand. Commit as `refactor: move components onto theme tokens`.
3. **Primitives and shell.** Add `ui/*`, then TopBar, NavMenu, BottomDock, AppShell and the sidebar components, plus the stars. Commit as `feat: retheme shell and server list`.
4. **Pages.** Server, network, global, leaderboard, inactive, wrapped and reviews. Commit as `feat: retheme pages with flex-wrap panels`.
5. **Charts.** Add `themeColors.ts`, then update chartHelpers, the four charts, the tooltip, the heatmap and the useUPlot redraw. Commit as `feat: charts read theme variables`.
6. **Customisation.** Update `customisation.ts`, `useBodyCustomisations` and `CustomisePanel`. Commit as `refactor: customisation sets theme tokens`.
7. **Docs and guard.**
   - Write `THEME.md` at the root:
     - tokens table with meaning
     - derived values and the `data-theme` gotcha
     - the 8 presets and how to add one
     - macro class reference
     - `ui/` primitives
     - layout rules (`panel-row` + size classes, `StatStrip`)
     - charts (canvas vs DOM colour paths, `theme-change`)
     - customisation
     - the phase-2 notes
   - Add a short Theme section to `CLAUDE.md` pointing at it, and fix its stale "detail page wrapper" note.
   - Add `frontend/src/util/noHardcodedColours.test.ts`. It greps `frontend/src` for hex, `rgb(`, `hsl(` and default-palette classes. The allowlist is `common/theme.ts`, `util/mindustryText.ts` (game colour tags are data) and `util/themeColors.ts`.
   - Commit as `docs: add THEME.md and colour guard`.

## Verification
- Root `bun run typecheck`, `bun run test` (including the new theme and colour-guard tests), and `bun run build`.
- `bun run dev` against a local Postgres (`scripts/setup-local-postgres.sh`; no TimescaleDB, so some charts may be empty).
- Playwright screenshots of `/`, `/network/:id`, `/server/:id`, `/global`, `/leaderboard`, `/inactive` and `/wrapped/2026` at 1280px and at 390px mobile. Compare against the preview: sidebar plus main on desktop, Servers list with bottom nav on mobile, groups expand, graph button navigates.
- Theme check in the browser console: run `Object.entries(themeVars(PRESETS.find(p=>p.id==='violet'))).forEach(...)` on `document.documentElement`, then `dispatchEvent(new Event('theme-change'))`. Every surface, the uPlot lines, axes, tooltip and heatmap should switch with no reload.
- Set an owner accent on a test network and confirm only that page recolours, with `--onacc` text readable on `btn-fill` and `seg` buttons.
- Resize across 950px: no horizontal scroll at 390px, and no blank cells in strips or panel rows for the 7, 10 and 5 item cases.
