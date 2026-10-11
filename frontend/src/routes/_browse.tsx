import React from "react";
import { createFileRoute, Outlet, retainSearchParams, stripSearchParams, useMatches } from "@tanstack/react-router";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { BROWSE_SEARCH_DEFAULTS, parseBrowseSearch } from "./-browseSearch.ts";
import type { BrowseSearch } from "./-browseSearch.ts";
import ServerListPanel from "../components/server-list/ServerListPanel";
import { fetchServers } from "../hooks/useApi.ts";
import { ServerListProvider } from "../context/ServerListContext.tsx";
import { BrowseLayoutProvider } from "../context/BrowseLayoutContext.tsx";
import { ApiPacker } from "../../../common/Packer.ts";
import { ServerElement } from "../../../common/models/serverData.ts";

export const Route = createFileRoute("/_browse")({
  // SSR-fetched on first load; the client hook (useApi) takes over polling afterward.
  validateSearch: (input: Partial<Record<keyof BrowseSearch, unknown>> & SearchSchemaInput): BrowseSearch =>
    parseBrowseSearch(input),
  search: {
    // Prefs follow every link inside _browse; defaults are stripped so `/` stays clean.
    middlewares: [retainSearchParams(true), stripSearchParams(BROWSE_SEARCH_DEFAULTS)],
  },
  // List prefs live in the search; changing them must never refetch /api/servers.
  staleTime: Infinity,
  shouldReload: false,
  loader: async () => {
    const data = await fetchServers();
    return { initialData: data };
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
  const initialData = ApiPacker.unpack<ServerElement>(Route.useLoaderData().initialData);

  return (
    <ServerListProvider initialData={initialData}>
      <BrowseLayoutProvider>
        <BrowseContent />
      </BrowseLayoutProvider>
    </ServerListProvider>
  );
}
