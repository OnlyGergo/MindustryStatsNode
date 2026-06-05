import {useEffect, useRef, useState} from 'react';
import { Chart, LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import {ServerElement, ServerHistory} from "../../../../common/models/serverData.ts";

// Register Chart.js components
Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler);

type DateRangeOption = '1d' | '7d' | '14d' | '3m' | '12m' | 'custom';

interface DateRange {
    label: string;
    value: DateRangeOption;
    hours?: number;
}

const DATE_RANGE_OPTIONS: DateRange[] = [
    { label: '1 Day', value: '1d', hours: 24 },
    { label: '7 Days', value: '7d', hours: 168 },
    { label: '14 Days', value: '14d', hours: 336 },
    { label: '3 Months', value: '3m', hours: 2190 },
    { label: '12 Months', value: '12m', hours: 8760 },
    { label: 'Custom', value: 'custom' },
];

const ServerHistoryChart = ({id}: ServerElement) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);
    const [selectedRange, setSelectedRange] = useState<DateRangeOption>('1d');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [chartData, setChartData] = useState<Array<ServerHistory>>([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [dateError, setDateError] = useState<string | null>(null);

    // Get today's date for max attribute on date inputs
    const today = new Date().toISOString().split('T')[0];

    // Fetch history data when range changes
    useEffect(() => {
        const fetchHistoryData = async () => {
            // Validate custom date range inline
            if (selectedRange === 'custom') {
                if (!customStartDate || !customEndDate) {
                    setDateError(null);
                    return;
                }
                const startTs = new Date(customStartDate).getTime();
                const endTs = new Date(customEndDate).getTime();
                if (endTs <= startTs) {
                    setDateError('End date must be after start date');
                    return;
                }
                setDateError(null);
            }

            setLoading(true);
            setFetchError(null);
            try {
                let url = `/api/servers/${id}/history?range=${selectedRange}`;
                
                if (selectedRange === 'custom' && customStartDate && customEndDate) {
                    const startTs = new Date(customStartDate).getTime();
                    const endTs = new Date(customEndDate).getTime();
                    url = `/api/servers/${id}/history?startDate=${startTs}&endDate=${endTs}`;
                }

                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    setChartData(data);
                } else {
                    console.error('Failed to fetch history data. Status:', response.status, response.statusText);
                    setFetchError('Unable to load server history data. Please try again later.');
                }
            } catch (error) {
                console.error('Error fetching history data:', error);
                setFetchError('An error occurred while loading server history data. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchHistoryData();
    }, [selectedRange, customStartDate, customEndDate, id]);

    useEffect(() => {
        if (!chartRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const labels = chartData.map(h => formatTime(h.timestamp, selectedRange));
        const data = chartData.map(h => h.players);

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Players',
                    data,
                    borderColor: 'rgb(249, 115, 22)',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointBackgroundColor: 'rgb(249, 115, 22)',
                    pointBorderColor: 'rgb(249, 115, 22)',
                    pointHoverBackgroundColor: 'rgb(251, 146, 60)',
                    pointHoverBorderColor: 'rgb(251, 146, 60)',
                    spanGaps: false // Show gaps when data is null
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0,
                            font: { size: 11 },
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            display: true,
                            color: 'rgba(249, 115, 22, 0.15)'
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8,
                            font: { size: 10 },
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            display: true,
                            color: 'rgba(249, 115, 22, 0.15)'
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: 'rgb(249, 115, 22)',
                        bodyColor: 'rgb(255, 255, 255)',
                        borderColor: 'rgb(249, 115, 22)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const item = items[0];
                                const label = item.chart.data.labels?.[item.dataIndex];
                                return label?.toString() || '';
                            },
                            label: (item) => `Players: ${item.formattedValue}`
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 0,
                        hitRadius: 12,
                        hoverRadius: 5
                    }
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [chartData, selectedRange]);

    const formatTime = (timestamp: number, range: DateRangeOption): string => {
        const date = new Date(timestamp);
        if (range === '1d') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (range === '7d' || range === '14d') {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    return (
        <div className="h-full w-full flex flex-col">
            {/* Date Range Selector */}
            <div className="flex flex-wrap gap-2 mb-4">
                {DATE_RANGE_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setSelectedRange(option.value)}
                        className={`px-3 py-1 text-sm rounded-lg transition-colors border ${
                            selectedRange === option.value
                                ? 'bg-orange-500/30 text-orange-400 border-orange-500/50'
                                : 'bg-neutral-700/30 text-gray-400 border-neutral-600/50 hover:bg-neutral-600/30'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {/* Custom Date Range Inputs */}
            {selectedRange === 'custom' && (
                <div className="flex gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="custom-start-date" className="text-sm text-gray-400">From:</label>
                        <input
                            id="custom-start-date"
                            type="date"
                            value={customStartDate}
                            max={today}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="bg-neutral-700/50 border border-neutral-600/50 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="custom-end-date" className="text-sm text-gray-400">To:</label>
                        <input
                            id="custom-end-date"
                            type="date"
                            value={customEndDate}
                            max={today}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="bg-neutral-700/50 border border-neutral-600/50 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                    </div>
                </div>
            )}

            {/* Date Range Error */}
            {dateError && (
                <div className="text-red-400 text-sm mb-4">
                    {dateError}
                </div>
            )}

            {/* Fetch Error */}
            {fetchError && (
                <div className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    {fetchError}
                </div>
            )}

            {/* Loading indicator */}
            {loading && (
                <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-400 border-t-transparent"></div>
                    <span className="ml-2 text-gray-400 text-sm">Loading history...</span>
                </div>
            )}

            {/* Chart */}
            <div className="flex-1 min-h-0">
                <canvas ref={chartRef}></canvas>
            </div>
        </div>
    );
};

export default ServerHistoryChart;