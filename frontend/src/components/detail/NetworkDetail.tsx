import React, {useEffect, useState} from 'react';
import NetworkHistoryChart from './NetworkHistoryChart.tsx';
import CopyButton from "../CopyButton.tsx";
import ShareButton from "../ShareButton.tsx";
import {NetworkDetails} from "../../../../common/models/serverData.ts";

const NetworkDetail: React.FC<{ network: NetworkDetails }> = ({ network }) => {
    const [details, setDetails] = useState<NetworkDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [showIp, setShowIp] = useState(true);

    // Fetch additional network details (player peaks, top server, etc.)
    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const response = await fetch(`/api/networks/${network.id}/details`);
                if (!response.ok) throw new Error('Failed to fetch network details');
                const data: NetworkDetails = await response.json();
                setDetails(data);
            } catch (error) {
                console.error('Error fetching network details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [network]);

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-400 border-t-transparent"></div>
            </div>
        );
    }

    if (!details) {
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-red-400">Failed to load network details.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-3 sm:p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-white mb-2 break-words">
                                {String(details.name)}
                            </h1>
                            <p className="text-gray-300 mb-4 text-sm sm:text-base break-words">
                                Network
                            </p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                                <span className="text-xs sm:text-sm text-gray-400">
                                    {details.activeServers}/{details.totalServers} servers active
                                </span>
                            </div>
                            {/* Action buttons - stacked on mobile */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                <CopyButton
                                    text={`${window.location.origin}${window.location.pathname}/network/${details.id}`}
                                    className="bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 text-xs sm:text-sm px-2 sm:px-3 py-1 rounded transition-colors border border-neutral-600/50"
                                />
                                <ShareButton
                                    networkId={details.id}
                                    className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-xs sm:text-sm px-2 sm:px-3 py-1 rounded transition-colors border border-orange-500/30"
                                />
                            </div>
                        </div>

                        <div className="text-left sm:text-right flex-shrink-0">
                            <div className="text-3xl sm:text-4xl font-bold text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">
                                {details.topServer ? String(details.topServer.players) : '0'}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-400">top server players</div>
                        </div>
                    </div>

                    {details.topServer && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-2 sm:p-3 rounded-lg">
                                <span className="text-gray-400">Top Server: </span>
                                <span className="font-medium text-white break-words">{String(details.topServer.name)}</span>
                            </div>
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-2 sm:p-3 rounded-lg">
                                <span className="text-gray-400">Host: </span>
                                <span className="font-medium text-white break-words">
                                    {showIp ? `${details.topServer.host}:${details.topServer.port}` : 'Hidden'}
                                </span>
                                <button
                                    onClick={() => setShowIp(!showIp)}
                                    className="ml-2 text-xs text-gray-400 hover:text-gray-300"
                                >
                                    {showIp ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-2 sm:p-3 rounded-lg">
                                <span className="text-gray-400">Players: </span>
                                <span className="font-medium text-white">{details.topServer.players}</span>
                            </div>
                            <div className="bg-neutral-700/30 backdrop-blur-sm border border-neutral-600/30 p-2 sm:p-3 rounded-lg">
                                <span className="text-gray-400">Servers: </span>
                                <span className="font-medium text-white">{details.totalServers}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Player Peaks */}
                <div className="bg-neutral-800/30 backdrop-blur-sm border border-neutral-700/50 p-4 sm:p-6 rounded-xl mb-4 sm:mb-6">
                    <h4 className="font-medium mb-3 sm:mb-4 text-orange-400 text-base sm:text-lg">Player Peaks</h4>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.3)]">{details.playerPeaks.daily}</div>
                            <div className="text-xs sm:text-sm text-gray-400">Today</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.3)]">{details.playerPeaks.weekly}</div>
                            <div className="text-xs sm:text-sm text-gray-400">This Week</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.3)]">{details.playerPeaks.allTime}</div>
                            <div className="text-xs sm:text-sm text-gray-400">All Time</div>
                        </div>
                    </div>
                </div>

                {/* Player History Chart */}
                <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
                    <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Player History</h2>
                    <div className="h-64 sm:h-96">
                        <NetworkHistoryChart network={details} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NetworkDetail;
