import React, { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../../util/api.ts";
import { MindustryText } from "../MindustryText.tsx";
import type { MergedFamily, MergeFamily, MergeReason, MergeSuggestion } from "../../../../common/models/admin.ts";

const REASON_LABELS: Record<MergeReason, string> = {
  same_name: "Same name",
  same_host: "Same host",
};

/** Our routes answer `{ error }`; Elysia's own validation 422s don't, so those get generic text. */
const errorMessageFor = (httpStatus: number, value: unknown): string => {
  if (httpStatus === 401) return "You need to be logged in to do that.";
  if (httpStatus === 403) return "Only admins can do that.";
  if (httpStatus === 429) return "Too many requests — please wait a moment and try again.";
  const message = (value as { error?: unknown } | null)?.error;
  if (typeof message === "string") return message;
  return "Something went wrong. Please try again.";
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const formatDate = (ms: number | null) => (ms == null ? "—" : dateFormat.format(ms));

/** Accepts a bare id or a pasted server URL (".../server/12"). */
const parseServerId = (text: string): number | null => {
  const raw = /\bserver\/(\d+)/.exec(text)?.[1] ?? text.trim();
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id >= 1 && id <= 2_147_483_647 ? id : null;
};

const ServerName: React.FC<{ name: string | null }> = ({ name }) =>
  name ? <MindustryText text={name} /> : <span className="text-tertiary">(no name)</span>;

const FamilyCard: React.FC<{ family: MergeFamily; label: string }> = ({ family, label }) => (
  <div className="flex-1 min-w-0 border border-subtle rounded p-2 bg-surface-primary">
    <div className="text-xs text-tertiary">{label}</div>
    <Link
      to="/server/$serverId"
      params={{ serverId: String(family.id) }}
      target="_blank"
      className="block text-sm text-primary truncate hover:underline"
    >
      <ServerName name={family.name} />
    </Link>
    <div className="text-xs text-secondary font-mono truncate">#{family.id} · {family.host}:{family.port}</div>
    <div className="text-xs text-tertiary">
      {formatDate(family.firstSeen)} → {formatDate(family.lastSeen)}
      {family.memberCount > 1 && ` · ${family.memberCount} members`}
    </div>
  </div>
);

/** Looks up the family an id belongs to, to preview a manual merge before it runs. */
const useFamilyLookup = (text: string) => {
  const [family, setFamily] = useState<MergeFamily | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFamily(null);
    setError(null);
    if (!text.trim()) return;
    const id = parseServerId(text);
    if (id === null) {
      setError("Enter a server id or URL.");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error: apiError, status } = await api.api.admin.families({ id }).get();
      if (cancelled) return;
      if (apiError) setError(errorMessageFor(status, apiError.value));
      else setFamily(data as MergeFamily);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  return { family, error };
};

type ApiResult = { error: { value: unknown } | null; status: number };

const MergesAdmin: React.FC = () => {
  const [suggestions, setSuggestions] = useState<MergeSuggestion[] | null>(null);
  const [merged, setMerged] = useState<MergedFamily[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const source = useFamilyLookup(sourceText);
  const target = useFamilyLookup(targetText);

  const load = useCallback(async () => {
    setLoadError(null);
    const [s, m] = await Promise.all([
      api.api.admin["merge-suggestions"].get(),
      api.api.admin["merged-families"].get(),
    ]);
    if (s.error) return setLoadError(errorMessageFor(s.status, s.error.value));
    if (m.error) return setLoadError(errorMessageFor(m.status, m.error.value));
    setSuggestions(s.data as MergeSuggestion[]);
    setMerged(m.data as MergedFamily[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one write, reports its outcome, and reloads both lists. */
  const run = async (action: () => Promise<ApiResult>, okText: string): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      const { error, status } = await action();
      if (error) {
        setMessage({ kind: "error", text: errorMessageFor(status, error.value) });
        return false;
      }
      setMessage({ kind: "ok", text: okText });
      await load();
      return true;
    } catch {
      setMessage({ kind: "error", text: "Something went wrong. Please try again." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const merge = async (src: MergeFamily, tgt: MergeFamily): Promise<boolean> => {
    const ok = confirm(
      `Merge #${src.id} (${src.host}:${src.port}) into #${tgt.id} (${tgt.host}:${tgt.port})?\n\n` +
        "The older of the two keeps its id, and its network and aggregate exclusion now apply to the whole family. " +
        "This can be undone by detaching.",
    );
    if (!ok) return false;
    return run(() => api.api.admin.merges.post({ sourceId: src.id, targetId: tgt.id }), `Merged #${src.id} into #${tgt.id}.`);
  };

  const dismiss = (s: MergeSuggestion) =>
    run(() => api.api.admin["merge-dismissals"].post({ a: s.source.id, b: s.target.id }), "Suggestion dismissed.");

  const detach = (familyId: number, memberId: number) => {
    if (!confirm(`Detach #${memberId} from #${familyId}? It becomes a separate server again.`)) return;
    void run(() => api.api.admin.merges({ id: memberId }).delete(), `Detached #${memberId}.`);
  };

  const handleManualMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.family || !target.family) return;
    if (await merge(source.family, target.family)) {
      setSourceText("");
      setTargetText("");
    }
  };

  const sameFamily = !!source.family && !!target.family && source.family.id === target.family.id;

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 max-w-4xl">
      <p className="text-sm text-secondary">
        Merging folds two server families into one. Stats stay on their original rows and are combined when read, so a
        merge is undone by detaching the member again. The older family always keeps its id.
      </p>

      {message && (
        <div className={`text-sm ${message.kind === "ok" ? "text-status-online" : "text-status-offline"}`}>{message.text}</div>
      )}
      {loadError && <div className="text-sm text-status-offline">{loadError}</div>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-primary">Manual merge</h2>
        <form onSubmit={handleManualMerge} className="border border-subtle rounded p-3 sm:p-4 bg-surface-secondary flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {([
              ["Merge server", sourceText, setSourceText, source],
              ["into server", targetText, setTargetText, target],
            ] as const).map(([label, value, setValue, lookup]) => (
              <label key={label} className="flex-1 flex flex-col gap-1 text-sm text-secondary min-w-0">
                {label}
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Id or /server/… URL"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={busy}
                  className="bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary"
                />
                {lookup.family && <FamilyCard family={lookup.family} label="Family" />}
                {lookup.error && <span className="text-xs text-status-offline">{lookup.error}</span>}
              </label>
            ))}
          </div>
          {sameFamily && <div className="text-sm text-status-offline">Those are already the same server.</div>}
          <div>
            <button
              type="submit"
              className="button-accent text-sm px-3 py-1"
              disabled={busy || !source.family || !target.family || sameFamily}
            >
              Merge
            </button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary">Suggestions</h2>
          <p className="text-xs text-tertiary">Same name, or same host and never online at the same time. Strongest first.</p>
        </div>
        {suggestions === null && !loadError && <div className="text-secondary text-sm">Loading…</div>}
        {suggestions?.length === 0 && <div className="text-secondary text-sm">No suggestions right now.</div>}
        {suggestions?.map((s) => (
          <div key={`${s.source.id}-${s.target.id}`} className="border border-subtle rounded p-3 bg-surface-secondary flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {s.reasons.map((r) => (
                <span key={r} className="px-1.5 py-0.5 rounded bg-surface-tertiary text-secondary">{REASON_LABELS[r]}</span>
              ))}
              {s.disjoint && <span className="px-1.5 py-0.5 rounded bg-surface-tertiary text-secondary">Never online together</span>}
              <span className="text-tertiary">score {s.score}</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <FamilyCard family={s.source} label="Merge" />
              <FamilyCard family={s.target} label="into (older)" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="button-accent text-sm px-3 py-1" disabled={busy} onClick={() => void merge(s.source, s.target)}>
                Merge
              </button>
              <button type="button" className="button-secondary text-sm px-3 py-1" disabled={busy} onClick={() => void dismiss(s)}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-primary">Merged servers</h2>
        {merged === null && !loadError && <div className="text-secondary text-sm">Loading…</div>}
        {merged?.length === 0 && <div className="text-secondary text-sm">Nothing is merged yet.</div>}
        {merged?.map((family) => (
          <div key={family.id} className="border border-subtle rounded p-3 bg-surface-secondary">
            <Link
              to="/server/$serverId"
              params={{ serverId: String(family.id) }}
              className="text-sm text-primary hover:underline"
            >
              <ServerName name={family.name} /> <span className="text-tertiary font-mono">#{family.id}</span>
            </Link>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead className="text-tertiary text-left">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Id</th>
                    <th className="py-1 pr-3 font-normal">Address</th>
                    <th className="py-1 pr-3 font-normal">First seen</th>
                    <th className="py-1 pr-3 font-normal">Last seen</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {family.members.map((m) => (
                    <tr key={m.id} className="border-t border-subtle">
                      <td className="py-1 pr-3 font-mono whitespace-nowrap">
                        {m.id}
                        {m.isRoot && <span className="ml-1 text-tertiary">(root)</span>}
                      </td>
                      <td className="py-1 pr-3 font-mono whitespace-nowrap">
                        {m.host}:{m.port}
                        {m.retiredAt != null && <span className="ml-1 text-tertiary">(retired)</span>}
                      </td>
                      <td className="py-1 pr-3 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">{formatDate(m.lastSeen)}</td>
                      <td className="py-1 text-right">
                        <button type="button" className="button-secondary px-2 py-0.5" disabled={busy} onClick={() => detach(family.id, m.id)}>
                          Detach
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default MergesAdmin;
