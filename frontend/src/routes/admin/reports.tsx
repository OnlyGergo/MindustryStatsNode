import { createFileRoute } from "@tanstack/react-router";
import ReportsAdmin from "../../components/admin/ReportsAdmin.tsx";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/admin/reports")({
  staticData: { title: "Reports" },
  head: () => ({ meta: [{ title: docTitle("Reports") }] }),
  component: ReportsAdmin,
});
