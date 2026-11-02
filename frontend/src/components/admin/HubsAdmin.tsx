import React, { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../../util/api.ts";
import { MindustryText } from "../MindustryText.tsx";
import { HUB_KEYWORDS } from "../../../../common/hubKeywords.ts";
import type { HubFamily, HubMatchField } from "../../../../common/models/admin.ts";

const MATCH_LABELS: Record<HubMatchField, string> = {
  name: "Name",
  description: "Description",
  map: "Map",
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

const HubCard: React.FC<{ family: HubFamily; children?: React.ReactNode }> = ({ family, children }) => (
  <div className="border border-subtle rounded p-3 bg-surface-secondary flex flex-col gap-1 min-w-0">
    {family.matches.length > 0 && (
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-tertiary">Keyword in</span>
        {family.matches.map((m) => (
          <span key={m} className="px-1.5 py-0.5 rounded bg-surface-tertiary text-secondary">{MATCH_LABELS[m]}</span>
        ))}
      </div>
    )}
    <Link
      to="/server/$serverId"
      params={{ serverId: String(family.id) }}
      target="_blank"
      className="block text-sm text-primary truncate hover:underline"
    >
      {family.name ? <MindustryText text={family.name} /> : <span className="text-tertiary">(no name)</span>}
    </Link>
    {family.description && (
      <div className="text-xs text-secondary line-clamp-2 break-words">
        <MindustryText text={family.description} />
      </div>
    )}
    <div className="text-xs text-tertiary truncate">
      <span className="font-mono">#{family.id} · {family.host}:{family.port}</span>
      {family.mapName && <> · map <MindustryText text={family.mapName} /></>}
      {" · last seen "}{formatDate(family.lastSeen)}
    </div>
    {children && <div className="flex gap-2 mt-1">{children}</div>}
  </div>
);

type ApiResult = { error: { value: unknown } | null; status: number };
type LookedUp = HubFamily & { isHub: boolean };

/** Looks up the family an id belongs to, for the manual form. */
const useHubLookup = (text: string, reloadKey: number) => {
  const [family, setFamily] = useState<LookedUp | null>(null);
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
      const { data, error: apiError, status } = await api.api.admin.hubs({ id }).get();
      if (cancelled) return;
      if (apiError) setError(errorMessageFor(status, apiError.value));
      else setFamily(data as LookedUp);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, reloadKey]);

  return { family, error };
};

const HubsAdmin: React.FC = () => {
  const [suggestions, setSuggestions] = useState<HubFamily[] | null>(null);
  const [hubs, setHubs] = useState<HubFamily[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [lookupText, setLookupText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const lookup = useHubLookup(lookupText, reloadKey);

  const load = useCallback(async () => {
    setLoadError(null);
    const [s, h] = await Promise.all([api.api.admin["hub-suggestions"].get(), api.api.admin.hubs.get()]);
    if (s.error) return setLoadError(errorMessageFor(s.status, s.error.value));
    if (h.error) return setLoadError(errorMessageFor(h.status, h.error.value));
    setSuggestions(s.data as HubFamily[]);
    setHubs(h.data as HubFamily[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one write, reports its outcome, and reloads both lists. */
  const run = async (action: () => Promise<ApiResult>, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { error, status } = await action();
      if (error) {
        setMessage({ kind: "error", text: errorMessageFor(status, error.value) });
        return;
      }
      setMessage({ kind: "ok", text: okText });
      setReloadKey((k) => k + 1);
      await load();
    } catch {
      setMessage({ kind: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const mark = (f: HubFamily) => run(() => api.api.admin.hubs({ id: f.id }).put(), `Marked #${f.id} as a hub.`);
  const unmark = (f: HubFamily) => run(() => api.api.admin.hubs({ id: f.id }).delete(), `#${f.id} is no longer a hub.`);
  const dismiss = (f: HubFamily) => run(() => api.api.admin["hub-dismissals"].post({ id: f.id }), `Dismissed #${f.id}.`);

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 max-w-4xl">
      <p className="text-sm text-secondary">
        Hubs and lobbies only forward players to other servers, so counting them would count those players twice. A hub
        stays listed but is left out of global and network player totals. It applies to the whole server family.
      </p>

      {message && (
        <div className={`text-sm ${message.kind === "ok" ? "text-status-online" : "text-status-offline"}`}>{message.text}</div>
      )}
      {loadError && <div className="text-sm text-status-offline">{loadError}</div>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-primary">Mark by id</h2>
        <div className="border border-subtle rounded p-3 sm:p-4 bg-surface-secondary flex flex-col gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Id or /server/… URL"
            value={lookupText}
            onChange={(e) => setLookupText(e.target.value)}
            disabled={busy}
            className="bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary"
          />
          {lookup.error && <span className="text-xs text-status-offline">{lookup.error}</span>}
          {lookup.family && (
            <HubCard family={lookup.family}>
              {lookup.family.isHub ? (
                <button type="button" className="button-secondary text-sm px-3 py-1" disabled={busy} onClick={() => void unmark(lookup.family!)}>
                  Unmark hub
                </button>
              ) : (
                <button type="button" className="button-accent text-sm px-3 py-1" disabled={busy} onClick={() => void mark(lookup.family!)}>
                  Mark as hub
                </button>
              )}
            </HubCard>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold text-primary">Suggestions</h2>
          <p className="text-xs text-tertiary">
            Servers with {HUB_KEYWORDS.map((k) => `“${k}”`).join(" or ")} in their name, description or current map. Most
            matches first.
          </p>
        </div>
        {suggestions === null && !loadError && <div className="text-secondary text-sm">Loading…</div>}
        {suggestions?.length === 0 && <div className="text-secondary text-sm">No suggestions right now.</div>}
        {suggestions?.map((f) => (
          <HubCard key={f.id} family={f}>
            <button type="button" className="button-accent text-sm px-3 py-1" disabled={busy} onClick={() => void mark(f)}>
              Mark as hub
            </button>
            <button type="button" className="button-secondary text-sm px-3 py-1" disabled={busy} onClick={() => void dismiss(f)}>
              Not a hub
            </button>
          </HubCard>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-primary">Marked hubs</h2>
        {hubs === null && !loadError && <div className="text-secondary text-sm">Loading…</div>}
        {hubs?.length === 0 && <div className="text-secondary text-sm">No servers are marked as hubs.</div>}
        {hubs?.map((f) => (
          <HubCard key={f.id} family={f}>
            <button type="button" className="button-secondary text-sm px-3 py-1" disabled={busy} onClick={() => void unmark(f)}>
              Unmark
            </button>
          </HubCard>
        ))}
      </section>
    </div>
  );
};

export default HubsAdmin;
