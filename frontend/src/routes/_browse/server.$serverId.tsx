import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import ServerDetail from "../../components/detail/ServerDetail.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import { docTitle } from "../../util/pageTitle.ts";
import { removeColors } from "../../util/mindustry.ts";
import { ServerDetails, ServerElement } from "../../../../common/models/serverData.ts";

type LoadedServer = ServerDetails & ServerElement;

const titleFor = (loaderData: unknown): string => {
  const server = (loaderData as { serverDataElement?: LoadedServer | null } | undefined)?.serverDataElement;
  if (!server) return "Server Details";
  return removeColors(server.currentData?.serverName ?? null) || server.name || "Server Details";
};

export const Route = createFileRoute("/_browse/server/$serverId")({
  component: ServerComponent,
  pendingComponent: () => (
      <DetailShell>
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
  // Pref changes (search params) keep the same match; only reload on entering/preloading.
  shouldReload: ({ cause }) => cause !== "stay",
  loader: async ({ params }) => {
    const { serverId } = params;

    // Check if its an int before even making an API request
    if (serverId === undefined || isNaN(parseInt(serverId))) {
      return { serverDataElement: null, error: "Invalid server ID" };
    }
    
    let serverDataElement = null;

    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/servers/${serverId}/details`);
      if (response.ok) {
        serverDataElement = await response.json();
        return { serverDataElement };
      } else {
        const errorText = await response.text();
        return { error: errorText };
      }
    } catch (err) {
      console.error("Error fetching server details in loader:", err);
      return { error: ((err as Error)?.message ?? "Unknown error") };
    }
  },
  // After `loader`: declared before it, TS can't infer the loader data type.
  staticData: { title: titleFor, back: true },
  head: ({ loaderData }) => ({ meta: [{ title: docTitle(titleFor(loaderData)) }] }),
});

function ServerComponent() {
  const { serverDataElement, error } = Route.useLoaderData();
  return (
    <DetailShell>
      {serverDataElement ? (
        <ServerDetail serverDataElement={serverDataElement} />
      ) : (
        <EmptyState
          title="Select a Server or Network"
          message="Server not found"
          error={error}
        />
      )}
    </DetailShell>
  );
}
