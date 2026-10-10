import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import ServerDetail from "../../components/detail/ServerDetail.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { DetailShell } from "../../components/sidebar/DetailShell.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";

export const Route = createFileRoute("/_browse/server/$serverId")({
  component: ServerComponent,
  pendingComponent: () => (
      <DetailShell title="Server Details">
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
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
});

function ServerComponent() {
  const { serverDataElement, error } = Route.useLoaderData();
  return (
    <DetailShell title="Server Details">
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
