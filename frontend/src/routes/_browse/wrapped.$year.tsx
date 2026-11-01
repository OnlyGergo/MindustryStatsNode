import { useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DetailShell } from "../../components/server-list/DetailShell.tsx";
import { EmptyState } from "../../components/detail/EmptyState.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import WrappedPage from "../../components/wrapped/WrappedPage.tsx";
import { getBaseUrl } from "../../util/getApi.ts";
import { docTitle } from "../../util/pageTitle.ts";
import type { WrappedReport } from "../../../../common/models/leaderboard.ts";

type WrappedLoad =
  | { status: "ok"; report: WrappedReport }
  | { status: "building" }
  | { status: "not_found" }
  | { status: "error"; error: string };

const RETRY_MS = 5000;

async function loadWrapped(year: string): Promise<WrappedLoad> {
  try {
    const r = await fetch(`${getBaseUrl()}/api/leaderboard/wrapped/${encodeURIComponent(year)}`);
    if (r.status === 503) return { status: "building" };
    if (r.status === 404 || r.status === 422) return { status: "not_found" };
    if (!r.ok) return { status: "error", error: `Unable to fetch the report (${r.status})` };
    return { status: "ok", report: (await r.json()) as WrappedReport };
  } catch (err) {
    console.error("Error fetching wrapped in loader:", err);
    return { status: "error", error: (err as Error)?.message ?? "Unknown error" };
  }
}

export const Route = createFileRoute("/_browse/wrapped/$year")({
  staticData: { title: "Wrapped", back: true },
  component: WrappedComponent,
  pendingComponent: () => (
    <DetailShell>
      <LoadingSpinner showText={false} />
    </DetailShell>
  ),
  shouldReload: ({ cause }) => (cause === "stay" ? false : undefined),
  loader: ({ params }) => loadWrapped(params.year),
  // After `loader`: declared before it, TS can't infer the loader data type.
  head: ({ params }) => ({ meta: [{ title: docTitle(`${params.year} Wrapped`) }] }),
});

function WrappedComponent() {
  const data = Route.useLoaderData();
  const { year } = Route.useParams();
  const router = useRouter();
  const building = data.status === "building";

  // Poll while the server builds the report; effects only run in the browser.
  // Only this route: a bare invalidate() marks every match invalid, which
  // overrides _browse's shouldReload and refetches the whole server list.
  useEffect(() => {
    if (!building) return;
    const id = setInterval(() => void router.invalidate({ filter: (m) => m.routeId === Route.id }), RETRY_MS);
    return () => clearInterval(id);
  }, [building, router]);

  return (
    <DetailShell>
      {data.status === "ok" ? (
        <WrappedPage report={data.report} />
      ) : data.status === "building" ? (
        <EmptyState title={`Wrapping up ${year}…`} message="This takes a moment." />
      ) : data.status === "not_found" ? (
        <EmptyState title={`No data for ${year}`} message="There is nothing recorded for that year." />
      ) : (
        <EmptyState title="Unexpected Error" message="Something went wrong while fetching the data" error={data.error} />
      )}
    </DetailShell>
  );
}
