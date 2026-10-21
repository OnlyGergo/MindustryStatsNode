import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../../util/api.ts";
import { stripMindustry } from "../../util/mindustryText.ts";
import { MindustryText } from "../MindustryText.tsx";
import type { MergedFamily, MergeFamily, MergeReason, MergeSuggestion } from "../../../../common/models/admin.ts";

/** Filter chips, in display order. `same_day` is on by default: a handover, not a reuse months later. */
const REASONS: { reason: MergeReason; label: string }[] = [
  { reason: "same_day", label: "Same-day overlap" },
  { reason: "same_name", label: "Same name" },
  { reason: "same_motd", label: "Same MOTD" },
  { reason: "same_host", label: "Same host" },
  { reason: "disjoint", label: "Never online together" },
];
const REASON_LABELS = Object.fromEntries(REASONS.map((r) => [r.reason, r.label])) as Record<MergeReason, string>;
const DEFAULT_FILTERS: MergeReason[] = ["same_day"];

/** Suggestions rendered per "Show more", so a phone isn't laying out 2000 cards at once. */
const PAGE_SIZE = 30;
/** Results shown under a picker's search box. */
const PICKER_RESULTS = 8;

type Tab = "suggestions" | "manual" | "merged";

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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const formatDuration = (ms: number): string => {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / DAY)} days`;
};

/** How the newer family's first sighting sits against the older one's last: "3 h gap" / "5 h overlap". */
const handoverText = (s: MergeSuggestion): string | null => {
  if (s.source.firstSeen == null || s.target.lastSeen == null) return null;
  const d = s.source.firstSeen - s.target.lastSeen;
  return d >= 0 ? `${formatDuration(d)} gap` : `${formatDuration(-d)} overlap`;
};

/** Accepts a bare id or a pasted server URL (".../server/12"). */
const parseServerId = (text: string): number | null => {
  const raw = /\bserver\/(\d+)/.exec(text)?.[1] ?? text.trim();
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id >= 1 && id <= 2_147_483_647 ? id : null;
};

/** Lowercased plain text a family is searched by: id, name, description and address. */
const haystackOf = (f: { id: number; name: string | null; description: string | null }, extra = ""): string =>
  `#${f.id} ${stripMindustry(f.name ?? "")} ${stripMindustry(f.description ?? "")} ${extra}`.toLowerCase();

/** Every whitespace-separated term has to appear somewhere. */
const matchesTerms = (haystack: string, terms: string[]) => terms.every((t) => haystack.includes(t));
const termsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

const ServerName: React.FC<{ name: string | null }> = ({ name }) =>
  name ? <MindustryText text={name} /> : <span className="text-tertiary">(no name)</span>;

const Description: React.FC<{ text: string | null }> = ({ text }) =>
  text && stripMindustry(text).trim() ? (
    <div className="text-xs text-secondary line-clamp-3 break-words">
      <MindustryText text={text} />
    </div>
  ) : (
    <div className="text-xs text-tertiary italic">No description</div>
  );

const FamilyCard: React.FC<{ family: MergeFamily; label?: string; action?: React.ReactNode }> = ({ family, label, action }) => (
  <div className="flex-1 min-w-0 border border-subtle rounded p-2 bg-surface-primary flex flex-col gap-1">
    {(label || action) && (
      <div className="flex items-center justify-between gap-2">
        {label && <div className="text-xs text-tertiary">{label}</div>}
        {action}
      </div>
    )}
    <Link
      to="/server/$serverId"
      params={{ serverId: String(family.id) }}
      target="_blank"
      className="block text-sm text-primary truncate hover:underline"
    >
      <ServerName name={family.name} />
    </Link>
    <Description text={family.description} />
    <div className="text-xs text-secondary font-mono break-all">#{family.id} · {family.host}:{family.port}</div>
    <div className="text-xs text-tertiary">
      {formatDate(family.firstSeen)} → {formatDate(family.lastSeen)}
      {family.memberCount > 1 && ` · ${family.memberCount} members`}
    </div>
  </div>
);

/**
 * The older and newer family of a pair. Desktop reads left to right, oldest to
 * newest; on a phone the stack is reversed so the newest sits on top and the
 * older one it folds into below it.
 */
const PairView: React.FC<{ older: MergeFamily; newer: MergeFamily; olderLabel: string; newerLabel: string }> = ({
  older,
  newer,
  olderLabel,
  newerLabel,
}) => (
  <div className="flex flex-col-reverse sm:flex-row gap-1 sm:gap-2 items-stretch">
    <FamilyCard family={older} label={olderLabel} />
    <div className="self-center text-tertiary text-lg leading-none" aria-hidden>
      <span className="sm:hidden">↓</span>
      <span className="hidden sm:inline">←</span>
    </div>
    <FamilyCard family={newer} label={newerLabel} />
  </div>
);

const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder, disabled, autoFocus }) => (
  <div className="relative">
    <input
      type="search"
      enterKeyHint="search"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      className="w-full bg-surface-tertiary border border-subtle rounded px-3 py-2 pr-9 text-base sm:text-sm text-primary focus:outline-none focus:border-accent [&::-webkit-search-cancel-button]:appearance-none"
    />
    {value && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange("")}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 text-tertiary hover:text-primary"
      >
        ✕
      </button>
    )}
  </div>
);

/** Searches every family client side; a pasted id or /server/<id> URL jumps straight to it. */
const FamilyPicker: React.FC<{
  label: string;
  families: MergeFamily[] | null;
  haystacks: Map<number, string>;
  selected: MergeFamily | null;
  onSelect: (f: MergeFamily | null) => void;
  disabled: boolean;
}> = ({ label, families, haystacks, selected, onSelect, disabled }) => {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const results = useMemo(() => {
    if (!families || !deferred.trim()) return [];
    const id = parseServerId(deferred);
    const exact = id == null ? undefined : families.find((f) => f.id === id);
    if (exact) return [exact];
    const terms = termsOf(deferred);
    const out: MergeFamily[] = [];
    for (const f of families) {
      if (matchesTerms(haystacks.get(f.id) ?? "", terms)) out.push(f);
      if (out.length >= PICKER_RESULTS) break;
    }
    return out;
  }, [families, haystacks, deferred]);

  if (selected) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <FamilyCard
          family={selected}
          label={label}
          action={
            <button type="button" className="button-secondary text-xs px-3 py-1" disabled={disabled} onClick={() => onSelect(null)}>
              Change
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1 text-sm text-secondary">
      <span>{label}</span>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={families ? "Name, MOTD, host, id or URL" : "Loading servers…"}
        disabled={disabled || !families}
      />
      {deferred.trim() && families && (
        <ul className="flex flex-col border border-subtle rounded divide-y divide-border-subtle max-h-96 overflow-y-auto overscroll-contain">
          {results.length === 0 && <li className="p-3 text-xs text-tertiary">No servers match.</li>}
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="w-full text-left p-2 sm:p-2 min-h-11 hover:bg-surface-tertiary flex flex-col gap-0.5"
                onClick={() => {
                  onSelect(f);
                  setQuery("");
                }}
              >
                <span className="text-sm text-primary truncate">
                  <ServerName name={f.name} />
                </span>
                <span className="text-xs text-secondary font-mono break-all">
                  #{f.id} · {f.host}:{f.port}
                </span>
                <span className="text-xs text-tertiary">
                  {formatDate(f.firstSeen)} → {formatDate(f.lastSeen)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type ApiResult = { error: { value: unknown } | null; status: number };

const MergesAdmin: React.FC = () => {
  const [tab, setTab] = useState<Tab>("suggestions");
  const [suggestions, setSuggestions] = useState<MergeSuggestion[] | null>(null);
  const [merged, setMerged] = useState<MergedFamily[] | null>(null);
  const [families, setFamilies] = useState<MergeFamily[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filters, setFilters] = useState<Set<MergeReason>>(() => new Set(DEFAULT_FILTERS));
  const [shown, setShown] = useState(PAGE_SIZE);

  const [manualSource, setManualSource] = useState<MergeFamily | null>(null);
  const [manualTarget, setManualTarget] = useState<MergeFamily | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [s, m, f] = await Promise.all([
      api.api.admin["merge-suggestions"].get(),
      api.api.admin["merged-families"].get(),
      api.api.admin.families.get(),
    ]);
    if (s.error) return setLoadError(errorMessageFor(s.status, s.error.value));
    if (m.error) return setLoadError(errorMessageFor(m.status, m.error.value));
    if (f.error) return setLoadError(errorMessageFor(f.status, f.error.value));
    setSuggestions(s.data as MergeSuggestion[]);
    setMerged(m.data as MergedFamily[]);
    setFamilies(f.data as MergeFamily[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A new search or filter starts from the top of the list again.
  useEffect(() => setShown(PAGE_SIZE), [deferredQuery, filters]);

  const familyHaystacks = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of families ?? []) map.set(f.id, haystackOf(f, `${f.host}:${f.port}`));
    return map;
  }, [families]);

  const terms = useMemo(() => termsOf(deferredQuery), [deferredQuery]);

  /** Counts per tag over the search results, so each chip says what turning it on leaves. */
  const { visibleSuggestions, searchedCount, reasonCounts } = useMemo(() => {
    const searched = (suggestions ?? []).filter(
      (s) =>
        terms.length === 0 ||
        matchesTerms(
          haystackOf(s.source, `${s.source.host}:${s.source.port}`) + " " + haystackOf(s.target, `${s.target.host}:${s.target.port}`),
          terms,
        ),
    );
    const counts = Object.fromEntries(REASONS.map((r) => [r.reason, 0])) as Record<MergeReason, number>;
    for (const s of searched) for (const r of s.reasons) counts[r]++;
    const visible = searched.filter((s) => [...filters].every((r) => s.reasons.includes(r)));
    return { visibleSuggestions: visible, searchedCount: searched.length, reasonCounts: counts };
  }, [suggestions, terms, filters]);

  const visibleMerged = useMemo(
    () =>
      (merged ?? []).filter(
        (family) =>
          terms.length === 0 ||
          matchesTerms(haystackOf(family, family.members.map((m) => `#${m.id} ${m.host}:${m.port}`).join(" ")), terms),
      ),
    [merged, terms],
  );

  const toggleFilter = (reason: MergeReason) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });

  /** Runs one write, reports its outcome, and reloads every list. */
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

  // The manual pair, ordered like a suggestion: the older one keeps the root either way.
  const manualPair = useMemo(() => {
    if (!manualSource || !manualTarget || manualSource.id === manualTarget.id) return null;
    const sourceIsOlder = (manualSource.firstSeen ?? Infinity) < (manualTarget.firstSeen ?? Infinity);
    return sourceIsOlder ? { older: manualSource, newer: manualTarget } : { older: manualTarget, newer: manualSource };
  }, [manualSource, manualTarget]);
  const sameFamily = !!manualSource && !!manualTarget && manualSource.id === manualTarget.id;

  const handleManualMerge = async () => {
    if (!manualPair) return;
    if (await merge(manualPair.newer, manualPair.older)) {
      setManualSource(null);
      setManualTarget(null);
    }
  };

  const tabs: { id: Tab; label: string; count: number | null }[] = [
    { id: "suggestions", label: "Suggestions", count: suggestions ? visibleSuggestions.length : null },
    { id: "manual", label: "Manual", count: null },
    { id: "merged", label: "Merged", count: merged ? visibleMerged.length : null },
  ];

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-4xl">
      <p className="text-xs sm:text-sm text-secondary">
        Merging folds two server families into one. Stats stay on their original rows and are combined when read, so a
        merge is undone by detaching the member again. The older family always keeps its id.
      </p>

      {message && (
        <div className={`text-sm ${message.kind === "ok" ? "text-status-online" : "text-status-offline"}`} role="status">
          {message.text}
        </div>
      )}
      {loadError && <div className="text-sm text-status-offline">{loadError}</div>}

      <div className="sticky top-0 z-10 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-surface-primary flex flex-col gap-2 border-b border-subtle">
        <div className="grid grid-cols-3 gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${tab === t.id ? "button-accent" : "button-secondary"} text-sm px-2 py-1.5 sm:py-2 leading-tight`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {/* Own line on a phone, so "Suggestions" never truncates. */}
              {t.count != null && <span className="block sm:inline text-xs sm:text-sm opacity-75"> ({t.count})</span>}
            </button>
          ))}
        </div>
        {tab !== "manual" && (
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, MOTD, host or id" />
        )}
        {tab === "suggestions" && (
          <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
            {REASONS.map(({ reason, label }) => {
              const on = filters.has(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={on}
                  className={`${on ? "button-accent" : "button-secondary"} shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-full`}
                  onClick={() => toggleFilter(reason)}
                >
                  {on && "✓ "}
                  {label}
                  <span className="opacity-75"> {reasonCounts[reason]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {tab === "suggestions" && (
        <section className="flex flex-col gap-2">
          <p className="text-xs text-tertiary">
            Same name, or a shared host or MOTD with the timing to back it. Every selected tag must match.
            {suggestions && ` Showing ${visibleSuggestions.length} of ${searchedCount}${terms.length ? " matching" : ""}.`}
          </p>
          {suggestions === null && !loadError && <div className="text-secondary text-sm">Loading…</div>}
          {suggestions && visibleSuggestions.length === 0 && (
            <div className="text-secondary text-sm">
              Nothing matches.
              {filters.size > 0 && (
                <button type="button" className="ml-2 underline" onClick={() => setFilters(new Set())}>
                  Clear tag filters
                </button>
              )}
            </div>
          )}
          {visibleSuggestions.slice(0, shown).map((s) => {
            const handover = handoverText(s);
            return (
              <div key={`${s.source.id}-${s.target.id}`} className="border border-subtle rounded p-3 bg-surface-secondary flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {s.reasons.map((r) => (
                    <span
                      key={r}
                      className={`px-1.5 py-0.5 rounded ${filters.has(r) ? "bg-accent-muted text-accent" : "bg-surface-tertiary text-secondary"}`}
                    >
                      {REASON_LABELS[r]}
                    </span>
                  ))}
                  {handover && <span className="text-tertiary">{handover}</span>}
                  <span className="text-tertiary ml-auto">score {s.score}</span>
                </div>
                <PairView older={s.target} newer={s.source} olderLabel="Into (older, keeps id)" newerLabel="Merge (newer)" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="button-accent text-sm px-4 py-2 sm:py-1 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => void merge(s.source, s.target)}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    className="button-secondary text-sm px-4 py-2 sm:py-1 flex-1 sm:flex-none"
                    disabled={busy}
                    onClick={() => void dismiss(s)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
          {visibleSuggestions.length > shown && (
            <button type="button" className="button-secondary text-sm px-4 py-2" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              Show more ({visibleSuggestions.length - shown} left)
            </button>
          )}
        </section>
      )}

      {tab === "manual" && (
        <section className="border border-subtle rounded p-3 sm:p-4 bg-surface-secondary flex flex-col gap-3">
          <p className="text-xs text-tertiary">
            Search every tracked server by name, MOTD, host or id, or paste a /server/… URL. The order you pick them in
            doesn't matter: the older one keeps its id.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <FamilyPicker
              label="Server A"
              families={families}
              haystacks={familyHaystacks}
              selected={manualSource}
              onSelect={setManualSource}
              disabled={busy}
            />
            <FamilyPicker
              label="Server B"
              families={families}
              haystacks={familyHaystacks}
              selected={manualTarget}
              onSelect={setManualTarget}
              disabled={busy}
            />
          </div>
          {sameFamily && <div className="text-sm text-status-offline">Those are already the same server.</div>}
          {manualPair && (
            <div className="flex flex-col gap-2 border-t border-subtle pt-3">
              <div className="text-xs text-tertiary">Result</div>
              <PairView older={manualPair.older} newer={manualPair.newer} olderLabel="Into (older, keeps id)" newerLabel="Merge (newer)" />
            </div>
          )}
          <div>
            <button
              type="button"
              className="button-accent text-sm px-4 py-2 sm:py-1 w-full sm:w-auto"
              disabled={busy || !manualPair}
              onClick={() => void handleManualMerge()}
            >
              Merge
            </button>
          </div>
        </section>
      )}

      {tab === "merged" && (
        <section className="flex flex-col gap-2">
          {merged === null && !loadError && <div className="text-secondary text-sm">Loading…</div>}
          {merged?.length === 0 && <div className="text-secondary text-sm">Nothing is merged yet.</div>}
          {merged && merged.length > 0 && visibleMerged.length === 0 && <div className="text-secondary text-sm">Nothing matches.</div>}
          {visibleMerged.map((family) => (
            <div key={family.id} className="border border-subtle rounded p-3 bg-surface-secondary flex flex-col gap-2">
              <Link to="/server/$serverId" params={{ serverId: String(family.id) }} className="text-sm text-primary hover:underline">
                <ServerName name={family.name} /> <span className="text-tertiary font-mono">#{family.id}</span>
              </Link>
              <Description text={family.description} />
              {/* Members come oldest first: desktop keeps that, a phone puts the newest on top. */}
              <ul className="flex flex-col-reverse sm:flex-col">
                {family.members.map((m) => (
                  <li key={m.id} className="border-t border-subtle py-2 flex items-center gap-2 text-xs text-secondary">
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
                      <span className="font-mono whitespace-nowrap sm:w-28">
                        #{m.id}
                        {m.isRoot && <span className="ml-1 text-tertiary">(root)</span>}
                      </span>
                      <span className="font-mono break-all sm:flex-1">
                        {m.host}:{m.port}
                        {m.retiredAt != null && <span className="ml-1 text-tertiary">(retired)</span>}
                      </span>
                      <span className="text-tertiary whitespace-nowrap">
                        {formatDate(m.createdAt)} → {formatDate(m.lastSeen)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button-secondary px-3 py-2 sm:py-0.5 shrink-0"
                      disabled={busy}
                      onClick={() => detach(family.id, m.id)}
                    >
                      Detach
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default MergesAdmin;
