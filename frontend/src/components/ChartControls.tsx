import React from "react";
import {
  DATE_RANGE_OPTIONS,
  DateRangeOption,
  ViewMode,
} from "../util/chartHelpers.ts";
import { GamemodeInfo } from "../../../common/models/GlobalStatsTypes.js";

interface ChartControlsProps {
  selectedRange: DateRangeOption;
  onRangeChange: (range: DateRangeOption) => void;
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
    const gamemode = gamemodeList.find((gm) => gm.modeId === selected) || null;
    onGamemodeChange(gamemode);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 w-full min-w-0">
      {/* Timeframe Controls */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-xs text-tertiary uppercase tracking-wider">
          Timeframe
        </span>
        <div className="flex flex-wrap gap-1 p-1 rounded border border-default bg-surface-tertiary">
          {DATE_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onRangeChange(option.value)}
              className={`text-xs sm:text-sm px-2 sm:px-3 py-1 rounded transition-all focus-ring-accent ${
                selectedRange === option.value
                  ? "button-accent"
                  : "text-secondary hover:text-primary hover:bg-accent-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* View Toggles */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-xs text-tertiary uppercase tracking-wider">
          View
        </span>
        <div className="flex flex-wrap gap-1 p-1 rounded border border-default bg-surface-tertiary">
          {(["lines", "aggregated"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`text-xs sm:text-sm px-2 sm:px-3 py-1 rounded capitalize transition-all focus-ring-accent ${
                viewMode === mode
                  ? "button-accent"
                  : "text-secondary hover:text-primary hover:bg-accent-hover"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Gamemode Filter */}
      <div className="relative w-full sm:w-auto max-w-full min-w-0">
        <select
          value={selectedGamemode?.modeId ?? ""}
          onChange={handleGamemodeChange}
          className="appearance-none truncate w-full sm:w-auto max-w-full border border-default text-primary text-xs sm:text-sm rounded pl-3 pr-8 py-1 focus-ring-accent focus:border-accent bg-surface-tertiary transition-all cursor-pointer"
        >
          <option value="">🌐 All Gamemodes</option>
          {[...gamemodeList]
            .sort((a, b) => b.serverCount - a.serverCount)
            .map((gm) => (
              <option key={gm.modeId} value={gm.modeId}>
                {gm.cleanModeName} ({gm.serverCount} servers)
              </option>
            ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-tertiary">
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
