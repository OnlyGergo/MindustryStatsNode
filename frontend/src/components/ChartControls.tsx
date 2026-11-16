import React from "react";
import {
  PRESET_RANGE_OPTIONS,
  PresetRange,
  ViewMode,
} from "../util/chartHelpers.ts";
import { GamemodeInfo } from "../../../common/models/GlobalStatsTypes.js";
import { modeIdToIcon } from "../util/mindustry.ts";
import Segmented from "./ui/Segmented.tsx";

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "share", label: "Share" },
  { value: "lines", label: "Lines" },
  { value: "aggregated", label: "Aggregated" },
];

interface ChartControlsProps {
  selectedRange: PresetRange;
  onRangeChange: (range: PresetRange) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedGamemode: GamemodeInfo | null;
  onGamemodeChange: (gamemode: GamemodeInfo | null) => void;
  gamemodeList: GamemodeInfo[];
}

export const ChartControls: React.FC<ChartControlsProps> = ({
  selectedRange,
  onRangeChange,
  viewMode,
  onViewModeChange,
  selectedGamemode,
  onGamemodeChange,
  gamemodeList,
}) => {
  const handleGamemodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value === "" ? null : Number(e.target.value);
    if (selected === null || isNaN(selected)) {
      onGamemodeChange(null);
      return;
    }
    const gamemode = gamemodeList.find((gm) => gm.registryId === selected) || null;
    onGamemodeChange(gamemode);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="label-caps">Timeframe</span>
        <Segmented
          aria-label="Timeframe"
          options={PRESET_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={selectedRange}
          onChange={onRangeChange}
        />
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="label-caps">View</span>
        <Segmented
          aria-label="View"
          options={VIEWS}
          value={viewMode}
          onChange={onViewModeChange}
        />
      </div>

      {/* Gamemode Filter */}
      <div className="relative w-full sm:w-auto max-w-full min-w-0">
        <select
          value={selectedGamemode?.registryId ?? ""}
          onChange={handleGamemodeChange}
          className="btn appearance-none truncate w-full sm:w-auto max-w-full pl-3 pr-8 bg-surf2 focus:border-acc"
        >
          <option value="">🌐 All Gamemodes</option>
          {[...gamemodeList]
            .map((gm) => (
              <option key={gm.registryId} value={gm.registryId}>
                {modeIdToIcon(gm.gamemodeId)} {gm.cleanModeName} ({gm.serverCount} servers)
              </option>
            ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-dim">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
