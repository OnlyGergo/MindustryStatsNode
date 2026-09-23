import React from "react";
import ServerHistoryChart from "./ServerHistoryChart.tsx";
import MapHistoryTable from "./table/MapHistoryTable.tsx";
import MotdHistoryTable from "./table/MotdHistoryTable.tsx";
import ReviewSummary from "./ReviewSummary.tsx";
import ReviewForm from "./ReviewForm.tsx";
import ReviewList from "./ReviewList.tsx";
import { removeColors } from "../../util/mindustry.ts";
import { formatDate } from "../../util/general.ts";
import CopyButton from "../CopyButton.tsx";
import ShareButton from "../ShareButton.tsx";
import { useServerReviews } from "../../hooks/api/useServerReviews.ts";
import {
  ServerDetails,
  ServerElement,
} from "../../../../common/models/serverData.ts";
import { getModeName } from "../../../../common/Gamemode.ts";

const ServerDetail: React.FC<{ serverDataElement: ServerDetails & ServerElement }> = ({ serverDataElement }) => {
  const serverData = serverDataElement.currentData;
  const serverStatus = serverDataElement.online
    ? "Online"
    : serverDataElement.lastSeen
      ? `Offline - Last Seen ${formatDate(serverDataElement.lastSeen)}`
      : "Offline";
  
  const statusClass = serverDataElement.online
    ? "bg-status-online text-status-online border-status-online"
    : "bg-status-offline text-status-offline border-status-offline";

  const formatUptime = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const reviews = useServerReviews(serverDataElement.id);

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6 bg-surface-primary">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-4">
            <div className="flex-1 min-w-0">
              {serverData?.serverName && (
                <h1 className="text-xl sm:text-2xl font-bold text-primary mb-2 wrap-break-word">
                  {String(removeColors(serverData.serverName))}
                </h1>
              )}
              {serverData?.description && (
                <p className="text-secondary mb-4 text-sm sm:text-base wrap-break-word">
                  {String(removeColors(serverData.description))}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span
                    className={`${statusClass} text-xs sm:text-sm px-2 sm:px-3 py-1 rounded border backdrop-blur-sm`}
                  >
                    {serverStatus}
                  </span>
                  {serverDataElement.online && serverData && (
                    <>
                      <span className="text-xs sm:text-sm text-tertiary">
                        {serverData.players}/{serverData.playerLimit} players
                      </span>
                      <span className="text-xs sm:text-sm text-tertiary">
                        {serverData.ping}ms
                      </span>
                    </>
                  )}
                </div>
                <CopyButton
                  text={`${serverDataElement.host}:${serverDataElement.port}`}
                  className="button-secondary text-xs sm:text-sm px-2 sm:px-3 py-1"
                />
                <ShareButton
                  serverId={serverDataElement.id}
                  className="button-accent text-xs sm:text-sm px-2 sm:px-3 py-1"
                />
              </div>
            </div>

            {serverDataElement.online && serverData && (
              <div className="text-left sm:text-right shrink-0">
                <div className="text-3xl sm:text-4xl font-bold text-accent">
                  {String(serverData.players)}
                </div>
                <div className="text-xs sm:text-sm text-tertiary">
                  players online
                </div>
              </div>
            )}
          </div>

          {serverData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
              <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded">
                <span className="text-tertiary">Map: </span>
                <span className="font-medium text-primary wrap-break-word">
                  {String(removeColors(serverData.mapName)) || "Unknown"}
                </span>
              </div>
              <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded">
                <span className="text-tertiary">Wave: </span>
                <span className="font-medium text-primary">
                  {serverData.wave || "0"}
                </span>
              </div>
              <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded">
                <span className="text-tertiary">Mode: </span>
                <span className="font-medium text-primary wrap-break-word">
                  {String(removeColors(serverData.modeName)) ||
                    getModeName(serverData.modeName, serverData.mode)}
                </span>
              </div>
              <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded">
                <span className="text-tertiary">Version: </span>
                <span className="font-medium text-primary">
                  {String(serverData.versionType) || ""}{" "}
                  {String(serverData.version) || ""}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Player Peaks and Uptime */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <div className="bg-surface-secondary border border-subtle p-4 sm:p-6 rounded">
            <h4 className="font-medium mb-3 sm:mb-4 text-accent text-base sm:text-lg">
              Player Peaks
            </h4>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-accent">
                  {serverDataElement?.playerPeaks?.daily ?? "-"}
                </div>
                <div className="text-xs sm:text-sm text-tertiary">Today</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-accent">
                  {serverDataElement?.playerPeaks?.weekly ?? "-"}
                </div>
                <div className="text-xs sm:text-sm text-tertiary">
                  This Week
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-accent">
                  {serverDataElement?.playerPeaks?.allTime ?? "-"}
                </div>
                <div className="text-xs sm:text-sm text-tertiary">All Time</div>
              </div>
            </div>
          </div>

          <div className="bg-surface-secondary border border-subtle p-4 sm:p-6 rounded">
            <h4 className="font-medium mb-3 sm:mb-4 text-status-online text-base sm:text-lg">
              Server Uptime
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-status-online">
                  {serverDataElement?.uptime?.last24h !== undefined ? formatUptime(serverDataElement.uptime.last24h) : "-"}
                </div>
                <div className="text-xs sm:text-sm text-tertiary">Last 24h</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-status-online">
                  {serverDataElement?.uptime?.last7d !== undefined ? formatUptime(serverDataElement.uptime.last7d) : "-"}
                </div>
                <div className="text-xs sm:text-sm text-tertiary">
                  Last 7 Days
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Player History Chart */}
        <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">
            Player History
          </h2>
          <div className="h-64 sm:h-96">
            <ServerHistoryChart {...serverDataElement} />
          </div>
        </div>

        {/* Reviews */}
        <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">
            Reviews
          </h2>
          <div className="mb-4 sm:mb-6">
            <ReviewSummary summary={reviews.summary} loading={reviews.summaryLoading} />
          </div>
          <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-subtle">
            <ReviewForm
              serverId={serverDataElement.id}
              mine={reviews.mine}
              mineLoading={reviews.mineLoading}
              onChanged={reviews.reload}
            />
          </div>
          <ReviewList
            reviews={reviews.reviews}
            total={reviews.total}
            page={reviews.page}
            perPage={reviews.perPage}
            sort={reviews.sort}
            loading={reviews.listLoading}
            onSortChange={reviews.setSort}
            onPageChange={reviews.setPage}
          />
        </div>

        {/* Map History Table */}
        <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">
            Map History
          </h2>
          <MapHistoryTable mapHistory={serverDataElement?.allMaps ?? []} />
        </div>

        {/* MOTD History Table */}
        <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">
            MOTD History
          </h2>
          <MotdHistoryTable motdHistory={serverDataElement?.allMotds ?? []} />
        </div>
      </div>
    </div>
  );
};

export default ServerDetail;