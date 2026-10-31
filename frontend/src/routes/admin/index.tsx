import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "../../util/api.ts";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

function AdminOverview() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const rebuild = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data, error, status } = await api.api.admin.leaderboard.rebuild.post();
      if (error) {
        const message = (error.value as { error?: unknown } | null)?.error;
        setResult({
          ok: false,
          text:
            typeof message === "string"
              ? message
              : status === 403
                ? "Only admins can do that."
                : "Something went wrong. Please try again.",
        });
      } else {
        setResult({ ok: true, text: `Generated at ${timeFormat.format(data.generatedAt)}` });
      }
    } catch {
      setResult({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 flex flex-col items-start gap-2">
      <p className="text-sm text-secondary">Pick a section from the tabs above.</p>
      <button
        type="button"
        onClick={rebuild}
        disabled={busy}
        className="button-secondary text-sm px-3 py-1"
      >
        {busy ? "Rebuilding…" : "Rebuild leaderboard"}
      </button>
      {result && <div className={`text-sm ${result.ok ? "text-secondary" : "text-red-500"}`}>{result.text}</div>}
    </div>
  );
}
