import React, { useState } from "react";
import { DateRangeOption, ViewMode } from "../../util/chartHelpers.ts";
import { useGamemodeList } from "../../hooks/api/useGamemodeList.ts";
import { useGamemodeHistory } from "../../hooks/api/useGamemodeHistory.ts";
import { useServerShare } from "../../hooks/api/useServerShare.ts";
import { ChartControls } from "../ChartControls.tsx";
import { GamemodeChart } from "./GamemodeChart.tsx";
import { ServerShareChart } from "./ServerShareChart.tsx";

const GlobalStatsChart: React.FC = () => {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("1d");
  const [viewMode, setViewMode] = useState<ViewMode>("lines");
  const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);

  const gamemodeList = useGamemodeList();
  const { data: gamemodeData, loading, error, peakPlayers } = useGamemodeHistory(selectedRange);
  const { data: serverShareData, loading: serverShareLoading, error: serverShareError } =
      useServerShare(selectedGamemode, selectedRange);

  return (
      <div className="h-full overflow-auto p-6">
        <h1 className="text-2xl font-bold text-orange-500 mb-6">Global Stats</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-2">
          <div className="bg-neutral-950/40 border border-neutral-800/80 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Period Peak High
              </p>
              <h3 className="text-2xl font-black text-amber-500 mt-1">
                {loading ? "..." : peakPlayers.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>

          <div className="bg-neutral-950/40 border border-neutral-800/80 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Tracked Modes
              </p>
              <h3 className="text-2xl font-black text-blue-400 mt-1">
                {gamemodeList.length}{" "}
                <span className="text-xs text-neutral-500 font-normal">modes</span>
              </h3>
            </div>
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          </div>
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

        <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Main Timeline */}
          <div className="border border-neutral-800/80 rounded-2xl p-4 h-[40vh]">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">
              {viewMode === "lines"
                  ? "Concurrent Players by Game Mode"
                  : "Aggregated Network Players"}
            </h4>
            <div className="relative w-full h-[calc(100%-2rem)]">
              <GamemodeChart
                  data={gamemodeData}
                  loading={loading}
                  error={error}
                  selectedRange={selectedRange}
                  viewMode={viewMode}
              />
            </div>
          </div>

          {/* Server Load Distribution (only when a gamemode is selected) */}
          {selectedGamemode && (
              <div className="border border-neutral-800/80 rounded-2xl p-4 h-[40vh]">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Load Distribution for:{" "}
                  <span className="text-orange-400 font-extrabold">{selectedGamemode}</span>
                </h4>
                <div className="relative w-full h-[calc(100%-2rem)]">
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
      </div>
  );
};

export default GlobalStatsChart;