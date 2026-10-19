import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import ServerDetail from "../../components/detail/ServerDetail.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { fetchCustomisation } from "../../util/customisation.ts";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import { docTitle } from "../../util/pageTitle.ts";
import { removeColors } from "../../util/mindustry.ts";
import { ServerDetails, ServerElement } from "../../../../common/models/serverData.ts";
import { useBodyCustomisation } from "../../hooks/useBodyCustomisations.ts";

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
  // Pref changes (search params) keep the same match, so never reload for those.
  // Otherwise defer to the stale times (undefined, not true: true forces a reload
  // and would refetch on every hover-preload and again on the click after it).
  shouldReload: ({ cause }) => (cause === "stay" ? false : undefined),
  loader: async ({ params }) => {
    const { serverId } = params;

    // Check if its an int before even making an API request
    if (serverId === undefined || isNaN(parseInt(serverId))) {
      return { serverDataElement: null, error: "Invalid server ID" };
    }
    
    let serverDataElement = null;

    try {
      const baseUrl = getBaseUrl();
      // In parallel; fetchCustomisation never throws, so it can't break the page.
      const [response, customisation] = await Promise.all([
        fetch(`${baseUrl}/api/servers/${serverId}/details`),
        fetchCustomisation(baseUrl, "servers", serverId),
      ]);
      if (response.ok) {
        serverDataElement = await response.json();
        return { serverDataElement, customisation };
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
  const { serverDataElement, customisation, error } = Route.useLoaderData();

  useBodyCustomisation({ customisation });
  
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
