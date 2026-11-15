import { createFileRoute } from "@tanstack/react-router";
import GlobalStatsChart, { DEFAULT_RANGE } from "../../components/global-stats/GlobalStatsChart.tsx";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { ApiPacker } from "../../../../common/Packer.ts";
import { GamemodeInfo } from "../../../../common/models/GlobalStatsTypes.ts";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import { docTitle } from "../../util/pageTitle.ts";
import { gamemodeHistoryUrl } from "../../hooks/api/useGamemodeHistory.ts";
import type { InitialChartData } from "../../hooks/useChartData.ts";

/**
 * The default range's history for the SSR page, so the tiles and legend are in
 * the markup and the chart draws on hydration instead of after another round
 * trip. Only on the server: a client navigation renders straight away and lets
 * the chart's own hook fetch it (in parallel with the chart chunk). Never
 * throws; a failure just leaves the chart to retry in the browser.
 */
async function loadInitialHistory(baseUrl: string): Promise<InitialChartData | null> {
  if (typeof window !== "undefined") return null;
  const url = gamemodeHistoryUrl(DEFAULT_RANGE);
  try {
    const r = await fetch(`${baseUrl}${url}`);
    return r.ok ? { url, json: await r.json(), at: Date.now() } : null;
  } catch (err) {
    console.error("Error fetching gamemode history in loader:", err);
    return null;
  }
}

async function loadGamemodes(baseUrl: string): Promise<{ gamemodes?: GamemodeInfo[]; error?: string }> {
  try {
    const r = await fetch(`${baseUrl}/api/gamemodes`);
    if (r.ok) {
      return { gamemodes: ApiPacker.unpack<GamemodeInfo>(await r.json()) };
    }
    return { error: "Unable to fetch gamemodes" };
  } catch (err) {
    console.error("Error fetching gamemodes in loader:", err);
    return { error: (err as Error)?.message ?? "Unknown error" };
  }
}

export const Route = createFileRoute("/_browse/global")({
  staticData: { title: "Global Stats", back: true },
  head: () => ({ meta: [{ title: docTitle("Global Stats") }] }),
  component: GlobalComponent,
  pendingComponent: () => (
      <DetailShell>
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
  // Pref changes (search params) keep the same match, so never reload for those.
  // Otherwise defer to the stale times (undefined, not true: true forces a reload
  // and would refetch on every hover-preload and again on the click after it).
  shouldReload: ({ cause }) => (cause === "stay" ? false : undefined),
  loader: async () => {
    const baseUrl = getBaseUrl();
    // In parallel: on SSR the page waits on both.
    const [{ gamemodes, error }, initialHistory] = await Promise.all([
      loadGamemodes(baseUrl),
      loadInitialHistory(baseUrl),
    ]);
    return { gamemodes, error, initialHistory };
  },
});

function GlobalComponent() {
  const { gamemodes, error, initialHistory } = Route.useLoaderData();
  return (
    <DetailShell>
      {gamemodes ? (
        <GlobalStatsChart gamemodeList={gamemodes} initialHistory={initialHistory} />
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
