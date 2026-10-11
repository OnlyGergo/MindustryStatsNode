import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/detail/EmptyState.tsx";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  return <EmptyState title="Admin" message="Pick a section from the tabs above." />;
}
