import React, { useState } from 'react';
import ServerHistoryChart from './ServerHistoryChart.tsx';
import ServerDetailsModal from './ServerDetailsModal.tsx';
import {removeColors, getGameModeName} from "../../util/mindustry.ts";
import {formatDate} from "../../util/general.ts";
import CopyButton from "../CopyButton.tsx";

const ServerDetail: React.FC<{ server: any }> = ({ server }) => {
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const serverData = server.currentData;
    const serverStatus = server.online ? 'Online' : server.lastSeen ? 'Offline - Last Seen ' + formatDate(server.lastSeen) : 'Offline';
    const statusClass = server.online
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30';

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl p-6 mb-6">
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
                                            className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 text-sm px-3 py-1 rounded transition-colors border border-slate-600/50"
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        {server.online && serverData && (
                            <div className="text-right">
                                <div className="text-4xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                                    {String(serverData.players)}
                                </div>
                                <div className="text-sm text-gray-400">players online</div>
                            </div>
                        )}
                    </div>

                    {serverData && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Map: </span>
                                <span className="font-medium text-white">{String(removeColors(serverData.mapName)) || 'Unknown'}</span>
                            </div>
                            <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Wave: </span>
                                <span className="font-medium text-white">{serverData.wave || '0'}</span>
                            </div>
                            <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Mode: </span>
                                <span className="font-medium text-white">
                                    {String(removeColors(serverData.modeName)) || getGameModeName(serverData.mode)}
                                </span>
                            </div>
                            <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-3 rounded-lg">
                                <span className="text-gray-400">Version: </span>
                                <span className="font-medium text-white">
                                    {String(serverData.versionType) || ''} {String(serverData.version) || ''}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Player History Chart */}
                <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Player History</h2>
                    <div className="h-64">
                        <ServerHistoryChart history={server.history} />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Server Actions</h2>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => setShowDetailsModal(true)}
                            className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-4 py-2 rounded-lg transition-colors backdrop-blur-sm"
                        >
                            View Detailed Stats
                        </button>
                    </div>
                </div>

                {showDetailsModal && (
                    <ServerDetailsModal
                        server={server}
                        onClose={() => setShowDetailsModal(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default ServerDetail;