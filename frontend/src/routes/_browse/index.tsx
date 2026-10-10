import { createFileRoute } from "@tanstack/react-router";
import { DetailShell } from "../../components/sidebar/DetailShell";
import { EmptyState } from "../../components/detail/EmptyState";
import { LoadingSpinner } from "../../components/LoadingSpinner";

export const Route = createFileRoute("/_browse/")({
  component: IndexComponent,
  pendingComponent: () => (
      <DetailShell title="Home">
        <LoadingSpinner showText={false} />
      </DetailShell>
  ),
});

function IndexComponent() {
  return (
    <DetailShell title="Home">
      <EmptyState
        title="Select a Server or Network"
        message="Choose a server or network from the list to view detailed information"
      />
    </DetailShell>
  );
}
