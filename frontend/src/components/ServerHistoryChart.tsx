import React, { useEffect, useRef } from 'react';
import { Chart, LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import { HistoryPoint } from '../../../common/models/serverData';

// Register Chart.js components
Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler);

interface ServerHistoryChartProps {
    history: HistoryPoint[];
}

const ServerHistoryChart: React.FC<ServerHistoryChartProps> = ({ history }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        // Cleanup previous chart
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        // Format data
        const labels = history.map(h => formatTime(h.timestamp));
        const data = history.map(h => h.players);

        // Create new chart
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Players',
                    data,
                    borderColor: 'rgb(79, 70, 229)',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.1,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300 // Faster animations
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0,
                            font: { size: 10 }
                        },
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 6,
                            font: { size: 9 }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
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
                        hitRadius: 10,
                        hoverRadius: 4
                    }
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [history]);

    const formatTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="chart-container">
            <canvas ref={chartRef}></canvas>
        </div>
    );
};

export default ServerHistoryChart;