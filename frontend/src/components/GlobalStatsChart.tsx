import React, { useEffect, useRef, useState } from "react";
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  ChartDataset,
} from "chart.js";
import {
  GamemodeHistoryEntry,
  GamemodeInfo,
  ServerShareEntry,
} from "../../../common/models/GlobalStatsTypes.js";
import { theme } from "../theme.ts";

Chart.register(
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

type DateRangeOption = "1d" | "7d" | "14d" | "3m" | "12m";
type ViewMode = "stacked" | "aggregated";

interface DateRange {
  label: string;
  value: DateRangeOption;
}

const DATE_RANGE_OPTIONS: DateRange[] = [
  { label: "1 Day", value: "1d" },
  { label: "7 Days", value: "7d" },
  { label: "14 Days", value: "14d" },
  { label: "3 Months", value: "3m" },
  { label: "12 Months", value: "12m" },
];

interface GlobalStatsChartProps {
  onClose: () => void;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 75%, 60%)`;
}

function getModeColor(modeName: string | null): string {
  if (!modeName) return "#ffffff";
  const lowerName = modeName.toLowerCase();
  if (theme && theme.modeColors && theme.modeColors[lowerName]) {
    return theme.modeColors[lowerName];
  }
  return stringToColor(modeName);
}

const GlobalStatsChart: React.FC<GlobalStatsChartProps> = ({ onClose }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const serverShareChartRef = useRef<HTMLCanvasElement>(null);
  const serverShareChartInstance = useRef<Chart | null>(null);

  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("1d");
  const [viewMode, setViewMode] = useState<ViewMode>("stacked");
  const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);
  const [gamemodeData, setGamemodeData] = useState<GamemodeHistoryEntry[]>([]);
  const [serverShareData, setServerShareData] = useState<ServerShareEntry[]>(
    [],
  );
  const [gamemodeList, setGamemodeList] = useState<GamemodeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [serverShareLoading, setServerShareLoading] = useState(false);
  const [serverShareError, setServerShareError] = useState<string | null>(null);

  // Calculated aggregated summary metrics
  const [totalPlayersSnapshot, setTotalPlayersSnapshot] = useState<number>(0);
  const [peakPlayersSnapshot, setPeakPlayersSnapshot] = useState<number>(0);

  useEffect(() => {
    const fetchGamemodeList = async () => {
      try {
        const response = await fetch("/api/gamemodes");
        if (response.ok) {
          const data: GamemodeInfo[] = await response.json();
          setGamemodeList(data);
        }
      } catch (error) {
        console.error("Error fetching gamemode list:", error);
      }
    };

    fetchGamemodeList();
  }, []);

  useEffect(() => {
    const fetchGamemodeHistory = async () => {
      setLoading(true);
      setFetchError(null);

      const validRanges: DateRangeOption[] = ["1d", "7d", "14d", "3m", "12m"];
      const range = validRanges.includes(selectedRange) ? selectedRange : "1d";

      try {
        const response = await fetch(
          `/api/global/gamemode-history?range=${range}`,
        );
        if (response.ok) {
          const data: GamemodeHistoryEntry[] = await response.json();
          setGamemodeData(data);

          // Process dynamic totals for indicators
          if (data && data.length > 0) {
            const uniqueTimestamps = Array.from(
              new Set(data.map((d) => d.timestamp)),
            ).sort((a, b) => b - a);
            const latestTs = uniqueTimestamps[0];
            const latestSum = data
              .filter((d) => d.timestamp === latestTs)
              .reduce((sum: number, item) => sum + (item.players ?? 0), 0);
            setTotalPlayersSnapshot(latestSum);

            const maxPeak = uniqueTimestamps.reduce((max, ts) => {
              const currentSum = data
                .filter((d) => d.timestamp === ts)
                .reduce(
                  (s, item) => s + (item.players == null ? 0 : item.players),
                  0,
                );
              return currentSum > max ? currentSum : max;
            }, 0);
            setPeakPlayersSnapshot(maxPeak);
          }
        } else {
          setFetchError("Unable to load gamemode history data.");
        }
      } catch (error) {
        console.error("Error fetching gamemode history data:", error);
        setFetchError("An error occurred while loading gamemode history data.");
      } finally {
        setLoading(false);
      }
    };

    fetchGamemodeHistory();
  }, [selectedRange]);

  useEffect(() => {
    const fetchServerShare = async () => {
      if (!selectedGamemode) {
        setServerShareData([]);
        return;
      }

      setServerShareLoading(true);
      setServerShareError(null);

      const validRanges: DateRangeOption[] = ["1d", "7d", "14d", "3m", "12m"];
      const range = validRanges.includes(selectedRange) ? selectedRange : "1d";

      try {
        const response = await fetch(
          `/api/gamemodes/${encodeURIComponent(selectedGamemode)}/servers?range=${range}`,
        );
        if (response.ok) {
          const data: ServerShareEntry[] = await response.json();
          setServerShareData(data);
        } else {
          setServerShareError("Unable to load server share data.");
        }
      } catch (error) {
        console.error("Error fetching server share data:", error);
        setServerShareError(
          "An error occurred while loading server share data.",
        );
      } finally {
        setServerShareLoading(false);
      }
    };

    fetchServerShare();
  }, [selectedGamemode, selectedRange]);

  useEffect(() => {
    if (!chartRef.current || gamemodeData.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    const timestamps = Array.from(
      new Set(gamemodeData.map((d) => d.timestamp)),
    ).sort((a, b) => a - b);
    const gamemodes = Array.from(
      new Set(gamemodeData.map((d) => d.modeName)),
    ).sort();

    const labels = timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      if (selectedRange === "1d") {
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      } else if (selectedRange === "7d" || selectedRange === "14d") {
        return date.toLocaleDateString([], {
          weekday: "short",
          hour: "2-digit",
        });
      } else {
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    });

    let datasets: ChartDataset<"line", (number | null)[]>[] = [];

    if (viewMode === "stacked") {
      datasets = gamemodes.map((mode) => {
        const data = timestamps.map((ts) => {
          const entry = gamemodeData.find(
            (d) => d.timestamp === ts && d.modeName === mode,
          );
          return entry ? entry.players : null;
        });

        const color = getModeColor(mode);
        return {
          label: mode,
          data,
          borderColor: color,
          backgroundColor: color + "15",
          fill: true,
          tension: 0.35,
          pointRadius: data.length > 80 ? 0 : 2.5,
          pointHoverRadius: 5,
          borderWidth: 2,
          spanGaps: true,
        };
      });
    } else {
      const data = timestamps.map((ts) => {
        const entries = gamemodeData.filter((d) => d.timestamp === ts);
        const sum = entries.reduce((acc, e) => acc + (e.players || 0), 0);
        return entries.length > 0 ? sum : null;
      });

      datasets = [
        {
          label: "Total Network Players",
          data,
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.1)",
          fill: true,
          tension: 0.35,
          pointRadius: data.length > 80 ? 0 : 3,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          spanGaps: true,
        },
      ];
    }

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: viewMode === "stacked",
            position: "top",
            labels: {
              color: "#9ca3af",
              font: { size: 11 },
              boxWidth: 8,
              usePointStyle: true,
              padding: 12,
              filter: (legendItem, data) => {
                // 'data' matches the exact structure of your data object
                const dataValue = data.datasets[0].data[legendItem.index];

                // Check against 0
                return dataValue !== 0;
              },
            },
          },
          tooltip: {
            backgroundColor: "rgba(17, 17, 17, 0.95)",
            titleColor: "#f97316",
            bodyColor: "#fff",
            borderColor: "#2d2d2d",
            borderWidth: 1,
            padding: 11,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                if (items[0]) {
                  const dataPoint = gamemodeData.find(
                    (d) => d.timestamp === timestamps[items[0].dataIndex],
                  );
                  if (dataPoint) {
                    return new Date(dataPoint.timestamp).toLocaleString();
                  }
                }
                return "";
              },
              label: (context) => {
                const value = context.raw;
                const label = context.dataset.label || "";
                return `  ${label}: ${Number(value).toLocaleString()}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: viewMode === "stacked",
            grid: {
              color: "rgba(255, 255, 255, 0.05)",
            },
            ticks: {
              color: "#9ca3af",
              maxRotation: 0,
              maxTicksLimit: 8,
              font: { size: 10 },
            },
          },
          y: {
            stacked: viewMode === "stacked",
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.05)",
            },
            ticks: {
              color: "#9ca3af",
              font: { size: 10 },
              callback: (value) => Math.round(Number(value)).toLocaleString(),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [gamemodeData, selectedRange, viewMode]);

  useEffect(() => {
    if (
      !serverShareChartRef.current ||
      serverShareData.length === 0 ||
      !selectedGamemode
    ) {
      if (serverShareChartInstance.current) {
        serverShareChartInstance.current.destroy();
        serverShareChartInstance.current = null;
      }
      return;
    }

    if (serverShareChartInstance.current) {
      serverShareChartInstance.current.destroy();
    }

    const ctx = serverShareChartRef.current.getContext("2d");
    if (!ctx) return;

    const timestamps = Array.from(
      new Set(serverShareData.map((d) => d.timestamp)),
    ).sort((a, b) => a - b);
    const serverGroups = Array.from(
      new Set(serverShareData.map((d) => d.groupName)),
    ).sort();

    const labels = timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      if (selectedRange === "1d") {
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      } else if (selectedRange === "7d" || selectedRange === "14d") {
        return date.toLocaleDateString([], {
          weekday: "short",
          hour: "2-digit",
        });
      } else {
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    });

    const datasets = serverGroups.map((groupName) => {
      const data = timestamps.map((ts) => {
        const entry = serverShareData.find(
          (d) => d.timestamp === ts && d.groupName === groupName,
        );
        return entry ? entry.players : null;
      });

      const color = getModeColor(groupName);
      return {
        label: groupName,
        data,
        borderColor: color,
        backgroundColor: color + "10",
        fill: true,
        tension: 0.35,
        pointRadius: data.length > 80 ? 0 : 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        spanGaps: true,
      };
    });

    serverShareChartInstance.current = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              color: "#9ca3af",
              font: { size: 10 },
              boxWidth: 6,
              usePointStyle: true,
              padding: 10,
            },
          },
          tooltip: {
            backgroundColor: "rgba(17, 17, 17, 0.95)",
            titleColor: "#f97316",
            bodyColor: "#fff",
            borderColor: "#2d2d2d",
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                if (items[0]) {
                  const dataPoint = serverShareData.find(
                    (d) => d.timestamp === timestamps[items[0].dataIndex],
                  );
                  if (dataPoint) {
                    return new Date(dataPoint.timestamp).toLocaleString();
                  }
                }
                return "";
              },
              label: (context) => {
                const value = context.raw;
                const label = context.dataset.label || "";
                return `  ${label}: ${Number(value).toLocaleString()}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(255, 255, 255, 0.04)",
            },
            ticks: {
              color: "#9ca3af",
              maxRotation: 0,
              maxTicksLimit: 8,
              font: { size: 9 },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.04)",
            },
            ticks: {
              color: "#9ca3af",
              font: { size: 9 },
              callback: (value) => Math.round(Number(value)).toLocaleString(),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
      },
    });

    return () => {
      if (serverShareChartInstance.current) {
        serverShareChartInstance.current.destroy();
        serverShareChartInstance.current = null;
      }
    };
  }, [serverShareData, selectedRange, selectedGamemode]);

  const handleGamemodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedGamemode(value === "" ? null : value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 transition-all duration-300">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl shadow-black/80">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-orange-500 tracking-wide">
              Global Stats
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all cursor-pointer"
            aria-label="Close analytics"
          >
            <svg
              className="w-5.5 h-5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* KPI Cards section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-6 pb-2 bg-neutral-900">
          <div className="bg-neutral-950/40 border border-neutral-800/80 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Live Active Players
              </p>
              <h3 className="text-2xl font-black text-white mt-1">
                {loading ? "..." : totalPlayersSnapshot.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
          </div>

          <div className="bg-neutral-950/40 border border-neutral-800/80 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Period Peak High
              </p>
              <h3 className="text-2xl font-black text-amber-500 mt-1">
                {loading ? "..." : peakPlayersSnapshot.toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-lg">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            </div>
          </div>

          <div className="bg-neutral-950/40 border border-neutral-800/80 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Tracked Nodes
              </p>
              <h3 className="text-2xl font-black text-blue-400 mt-1">
                {gamemodeList.length}{" "}
                <span className="text-xs text-neutral-500 font-normal">
                  modes
                </span>
              </h3>
            </div>
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Dashboard Controls Toolbar */}
        <div className="px-6 py-4 bg-neutral-900 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-4">
          {/* Timeframe Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mr-1">
              Timeframe
            </span>
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              {DATE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedRange(option.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedRange === option.value
                      ? "bg-neutral-800 text-orange-400 shadow-sm border border-neutral-700/50"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-900/40"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter and View Toggles */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mr-1">
              View
            </span>
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              <button
                onClick={() => setViewMode("stacked")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "stacked"
                    ? "bg-neutral-800 text-orange-400 shadow-sm border border-neutral-700/50"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900/40"
                }`}
              >
                Stacked
              </button>
              <button
                onClick={() => setViewMode("aggregated")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "aggregated"
                    ? "bg-neutral-800 text-orange-400 shadow-sm border border-neutral-700/50"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900/40"
                }`}
              >
                Aggregated
              </button>
            </div>

            {/* Dropdown styling */}
            <div className="relative">
              <select
                value={selectedGamemode || ""}
                onChange={handleGamemodeChange}
                className="appearance-none bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs font-bold rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500/50 hover:bg-neutral-900 transition-all cursor-pointer"
              >
                <option value="">🌐 All Gamemodes</option>
                {gamemodeList
                  .sort((a, b) => a.serverCount - a.serverCount)
                  .map((gm) => (
                    <option key={gm.modeName} value={gm.modeName}>
                      {gm.cleanName} ({gm.serverCount} servers)
                    </option>
                  ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-neutral-500">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
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
        </div>

        {/* Scrollable Main Charts Container */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-neutral-900 custom-scrollbar">
          {/* Main Timeline Card */}
          <div className="bg-neutral-950/20 border border-neutral-800/80 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">
              {viewMode === "stacked"
                ? "Concurrent Players by Game Mode"
                : "Aggregated Network Players"}
            </h4>

            {/* Wrapper height constraints directly prevents the Chart.js loop */}
            <div className="relative h-[280px] w-full">
              {loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
                  <span className="text-xs text-neutral-500 font-medium">
                    Recompiling metrics...
                  </span>
                </div>
              ) : fetchError ? (
                <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs font-semibold">
                  {fetchError}
                </div>
              ) : gamemodeData.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
                  No data available for selected time range
                </div>
              ) : (
                <canvas ref={chartRef} />
              )}
            </div>
          </div>

          {/* Secondary Node/Server Allocation Shares (Visible when filtering game mode) */}
          {selectedGamemode && (
            <div className="bg-neutral-950/20 border border-neutral-800/80 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                Load Distribution for:{" "}
                <span className="text-orange-400 font-extrabold">
                  {selectedGamemode}
                </span>
              </h4>

              {/* Wrapper height constraint directly prevents infinite height loop */}
              <div className="relative h-[220px] w-full">
                {serverShareLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-500 border-t-transparent"></div>
                    <span className="text-xs text-neutral-500 font-medium">
                      Analyzing active instances...
                    </span>
                  </div>
                ) : serverShareError ? (
                  <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs font-semibold">
                    {serverShareError}
                  </div>
                ) : serverShareData.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
                    No telemetry recorded for this gamemode instance
                  </div>
                ) : (
                  <canvas ref={serverShareChartRef} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Status message bar */}
        <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-950/40 text-[10.5px] text-neutral-500 flex items-center justify-between">
          <div>
            {selectedGamemode
              ? `Displaying specific server clusters for ${selectedGamemode}`
              : "All system indices operational. Displaying total cluster metrics."}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalStatsChart;
