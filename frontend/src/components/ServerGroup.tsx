import React from 'react';
import ServerItem from './ServerItem';
import {isHub} from "../util/mindustry.ts";

const ServerGroup: React.FC<{
    name: string;
    servers: any[];
    expanded: boolean;
    onToggleExpand: () => void;
}> = ({ name, servers, expanded, onToggleExpand }) => {
    const onlineServersCount = servers.filter(s => s.online).length;
    const totalPlayers = servers.reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);

    return (
        <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl overflow-hidden">
            <div
                className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={onToggleExpand}
            >
                <div>
                    <h3 className="font-semibold text-white text-lg">{name}</h3>
                    <p className="text-sm text-gray-400">
                        {onlineServersCount}/{servers.length} servers online, {totalPlayers} players total
                    </p>
                </div>
                <div className="flex items-center space-x-4">
          <span className="text-2xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
            {totalPlayers}
          </span>
                    <svg
                        className={`h-5 w-5 text-cyan-400 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ServerGroup;