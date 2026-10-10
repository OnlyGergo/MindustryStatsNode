import React from "react";
import { Link } from "@tanstack/react-router";
import NetworkHistoryChart from "./NetworkHistoryChart.tsx";
import NetworkServerShare from "./NetworkServerShare.tsx";
import NetworkServerList from "./NetworkServerList.tsx";
import NetworkStatsRow from "./NetworkStatsRow.tsx";
import NetworkSources from "./NetworkSources.tsx";
import ShareButton from "../ShareButton.tsx";
import { NetworkDetails } from "../../../../common/models/serverData.ts";
import { removeColors } from "../../util/mindustry.ts";

const NetworkDetail: React.FC<{ details: NetworkDetails }> = ({ details }) => {
  const { topServer, playerPeaks } = details;
  const peakDate = playerPeaks.allTimeDate ? new Date(playerPeaks.allTimeDate).getTime() : null;

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6 bg-surface-primary">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-surface-secondary border border-subtle backdrop-blur-md rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="mb-4 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-primary mb-2 wrap-break-word">
              {String(details.name)}
            </h1>
            <p className="text-secondary mb-2 text-sm sm:text-base wrap-break-word">Network</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <ShareButton
                networkId={details.id}
                className="button-accent text-xs sm:text-sm px-2 sm:px-3 py-1"
              />
            </div>
          </div>

          <NetworkStatsRow details={details} />
          <NetworkSources sources={details.sources} />

          {topServer && (
            <div className="mt-2 sm:mt-4 bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded text-xs sm:text-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0">
                <span className="text-tertiary">Top server: </span>
                <Link
                  to="/server/$serverId"
                  params={{ serverId: String(topServer.id) }}
                  className="font-medium text-accent hover:underline wrap-break-word"
                >
                  {removeColors(topServer.name) || topServer.name}
                </Link>
              </span>
              <span className="text-primary font-medium">{topServer.players} players</span>
            </div>
          )}
        </div>

        {/* Player Peaks */}
        <div className="bg-surface-secondary border border-subtle p-4 sm:p-6 rounded mb-4 sm:mb-6">
          <h4 className="font-medium mb-3 sm:mb-4 text-accent text-base sm:text-lg">Player Peaks</h4>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-accent">{playerPeaks.daily}</div>
              <div className="text-xs sm:text-sm text-tertiary">Today</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-accent">{playerPeaks.weekly}</div>
              <div className="text-xs sm:text-sm text-tertiary">This Week</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-accent">{playerPeaks.allTime}</div>
              <div className="text-xs sm:text-sm text-tertiary">
                All Time{peakDate !== null && !Number.isNaN(peakDate) ? ` (${new Date(peakDate).toLocaleDateString()})` : ""}
              </div>
            </div>
          </div>
        </div>

        <NetworkServerList networkId={details.id} />

        {/* Player History Chart */}
        <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">Player History</h2>
          <div className="h-64 sm:h-96">
            <NetworkHistoryChart network={details} />
          </div>
        </div>

        <NetworkServerShare networkId={details.id} />
      </div>
    </div>
  );
};

export default NetworkDetail;
