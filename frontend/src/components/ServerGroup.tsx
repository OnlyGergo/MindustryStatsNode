import React from 'react';
import ServerItem from './ServerItem';
import {isHub} from "../util/mindustry.ts";

const ServerGroup: React.FC<{
    name: string;
    servers: any[];
    expanded: boolean;
    onToggleExpand: () => void;
    onServerSelect: (server: any) => void;
    selectedServer: any;
}> = ({ name, servers, expanded, onToggleExpand, onServerSelect, selectedServer }) => {
    const onlineServersCount = servers.filter(s => s.online).length;
    const totalPlayers = servers.reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);

    return (
        <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl overflow-hidden">
            <div
                className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700/50 px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={onToggleExpand}
            >
                <div>
                    <h3 className="font-semibold text-white text-sm">{name}</h3>
                    <p className="text-xs text-gray-400">
                        {onlineServersCount}/{servers.length} online, {totalPlayers} players
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                        {totalPlayers}
                    </span>
                    <svg
                        className={`h-4 w-4 text-cyan-400 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
            </div>
            {expanded && (
                <div className="divide-y divide-slate-700/50">
                    {servers.map(server => (
                        <ServerItem
                            key={`${server.host}-${server.port}`}
                            server={server}
                            onSelect={onServerSelect}
                            isSelected={selectedServer && selectedServer.host === server.host && selectedServer.port === server.port}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ServerGroup;