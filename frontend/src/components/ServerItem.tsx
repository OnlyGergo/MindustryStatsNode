import React, {useState} from 'react';
import ServerHistoryChart from './ServerHistoryChart';
import ServerDetailsModal from './ServerDetailsModal';
import {removeColors, getGameModeName} from "../util/mindustry.ts";
import {formatDate} from "../util/general.ts";
import CopyButton from "./CopyButton.tsx";

const ServerItem: React.FC<{ server: any }> = ({ server }) => {
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const serverData = server.currentData;
    const serverStatus = server.online ? 'Online' : server.lastSeen ? 'Offline - Last Seen ' + formatDate(server.lastSeen) : 'Offline';
    const statusClass = server.online
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30';

    return (
        <div className="p-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-lg">
            <div className="flex flex-wrap justify-between items-center">
                <div className="flex items-center space-x-3">
          <span className={`${statusClass} text-xs px-3 py-1 rounded-full border backdrop-blur-sm`}>
            {serverStatus}
          </span>
                    {server.online && serverData && (
                        <>
              <span className="text-xs text-gray-400">
                {serverData.players}/{serverData.playerLimit} players
              </span>
                            <span className="text-xs text-gray-400">
                {serverData.ping}ms
              </span>
                            <CopyButton
                                text={`${server.host}:${server.port}`}
                                className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 text-xs px-2 py-1 rounded transition-colors border border-slate-600/50"
                            />
                        </>
                    )}
                </div>

                {server.online && serverData && (
                    <div className="text-right">
                        <div className="text-2xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                            {String(serverData.players)}
                        </div>
                        <div className="text-xs text-gray-400">players</div>
                    </div>
                )}
            </div>

            {serverData?.serverName && (
                <div className="mt-3 text-lg font-bold text-white truncate">
                    {String(removeColors(serverData.serverName))}
                </div>
            )}

            {serverData?.description && (
                <div className="mt-2 text-sm text-gray-300 truncate">
                    {String(removeColors(serverData.description))}
                </div>
            )}

            {serverData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs">
                    <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-2 rounded">
                        <span className="text-gray-400">Map: </span>
                        <span className="font-medium text-white">{String(removeColors(serverData.mapName)) || 'Unknown'}</span>
                    </div>
                    <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-2 rounded">
                        <span className="text-gray-400">Wave: </span>
                        <span className="font-medium text-white">{serverData.wave || '0'}</span>
                    </div>
                    <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-2 rounded">
                        <span className="text-gray-400">Mode: </span>
                        <span className="font-medium text-white">
              {String(removeColors(serverData.modeName)) || getGameModeName(serverData.mode)}
            </span>
                    </div>
                    <div className="bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 p-2 rounded">
                        <span className="text-gray-400">Version: </span>
                        <span className="font-medium text-white">
              {String(serverData.versionType) || ''} {String(serverData.version) || ''}
            </span>
                    </div>
                </div>
            )}

            <div className="mt-4 bg-slate-900/30 backdrop-blur-sm border border-slate-700/30 rounded-lg p-3">
                <ServerHistoryChart history={server.history} />
            </div>

            <div className="mt-4 flex justify-end space-x-2">
                <button
                    onClick={() => setShowDetailsModal(true)}
                    className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-3 py-1 text-xs rounded transition-colors backdrop-blur-sm"
                >
                    View Details
                </button>
                <button
                    onClick={() => window.open(`/api/servers/${server.host}/${server.port}/maps`, '_blank')}
                    className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 px-3 py-1 text-xs rounded transition-colors backdrop-blur-sm"
                >
                    Map History
                </button>
                <button
                    onClick={() => window.open(`/api/servers/${server.host}/${server.port}/motd`, '_blank')}
                    className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 px-3 py-1 text-xs rounded transition-colors backdrop-blur-sm"
                >
                    MOTD History
                </button>
            </div>

            {showDetailsModal && (
                <ServerDetailsModal
                    server={server}
                    onClose={() => setShowDetailsModal(false)}
                />
            )}
        </div>
    );
};

export default ServerItem;