import { createFileRoute } from "@tanstack/react-router";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import NetworkDetail from "../../components/detail/NetworkDetail.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { NetworkDetails } from "../../../../common/models/serverData";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import { docTitle } from "../../util/pageTitle.ts";

const titleFor = (loaderData: unknown): string =>
  (loaderData as { details?: NetworkDetails } | undefined)?.details?.name ?? "Network Details";

export const Route = createFileRoute("/_browse/network/$networkId")({
  component: NetworkComponent,
  pendingComponent: () => (
      <DetailShell>
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
  // Pref changes (search params) keep the same match; only reload on entering/preloading.
  shouldReload: ({ cause }) => cause !== "stay",
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
  // After `loader`: declared before it, TS can't infer the loader data type.
  staticData: { title: titleFor, back: true },
  head: ({ loaderData }) => ({ meta: [{ title: docTitle(titleFor(loaderData)) }] }),
});

function NetworkComponent() {
  const { details, error } = Route.useLoaderData();
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