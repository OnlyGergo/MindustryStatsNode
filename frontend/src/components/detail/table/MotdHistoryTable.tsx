import React, { useMemo, useState } from "react";
import { removeColors } from "../../../util/mindustry.ts";
import { formatDateTimeHuman } from "../../../util/general.ts";
import { LoadingSpinner } from "../../LoadingSpinner.tsx";
import { ServerMotdData } from "../../../../../common/models/serverData.ts";

const ITEMS_PER_PAGE = 10;

const MotdHistoryTable: React.FC<{ motdHistory: ServerMotdData[]; loading?: boolean; error?: string | null }> = ({
  motdHistory,
  loading = false,
  error = null,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const sortedHistory = useMemo(() => {
    if (!motdHistory || motdHistory.length === 0) return [];
    return [...motdHistory].sort(
      (a, b) =>
        new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
    );
  }, [motdHistory]);

  const filteredHistory = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return sortedHistory.filter(
      (item) =>
        removeColors(item.serverName)
          ?.toLowerCase()
          .includes(lowerCaseSearchTerm) ||
        removeColors(item.description)
          ?.toLowerCase()
          .includes(lowerCaseSearchTerm),
    );
  }, [sortedHistory, searchTerm]);

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredHistory, currentPage]);

  const hasNameChanged = (
    currentItem: ServerMotdData,
    index: number,
  ): boolean => {
    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
    if (globalIndex === 0) return false;
    const previousItem = filteredHistory[globalIndex - 1];
    return (
      previousItem &&
      removeColors(currentItem.serverName) !==
        removeColors(previousItem.serverName)
    );
  };

  const hasDescriptionChanged = (
    currentItem: ServerMotdData,
    index: number,
  ): boolean => {
    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
    if (globalIndex === 0) return false;
    const previousItem = filteredHistory[globalIndex - 1];
    return (
      previousItem &&
      removeColors(currentItem.description) !==
        removeColors(previousItem.description)
    );
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="w-full">
      <input
        type="text"
        placeholder="Search MOTD, description, or mode..."
        className="field mb-2"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {paginatedHistory.length > 0 ? (
        <>
          <div className="overflow-x-auto -mx-3">
            <table className="w-full divide-y divide-bd">
              <thead className="bg-surf border-bd">
                <tr>
                  <th
                    scope="col"
                    className="px-3 py-1.5 text-left label-caps font-normal"
                  >
                    MOTD
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-1.5 text-left label-caps font-normal hidden sm:table-cell"
                  >
                    Description
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-1.5 text-left label-caps font-normal hidden lg:table-cell"
                  >
                    From - To
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surf divide-y divide-bd">
                {paginatedHistory.map((item, index) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surf2 transition-colors"
                  >
                    <td
                      className={`px-3 py-1.5 text-xs sm:text-sm font-medium user-select-text ${
                        hasNameChanged(item, index)
                          ? "text-acc bg-acc/12"
                          : "text-tx"
                      }`}
                    >
                      <div className="wrap-break-word max-w-30 sm:max-w-none">
                        {String(removeColors(item.serverName) + (hasNameChanged(item, index) ? " ●" : ""))}
                      </div>
                      <div
                        className="text-xs text-dim mt-1 truncate max-w-30 sm:hidden"
                        title={String(removeColors(item.description))}
                      >
                        {String(removeColors(item.description))}
                      </div>
                    </td>
                    <td
                      className={`px-3 py-1.5 text-xs sm:text-sm max-w-50 truncate hidden sm:table-cell user-select-text ${
                        hasDescriptionChanged(item, index)
                          ? "text-acc bg-acc/12"
                          : "text-dim"
                      }`}
                      title={String(removeColors(item.description))}
                    >
                      {String(removeColors(item.description) + (hasDescriptionChanged(item, index) ? " ●" : ""))}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs sm:text-sm text-dim hidden lg:table-cell user-select-text">
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
              <div className="text-xs text-dim text-center sm:text-left">
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
                      ? "bg-surf2 text-dim border border-bd cursor-not-allowed rounded"
                      : "btn"
                  }`}
                >
                  ←
                </button>
                <span className="px-2 py-1 text-xs text-dim">
                  {currentPage}/{totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className={`px-2.5 py-1 text-xs ${
                    currentPage === totalPages
                      ? "bg-surf2 text-dim border border-bd cursor-not-allowed rounded"
                      : "btn"
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
        <p className="text-dim text-center py-6 sm:py-8 text-sm">
          {error ?? "No MOTD history available or matching your search."}
        </p>
      )}
    </div>
  );
};

export default MotdHistoryTable;
