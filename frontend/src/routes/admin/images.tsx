import { createFileRoute } from "@tanstack/react-router";
import ImagesAdmin from "../../components/admin/ImagesAdmin.tsx";
import { docTitle } from "../../util/pageTitle.ts";

export const Route = createFileRoute("/admin/images")({
  staticData: { title: "Images" },
  head: () => ({ meta: [{ title: docTitle("Images") }] }),
  component: ImagesAdmin,
});
