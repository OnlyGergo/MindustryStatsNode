import React from 'react';
import { ServerWithHistory } from '../../../common/models/serverData';
import ServerItem from './ServerItem';
import {isHub} from "../util/mindustry.ts";

interface ServerGroupProps {
    name: string;
    servers: ServerWithHistory[];
    expanded: boolean;
    onToggleExpand: () => void;
}

const ServerGroup: React.FC<ServerGroupProps> = ({ name, servers, expanded, onToggleExpand }) => {
    const onlineServersCount = servers.filter(s => s.online).length;
    const totalPlayers = servers.reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);

    return (
        <div className={`bg-white rounded-lg shadow overflow-hidden server-group ${expanded ? '' : 'collapsed'}`}>
            <div
                className="bg-gray-50 px-4 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-100 group-header"
                onClick={onToggleExpand}
            >
                <div>
                    <h3 className="font-medium">{name}</h3>
                    <p className="text-xs text-gray-600">
                        {onlineServersCount}/{servers.length} servers online, {totalPlayers} players total
                    </p>
                </div>
                <div className="flex items-center">
                    <span className="text-lg font-bold text-indigo-600">{totalPlayers}</span>
                    <svg
                        className={`h-4 w-4 ml-2 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
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
                <div className="server-content divide-y">
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