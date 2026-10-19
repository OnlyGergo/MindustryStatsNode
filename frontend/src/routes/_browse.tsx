import React from "react";
import { createFileRoute, Outlet, retainSearchParams, stripSearchParams, useMatches } from "@tanstack/react-router";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { BROWSE_SEARCH_DEFAULTS, parseBrowseSearch } from "./-browseSearch.ts";
import type { BrowseSearch } from "./-browseSearch.ts";
import ServerListPanel from "../components/server-list/ServerListPanel";
import { loadServerList } from "../hooks/useApi.ts";
import { getSiteOrigin } from "../util/getApi.ts";
import { ServerListProvider, summariseServers } from "../context/ServerListContext.tsx";
import type { ServerListSummary } from "../context/ServerListContext.tsx";
import type { ServerListItem } from "../../../common/models/serverData.ts";
import type { RouterContext } from "../router.tsx";
import { BrowseLayoutProvider } from "../context/BrowseLayoutContext.tsx";

interface BrowseLoaderData {
  initialData: ServerListItem[] | null;
  summary: ServerListSummary;
}

export const Route = createFileRoute("/_browse")({
  validateSearch: (input: Partial<Record<keyof BrowseSearch, unknown>> & SearchSchemaInput): BrowseSearch =>
    parseBrowseSearch(input),
  search: {
    // Prefs follow every link inside _browse; defaults are stripped so `/` stays clean.
    // Order matters: listed the other way round, retain re-adds the defaults strip removed.
    middlewares: [stripSearchParams(BROWSE_SEARCH_DEFAULTS), retainSearchParams(true)],
  },
  // List prefs are view state, not content: every variant points at the bare path.
  head: ({ matches }) => ({
    links: [{ rel: "canonical", href: getSiteOrigin() + (matches[matches.length - 1]?.pathname ?? "/") }],
  }),
  // List prefs live in the search; changing them must never refetch /api/servers.
  staleTime: Infinity,
  shouldReload: false,
  // On an SSR request the list goes to the per-request holder, not the loader
  // data, so it is never serialised into the page: the HTML carries only the
  // top of the list as markup (ServerListPanel) and the header counts, and the
  // client fetches the full list itself (useApi). A loader run in the browser
  // (a client navigation into _browse) just hands its list over.
  // Annotated: inferred, the context parameter makes the loader data type circular.
  loader: async ({ context }: { context: RouterContext }): Promise<BrowseLoaderData> => {
    const servers = await loadServerList();
    const summary = summariseServers(servers);
    if (typeof window === "undefined") {
      context.ssrServerList.rows = servers;
      return { initialData: null, summary };
    }
    return { initialData: servers, summary };
  },
  component: BrowseLayout,
});

// List/detail swap is pure CSS below `split`; the matched route is known during SSR,
// so server and client render the same markup. The list stays mounted either way.
const BrowseContent: React.FC = () => {
  const isIndex = useMatches({ select: (m) => m[m.length - 1]?.routeId === "/_browse/" });

  return (
    <div className="flex-1 flex min-h-0">
      <ServerListPanel mobileVisible={isIndex} />
      <div className={`flex-1 min-w-0 min-h-0 flex-col ${isIndex ? "hidden split:flex" : "flex"}`}>
        <Outlet />
      </div>
    </div>
  );
};

function BrowseLayout() {
  const { initialData, summary } = Route.useLoaderData();
  const { ssrServerList } = Route.useRouteContext();

  return (
    <ServerListProvider initialData={initialData} ssrRows={ssrServerList.rows} summary={summary}>
      <BrowseLayoutProvider>
        <BrowseContent />
      </BrowseLayoutProvider>
    </ServerListProvider>
  );
}
