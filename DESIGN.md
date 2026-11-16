# Theme

How the site is styled. The short version:

- Every colour is one of **13 CSS variables**.
- A **theme** is a plain object of those 13 values (`common/theme.ts`).
- Components use **Tailwind utilities that point at the variables** (`bg-surf`, `text-dim`, `border-bd`), plus a small set of **macro classes** in `frontend/src/index.css` (`panel`, `strip`, `btn`, `seg-btn` …).
- **No colour literals in components.** No hex, no `rgb()`, and no `text-red-400`. `backend/src/frontendColours.test.ts` fails the build if one sneaks in.

The design comes from the palette preview (desktop sidebar plus main area, mobile Servers page with a bottom nav). The plan it was built from is in `docs/plans/retheme.md`.

## Tokens

| Token | Utility | Used for |
|---|---|---|
| `--bg` | `bg-bg` | page background |
| `--surf` | `bg-surf` | panels, cards, menus |
| `--surf2` | `bg-surf2` | raised surface: inputs, hover rows, selected group, empty bar track |
| `--bd` | `border-bd`, `divide-bd` | every border and divider |
| `--tx` | `text-tx` | primary text |
| `--dim` | `text-dim` | secondary text, labels, axes |
| `--acc` | `text-acc`, `bg-acc`, `border-acc` | brand accent: numbers, active controls, main chart series |
| `--acc2` | `text-acc2`, `bg-acc2` | second accent: links such as "Listed on", map bars |
| `--onacc` | `text-onacc` | text on an `--acc` fill (`btn-fill`, active `seg-btn`) |
| `--good` | `text-good` | online, up, positive change |
| `--bad` | `text-bad` | offline, down, errors |
| `--sidebg` | `bg-sidebg` | desktop sidebar |
| `--topbg` | `bg-topbg` | top bar, mobile bottom nav |

Opacity modifiers work on every token: `bg-acc/12` (selected row), `bg-acc/18` (hover), `border-acc/40`, `bg-good/15`. Tailwind turns them into `color-mix()`.

The default Tailwind palette is switched off (`--color-*: initial` in `index.css`), so `text-red-400` and its relatives simply produce no CSS. `white`, `black`, `transparent` and `current` still exist. Prefer `tx` to `white`.

### Derived values
These are computed from the tokens in `index.css`, never stored in a theme:

| Variable | Value | Used for |
|---|---|---|
| `--top` | `--acc` mixed 62% with white | the busiest heatmap cells |
| `--grid` | `--bd` 80% into `--bg` | chart gridlines |
| `--track` | `--surf2` | empty part of bars (`track`) |
| `--acc-line` | `--acc` at 40% | scrollbar thumb |

`--onacc` is part of the theme, but whenever an accent is chosen at runtime it is **derived from luminance**. `onAccentFor(hex)` returns near-black on light accents and white on dark ones, the same rule as the preview's `lum()`.

## Themes and where they apply
`common/theme.ts` exports:
- `THEME_TOKENS`
- `PRESETS`: moth, moss, mint, violet, rose, glacier, brass, graphite
- `DEFAULT_THEME` (**moth**) and `getPreset(id)`
- `lum`, `onAccentFor`, `withAccent(theme, hex)` and `alpha(hex, a)`
- `themeVars(theme)`, which returns `{ "--bg": …, … }` for a `style` attribute

A theme applies by putting those variables on **any wrapper element together with a `data-theme` attribute**:
- The site theme lives on `<html data-theme style={themeVars(DEFAULT_THEME)}>` in `frontend/src/routes/__root.tsx`. It is SSR'd, so there is no flash.
- Everything below the wrapper inherits it, so a page, a panel or a network section can override the site theme by wrapping itself:
  ```tsx
  <div data-theme style={themeVars(getPreset("violet")) as React.CSSProperties}>…</div>
  ```
  A partial override works too, for example `themeVars(withAccent({}, "#3b82f6"))`.
- **Gotcha:** custom properties resolve where they are *declared*. The derived block in `index.css` is on `:root, [data-theme]`, so an element that overrides tokens **must** carry `data-theme`, or `--top`/`--grid`/`--acc-line` keep the parent's colours.
- After changing variables at runtime, call `notifyThemeChange()` (`util/themeColors.ts`) so the canvas charts redraw (see [Charts](#charts)).

Owner customisation (`util/customisation.ts` and `hooks/useBodyCustomisations.ts`) uses exactly this mechanism on `<body>`:
- The accent sets `--acc` plus a derived `--onacc`.
- A background image makes `--surf`, `--surf2` and `--sidebg` translucent (concrete values, because `--surf: color-mix(var(--surf) …)` would be a cycle) and lays a `--bg` overlay over the image.
- `data-theme` is added and the event fired.

The other manifest and meta colours (`theme-color`, the PWA manifest in `vite.config.ts`) are read from `DEFAULT_THEME` too.

### Adding a preset
Add one object to `PRESETS` with all 13 tokens as `#rrggbb`. The theme test checks that every token is present and is hex. Check it:
- with a long server list
- on a chart, where series take their saturation and lightness from `--acc`
- with `btn-fill`, so `--onacc` is readable

### Phase 2 (not built yet)
Admins pick the site preset and owners pick one per network or server. Store a preset **id** (validate with `getPreset`) next to the existing accent in `customisations`. Apply `themeVars(withAccent(getPreset(id), accent))` with `data-theme` on the same wrapper the customisation uses today. Nothing in the components needs to change.

## Fonts
- **Barlow** (body, 13px, tabular numbers) and **Barlow Semi Condensed** (`font-head`, used for headings and big numbers). Both load from Google Fonts in `__root.tsx`.
- **MindustryIcons** comes first in both stacks, limited by `unicode-range` to the private-use glyphs the game uses in server names.

## Macro classes (`frontend/src/index.css`)
These are Tailwind `@utility` classes, so they take variants (`hover:`, `split:`). Explicit utilities on the same element win over them, so `btn px-4` works.

**Layout**

| Class | What it is |
|---|---|
| `page-scroll` / `page` | the scrolling main area, and its centred column of sections (`gap-3`) |
| `panel` | the box every section lives in: `--surf`, `--bd` border, 5px radius |
| `panel-head` / `panel-title` | the title row of a panel: title on the left, controls on the right, wrapping |
| `panel-row` | a row of panels that wrap and grow: **use this instead of `grid-cols-N`** |
| `panel-sm` / `panel-md` / `panel-lg` / `panel-full` | panel width in a `panel-row`: flex `1 1 240px` / `1 1 320px` / `1.3 1 400px` / `1 1 100%` |
| `strip` / `strip-cell` / `strip-label` / `strip-value` | stat strip: one box of label/value cells divided by 1px lines |

**Controls**

| Class | What it is |
|---|---|
| `btn` / `btn-acc` / `btn-fill` | outline button, accent outline, accent fill |
| `btn-discord` | the Discord login button, the one non-theme colour |
| `ib` | 34px square icon button, such as the network graph button |
| `seg` + `seg-btn` | segmented control. The active button has `aria-pressed="true"`. |
| `field` | text input or textarea |

**Bits**

| Class | What it is |
|---|---|
| `pill-good` / `pill-bad` | status pill ("Online · 79ms") |
| `tag` | small outline tag (versions, list names) |
| `track` + `track-fill` / `track-fill-2` | bar: `<div class="track"><i class="track-fill" style="width:40%"/></div>` |
| `label-caps` | 10px uppercase dim label (table headers, control captions) |
| `series-swatch` | legend dot for a chart series (see [Charts](#charts)) |
| `chart-tip` | uPlot tooltip |

Use the radius token `rounded-ui` (5px) on anything boxy.

## React primitives (`frontend/src/components/ui/`)
Only the pieces that were copy-pasted around the app:
- `Panel`: `title`, `controls`, `size` (`sm`/`md`/`lg`/`full`), `ref`.
- `StatStrip`: `items: { label, value, sub?, tone? }[]`.
- `Segmented`: `options`, `value`, `onChange`. Use it for every time-window, view or sort picker. When the state lives in the URL (leaderboard windows), use `seg`/`seg-btn` on `Link`s instead.
- `PageHead`: `title`, `sub`, `right`.

Anything else stays a plain element with macro classes.

## Layout rules
- **Shell:**
  - desktop (`split:`, 950px and up): top bar, a `w-80` sidebar on `--sidebg`, and the main area
  - mobile: the top bar shows the page title; the Servers page is the list; `BottomDock` is the nav
- **Server list:**
  - Groups lead with the player count (`font-head text-acc`), then the name and online count, then the graph `ib` and the chevron.
  - On mobile, groups are separate cards.
  - On desktop they are rows divided by `--bd`, and the selected one gets `bg-surf2` with a 3px inset accent bar.
- **Pages:** `page` → `PageHead` → optional chip line → `StatStrip` → `panel-row`s of `Panel`s.
  - Pick panel sizes so a row reads well at about 1100px. Wrapping takes care of the rest.
  - Never use a fixed `grid-cols-N` for a data-driven number of boxes. That is what left blank cells before.
  - For stat tiles, use `StatStrip`: any number of cells fills its rows.
- **Stars:** compact list star 12px, display 12–14px, picker 16–22px.

## Charts
uPlot draws on a canvas, and a canvas can't resolve `var()`. So chart colours are **functions** that read the tokens off the chart's own element on every draw. They live in `frontend/src/util/themeColors.ts`:
- `tokenStroke("acc")` and `tokenAlpha("acc", .12)` for series strokes and fills
- `cssToken(el, "dim")` for a concrete value, such as a tooltip row colour
- `gridColor(el)`, the JS twin of `--grid`
- `labelColor(el, name)` for a named series. It uses a stable hash hue per name (`modeHue`), so a gamemode keeps its colour everywhere, at `--acc`'s saturation and lightness clamped to S 35–80%, L 50–70%. "Other" uses `--dim`.
- `buildTimeAxes` (`util/chartHelpers.ts`) already wires the axis, tick and grid colours.

Because uPlot calls those functions on every draw, `setData` and resizes pick up a new theme by themselves. A pure theme change fires `theme-change` (`notifyThemeChange()`), and `useUPlot` calls `redraw()` on every live chart. That is the only theme hook, and no chart component needs its own.

DOM parts of a chart use CSS:
- The tooltip is styled by `.chart-tip`.
- Legend dots are `<SeriesSwatch label=…>`. It computes the same hash colour in CSS with relative colour syntax (`hsl(from var(--acc) <hue> …)`), with a plain `hsl()` fallback, so it is SSR-safe.
- The heatmap (`NetworkActivity.tsx`) shades cells with `color-mix(var(--acc) N%, transparent)`, and uses `var(--top)` for the busiest ones.

## What may still contain colour literals
- `common/theme.ts`: the presets themselves.
- `frontend/src/util/mindustryText.ts`: in-game colour tags such as `[scarlet]` are data, rendered as the server wrote them.
- `frontend/src/util/themeColors.ts`: builds canvas colours.
- `index.css`: only `white` in the `--top` mix, the shadow `black`, and the Discord brand colour.
- A single line marked with a `theme-ok` comment (example text in a message, say).

`backend/src/frontendColours.test.ts` enforces this list.
