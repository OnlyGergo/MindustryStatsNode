import React, { useState, useMemo } from "react";
import { getModeColor } from "../../util/chartHelpers.ts";

// Fixed locale: the legend is server-rendered, and the browser's must not differ.
const nf = new Intl.NumberFormat("en-US");

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
        <div className="flex flex-col h-full min-w-0 text-xs sm:text-sm text-tx">
            <div className="mb-2.5">
                <input
                    type="text"
                    placeholder="Search gamemodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full max-w-full bg-surf2 border border-bd rounded px-3 py-1.5 text-xs sm:text-sm text-tx placeholder:text-dim focus:border-acc transition-colors"
                />
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                <button
                    onClick={() => onChange(new Set(gamemodes))}
                    className="btn flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3 py-1"
                >
                    Select All
                </button>
                <button
                    onClick={() => onChange(new Set())}
                    className="btn flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3 py-1"
                >
                    Clear All
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 max-h-65 lg:max-h-none">
                {filteredModes.length === 0 ? (
                    <div className="text-center text-xs text-dim py-6">
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
                                className={`flex items-center justify-between gap-2 px-2 sm:px-2.5 py-1.5 rounded cursor-pointer select-none transition-all ${
                                    isChecked
                                        ? "bg-acc/12 border border-acc text-tx"
                                        : "bg-transparent border border-transparent text-dim hover:bg-surf2 hover:text-dim"
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleMode(mode)}
                                        className="accent-acc h-3.5 w-3.5 shrink-0 rounded border-bd bg-surf text-acc"
                                    />
                                    <span
                                        className="w-2 h-2 rounded shrink-0 animate-pulse"
                                        style={{ backgroundColor: color }}
                                    />
                                    <span className="truncate text-xs font-medium">{mode}</span>
                                </div>
                                <span className="text-xs font-mono text-dim shrink-0 bg-surf2 px-1.5 py-0.5 rounded border border-bd">
                                  {nf.format(peak)}
                                </span>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
};