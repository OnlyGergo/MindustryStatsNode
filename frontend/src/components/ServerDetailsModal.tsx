import React, { useEffect, useState } from 'react';
import { ServerWithHistory } from '../../../common/models/serverData';

interface ServerDetailsModalProps {
    server: ServerWithHistory;
    onClose: () => void;
}

interface ServerDetails {
    mapHistory: Array<{timestamp: number, mapName: string}>;
    motdHistory: Array<{timestamp: number, message: string}>;
    playerPeaks: {
        allTime: number;
        daily: number;
        weekly: number;
    };
    uptime: {
        last24h: number;
        last7d: number;
    };
}

const ServerDetailsModal: React.FC<ServerDetailsModalProps> = ({ server, onClose }) => {
    const [details, setDetails] = useState<ServerDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const response = await fetch(`/api/servers/${server.host}/${server.port}/details`);
                if (!response.ok) throw new Error('Failed to fetch server details');
                const data = await response.json();
                setDetails(data);
            } catch (error) {
                console.error('Error fetching server details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [server]);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const formatUptime = (percentage: number) => {
        return `${(percentage * 100).toFixed(1)}%`;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-lg font-bold">{server.host}:{server.port} Details</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-4">
                    {loading ? (
                        <div className="flex justify-center my-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                        </div>
                    ) : details ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <h4 className="font-medium mb-2">Player Peaks</h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-indigo-600">{details.playerPeaks.daily}</div>
                                            <div className="text-xs">Today</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-indigo-600">{details.playerPeaks.weekly}</div>
                                            <div className="text-xs">This Week</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-indigo-600">{details.playerPeaks.allTime}</div>
                                            <div className="text-xs">All Time</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <h4 className="font-medium mb-2">Server Uptime</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-green-600">{formatUptime(details.uptime.last24h)}</div>
                                            <div className="text-xs">Last 24h</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-green-600">{formatUptime(details.uptime.last7d)}</div>
                                            <div className="text-xs">Last 7 Days</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-6">
                                <h4 className="font-medium mb-2">Recent Map Changes</h4>
                                {details.mapHistory.length > 0 ? (
                                    <div className="bg-gray-50 rounded-lg p-2 max-h-40 overflow-y-auto">
                                        {details.mapHistory.map((item, index) => (
                                            <div key={index} className="p-2 border-b last:border-b-0">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium">{item.mapName}</span>
                                                    <span className="text-xs text-gray-500">{formatDate(item.timestamp)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No map history available</p>
                                )}
                            </div>

                            <div>
                                <h4 className="font-medium mb-2">MOTD History</h4>
                                {details.motdHistory.length > 0 ? (
                                    <div className="bg-gray-50 rounded-lg p-2 max-h-40 overflow-y-auto">
                                        {details.motdHistory.map((item, index) => (
                                            <div key={index} className="p-2 border-b last:border-b-0">
                                                <div className="text-sm">{item.message}</div>
                                                <div className="text-xs text-gray-500 mt-1">{formatDate(item.timestamp)}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No MOTD history available</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-red-500">Failed to load server details</p>
                    )}
                </div>

                <div className="p-4 border-t flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-sm transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ServerDetailsModal;