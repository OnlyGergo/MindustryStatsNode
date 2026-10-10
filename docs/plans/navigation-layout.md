# Navigation & Layout Refactor: Plan (prep for F3)

## Context
The F3 admin panel (`discord-oauth-ratings.md`) needs a page with **no server list** and its own tabbed sub-navigation. The current shell can't do that cleanly:
- `frontend/src/routes/__root.tsx` hard-mounts `NavBar` and `MasterPanel` around **every** route, so every page is assumed to be about servers.
- `frontend/src/context/SidebarContext.tsx` is the god object. It mixes:
  - server-list polling (`useApi`), grouping and totals
  - collapse and `showMasterPanel` layout state, and `expandedGroups`
  - mobile detection (`useResponsive`)
  - a navigation side effect (`handleToggleCollapse` calls `navigate({to:'/'})` on mobile)
  - a page-title channel (`pageTitle`, written by `DetailShell` in a `useEffect`)
- `frontend/src/components/navbar/NavBar.tsx` has a whole second render mode for mobile detail views. It hard-codes its two links by importing `Route` objects from `routes/inactive.tsx` and `routes/global.tsx`.
- `frontend/src/components/sidebar/MasterPanel.tsx` mixes search/filter controls, collapse, selection (`useParams`), the list and a footer.

On mobile:
- **Too much chrome.** About 210px of it sits above the server list: a 56px bar, a stats row, and a control block that wraps to two rows, plus a footer.
- **List state resets.** `MasterPanel` unmounts when you open a server. `useServerList`'s search, sort, grouping and hide-inactive (`useState`) reset every time you go back.
- **Layout flashes.** `isMobile` is JS-only (`innerWidth < 950`, starts `false`), so SSR always renders the desktop layout and the page jumps after hydration.
- **Links aren't links.** List items navigate via `div onClick={navigate}`, so there's no anchor, no middle-click and no hover preload.

Goal:
- Layout belongs to **routes**, not to one global context.
- Pages that aren't about servers get no server list, and don't poll for it.
- Each layout can bring its own sub-navigation.
- Mobile chrome is a single ~48px bar.

Decisions made:
- **Mobile nav:** one top bar plus a ☰ menu, no bottom tabs.
- **Server-list prefs:** in **URL search params**.

### Architectural rules (apply to every phase)
1. **Layout routes own the layout.**
   - `__root.tsx` only renders the `<html>` shell, the providers (`AuthProvider`) and `AppShell`, which is the top bar plus `<Outlet/>`.
   - `AnimatedBackground` moves to its own file.
   - Everything shaped like a server list lives under a **pathless** `_browse` layout route. URLs don't change.
   ```
   __root            html shell, AuthProvider, AppShell (TopBar + Outlet)
   ├─ _browse        pathless: ServerListProvider + list panel + Outlet; loader = fetchServers
   │   ├─ /                    index
   │   ├─ /server/$serverId
   │   ├─ /network/$networkId
   │   ├─ /inactive
   │   └─ /global              (stays here for now; moving it out is a file move)
   ├─ /admin         F3: admin layout = TabNav + Outlet, no server list
   └─ /account, /about …       future: plain centred page, no server list
   ```
2. **Pages describe their chrome; they don't push it into context.**
   - Routes declare typed `staticData`, using module augmentation of `StaticDataRouteOption` in `frontend/src/router.tsx`. For example: `{ title: string | ((loaderData) => string), back?: 'list' | 'history', hideTopBar?: boolean }`.
   - `TopBar` reads the deepest match through `useMatches()`. That works during SSR, so there is no `useEffect` and no title flash. `pageTitle`/`setPageTitle` and `DetailShell`'s effect are deleted.
   - Each route also sets `head()` with a real document title (`Server name · Mindustry Tracker`). Today every page is titled "Mindustry Stats".
   - A layout that needs its own sub-navigation (admin tabs, future account tabs) renders it **inside its own layout component** under the top bar. It never adds a mode to `TopBar`.
3. **Split `SidebarContext`; nothing about the server list is global.**
   - **`ServerListContext`** (data only): `useApi` polling, `serverGroups`, totals, `loading`/`error`/`lastUpdated`.
     - Provided by `_browse`, and the `fetchServers` SSR loader moves from root to `_browse`.
     - So `/admin` and `/account` never fetch or poll `/api/servers`.
   - **List prefs → URL search params** on `_browse`:
     - `validateSearch` covers `q`, `sort`, `dir`, `grouped` and `inactive`, with defaults matching today's `useState` initial values.
     - `search.middlewares: [retainSearchParams([...]), stripSearchParams(defaults)]`. Prefs follow every link inside `_browse`, so opening a server and going back keeps them. Defaults stay out of the URL, so `/` stays `/`.
     - `useServerList.ts` keeps its sort/filter logic but reads state from `Route.useSearch()` instead of `useState`.
     - The search box writes with a debounced `navigate({ search, replace: true })`, so typing doesn't spam history.
     - The `_browse` loader gets `staleTime: Infinity` and `shouldReload: false`, so a search-param change never refetches the list. `useApi` polling continues as now.
     - Bonus: a filtered list is shareable, and SSR renders it already filtered.
   - **`BrowseLayoutContext`** (UI only, inside `_browse`):
     - The desktop collapse flag, persisted in localStorage. It is read after hydration, inside try/catch, so SSR and a blocked storage both fall back to expanded.
     - `expandedGroups`.
4. **CSS-first responsiveness.**
   - Add `--breakpoint-split: 950px` to `@theme` in `frontend/src/index.css`. That keeps today's threshold and gives a `split:` variant.
   - The list/detail swap becomes classes driven by **which route matched**, which is known during SSR:
     - On `/` the list panel is `flex` and the outlet is `hidden split:flex`.
     - On a detail route the list panel is `hidden split:flex`.
   - No JS, no flash, and the list never unmounts on desktop.
   - `useResponsive` is replaced by a `matchMedia`-based `useMediaQuery`, used only where JS genuinely needs a width (charts), never for layout.
5. **Real links.**
   - `ServerGroup` and `ServerItem` use `<Link to="/server/$serverId" params=…>` instead of `onClick={navigate}`.
   - `AccountMenu`'s Admin entry becomes a `<Link>`, not an `<a>`.
6. **One nav-items list.**
   - `components/layout/navItems.ts` exports `{ to, label, icon, visible?: (me) => boolean }[]`.
   - Both the desktop inline links and the mobile ☰ menu render from it, and the active state uses `<Link activeProps>` rather than `pathname ===`.
   - Admin is just an entry with `visible: me => !!me?.isAdmin`. A new top-level page is one line.

### Target file layout (frontend/src)
```
components/layout/
  AppShell.tsx           TopBar + <main><Outlet/></main>
  TopBar.tsx             leading (brand | back) · title · trailing (NavMenu, AccountMenu)
  NavMenu.tsx            inline links ≥ split, ☰ sheet below it
  navItems.ts
  BackButton.tsx
  TabNav.tsx             reusable horizontal tabs (child-route Links), scrollable on mobile
  AnimatedBackground.tsx
  usePageChrome.ts       useMatches() → merged staticData of the deepest match
components/server-list/  (renamed from sidebar/)
  ServerListPanel.tsx    composition only
  ServerListControls.tsx search + filters
  ServerListFooter.tsx   last updated / commit / source
  ServerGroup.tsx  ServerItem.tsx  FlatServerList.tsx
context/ServerListContext.tsx
context/BrowseLayoutContext.tsx
routes/_browse.tsx
routes/_browse/{index,server.$serverId,network.$networkId,inactive,global}.tsx
```
`DetailShell` becomes a plain scroll container (`h-full overflow-y-auto`), or is dropped where the page already scrolls itself.

### Mobile target (< split)
- **TopBar, `h-12` (48px), on every page:**
  - Leading: the brand icon, linking to `/`. When `staticData.back` is set, a Back button instead.
    - Back goes `history.back()` if the previous entry is inside the app.
    - Otherwise it is a `<Link>` to the list, carrying the retained search params.
  - Middle: the page title, truncated.
  - Trailing: the ☰ `NavMenu` (a sheet holding the nav items, account actions and the commit/source footer) and the avatar.
- **Stats summary:** moves out of the top bar into one compact line in the list panel header. The second mobile row is removed. On desktop it can stay in the bar.
- **List controls:** one row, with Search plus a **Filters** button that opens a popover holding Group, Hide inactive and Sort. At wider widths the three controls stay inline as today.
- **Footer:** last-updated/commit/source shows on desktop only. On mobile it lives in the ☰ sheet.
- **Result:** about 96px of chrome above the list (48 bar + 48 search row) instead of about 210px. Detail pages have 48px.

---

## N1: Route split, no visual change
- **Routes:**
  - Add `routes/_browse.tsx` and move the five pages under `routes/_browse/`.
  - The `fetchServers` loader moves from `__root.tsx` to `_browse.tsx`.
  - `routeTree.gen.ts` regenerates.
- **Contexts:** split `SidebarContext` into `ServerListContext` (data) and `BrowseLayoutContext` (collapse, `showMasterPanel` and `expandedGroups` for now). `pageTitle` stays temporarily at root, as a tiny context, until N2.
- **Root:** keeps `NavBar` for now. `NavBar` can't read server totals outside `_browse` any more, so the stats summary moves into the list panel header in this phase.
- **Verify:** every URL renders as before, desktop and mobile, and `bun run build` is clean.

## N2: Chrome from routes
- **Typing and reading:** the `staticData` typing in `router.tsx`, and `usePageChrome.ts`.
- **New components:** `TopBar`, `NavMenu` and `navItems` (desktop: inline links; mobile: the ☰ sheet, reusing `AccountMenu`'s click-outside and Escape handling). Delete `NavBar.tsx` and the `pageTitle` channel.
- **Titles:** per-route `staticData.title` and `head()` titles. Server and network titles come from loader data.
- **Links:** `<Link>` in `ServerGroup` and `ServerItem`.
- **Verify:** titles are correct in the SSR HTML (curl the page), and middle-click on a server opens a new tab.

## N3: List prefs in the URL
- **`_browse` search:** `validateSearch`, `retainSearchParams` and `stripSearchParams` on `_browse`.
- **`useServerList.ts`:** reads search params.
- **Search box:** writes with a debounced `replace` navigate.
- **Loader:** `staleTime`/`shouldReload` on the `_browse` loader.
- **Verify:**
  - On mobile, set a search, sort and Ungroup, open a server, go back: everything is kept.
  - Reload: everything is kept.
  - With default prefs `/` has no query string.
  - Changing a filter makes no `/api/servers` request.

## N4: Mobile compaction
- **Breakpoint:** the `split` token in `index.css`.
- **Layout:** the CSS-driven list/detail swap in `_browse.tsx`. Remove `isMobile`/`showMasterPanel` from layout, and move `useResponsive` to `useMediaQuery` (charts only).
- **TopBar:** 48px.
- **List controls:** `ServerListControls` with the Filters popover. `ServerListFooter` is desktop-only.
- **Verify:** at 390×844 the list starts about 96px from the top, and the SSR HTML is already in the mobile layout (no flash on a throttled load).

## N5: Hand-off to F3
- **`TabNav.tsx`:** a horizontal list of `<Link>`s to child routes, with `activeProps`, overflow-x scroll on mobile.
- **The admin layout pattern**, which F3 implements:
  - `routes/admin.tsx`: `staticData: { title: 'Admin' }`, rendering `<TabNav/>` + `<Outlet/>`.
  - Tabs are child routes (`admin/owners.tsx`, and later `admin/images.tsx` …), so each tab has its own URL.
  - **Guard:** auth is not SSR'd (`AuthContext` loads `/me` on the client), so the layout shows a spinner while `loading` and `<Navigate to="/">` when `!me?.isAdmin`. The API enforces `requireAdmin` anyway.
  - `navItems` gains the Admin entry. `AccountMenu`'s link already exists.
- **Verify:** `/admin` renders with no server list and makes no `/api/servers` request.

---

## Reuse (don't rewrite)
- `AccountMenu.tsx`: the dropdown, with click-outside, Escape and `role="menu"`. Generalise it into the ☰ sheet.
- `ServerStatsSummary.tsx`, `SearchBar.tsx`, `SortDropdown.tsx`, `ToggleButton.tsx`, `Tooltip.tsx`, `LoadingSpinner.tsx`.
- `useServerList.ts`'s sort/filter maths: only its state source changes.
- `useApi.ts` polling. `fetchServers` stays the SSR loader.
- The `index.css` `@theme` tokens and `@utility` classes. No component library is added.

## Delegation
Same as the feature plan: Opus writes a tight spec per phase, a Sonnet worker implements it on its own branch, and Opus reviews the diff. N1 and N3 get the closest review, because route moves and search middlewares are where subtle breakage hides.

## Verification (every phase)
- `bun run typecheck` and `bun run build` (root), plus `bun run lint` in `frontend`.
- `bun run dev`, then Playwright against **:3000** at 390×844 and 1440×900:
  - Every URL renders.
  - SSR HTML has the right title and layout.
  - Back from a server keeps the list prefs (from N3).
  - The ☰ menu reaches Global, Inactive and, for an admin, Admin.
  - The document title updates per page.

## Open items
- Should `/global` leave `_browse` for full chart width? It is a file move either way.
- A top bar that hides on scroll: skipped for now. Each page scrolls inside its own container rather than the window, which makes it fiddly.
- Check `retainSearchParams`/`stripSearchParams` and `StaticDataRouteOption` against the installed `@tanstack/react-router` version before N2/N3.
