import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { TabNav, type TabNavItem } from "../components/layout/TabNav.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { useAuth } from "../context/AuthContext.tsx";
import { docTitle } from "../util/pageTitle.ts";

// Later features add their queues here (Images, Announcements, Reports).
const ADMIN_TABS: TabNavItem[] = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/owners", label: "Owners" },
  { to: "/admin/images", label: "Images" },
];

export const Route = createFileRoute("/admin")({
  staticData: { title: "Admin" },
  head: () => ({ meta: [{ title: docTitle("Admin") }] }),
  component: AdminLayout,
});

/**
 * Admin section layout. Deliberately outside `_browse`, so it has no server list
 * and fetches nothing from /api/servers. Auth is client-only (see AuthContext),
 * so this guard is UX only; the API enforces `requireAdmin` regardless.
 * Each tab is a child route under `routes/admin/`.
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
      <TabNav tabs={ADMIN_TABS} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
