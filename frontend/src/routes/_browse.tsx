import React from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import MasterPanel from "../components/sidebar/MasterPanel";
import { fetchServers } from "../hooks/useApi.ts";
import { ServerListProvider } from "../context/ServerListContext.tsx";
import { BrowseLayoutProvider, useBrowseLayout } from "../context/BrowseLayoutContext.tsx";
import { ApiPacker } from "../../../common/Packer.ts";
import { ServerElement } from "../../../common/models/serverData.ts";

export const Route = createFileRoute("/_browse")({
  // SSR-fetched on first load; the client hook (useApi) takes over polling afterward.
  loader: async () => {
    const data = await fetchServers();
    return { initialData: data };
  },
  component: BrowseLayout,
});

const BrowseContent: React.FC = () => {
  const { isMobile, showMasterPanel } = useBrowseLayout();

  return (
    <div className="flex-1 flex min-h-0">
      {(!isMobile || showMasterPanel) && <MasterPanel />}
      {(!isMobile || !showMasterPanel) && (
        <div className="flex-1" style={{ minWidth: 0 }}>
          <Outlet />
        </div>
      )}
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
