import React, { useState, useEffect, useMemo } from "react";
import { DateRangeOption, ViewMode } from "../../util/chartHelpers.ts";
import { useGamemodeList } from "../../hooks/api/useGamemodeList.ts";
import { useGamemodeHistory } from "../../hooks/api/useGamemodeHistory.ts";
import { useServerShare } from "../../hooks/api/useServerShare.ts";
import { ChartControls } from "../ChartControls.tsx";
import { GamemodeChart } from "./GamemodeChart.tsx";
import { ServerShareChart } from "./ServerShareChart.tsx";
import { ChartSidebarLegend } from "./ChartSidebarLegend.tsx";

const GlobalStatsChart: React.FC = () => {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("1d");
  const [viewMode, setViewMode] = useState<ViewMode>("lines");
  const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);
  const [visibleModes, setVisibleModes] = useState<Set<string>>(new Set());

  const gamemodeList = useGamemodeList();
  const { data: gamemodeData, loading, error, peakPlayers } = useGamemodeHistory(selectedRange);
  const { data: serverShareData, loading: serverShareLoading, error: serverShareError } =
      useServerShare(selectedGamemode, selectedRange);

  // Parse peak player history per gamemode directly from metrics
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

  // Order gamemodes by telemetry peak performance
  const sortedGamemodes = useMemo(() => {
    if (!gamemodeData) return [];
    const unique = [...new Set(gamemodeData.map((d) => d.modeName))];
    return unique.sort((a, b) => (computedPeaks[b] || 0) - (computedPeaks[a] || 0));
  }, [gamemodeData, computedPeaks]);

  // Handle auto-initializing the visible state to the top 8 performing models
  useEffect(() => {
    if (sortedGamemodes.length > 0) {
      setVisibleModes(new Set(sortedGamemodes.slice(0, 8)));
    }
  }, [sortedGamemodes]);

  return (
      <div className="h-full overflow-auto p-6 space-y-5 text-neutral-100 custom-scrollbar">
        {/* Top Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-900 pb-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">
              Global Stats
            </h1>
            <p className="text-[11px] text-neutral-500 font-medium">
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

        {/* Stats Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-neutral-900/20 border border-neutral-800/50 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Period Peak High
              </p>
              <h3 className="text-xl font-black text-amber-500 mt-0.5 tracking-tight">
                {loading ? "..." : (peakPlayers?.toLocaleString() ?? "0")}
              </h3>
            </div>
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>

          <div className="bg-neutral-900/20 border border-neutral-800/50 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Tracked Gamemodes
              </p>
              <h3 className="text-xl font-black text-blue-400 mt-0.5 tracking-tight">
                {gamemodeList?.length ?? 0}{" "}
                <span className="text-xs text-neutral-500 font-normal">modes</span>
              </h3>
            </div>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>

        {/* Main Responsive Grid Panel */}
        <div className="flex flex-col lg:flex-row gap-5 items-stretch w-full min-h-[460px]">
          {/* Core Timeline View */}
          <div className="flex-1 border border-neutral-800/50 rounded-2xl p-4 bg-neutral-900/10 flex flex-col min-h-[340px] lg:min-h-0">
            <div className="mb-3">
              <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                {viewMode === "lines" ? "Concurrent Active Telemetry Streams" : "Aggregated Cluster Execution"}
              </h4>
            </div>
            <div className="relative flex-1 w-full min-h-0">
              <GamemodeChart
                  data={gamemodeData}
                  loading={loading}
                  error={error}
                  selectedRange={selectedRange}
                  viewMode={viewMode}
                  visibleModes={visibleModes}
              />
            </div>
          </div>

          {/* Dynamic Sidebar Legend - Flows underneath on mobile layouts natively */}
          {viewMode === "lines" && (
              <div className="w-full lg:w-76 shrink-0 border border-neutral-800/50 rounded-2xl p-4 bg-neutral-900/10 flex flex-col overflow-hidden">
                <div className="mb-3">
                  <h4 className="font-bold text-orange-400/80">
                    Gamemodes
                  </h4>
                </div>
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

        {/* Secondary Node Breakdown Map */}
        {selectedGamemode && (
            <div className="border border-neutral-800/50 rounded-2xl p-4 bg-neutral-900/10 h-[380px] flex flex-col">
              <div className="mb-3">
                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-400" />
                  Instance Core Matrix:{" "}
                  <span className="text-orange-400 font-black px-1.5 py-0.5 rounded bg-orange-500/5 border border-orange-500/10 text-xs">
                {selectedGamemode}
              </span>
                </h4>
              </div>
              <div className="relative flex-1 w-full min-h-0">
                <ServerShareChart
                    data={serverShareData}
                    loading={serverShareLoading}
                    error={serverShareError}
                    selectedRange={selectedRange}
                    gamemode={selectedGamemode}
                />
              </div>
            </div>
        )}
      </div>
  );
};

export default GlobalStatsChart;