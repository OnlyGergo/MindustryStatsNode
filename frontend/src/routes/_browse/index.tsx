import { createFileRoute } from "@tanstack/react-router";
import { DetailShell } from "../../components/sidebar/DetailShell";
import { EmptyState } from "../../components/detail/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/_browse/")({
  staticData: { title: "Servers" },
  head: () => ({ meta: [{ title: docTitle("Servers") }] }),
  component: IndexComponent,
  pendingComponent: () => (
      <DetailShell>
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
});

function IndexComponent() {
  return (
    <DetailShell>
      <EmptyState
        title="Select a Server or Network"
        message="Choose a server or network from the list to view detailed information"
      />
    </DetailShell>
  );
}
