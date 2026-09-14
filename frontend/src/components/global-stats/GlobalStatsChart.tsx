import React, { useState, useEffect, useMemo, lazy } from "react";
import { DateRangeOption, ViewMode } from "../../util/chartHelpers.ts";
import { useGamemodeHistory } from "../../hooks/api/useGamemodeHistory.ts";
import { useServerShare } from "../../hooks/api/useServerShare.ts";
import { ChartControls } from "../ChartControls.tsx";
import { ChartSidebarLegend } from "./ChartSidebarLegend.tsx";
import { ChartSuspense } from "../ChartSuspense.tsx";
import { GamemodeInfo } from "../../../../common/models/GlobalStatsTypes.ts";

// uPlot touches the DOM at render time and isn't SSR-safe without extra
// native deps, so these charts live in their own modules, loaded lazily
// and only on the client (see ChartSuspense.tsx for the pattern).
const GamemodeChart = lazy(() => import("./GamemodeChart.tsx"));
const ServerShareChart = lazy(() => import("./ServerShareChart.tsx"));

interface GlobalStatsChartProps {
    gamemodeList: GamemodeInfo[];
}

const GlobalStatsChart: React.FC<GlobalStatsChartProps> = ({gamemodeList}) => {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("1d");
  const [viewMode, setViewMode] = useState<ViewMode>("lines");
  const [selectedGamemode, setSelectedGamemode] = useState<GamemodeInfo | null>(null);
  const [visibleModes, setVisibleModes] = useState<Set<string>>(new Set());
  const [visibleServerGroups, setVisibleServerGroups] = useState<Set<string>>(new Set());

  const { data: gamemodeData, loading, error, peakPlayers } = useGamemodeHistory(selectedRange);
  const { data: serverShareData, loading: serverShareLoading, error: serverShareError } =
      useServerShare(selectedGamemode?.modeId, selectedRange);

  const computedPeaks = useMemo(() => {
    const peaks: Record<string, number> = {};
    if (!gamemodeData) return peaks;

    gamemodeData.forEach((d) => {
      if (d.modeName === null || d.players === null) return;
      if (!peaks[d.modeName] || d.players > peaks[d.modeName]) {
        peaks[d.modeName] = d.players;
      }
    });
    return peaks;
  }, [gamemodeData]);

  const sortedGamemodes = useMemo(() => {
    if (!gamemodeData) return [];
    const unique = [...new Set(gamemodeData.map((d) => d.modeName))];
    return unique.sort((a, b) => (computedPeaks[b] || 0) - (computedPeaks[a] || 0));
  }, [gamemodeData, computedPeaks]);

  useEffect(() => {
    if (sortedGamemodes.length > 0) {
      setVisibleModes(new Set(sortedGamemodes.slice(0, 8)));
    }
  }, [sortedGamemodes]);

  const computedServerGroupPeaks = useMemo(() => {
    const peaks: Record<string, number> = {};
    if (!serverShareData) return peaks;

    serverShareData.forEach((d) => {
      if (d.groupName === null || d.players === null) return;
      if (!peaks[d.groupName] || d.players > peaks[d.groupName]) {
        peaks[d.groupName] = d.players;
      }
    });
    return peaks;
  }, [serverShareData]);

  const sortedServerGroups = useMemo(() => {
    if (!serverShareData) return [];
    const unique = [...new Set(serverShareData.map((d) => d.groupName))];
    return unique.sort((a, b) => (computedServerGroupPeaks[b] || 0) - (computedServerGroupPeaks[a] || 0));
  }, [serverShareData, computedServerGroupPeaks]);

  useEffect(() => {
    if (sortedServerGroups.length > 0) {
      setVisibleServerGroups(new Set(sortedServerGroups.slice(0, 8)));
    }
  }, [sortedServerGroups]);

  return (
      <div className="h-full overflow-y-auto p-3 sm:p-6 bg-surface-primary">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="min-w-0 mb-4">
              <h1 className="text-xl sm:text-2xl font-bold text-primary wrap-break-word">
                Global Stats
              </h1>
              <p className="text-sm sm:text-base text-secondary wrap-break-word">
                Automated cluster network telemetry logging maps
              </p>
            </div>

            <ChartControls
                selectedRange={selectedRange}
                onRangeChange={setSelectedRange}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedGamemode={selectedGamemode}
                onGamemodeChange={setSelectedGamemode}
                gamemodeList={gamemodeList}
            />
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
            <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 flex items-center justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-tertiary">
                  Period Peak High
                </div>
                <div className="text-xl sm:text-2xl font-bold text-accent wrap-break-word">
                  {loading ? "..." : (peakPlayers?.toLocaleString() ?? "0")}
                </div>
              </div>
              <div className="shrink-0 bg-accent-muted text-accent border border-accent rounded p-2 sm:p-3">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>

            <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 flex items-center justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <div className="text-xs sm:text-sm text-tertiary">
                  Tracked Gamemodes
                </div>
                <div className="text-xl sm:text-2xl font-bold text-accent wrap-break-word">
                  {gamemodeList?.length ?? 0}{" "}
                  <span className="text-xs sm:text-sm font-normal text-tertiary">modes</span>
                </div>
              </div>
              <div className="shrink-0 bg-surface-tertiary text-secondary border border-subtle rounded p-2 sm:p-3">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
          </div>

          {/* Gamemode chart + legend */}
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full lg:items-stretch lg:min-h-115 lg:h-[60vh] mb-4 sm:mb-6">
            <div className="flex-1 min-w-0 bg-surface-secondary border border-subtle rounded p-4 sm:p-6 flex flex-col">
              <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4 wrap-break-word">
                {viewMode === "lines" ? "Playercounts by Gamemode" : "Aggregated Global Playercounts"}
              </h2>
              <div className="relative w-full h-64 sm:h-96 lg:h-auto lg:flex-1 lg:min-h-0">
                <ChartSuspense>
                  <GamemodeChart
                      data={gamemodeData}
                      loading={loading}
                      error={error}
                      selectedRange={selectedRange}
                      viewMode={viewMode}
                      visibleModes={visibleModes}
                  />
                </ChartSuspense>
              </div>
            </div>

            {viewMode === "lines" && (
                <div className="w-full lg:w-76 shrink-0 bg-surface-secondary border border-subtle rounded p-4 sm:p-6 flex flex-col overflow-hidden">
                  <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">
                    Gamemodes
                  </h2>
                  <div className="flex-1 min-h-0">
                    <ChartSidebarLegend
                        gamemodes={sortedGamemodes}
                        peaks={computedPeaks}
                        visibleModes={visibleModes}
                        onChange={setVisibleModes}
                    />
                  </div>
                </div>
            )}
          </div>

          {/* Group share chart + legend */}
          {selectedGamemode && (
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full lg:items-stretch lg:min-h-115 lg:h-[60vh] mb-4 sm:mb-6">
                <div className="flex-1 min-w-0 bg-surface-secondary border border-subtle rounded p-4 sm:p-6 flex flex-col">
                  <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4 flex flex-wrap items-center gap-2 min-w-0">
                    <span>Group Share for</span>
                    <span className="min-w-0 bg-accent-muted text-accent border border-accent rounded px-2 py-0.5 text-xs sm:text-sm font-medium wrap-break-word">
                      {selectedGamemode.cleanModeName}
                    </span>
                  </h2>
                  <div className="relative w-full h-64 sm:h-96 lg:h-auto lg:flex-1 lg:min-h-0">
                    <ChartSuspense>
                      <ServerShareChart
                          data={serverShareData}
                          loading={serverShareLoading}
                          error={serverShareError}
                          selectedRange={selectedRange}
                          visibleGroups={visibleServerGroups}
                      />
                    </ChartSuspense>
                  </div>
                </div>

                <div className="w-full lg:w-76 shrink-0 bg-surface-secondary border border-subtle rounded p-4 sm:p-6 flex flex-col overflow-hidden">
                  <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">
                    Server Groups
                  </h2>
                  <div className="flex-1 min-h-0">
                    <ChartSidebarLegend
                        gamemodes={sortedServerGroups}
                        peaks={computedServerGroupPeaks}
                        visibleModes={visibleServerGroups}
                        onChange={setVisibleServerGroups}
                    />
                  </div>
                </div>
              </div>
          )}
        </div>
      </div>
  );
};

export default GlobalStatsChart;
