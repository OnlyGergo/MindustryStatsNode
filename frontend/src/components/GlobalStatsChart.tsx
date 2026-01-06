import React, { useEffect, useRef, useState } from 'react';
import { Chart, LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';

// Register Chart.js components
Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler);

type DateRangeOption = '1d' | '7d' | '14d' | '3m' | '12m';

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

const GlobalStatsChart: React.FC<GlobalStatsChartProps> = ({ onClose }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);
    const [selectedRange, setSelectedRange] = useState<DateRangeOption>('1d');
    const [chartData, setChartData] = useState<Array<{ timestamp: number; players: number | null }>>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Fetch global history data when range changes
    useEffect(() => {
        const fetchGlobalHistory = async () => {
            setLoading(true);
            setFetchError(null);

            // Validate selectedRange is one of the expected values
            const validRanges: DateRangeOption[] = ['1d', '7d', '14d', '3m', '12m'];
            const range = validRanges.includes(selectedRange) ? selectedRange : '1d';

            try {
                const response = await fetch(`/api/global/history?range=${range}`);
                if (response.ok) {
                    const data = await response.json();
                    setChartData(data);
                } else {
                    console.error('Failed to fetch global history data. Status:', response.status, response.statusText);
                    setFetchError('Unable to load global history data.');
                }
            } catch (error) {
                console.error('Error fetching global history data:', error);
                setFetchError('An error occurred while loading global history data.');
            } finally {
                setLoading(false);
            }
        };

        fetchGlobalHistory();
    }, [selectedRange]);

    // Create/update chart when data changes
    useEffect(() => {
        if (!chartRef.current || chartData.length === 0) return;

        // Destroy existing chart
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        // Format timestamps for labels
        const labels = chartData.map(entry => {
            const date = new Date(entry.timestamp);
            // Show more detail for shorter ranges
            if (selectedRange === '1d') {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (selectedRange === '7d' || selectedRange === '14d') {
                return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
            } else {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
        });

        const data = chartData.map(entry => entry.players);

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Total Players',
                    data,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: data.length > 100 ? 0 : 2,
                    pointHoverRadius: 4,
                    borderWidth: 2,
                    spanGaps: false, // Show gaps when data is null
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false,
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
                                    const dataPoint = chartData[items[0].dataIndex];
                                    return new Date(dataPoint.timestamp).toLocaleString();
                                }
                                return '';
                            },
                            label: (context) => `Total Players: ${context.raw}`
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
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [chartData, selectedRange]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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

                {/* Date Range Selector */}
                <div className="p-4 border-b border-neutral-700">
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
                </div>

                {/* Chart Area */}
                <div className="flex-1 p-4 min-h-[300px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-400 border-t-transparent"></div>
                        </div>
                    ) : fetchError ? (
                        <div className="flex items-center justify-center h-full text-red-400">
                            {fetchError}
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-400">
                            No data available for this time range
                        </div>
                    ) : (
                        <canvas ref={chartRef} />
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-700 text-xs text-gray-500">
                    Showing total player count across all tracked servers
                </div>
            </div>
        </div>
    );
};

export default GlobalStatsChart;
