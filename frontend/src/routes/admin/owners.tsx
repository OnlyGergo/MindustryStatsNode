import { createFileRoute } from "@tanstack/react-router";
import OwnersAdmin from "../../components/admin/OwnersAdmin.tsx";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/admin/owners")({
  staticData: { title: "Owners" },
  head: () => ({ meta: [{ title: docTitle("Owners") }] }),
  component: OwnersAdmin,
});
