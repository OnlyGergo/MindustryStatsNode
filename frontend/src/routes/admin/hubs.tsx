import { createFileRoute } from "@tanstack/react-router";
import HubsAdmin from "../../components/admin/HubsAdmin.tsx";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/admin/hubs")({
  staticData: { title: "Hubs" },
  head: () => ({ meta: [{ title: docTitle("Hubs") }] }),
  component: HubsAdmin,
});
