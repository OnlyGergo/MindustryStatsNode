import React, { useMemo, useState } from "react";
import { removeColors } from "../../../util/mindustry.ts";
import { ServerMapData } from "../../../../../common/models/serverData.ts";
import { formatDateTimeHuman } from "../../../util/general.ts";
import { LoadingSpinner } from "../../LoadingSpinner.tsx";
import { getModeName } from "../../../../../common/Gamemode.ts";

const ITEMS_PER_PAGE = 10;

const MapHistoryTable: React.FC<{ mapHistory: ServerMapData[]; loading?: boolean; error?: string | null }> = ({
  mapHistory,
  loading = false,
  error = null,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const sortedHistory = useMemo(() => {
    if (!mapHistory || mapHistory.length === 0) return [];
    return [...mapHistory].sort(
      (a, b) =>
        new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
    );
  }, [mapHistory]);

  const filteredHistory = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return sortedHistory.filter(
      (item) =>
        removeColors(item.mapName)
          ?.toLowerCase()
          .includes(lowerCaseSearchTerm) ||
        getModeName(item.modeName, item.gameMode)
          .toLowerCase()
          .includes(lowerCaseSearchTerm),
    );
  }, [sortedHistory, searchTerm]);

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredHistory, currentPage]);

  const hasMapChanged = (
    currentItem: ServerMapData,
    index: number,
  ): boolean => {
    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
    if (globalIndex === 0) return false;
    const prevItem = filteredHistory[globalIndex - 1];
    return (
      prevItem &&
      removeColors(currentItem.mapName) !== removeColors(prevItem.mapName)
    );
  };

  const hasModeChanged = (
    currentItem: ServerMapData,
    index: number,
  ): boolean => {
    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
    if (globalIndex === 0) return false;
    const prevItem = filteredHistory[globalIndex - 1];
    return prevItem && currentItem.gameMode !== prevItem.gameMode;
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="w-full overflow-hidden">
      <input
        type="text"
        placeholder="Search maps or gamemodes..."
        className="w-full p-2 sm:p-3 mb-3 sm:mb-4 bg-surface-secondary border border-default rounded text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent transition-all text-sm"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {paginatedHistory.length > 0 ? (
        <>
          <div className="overflow-x-auto card-base shadow-lg -mx-1 px-1">
            <table className="w-full divide-y divide-subtle">
              <thead className="bg-surface-secondary border-default">
                <tr>
                  <th
                    scope="col"
                    className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider"
                  >
                    Map Name
                  </th>
                  <th
                    scope="col"
                    className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider"
                  >
                    Mode
                  </th>
                  <th
                    scope="col"
                    className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider hidden sm:table-cell"
                  >
                    From - To
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface-primary divide-y divide-subtle">
                {paginatedHistory.map((item, index) => (
                  <tr
                    key={item.id}
                    className="hover:bg-accent-muted transition-colors border-default"
                  >
                    <td
                      className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium user-select-text ${
                        hasMapChanged(item, index)
                          ? "text-accent bg-accent-muted"
                          : "text-primary"
                      }`}
                    >
                      <div className="wrap-break-word max-w-25 sm:max-w-none">
                        {String(removeColors(item.mapName) + (hasMapChanged(item, index) ? " ●" : ""))}
                      </div>
                      <div className="text-xs text-tertiary mt-1 sm:hidden">
                        {formatDateTimeHuman(item.validFrom)}
                      </div>
                    </td>
                    <td
                      className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm user-select-text ${
                        hasModeChanged(item, index)
                          ? "text-accent bg-accent-muted"
                          : "text-secondary"
                      }`}
                    >
                      {getModeName(item.modeName, item.gameMode) + (hasModeChanged(item, index) ? " ●" : "")}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-tertiary hidden sm:table-cell user-select-text">
                      {formatDateTimeHuman(item.validFrom)} -{" "}
                      {item.validTo
                        ? formatDateTimeHuman(item.validTo)
                        : "Ongoing"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-3 gap-2">
              <div className="text-xs text-tertiary text-center sm:text-left">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredHistory.length)}{" "}
                of {filteredHistory.length}
              </div>
              <div className="flex justify-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`px-2.5 py-1 text-xs ${
                    currentPage === 1
                      ? "bg-surface-tertiary text-tertiary border border-subtle cursor-not-allowed rounded"
                      : "button-secondary"
                  }`}
                >
                  ←
                </button>
                <span className="px-2 py-1 text-xs text-tertiary">
                  {currentPage}/{totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className={`px-2.5 py-1 text-xs ${
                    currentPage === totalPages
                      ? "bg-surface-tertiary text-tertiary border border-subtle cursor-not-allowed rounded"
                      : "button-secondary"
                  }`}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      ) : loading ? (
        <div className="py-6 sm:py-8">
          <LoadingSpinner showText={false} size="small" />
        </div>
      ) : (
        <p className="text-tertiary text-center py-6 sm:py-8 text-sm">
          {error ?? "No map history available or matching your search."}
        </p>
      )}
    </div>
  );
};

export default MapHistoryTable;