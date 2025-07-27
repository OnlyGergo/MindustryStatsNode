import React from 'react';
import {formatUnsafeText, removeColors} from "../../util/mindustry.ts";

const ServerItem: React.FC<{
    server: any;
    onSelect: (server: any) => void;
    isSelected: boolean;
}> = ({ server, onSelect, isSelected }) => {
    const serverData = server.currentData;
    //const serverStatus = server.online ? 'Online' : server.lastSeen ? 'Offline - Last Seen ' + formatDate(server.lastSeen) : 'Offline';
    const statusClass = server.online
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30';

    return (
        <div
            className={`p-3 cursor-pointer transition-colors flex items-center justify-between ${
                isSelected
                    ? 'bg-cyan-500/20 border-l-4 border-l-cyan-400'
                    : 'hover:bg-slate-700/30'
            }`}
            onClick={() => onSelect(server)}
        >
            <div className="flex flex-col flex-1 min-w-0 mr-4">
                {serverData?.serverName && (
                    <div className="text-sm font-bold text-white truncate mb-1">
                        {String(removeColors(serverData.serverName))}
                    </div>
                )}

                {serverData?.description && (
                    <div
                        className="text-xs text-gray-300 truncate mb-2"
                        dangerouslySetInnerHTML={{ __html: formatUnsafeText(serverData.description) }}
                    >
                    </div>
                )}

                {server.online && serverData && (
                    <div className="text-s text-gray-400">
                        <span>{String(removeColors(serverData.mapName)) || 'Unknown'}</span>
                    </div>
                )}
            </div>
            <div className="flex flex-col items-end">
                <span className={`${statusClass} text-xs px-2 py-1 rounded-full border backdrop-blur-sm mb-1`}>
                    {server.online ? 'Online - ' + serverData.ping + 'ms' : 'Offline'}
                </span>
                {server.online && serverData && (
                    <div className="text-right">
                        <div className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                            {String(serverData.players)}
                            <span className="text-gray-500 ml-1">/ {String(serverData.playerLimit)}</span>
                        </div>
                        <div className="text-xs text-gray-400">players</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServerItem;