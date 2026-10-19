import { createFileRoute } from "@tanstack/react-router";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import NetworkDetail from "../../components/detail/NetworkDetail.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { fetchCustomisation } from "../../util/customisation.ts";
import { NetworkDetails } from "../../../../common/models/serverData";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import { docTitle } from "../../util/pageTitle.ts";
import { useBodyCustomisation } from "../../hooks/useBodyCustomisations.ts";

const titleFor = (loaderData: unknown): string =>
  (loaderData as { details?: NetworkDetails } | undefined)?.details?.name ?? "Network Details";

export const Route = createFileRoute("/_browse/network/$networkId")({
  component: NetworkComponent,
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
    const { networkId } = params;
    try {
      const baseUrl = getBaseUrl();
      const [r, customisation] = await Promise.all([
        fetch(`${baseUrl}/api/networks/${networkId}/details`),
        fetchCustomisation(baseUrl, "networks", networkId),
      ]);
      if (r.ok) {
        const data: NetworkDetails = await r.json();
        return { details: data, customisation };
      }
      return { error: "Failed to fetch network details" };
    } catch (err) {
      console.error("Error fetching network details in loader:", err);
      return { error: ((err as Error)?.message ?? "Unknown error") };
    }
  },
  // After `loader`: declared before it, TS can't infer the loader data type.
  staticData: { title: titleFor, back: true },
  head: ({ loaderData }) => ({ meta: [{ title: docTitle(titleFor(loaderData)) }] }),
});

function NetworkComponent() {
  const { details, customisation, error } = Route.useLoaderData();
  
  useBodyCustomisation({ customisation });
  
  return (
      <DetailShell>
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