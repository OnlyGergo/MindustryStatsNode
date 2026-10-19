import { createFileRoute } from "@tanstack/react-router";
import MergesAdmin from "../../components/admin/MergesAdmin.tsx";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/admin/merges")({
  staticData: { title: "Merges" },
  head: () => ({ meta: [{ title: docTitle("Merges") }] }),
  component: MergesAdmin,
});
