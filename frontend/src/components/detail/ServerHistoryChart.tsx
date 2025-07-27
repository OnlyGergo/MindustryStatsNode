import React, {useEffect, useRef} from 'react';
import { Chart, LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';

// Register Chart.js components
Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const ServerHistoryChart: React.FC<{ history: Array<{ timestamp: number; players: number }> }> = ({ history }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const labels = history.map(h => formatTime(h.timestamp));
        const data = history.map(h => h.players);

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Players',
                    data,
                    borderColor: 'rgb(0, 255, 255)',
                    backgroundColor: 'rgba(0, 255, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointBackgroundColor: 'rgb(0, 255, 255)',
                    pointBorderColor: 'rgb(0, 255, 255)',
                    pointHoverBackgroundColor: 'rgb(255, 0, 255)',
                    pointHoverBorderColor: 'rgb(255, 0, 255)'
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
                            color: 'rgba(0, 255, 255, 0.15)'
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
                            color: 'rgba(0, 255, 255, 0.15)'
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: 'rgb(0, 255, 255)',
                        bodyColor: 'rgb(255, 255, 255)',
                        borderColor: 'rgb(0, 255, 255)',
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
    }, [history]);

    const formatTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="h-full w-full">
            <canvas ref={chartRef}></canvas>
        </div>
    );
};

export default ServerHistoryChart;