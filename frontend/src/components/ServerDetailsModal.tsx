import {FC, useEffect, useState} from 'react';
import {getGameModeName, removeColors} from "../util/mindustry.ts";
import {formatDate} from "../util/general.ts";
import CopyButton from "./CopyButton.tsx";
import {createPortal} from "react-dom";

const ServerDetailsModal: FC<{ server: any; onClose: () => void }> = ({ server, onClose }) => {
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const response = await fetch(`/api/servers/${server.id}/details`);
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

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const formatUptime = (percentage: number) => {
        return `${percentage.toFixed(1)}%`;
    };

    const modalContent = (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <div className="bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <span className="text-xl font-bold text-cyan-400">{removeColors(server.currentData?.serverName || server.name)}</span>
                        <CopyButton
                            text={`${server.host}:${server.port}`}
                            className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 text-xs px-2 py-1 rounded transition-colors border border-slate-600/50"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-xl transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex justify-center my-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cyan-400 border-t-transparent"></div>
                        </div>
                    ) : details ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-4 rounded-lg">
                                    <h4 className="font-medium mb-3 text-cyan-400">Player Peaks</h4>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(0,255,255,0.3)]">{details.playerPeaks.daily}</div>
                                            <div className="text-xs text-gray-400">Today</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(0,255,255,0.3)]">{details.playerPeaks.weekly}</div>
                                            <div className="text-xs text-gray-400">This Week</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(0,255,255,0.3)]">{details.playerPeaks.allTime}</div>
                                            <div className="text-xs text-gray-400">All Time</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 p-4 rounded-lg">
                                    <h4 className="font-medium mb-3 text-green-400">Server Uptime</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-green-400">{formatUptime(details.uptime.last24h)}</div>
                                            <div className="text-xs text-gray-400">Last 24h</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-green-400">{formatUptime(details.uptime.last7d)}</div>
                                            <div className="text-xs text-gray-400">Last 7 Days</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-6">
                                <h4 className="font-medium mb-3 text-purple-400">Recent Map Changes</h4>
                                {details.mapHistory.length > 0 ? (
                                    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                                        {details.mapHistory.map((item: any, index: number) => (
                                            <div key={index} className="p-2 border-b border-slate-700/30 last:border-b-0">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium text-white">{String(removeColors(item.mapName))} - {getGameModeName(item.gameMode)}</span>
                                                    <span className="text-xs text-gray-400">{formatDate(item.timestamp)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm">No map history available</p>
                                )}
                            </div>

                            <div>
                                <h4 className="font-medium mb-3 text-yellow-400">MOTD History</h4>
                                {details.motdHistory.length > 0 ? (
                                    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                                        {details.motdHistory.map((item: any, index: number) => (
                                            <div key={index} className="p-2 border-b border-slate-700/30 last:border-b-0">
                                                <div className="text-sm font-bold text-white">{String(removeColors(item.name))}</div>
                                                <div className="text-xs text-gray-300">{String(removeColors(item.motd))}</div>
                                                <div className="text-xs text-gray-500 mt-1">{formatDate(item.timestamp)}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm">No MOTD history available</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-red-400">Failed to load server details</p>
                    )}
                </div>

                <div className="p-6 border-t border-slate-700/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 border border-slate-600/50 px-4 py-2 rounded-lg text-sm transition-colors backdrop-blur-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default ServerDetailsModal;