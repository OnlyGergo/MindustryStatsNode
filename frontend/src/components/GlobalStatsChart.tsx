import React, {useEffect, useRef, useState} from 'react';
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
    ChartDataset
} from 'chart.js';
import {GamemodeHistoryEntry, GamemodeInfo, ServerShareEntry} from "../../../common/models/GlobalStatsTypes.js";
import {theme} from "../theme.ts";

// Register Chart.js components
Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler);

type DateRangeOption = '1d' | '7d' | '14d' | '3m' | '12m';
type ViewMode = 'stacked' | 'aggregated';

interface DateRange {
    label: string;
    value: DateRangeOption;
}

const DATE_RANGE_OPTIONS: DateRange[] = [
    { label: '1 Day', value: '1d' },
    { label: '7 Days', value: '7d' },
    { label: '14 Days', value: '14d' },
    { label: '3 Months', value: '3m' },
    { label: '12 Months', value: '12m' },
];

interface GlobalStatsChartProps {
    onClose: () => void;
}

// Generate a consistent color from a string
function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 55%)`;
}

// Get color for a gamemode, using theme.modeColors if available
function getModeColor(modeName: string | null): string {
    if (!modeName) return "#ffffff";
    const lowerName = modeName.toLowerCase();
    if (theme.modeColors && theme.modeColors[lowerName]) {
        return theme.modeColors[lowerName];
    }
    return stringToColor(modeName);
}

const GlobalStatsChart: React.FC<GlobalStatsChartProps> = ({ onClose }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);
    const serverShareChartRef = useRef<HTMLCanvasElement>(null);
    const serverShareChartInstance = useRef<Chart | null>(null);
    const [selectedRange, setSelectedRange] = useState<DateRangeOption>('1d');
    const [viewMode, setViewMode] = useState<ViewMode>('stacked');
    const [selectedGamemode, setSelectedGamemode] = useState<string | null>(null);
    const [gamemodeData, setGamemodeData] = useState<GamemodeHistoryEntry[]>([]);
    const [serverShareData, setServerShareData] = useState<ServerShareEntry[]>([]);
    const [gamemodeList, setGamemodeList] = useState<GamemodeInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [serverShareLoading, setServerShareLoading] = useState(false);
    const [serverShareError, setServerShareError] = useState<string | null>(null);

    // Fetch gamemode list on mount
    useEffect(() => {
        const fetchGamemodeList = async () => {
            try {
                const response = await fetch('/api/gamemodes');
                if (response.ok) {
                    const data: GamemodeInfo[] = await response.json();
                    setGamemodeList(data);
                }
            } catch (error) {
                console.error('Error fetching gamemode list:', error);
            }
        };

        fetchGamemodeList();
    }, []);

    // Fetch gamemode history data when range changes
    useEffect(() => {
        const fetchGamemodeHistory = async () => {
            setLoading(true);
            setFetchError(null);

            const validRanges: DateRangeOption[] = ['1d', '7d', '14d', '3m', '12m'];
            const range = validRanges.includes(selectedRange) ? selectedRange : '1d';

            try {
                const response = await fetch(`/api/global/gamemode-history?range=${range}`);
                if (response.ok) {
                    const data: GamemodeHistoryEntry[] = await response.json();
                    setGamemodeData(data);
                } else {
                    console.error('Failed to fetch gamemode history data. Status:', response.status, response.statusText);
                    setFetchError('Unable to load gamemode history data.');
                }
            } catch (error) {
                console.error('Error fetching gamemode history data:', error);
                setFetchError('An error occurred while loading gamemode history data.');
            } finally {
                setLoading(false);
            }
        };

        fetchGamemodeHistory();
    }, [selectedRange]);

    // Fetch server share when gamemode is selected
    useEffect(() => {
        const fetchServerShare = async () => {
            if (!selectedGamemode) {
                setServerShareData([]);
                return;
            }

            setServerShareLoading(true);
            setServerShareError(null);

            const validRanges: DateRangeOption[] = ['1d', '7d', '14d', '3m', '12m'];
            const range = validRanges.includes(selectedRange) ? selectedRange : '1d';

            try {
                const response = await fetch(`/api/gamemodes/${encodeURIComponent(selectedGamemode)}/servers?range=${range}`);
                if (response.ok) {
                    const data: ServerShareEntry[] = await response.json();
                    setServerShareData(data);
                } else {
                    console.error('Failed to fetch server share data. Status:', response.status, response.statusText);
                    setServerShareError('Unable to load server share data.');
                }
            } catch (error) {
                console.error('Error fetching server share data:', error);
                setServerShareError('An error occurred while loading server share data.');
            } finally {
                setServerShareLoading(false);
            }
        };

        fetchServerShare();
    }, [selectedGamemode, selectedRange]);

    // Create/update main chart when data changes
    useEffect(() => {
        if (!chartRef.current || gamemodeData.length === 0) return;

        // Destroy existing chart
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        // Get unique timestamps and gamemodes
        const timestamps = Array.from(new Set(gamemodeData.map(d => d.timestamp))).sort((a, b) => a - b);
        const gamemodes = Array.from(new Set(gamemodeData.map(d => d.modeName))).sort();

        // Format timestamps for labels
        const labels = timestamps.map(timestamp => {
            const date = new Date(timestamp);
            if (selectedRange === '1d') {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (selectedRange === '7d' || selectedRange === '14d') {
                return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
            } else {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
        });

        // Build datasets
        let datasets: ChartDataset<'line', (number | null)[]>[] = [];

        if (viewMode === 'stacked') {
            // One dataset per gamemode
            datasets = gamemodes.map(mode => {
                const data = timestamps.map(ts => {
                    const entry = gamemodeData.find(d => d.timestamp === ts && d.modeName === mode);
                    return entry ? entry.players : null;
                });

                return {
                    label: mode,
                    data,
                    borderColor: getModeColor(mode),
                    backgroundColor: getModeColor(mode) + '40',
                    fill: true,
                    tension: 0.3,
                    pointRadius: data.length > 100 ? 0 : 2,
                    pointHoverRadius: 4,
                    borderWidth: 2,
                    spanGaps: false,
                };
            });
        } else {
            // Aggregated: single dataset summing all gamemodes
            const data = timestamps.map(ts => {
                const entries = gamemodeData.filter(d => d.timestamp === ts);
                const sum = entries.reduce((acc, e) => acc + (e.players || 0), 0);
                return entries.length > 0 ? sum : null;
            });

            datasets = [{
                label: 'Total Players',
                data,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: data.length > 100 ? 0 : 2,
                pointHoverRadius: 4,
                borderWidth: 2,
                spanGaps: false,
            }];
        }

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: viewMode === 'stacked',
                        position: 'top',
                    },
                    tooltip: {
                        backgroundColor: 'rgba(23, 23, 23, 0.9)',
                        titleColor: '#f97316',
                        bodyColor: '#fff',
                        borderColor: '#f97316',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            title: (items) => {
                                if (items[0]) {
                                    const dataPoint = gamemodeData.find(d => d.timestamp === timestamps[items[0].dataIndex]);
                                    if (dataPoint) {
                                        return new Date(dataPoint.timestamp).toLocaleString();
                                    }
                                }
                                return '';
                            },
                            label: (context) => {
                                const value = context.raw;
                                const label = context.dataset.label || '';
                                return `${label}: ${value}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: viewMode === 'stacked',
                        grid: {
                            color: 'rgba(82, 82, 91, 0.3)',
                        },
                        ticks: {
                            color: '#9ca3af',
                            maxRotation: 45,
                            maxTicksLimit: 10,
                        }
                    },
                    y: {
                        stacked: viewMode === 'stacked',
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(82, 82, 91, 0.3)',
                        },
                        ticks: {
                            color: '#9ca3af',
                            callback: (value) => Math.round(Number(value))
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [gamemodeData, selectedRange, viewMode]);

    // Create/update server share chart when data changes
    useEffect(() => {
        if (!serverShareChartRef.current || serverShareData.length === 0 || !selectedGamemode) {
            if (serverShareChartInstance.current) {
                serverShareChartInstance.current.destroy();
                serverShareChartInstance.current = null;
            }
            return;
        }

        // Destroy existing chart
        if (serverShareChartInstance.current) {
            serverShareChartInstance.current.destroy();
        }

        const ctx = serverShareChartRef.current.getContext('2d');
        if (!ctx) return;

        // Get unique timestamps and server groups
        const timestamps = Array.from(new Set(serverShareData.map(d => d.timestamp))).sort((a, b) => a - b);
        const serverGroups = Array.from(new Set(serverShareData.map(d => d.groupName))).sort();

        // Format timestamps for labels
        const labels = timestamps.map(timestamp => {
            const date = new Date(timestamp);
            if (selectedRange === '1d') {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (selectedRange === '7d' || selectedRange === '14d') {
                return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
            } else {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
        });

        // Build datasets - one per server group
        const datasets = serverGroups.map(groupName => {
            const data = timestamps.map(ts => {
                const entry = serverShareData.find(d => d.timestamp === ts && d.groupName === groupName);
                return entry ? entry.players : null;
            });

            return {
                label: groupName,
                data,
                borderColor: getModeColor(groupName),
                backgroundColor: getModeColor(groupName) + '40',
                fill: true,
                tension: 0.3,
                pointRadius: data.length > 100 ? 0 : 2,
                pointHoverRadius: 4,
                borderWidth: 2,
                spanGaps: false,
            };
        });

        serverShareChartInstance.current = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    tooltip: {
                        backgroundColor: 'rgba(23, 23, 23, 0.9)',
                        titleColor: '#f97316',
                        bodyColor: '#fff',
                        borderColor: '#f97316',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            title: (items) => {
                                if (items[0]) {
                                    const dataPoint = serverShareData.find(d => d.timestamp === timestamps[items[0].dataIndex]);
                                    if (dataPoint) {
                                        return new Date(dataPoint.timestamp).toLocaleString();
                                    }
                                }
                                return '';
                            },
                            label: (context) => {
                                const value = context.raw;
                                const label = context.dataset.label || '';
                                return `${label}: ${value}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(82, 82, 91, 0.3)',
                        },
                        ticks: {
                            color: '#9ca3af',
                            maxRotation: 45,
                            maxTicksLimit: 10,
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(82, 82, 91, 0.3)',
                        },
                        ticks: {
                            color: '#9ca3af',
                            callback: (value) => Math.round(Number(value))
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
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
        setSelectedGamemode(value === '' ? null : value);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-700">
                    <h2 className="text-xl font-bold text-white">
                        <span className="text-orange-400">Global</span> Player Statistics
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-700/50 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Controls */}
                <div className="p-4 border-b border-neutral-700 space-y-3">
                    {/* Date Range Selector */}
                    <div className="flex flex-wrap gap-2">
                        {DATE_RANGE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setSelectedRange(option.value)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    selectedRange === option.value
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                        : 'bg-neutral-800/50 text-gray-400 border border-neutral-700/50 hover:bg-neutral-700/50'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {/* View Mode Toggle and Gamemode Dropdown */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                            <button
                                onClick={() => setViewMode('stacked')}
                                className={`px-4 py-1.5 text-sm font-medium transition-all ${
                                    viewMode === 'stacked'
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : 'bg-neutral-800/50 text-gray-400 hover:bg-neutral-700/50'
                                }`}
                            >
                                Stacked
                            </button>
                            <button
                                onClick={() => setViewMode('aggregated')}
                                className={`px-4 py-1.5 text-sm font-medium transition-all border-l border-neutral-700 ${
                                    viewMode === 'aggregated'
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : 'bg-neutral-800/50 text-gray-400 hover:bg-neutral-700/50'
                                }`}
                            >
                                Aggregated
                            </button>
                        </div>

                        <select
                            value={selectedGamemode || ''}
                            onChange={handleGamemodeChange}
                            className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        >
                            <option value="">All Gamemodes</option>
                            {gamemodeList.map(gm => (
                                <option key={gm.modeName} value={gm.modeName}>
                                    {gm.modeName} ({gm.serverCount} servers)
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Chart Area */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {/* Main Chart */}
                    <div className="min-h-[300px]">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-400 border-t-transparent"></div>
                            </div>
                        ) : fetchError ? (
                            <div className="flex items-center justify-center h-full text-red-400">
                                {fetchError}
                            </div>
                        ) : gamemodeData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                No data available for this time range
                            </div>
                        ) : (
                            <canvas ref={chartRef} />
                        )}
                    </div>

                    {/* Server Share Chart */}
                    {selectedGamemode && (
                        <div className="min-h-[300px]">
                            <h3 className="text-sm font-medium text-gray-300 mb-2">
                                Server Share: {selectedGamemode}
                            </h3>
                            {serverShareLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-400 border-t-transparent"></div>
                                </div>
                            ) : serverShareError ? (
                                <div className="flex items-center justify-center h-full text-red-400">
                                    {serverShareError}
                                </div>
                            ) : serverShareData.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-400">
                                    No server share data available
                                </div>
                            ) : (
                                <canvas ref={serverShareChartRef} />
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-700 text-xs text-gray-500">
                    {selectedGamemode
                        ? `Showing player count for ${selectedGamemode} across tracked servers`
                        : 'Showing total player count across all tracked servers'}
                </div>
            </div>
        </div>
    );
};

export default GlobalStatsChart;
