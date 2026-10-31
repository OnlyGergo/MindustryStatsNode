import { createFileRoute } from "@tanstack/react-router";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import LeaderboardPage from "../../components/leaderboard/LeaderboardPage.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { docTitle } from "../../util/pageTitle.ts";
import { LEADERBOARD_WINDOWS } from "../../../../common/models/leaderboard.ts";
import type { LeaderboardReport, LeaderboardWindow } from "../../../../common/models/leaderboard.ts";

type LeaderboardLoad =
  | { status: "ok"; report: LeaderboardReport }
  | { status: "building" }
  | { status: "error"; error: string };

async function loadLeaderboard(): Promise<LeaderboardLoad> {
  try {
    const r = await fetch(`${getBaseUrl()}/api/leaderboard`);
    if (r.status === 503) return { status: "building" };
    if (!r.ok) return { status: "error", error: `Unable to fetch the leaderboard (${r.status})` };
    return { status: "ok", report: (await r.json()) as LeaderboardReport };
  } catch (err) {
    console.error("Error fetching leaderboard in loader:", err);
    return { status: "error", error: (err as Error)?.message ?? "Unknown error" };
  }
}

export const Route = createFileRoute("/_browse/leaderboard")({
  staticData: { title: "Leaderboard", back: true },
  head: () => ({ meta: [{ title: docTitle("Leaderboard") }] }),
  // Optional on input so links elsewhere need not pass it. Returns only this
  // route's param: the parent's validated search is merged in by the router.
  validateSearch: (input: { w?: unknown } & SearchSchemaInput): { w: LeaderboardWindow } => ({
    w: LEADERBOARD_WINDOWS.includes(input.w as LeaderboardWindow) ? (input.w as LeaderboardWindow) : "24h",
  }),
  component: LeaderboardComponent,
  pendingComponent: () => (
    <DetailShell>
      <LoadingSpinner showText={false} />
    </DetailShell>
  ),
  // All three windows are in one response: the tab (search param) only selects
  // one client-side, so a search change must never refetch.
  shouldReload: ({ cause }) => (cause === "stay" ? false : undefined),
  loader: loadLeaderboard,
});

function LeaderboardComponent() {
  const data = Route.useLoaderData();
  const { w } = Route.useSearch();
  return (
    <DetailShell>
      {data.status === "ok" ? (
        <LeaderboardPage report={data.report} window={w} />
      ) : data.status === "building" ? (
        <EmptyState
          title="Leaderboard is warming up"
          message="The first report is being built, check back in a minute."
        />
      ) : (
        <EmptyState title="Unexpected Error" message="Something went wrong while fetching the data" error={data.error} />
      )}
    </DetailShell>
  );
}
