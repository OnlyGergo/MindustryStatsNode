import { createFileRoute } from "@tanstack/react-router";
import { DetailShell } from "../../components/sidebar/DetailShell.tsx";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import NetworkDetail from "../../components/detail/NetworkDetail.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { NetworkDetails } from "../../../../common/models/serverData";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";

export const Route = createFileRoute("/_browse/network/$networkId")({
  component: NetworkComponent,
  pendingComponent: () => (
      <DetailShell title="Network Details">
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
  loader: async ({ params }) => {
    const { networkId } = params;
    try {
      const baseUrl = getBaseUrl();
      const r = await fetch(`${baseUrl}/api/networks/${networkId}/details`);
      if (r.ok) {
        const data: NetworkDetails = await r.json();
        return { details: data };
      }
      return { error: "Failed to fetch network details" };
    } catch (err) {
      console.error("Error fetching network details in loader:", err);
      return { error: ((err as Error)?.message ?? "Unknown error") };
    }
  },
});

function NetworkComponent() {
  const { details, error } = Route.useLoaderData();
  return (
      <DetailShell title="Network Details">
        {details ? (
            <NetworkDetail details={details} />
        ) : (
            <EmptyState
                title="Unexpected Error"
                message="Something went wrong while fetching the data"
                error={error}
            />
        )}
      </DetailShell>
  );
}