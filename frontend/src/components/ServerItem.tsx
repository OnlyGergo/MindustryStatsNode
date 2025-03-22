import React, { useState } from 'react';
import { ServerWithHistory } from '../../../common/models/serverData';
import ServerHistoryChart from './ServerHistoryChart';
import ServerDetailsModal from './ServerDetailsModal';

interface ServerItemProps {
    server: ServerWithHistory;
}

const ServerItem: React.FC<ServerItemProps> = ({ server }) => {
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const serverData = server.currentData;
    const serverStatus = server.online ? 'Online' : 'Offline';
    const statusClass = server.online
        ? 'bg-green-100 text-green-800'
        : 'bg-red-100 text-red-800';

    return (
        <div className="p-3 server-item">
            <div className="flex flex-wrap justify-between items-center">
                <div>
                    <h4 className="font-medium">{server.host}:{server.port}</h4>
                    <div className="flex items-center mt-1">
            <span className={`${statusClass} text-xs px-2 py-0.5 rounded-full`}>
              {serverStatus}
            </span>
                        {server.online && serverData && (
                            <>
                <span className="text-xs text-gray-500 ml-2">
                  {serverData.players}/{serverData.playerLimit} players
                </span>
                                <span className="text-xs text-gray-500 ml-2">
                  {serverData.ping}ms
                </span>
                            </>
                        )}
                    </div>
                </div>

                {server.online && serverData && (
                    <div className="text-right">
                        <div className="text-lg font-bold text-indigo-600">{serverData.players}</div>
                        <div className="text-xs text-gray-500">players</div>
                    </div>
                )}
            </div>

            {server.online && serverData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                    <div className="bg-gray-50 p-1 rounded">
                        <span className="text-gray-500">Map:</span>
                        <span className="font-medium">{serverData.mapName || 'Unknown'}</span>
                    </div>
                    <div className="bg-gray-50 p-1 rounded">
                        <span className="text-gray-500">Wave:</span>
                        <span className="font-medium">{serverData.wave || '0'}</span>
                    </div>
                    <div className="bg-gray-50 p-1 rounded">
                        <span className="text-gray-500">Mode:</span>
                        <span className="font-medium">
              {serverData.modeName || getGameModeName(serverData.mode)}
            </span>
                    </div>
                    <div className="bg-gray-50 p-1 rounded">
                        <span className="text-gray-500">Version:</span>
                        <span className="font-medium">
              {serverData.versionType || ''} {serverData.version || ''}
            </span>
                    </div>
                </div>
            )}

            {serverData?.description && (
                <div className="mt-2 text-xs italic text-gray-600 truncate">
                    {serverData.description}
                </div>
            )}

            <div className="mt-3 chart-container">
                <ServerHistoryChart history={server.history} />
            </div>

            <div className="mt-3 flex justify-end space-x-2">
                <button
                    onClick={() => setShowDetailsModal(true)}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 text-xs rounded transition-colors"
                >
                    View Details
                </button>
                <button
                    onClick={() => window.open(`/api/servers/${server.host}/${server.port}/maps`, '_blank')}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-xs rounded transition-colors"
                >
                    Map History
                </button>
                <button
                    onClick={() => window.open(`/api/servers/${server.host}/${server.port}/motd`, '_blank')}
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 text-xs rounded transition-colors"
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

function getGameModeName(mode?: number): string {
    return ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'][mode || 0] || 'Unknown';
}

export default ServerItem;