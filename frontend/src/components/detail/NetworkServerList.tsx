import React, { useMemo, useState } from "react";
import { ServerElement } from "../../../../common/models/serverData.ts";
import { useNetworkServers } from "../../hooks/api/useNetworkServers.ts";
import { SORT_OPTIONS, SortCriteria, SortDirection } from "../../hooks/useServerList.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";
import ServerItem from "../server-list/ServerItem.tsx";

const compare = (a: number | string | null, b: number | string | null, dir: SortDirection): number => {
  // Unknown values always sink, whichever way the list is sorted.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const c = typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return dir === "desc" ? -c : c;
};

const NetworkServerList: React.FC<{ networkId: number }> = ({ networkId }) => {
  const { servers, loading, error } = useNetworkServers(networkId);
  const [criteria, setCriteria] = useState<SortCriteria>("playerCount");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const sortOption = SORT_OPTIONS.find((o) => o.key === criteria) ?? SORT_OPTIONS[0];

  const { online, offline } = useMemo(() => {
    const sorted = [...servers].sort(
      (a, b) => compare(sortOption.getValue(a), sortOption.getValue(b), direction) || a.id - b.id
    );
    return {
      online: sorted.filter((s) => s.online),
      offline: sorted.filter((s) => !s.online),
    };
  }, [servers, sortOption, direction]);

  const selectCriteria = (key: SortCriteria) => {
    if (key === criteria) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    const next = SORT_OPTIONS.find((o) => o.key === key);
    setCriteria(key);
    setDirection(next?.defaultDirection ?? "desc");
  };

  const renderRows = (list: ServerElement[]) => (
    <div className="divide-y divide-subtle border border-bd rounded overflow-hidden">
      {list.map((server) => (
        <div key={server.id} className="border border-bd">
          <ServerItem server={server} isSelected={false} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-surf border border-bd rounded p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-tx">Servers</h2>
        <div className="flex flex-wrap items-center gap-1 text-xs sm:text-sm" role="group" aria-label="Sort servers">
          <span className="text-dim mr-1">Sort:</span>
          {SORT_OPTIONS.map((option) => {
            const active = option.key === criteria;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => selectCriteria(option.key)}
                aria-pressed={active}
                title={active ? option.directionLabels[direction] : option.serverHint}
                className={`px-2 py-1 rounded border ${
                  active ? "bg-acc/12 border-bd text-tx" : "border-bd text-dim hover:text-dim"
                }`}
              >
                {option.label}
                {active && <span aria-hidden="true">{direction === "asc" ? " ▲" : " ▼"}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <LoadingSpinner showText={false} />}
      {error && <p className="text-sm text-bad">{error}</p>}

      {!loading && !error && (
        <>
          {online.length > 0 ? (
            renderRows(online)
          ) : (
            <p className="text-sm text-dim">No servers are online right now.</p>
          )}

          {offline.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-dim hover:text-tx">
                {offline.length} offline server{offline.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2">{renderRows(offline)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
};

export default NetworkServerList;
