import React from "react";
import { DATE_RANGE_OPTIONS, DateRangeOption, ViewMode } from "../util/chartHelpers.ts";
import { GamemodeInfo } from "../../../common/models/GlobalStatsTypes.js";

interface ChartControlsProps {
    selectedRange: DateRangeOption;
    onRangeChange: (range: DateRangeOption) => void;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    selectedGamemode: string | null;
    onGamemodeChange: (gamemode: string | null) => void;
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
        onGamemodeChange(e.target.value === "" ? null : e.target.value);
    };

    return (
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            {/* Timeframe Controls */}
            <div className="flex items-center gap-2">
    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mr-1">
        Timeframe
        </span>
                <div className="flex p-1 rounded-xl border border-neutral-800">
                    {DATE_RANGE_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => onRangeChange(option.value)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                selectedRange === option.value
                                    ? "bg-neutral-900 text-orange-400 shadow-sm border border-neutral-700/50"
                                    : "text-neutral-400 hover:text-white hover:bg-neutral-900/40"
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* View and Filter Toggles */}
            <div className="flex items-center gap-3">
    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mr-1">
        View
        </span>
                <div className="flex p-1 rounded-xl border border-neutral-800">
                    {(["lines", "aggregated"] as ViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => onViewModeChange(mode)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                                viewMode === mode
                                    ? "bg-neutral-800 text-orange-400 shadow-sm border border-neutral-700/50"
                                    : "text-neutral-400 hover:text-white hover:bg-neutral-900/40"
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <select
                        value={selectedGamemode ?? ""}
                        onChange={handleGamemodeChange}
                        className="appearance-none border border-neutral-800 text-neutral-200 text-xs font-bold rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500/50 bg-neutral-900 transition-all cursor-pointer"
                    >
                        <option value="">🌐 All Gamemodes</option>
                        {[...gamemodeList]
                            .sort((a, b) => b.serverCount - a.serverCount)
                            .map((gm) => (
                                <option key={gm.modeName} value={gm.modeName}>
                                    {gm.cleanName} ({gm.serverCount} servers)
                                </option>
                            ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-neutral-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};