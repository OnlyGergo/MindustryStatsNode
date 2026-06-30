import React, { useState, useMemo } from "react";
import { getModeColor } from "../../util/chartHelpers.ts";

interface ChartSidebarLegendProps {
    gamemodes: string[];
    peaks: Record<string, number>;
    visibleModes: Set<string>;
    onChange: (visible: Set<string>) => void;
}

export const ChartSidebarLegend: React.FC<ChartSidebarLegendProps> = ({
                                                                          gamemodes,
                                                                          peaks,
                                                                          visibleModes,
                                                                          onChange,
                                                                      }) => {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredModes = useMemo(() => {
        return gamemodes.filter((mode) =>
            mode.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [gamemodes, searchQuery]);

    const toggleMode = (mode: string) => {
        const next = new Set(visibleModes);
        if (next.has(mode)) {
            next.delete(mode);
        } else {
            next.add(mode);
        }
        onChange(next);
    };

    return (
        <div className="flex flex-col h-full text-sm text-neutral-200">
            <div className="mb-2.5">
                <input
                    type="text"
                    placeholder="Search gamemodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-orange-500/40 transition-colors"
                />
            </div>

            <div className="flex gap-2 mb-3 text-[11px]">
                <button
                    onClick={() => onChange(new Set(gamemodes))}
                    className="flex-1 bg-neutral-900/60 hover:bg-neutral-800 border border-neutral-800 rounded py-1 text-neutral-400 hover:text-neutral-200 font-medium transition-colors"
                >
                    Select All
                </button>
                <button
                    onClick={() => onChange(new Set())}
                    className="flex-1 bg-neutral-900/60 hover:bg-neutral-800 border border-neutral-800 rounded py-1 text-neutral-400 hover:text-neutral-200 font-medium transition-colors"
                >
                    Clear All
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar max-h-[260px] lg:max-h-none">
                {filteredModes.length === 0 ? (
                    <div className="text-center text-xs text-neutral-500 py-6">
                        No matching gamemodes found
                    </div>
                ) : (
                    filteredModes.map((mode) => {
                        const isChecked = visibleModes.has(mode);
                        const peak = peaks[mode] || 0;
                        const color = getModeColor(mode);

                        return (
                            <label
                                key={mode}
                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-all ${
                                    isChecked
                                        ? "bg-neutral-800/10 border-neutral-700/40 text-neutral-100"
                                        : "bg-transparent border-transparent text-neutral-500 hover:bg-neutral-900/50 hover:text-neutral-300"
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleMode(mode)}
                                        className="accent-orange-500 h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-900 text-orange-500 focus:ring-0"
                                    />
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                                        style={{ backgroundColor: color }}
                                    />
                                    <span className="truncate text-xs font-semibold">{mode}</span>
                                </div>
                                <span className="text-[10px] font-mono text-neutral-400 shrink-0 bg-neutral-950/60 px-1.5 py-0.5 rounded border border-neutral-800/40">
                                  {peak.toLocaleString()}
                                </span>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
};