import React, { useState, useEffect } from 'react';
import ServerHistoryChart from './ServerHistoryChart.tsx';
import MapHistoryTable from './table/MapHistoryTable.tsx';
import MotdHistoryTable from './table/MotdHistoryTable.tsx';
import { removeColors, getGameModeName } from "../../util/mindustry.ts";
import { formatDate } from "../../util/general.ts";
import CopyButton from "../CopyButton.tsx";
import {ServerDetails} from "../../../../common/models/serverData.ts";

const ServerDetail: React.FC<{ server: any }> = ({ server }) => {
    const [details, setDetails] = useState<ServerDetails | null>(null);
    const [loading, setLoading] = useState(true);

    const serverData = server.currentData;
    const serverStatus = server.online ? 'Online' : server.lastSeen ? 'Offline - Last Seen ' + formatDate(server.lastSeen) : 'Offline';
    const statusClass = server.online
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30';

    // Fetch additional server details (map and MOTD history, player peaks, uptime)
    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const response = await fetch(`/api/servers/${server.id}/details`);
                if (!response.ok) throw new Error('Failed to fetch server details');
                const data: ServerDetails = await response.json();
                setDetails(data);
            } catch (error) {
                console.error('Error fetching server details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [server]);

    const formatUptime = (percentage: number) => {
        return `${percentage.toFixed(1)}%`;
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-400 border-t-transparent"></div>
            </div>
        );
    }

    if (!details) {
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-red-400">Failed to load server details.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto"> {/* Increased max-width */}
                {/* Header */}
                <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-6 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            {serverData?.serverName && (
                                <h1 className="text-2xl font-bold text-white mb-2">
                                    {String(removeColors(serverData.serverName))}
                                </h1>
                            )}
                            {serverData?.description && (
                                <p className="text-gray-300 mb-4">
                                    {String(removeColors(serverData.description))}
                                </p>
                            )}
                            <div className="flex items-center space-x-4">
                                <span className={`${statusClass} text-sm px-3 py-1 rounded-full border backdrop-blur-sm`}>
                                    {serverStatus}
                                </span>
                                {server.online && serverData && (
                                    <>
                                        <span className="text-sm text-gray-400">
                                            {serverData.players}/{serverData.playerLimit} players
                                        </span>
                                        <span className="text-sm text-gray-400">
                                            {serverData.ping}ms
                                        </span>
                                        <CopyButton
                                            text={`${server.host}:${server.port}`}
                                            className="bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 text-sm px-3 py-1 rounded transition-colors border border-neutral-600/50"
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        {server.online && serverData && (
                            <div className="text-right">
                                <div className="text-4xl font-bold text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">
                                    {String(serverData.players)}
                                </div>
                                <div className="text-sm text-gray-400">players online</div>
                            </div>
                        )}
                    </div>

                    {serverData && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Map: </span>
                                <span className="font-medium text-white">{String(removeColors(serverData.mapName)) || 'Unknown'}</span>
                            </div>
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Wave: </span>
                                <span className="font-medium text-white">{serverData.wave || '0'}</span>
                            </div>
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Mode: </span>
                                <span className="font-medium text-white">
                                    {String(removeColors(serverData.modeName)) || getGameModeName(serverData.mode)}
                                </span>
                            </div>
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Version: </span>
                                <span className="font-medium text-white">
                                    {String(serverData.versionType) || ''} {String(serverData.version) || ''}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Player Peaks and Uptime */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-neutral-800/30 backdrop-blur-sm border border-neutral-700/50 p-6 rounded-xl">
                        <h4 className="font-medium mb-4 text-orange-400 text-lg">Player Peaks</h4>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.3)]">{details.playerPeaks.daily}</div>
                                <div className="text-sm text-gray-400">Today</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.3)]">{details.playerPeaks.weekly}</div>
                                <div className="text-sm text-gray-400">This Week</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.3)]">{details.playerPeaks.allTime}</div>
                                <div className="text-sm text-gray-400">All Time</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-neutral-800/30 backdrop-blur-sm border border-neutral-700/50 p-6 rounded-xl">
                        <h4 className="font-medium mb-4 text-green-400 text-lg">Server Uptime</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">{formatUptime(details.uptime.last24h)}</div>
                                <div className="text-sm text-gray-400">Last 24h</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">{formatUptime(details.uptime.last7d)}</div>
                                <div className="text-sm text-gray-400">Last 7 Days</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Player History Chart */}
                <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Player History</h2>
                    <div className="h-96"> {/* Increased height */}
                        <ServerHistoryChart history={server.history} serverId={server.id} />
                    </div>
                </div>

                {/* Map History Table */}
                <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Map History</h2>
                    <MapHistoryTable mapHistory={details.allMaps} />
                </div>

                {/* MOTD History Table */}
                <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">MOTD History</h2>
                    <MotdHistoryTable motdHistory={details.allMotds} />
                </div>
            </div>
        </div>
    );
};

export default ServerDetail;
