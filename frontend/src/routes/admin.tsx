import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { TabNav } from "../components/layout/TabNav.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { useAuth } from "../context/AuthContext.tsx";
import { docTitle } from "../util/pageTitle.ts";

export const Route = createFileRoute("/admin")({
  staticData: { title: "Admin" },
  head: () => ({ meta: [{ title: docTitle("Admin") }] }),
  component: AdminLayout,
});

/**
 * Admin section layout. Deliberately outside `_browse`, so it has no server list
 * and fetches nothing from /api/servers. Auth is client-only (see AuthContext),
 * so this guard is UX only; the API enforces `requireAdmin` regardless.
 * Each tab is a child route (e.g. `admin/owners.tsx` in F3).
 */
function AdminLayout() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div className="relative flex-1 min-h-0">
        <LoadingSpinner />
      </div>
    );
  }

  if (!me?.isAdmin) {
    return <Navigate to="/" />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TabNav tabs={[{ to: "/admin", label: "Overview", exact: true }]} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
