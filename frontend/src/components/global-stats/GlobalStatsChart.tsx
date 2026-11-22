import React, { useState, useMemo, lazy } from "react";
import { PresetRange, ViewMode } from "../../util/chartHelpers.ts";
import { useGamemodeHistory } from "../../hooks/api/useGamemodeHistory.ts";
import { useServerShare } from "../../hooks/api/useServerShare.ts";
import { ChartControls } from "../ChartControls.tsx";
import { ChartSidebarLegend } from "./ChartSidebarLegend.tsx";
import { ChartSuspense } from "../ChartSuspense.tsx";
import { GamemodeInfo } from "../../../../common/models/GlobalStatsTypes.ts";
import type { InitialChartData } from "../../hooks/useChartData.ts";
import Panel from "../ui/Panel.tsx";
import PageHead from "../ui/PageHead.tsx";
import StatStrip from "../ui/StatStrip.tsx";

// uPlot touches the DOM at render time and isn't SSR-safe without extra
// native deps, so these charts live in their own modules, loaded lazily
// and only on the client (see ChartSuspense.tsx for the pattern).
const GamemodeChart = lazy(() => import("./GamemodeChart.tsx"));
const ServerShareChart = lazy(() => import("./ServerShareChart.tsx"));

interface GlobalStatsChartProps {
    gamemodeList: GamemodeInfo[];
    /** The default range's history, fetched by the route loader during SSR. */
    initialHistory?: InitialChartData | null;
}

export const DEFAULT_RANGE: PresetRange = "1d";

// Fixed locale: the tiles are server-rendered, and the browser's must not differ.
const nf = new Intl.NumberFormat("en-US");

/** Series shown by default: the eight busiest. */
const DEFAULT_VISIBLE = 8;

/**
 * Legend selection derived from the current key list: the busiest few until the
 * user picks, and the user's pick only for the list it was made on, so new data
 * (a range change) falls back to the default without an extra render pass.
 */
function useVisibleSet(sortedKeys: string[]) {
  const [pick, setPick] = useState<{ keys: string[]; set: Set<string> } | null>(null);
  const fallback = useMemo(() => new Set(sortedKeys.slice(0, DEFAULT_VISIBLE)), [sortedKeys]);
  const visible = pick?.keys === sortedKeys ? pick.set : fallback;
  const setVisible = (set: Set<string>) => setPick({ keys: sortedKeys, set });
  return [visible, setVisible] as const;
}

const GlobalStatsChart: React.FC<GlobalStatsChartProps> = ({gamemodeList, initialHistory}) => {
  const [selectedRange, setSelectedRange] = useState<PresetRange>(DEFAULT_RANGE);
  const [viewMode, setViewMode] = useState<ViewMode>("lines");
  const [selectedGamemode, setSelectedGamemode] = useState<GamemodeInfo | null>(null);

  const { pivot, loading, error } = useGamemodeHistory(selectedRange, initialHistory);
  const { data: serverShareData, loading: serverShareLoading, error: serverShareError } =
      useServerShare(selectedGamemode?.registryId, selectedRange);

  const sortedGamemodes = useMemo(
      () => [...pivot.gamemodes].sort((a, b) => (pivot.peaks[b] || 0) - (pivot.peaks[a] || 0)),
      [pivot],
  );

  const [visibleModes, setVisibleModes] = useVisibleSet(sortedGamemodes);

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

  const [visibleServerGroups, setVisibleServerGroups] = useVisibleSet(sortedServerGroups);

  const chartTitle =
      viewMode === "share" ? "Player share by gamemode"
      : viewMode === "lines" ? "Playercounts by gamemode"
      : "Aggregated global playercounts";

  // Chart + legend pairs: stacked on mobile, side by side at lg with the legend
  // scrolling at the chart's height.
  const pairRow = "flex flex-col lg:flex-row gap-3 lg:h-[60vh] lg:min-h-115";

  return (
      <div className="page-scroll">
        <div className="page">
          <PageHead title="Global stats" sub="Player counts across every tracked server, by gamemode" />

          <ChartControls
              selectedRange={selectedRange}
              onRangeChange={setSelectedRange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              selectedGamemode={selectedGamemode}
              onGamemodeChange={setSelectedGamemode}
              gamemodeList={gamemodeList}
          />

          <StatStrip
              items={[
                { label: "Period peak high", value: loading ? "…" : nf.format(pivot.peakPlayers) },
                { label: "Tracked gamemodes", value: gamemodeList?.length ?? 0, sub: "modes" },
              ]}
          />

          <div className={pairRow}>
            <Panel title={chartTitle} className="flex-1 min-h-0 flex flex-col">
              <div className="relative w-full h-72 sm:h-96 lg:h-auto lg:flex-1 lg:min-h-0">
                <ChartSuspense>
                  <GamemodeChart
                      pivot={pivot}
                      loading={loading}
                      error={error}
                      viewMode={viewMode}
                      visibleModes={visibleModes}
                  />
                </ChartSuspense>
              </div>
            </Panel>

            {viewMode !== "aggregated" && (
                <Panel
                    title="Gamemodes"
                    controls={<span className="text-xs text-dim">peak</span>}
                    className="w-full lg:w-76 shrink-0 flex flex-col overflow-hidden"
                >
                  <div className="flex-1 min-h-0">
                    <ChartSidebarLegend
                        gamemodes={sortedGamemodes}
                        peaks={pivot.peaks}
                        visibleModes={visibleModes}
                        onChange={setVisibleModes}
                    />
                  </div>
                </Panel>
            )}
          </div>

          {selectedGamemode && (
              <div className={pairRow}>
                <Panel
                    title={
                      <span className="flex flex-wrap items-center gap-2 min-w-0">
                        Group share for <span className="tag text-acc border-acc">{selectedGamemode.cleanModeName}</span>
                      </span>
                    }
                    className="flex-1 min-h-0 flex flex-col"
                >
                  <div className="relative w-full h-72 sm:h-96 lg:h-auto lg:flex-1 lg:min-h-0">
                    <ChartSuspense>
                      <ServerShareChart
                          data={serverShareData}
                          loading={serverShareLoading}
                          error={serverShareError}
                          visibleGroups={visibleServerGroups}
                      />
                    </ChartSuspense>
                  </div>
                </Panel>

                <Panel title="Server groups" className="w-full lg:w-76 shrink-0 flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0">
                    <ChartSidebarLegend
                        gamemodes={sortedServerGroups}
                        peaks={computedServerGroupPeaks}
                        visibleModes={visibleServerGroups}
                        onChange={setVisibleServerGroups}
                    />
                  </div>
                </Panel>
              </div>
          )}
        </div>
      </div>
  );
};

export default GlobalStatsChart;
