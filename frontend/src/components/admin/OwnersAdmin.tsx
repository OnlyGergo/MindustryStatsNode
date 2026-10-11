import React, { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../../util/api.ts";
import type { AdminUser, OwnerEntry } from "../../../../common/models/admin.ts";

type TargetKind = "network" | "server";

/** Our routes answer `{ error }`; Elysia's own validation 422s don't, so those get generic text. */
const errorMessageFor = (httpStatus: number, value: unknown): string => {
  if (httpStatus === 401) return "You need to be logged in to do that.";
  if (httpStatus === 403) return "Only admins can do that.";
  if (httpStatus === 429) return "Too many requests — please wait a moment and try again.";
  const message = (value as { error?: unknown } | null)?.error;
  if (typeof message === "string") return message;
  return "Something went wrong. Please try again.";
};

/**
 * Accepts a bare id or a pasted page URL (".../network/5", ".../server/12").
 * A URL's own kind wins over the selected one, so pasting can't mis-target.
 */
export const parseTarget = (text: string, kind: TargetKind): { kind: TargetKind; id: number } | null => {
  const fromUrl = /\b(network|server)\/(\d+)/.exec(text);
  const raw = fromUrl ? fromUrl[2]! : text.trim();
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return null;
  return { kind: fromUrl ? (fromUrl[1] as TargetKind) : kind, id };
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const UserLabel: React.FC<{ avatarUrl: string; name: string; sub: string }> = ({ avatarUrl, name, sub }) => (
  <div className="flex items-center gap-2 min-w-0">
    <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" loading="lazy" />
    <div className="flex flex-col min-w-0">
      <span className="text-sm text-primary truncate">{name}</span>
      <span className="text-xs text-tertiary truncate">{sub}</span>
    </div>
  </div>
);

const TargetLabel: React.FC<{ target: OwnerEntry["target"] }> = ({ target }) => {
  if (target.kind === "network") {
    return (
      <Link
        to="/network/$networkId"
        params={{ networkId: String(target.networkId) }}
        className="text-accent hover:underline"
      >
        Network: {target.name ?? `#${target.networkId}`}
      </Link>
    );
  }
  return (
    <span className="flex flex-col min-w-0">
      <Link
        to="/server/$serverId"
        params={{ serverId: String(target.serverId) }}
        className="text-accent hover:underline truncate"
      >
        Server: {target.name ?? `#${target.serverId}`}
      </Link>
      {target.address && <span className="text-xs text-tertiary truncate">{target.address}</span>}
    </span>
  );
};

/** Debounced search over users who have logged in at least once. */
const UserPicker: React.FC<{
  selected: AdminUser | null;
  onSelect: (user: AdminUser | null) => void;
  disabled: boolean;
}> = ({ selected, onSelect, disabled }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.api.admin.users.get({ query: { q: term.slice(0, 64) } });
        if (!cancelled) setResults(data ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 bg-surface-tertiary border border-subtle rounded p-2">
        <UserLabel
          avatarUrl={selected.avatarUrl}
          name={selected.globalName ?? selected.username}
          sub={`@${selected.username} · ${selected.discordId}`}
        />
        <button
          type="button"
          className="button-secondary text-xs px-2 py-1"
          disabled={disabled}
          onClick={() => onSelect(null)}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={64}
        placeholder="Search by name or Discord ID"
        disabled={disabled}
        className="w-full bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary"
      />
      {q.trim() && (
        <ul className="border border-subtle rounded divide-y divide-[var(--color-border-subtle)] max-h-64 overflow-y-auto">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="w-full text-left p-2 hover:bg-surface-tertiary"
                onClick={() => {
                  onSelect(user);
                  setQ("");
                }}
              >
                <UserLabel
                  avatarUrl={user.avatarUrl}
                  name={user.globalName ?? user.username}
                  sub={`@${user.username} · ${user.discordId}`}
                />
              </button>
            </li>
          ))}
          {!searching && results.length === 0 && (
            <li className="p-2 text-sm text-tertiary">No users found. They need to have logged in once.</li>
          )}
          {searching && results.length === 0 && <li className="p-2 text-sm text-tertiary">Searching…</li>}
        </ul>
      )}
    </div>
  );
};

const AssignOwnerForm: React.FC<{ onAssigned: () => void }> = ({ onAssigned }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [kind, setKind] = useState<TargetKind>("network");
  const [targetText, setTargetText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = parseTarget(targetText, kind);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !target) return;

    setSubmitting(true);
    setError(null);
    try {
      const body =
        target.kind === "network"
          ? { userId: user.id, networkId: target.id }
          : { userId: user.id, serverId: target.id };
      const { error: apiError, status: httpStatus } = await api.api.admin.owners.post(body);
      if (apiError) {
        setError(errorMessageFor(httpStatus, apiError.value));
        return;
      }
      setTargetText("");
      onAssigned();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 bg-surface-secondary border border-subtle rounded p-3 sm:p-4"
    >
      <h2 className="text-base font-semibold text-primary">Assign an owner</h2>

      <div className="flex flex-col gap-1">
        <span className="text-xs sm:text-sm text-secondary">User</span>
        <UserPicker selected={user} onSelect={setUser} disabled={submitting} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs sm:text-sm text-secondary">Owns</span>
        <div className="flex flex-wrap gap-2">
          <select
            value={target?.kind ?? kind}
            onChange={(e) => setKind(e.target.value as TargetKind)}
            disabled={submitting}
            className="bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary"
          >
            <option value="network">Network</option>
            <option value="server">Server</option>
          </select>
          <input
            type="text"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            placeholder={`${kind === "network" ? "Network" : "Server"} ID or page URL`}
            disabled={submitting}
            className="flex-1 min-w-40 bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary"
          />
        </div>
        <span className="text-xs text-tertiary">
          A network owner manages every server in it. A server owner manages that server, including its old
          addresses.
        </span>
      </div>

      {error && <div className="text-sm text-status-offline">{error}</div>}

      <div>
        <button
          type="submit"
          className="button-accent text-xs sm:text-sm px-3 py-1.5 disabled:opacity-50"
          disabled={submitting || !user || !target}
        >
          Assign
        </button>
      </div>
    </form>
  );
};

const OwnersAdmin: React.FC = () => {
  const [owners, setOwners] = useState<OwnerEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error, status: httpStatus } = await api.api.admin.owners.get();
      if (error) {
        setLoadError(errorMessageFor(httpStatus, error.value));
        return;
      }
      setOwners(data ?? []);
      setLoadError(null);
    } catch {
      setLoadError("Could not load owners.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = async (entry: OwnerEntry) => {
    const what = entry.target.kind === "network" ? "network" : "server";
    if (!confirm(`Remove ${entry.user.name} as owner of this ${what}?`)) return;

    setRemovingId(entry.id);
    setRemoveError(null);
    try {
      const { error, status: httpStatus } = await api.api.admin.owners({ id: entry.id }).delete();
      if (error && httpStatus !== 404) {
        setRemoveError(errorMessageFor(httpStatus, error.value));
        return;
      }
      await load();
    } catch {
      setRemoveError("Something went wrong. Please try again.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-4xl">
      <AssignOwnerForm onAssigned={() => void load()} />

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-primary">
          Owners{owners ? <span className="text-tertiary font-normal"> ({owners.length})</span> : null}
        </h2>

        {loadError && <div className="text-sm text-status-offline">{loadError}</div>}
        {removeError && <div className="text-sm text-status-offline">{removeError}</div>}
        {!owners && !loadError && <div className="text-sm text-tertiary">Loading…</div>}
        {owners?.length === 0 && <div className="text-sm text-tertiary">No owners assigned yet.</div>}

        {owners && owners.length > 0 && (
          <ul className="flex flex-col gap-2">
            {owners.map((entry) => (
              <li
                key={entry.id}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 bg-surface-secondary border border-subtle rounded p-2 sm:p-3"
              >
                <UserLabel avatarUrl={entry.user.avatarUrl} name={entry.user.name} sub={entry.user.discordId} />
                <div className="flex flex-col min-w-0 text-sm">
                  <TargetLabel target={entry.target} />
                  <span className="text-xs text-tertiary">
                    {dateFormat.format(entry.createdAt)}
                    {entry.createdBy ? ` · by ${entry.createdBy.name}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="button-secondary text-xs px-2 py-1 justify-self-start sm:justify-self-end disabled:opacity-50"
                  disabled={removingId === entry.id}
                  onClick={() => void handleRemove(entry)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default OwnersAdmin;
