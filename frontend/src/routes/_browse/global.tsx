import { createFileRoute } from "@tanstack/react-router";
import GlobalStatsChart from "../../components/global-stats/GlobalStatsChart.tsx";
import { DetailShell } from "../../components/sidebar/DetailShell.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { ApiPacker } from "../../../../common/Packer.ts";
import { GamemodeInfo } from "../../../../common/models/GlobalStatsTypes.ts";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/_browse/global")({
  staticData: { title: "Global Stats", back: true },
  head: () => ({ meta: [{ title: docTitle("Global Stats") }] }),
  component: GlobalComponent,
  pendingComponent: () => (
      <DetailShell>
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
  // Pref changes (search params) keep the same match; only reload on entering/preloading.
  shouldReload: ({ cause }) => cause !== "stay",
  loader: async () => {
    try {
      const baseUrl = getBaseUrl();
      const r = await fetch(`${baseUrl}/api/gamemodes`);

      if (r.ok) {
        return { gamemodes: ApiPacker.unpack<GamemodeInfo>(await r.json()) };
      }
      return { error: "Unable to fetch gamemodes" };
    } catch (err) {
      console.error("Error fetching gamemodes in loader:", err);
      return { error: (err as Error)?.message ?? "Unknown error" };
    }
  },
});

function GlobalComponent() {
  const { gamemodes, error } = Route.useLoaderData();
  return (
    <DetailShell>
      {gamemodes ? (
        <GlobalStatsChart gamemodeList={gamemodes} />
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
