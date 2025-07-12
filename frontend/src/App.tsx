import React, { useState, useEffect } from 'react';
import { ServerWithHistory } from  '../../common/models/serverData';
import ServerGroup from './components/ServerGroup';
import useWebSocket from './hooks/useWebSocket';
import {isHub} from "./util/mindustry.ts";

const App: React.FC = () => {
    const [serverGroups, setServerGroups] = useState<Record<string, ServerWithHistory[]>>({});
    const [lastUpdated, setLastUpdated] = useState<string>('Loading...');
    const [totalServers, setTotalServers] = useState<number>(0);
    const [onlineServers, setOnlineServers] = useState<number>(0);
    const [totalPlayers, setTotalPlayers] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);

    const {connectionStatus, data} = useWebSocket();

    useEffect(() => {
        if (data && data.type === 'init' || data?.type === 'update') {
            processServerData(data.data);
            setLastUpdated(new Date().toLocaleString());
            setLoading(false);
        }
    }, [data]);

    const processServerData = (servers: ServerWithHistory[]) => {
        if (!servers || !Array.isArray(servers)) {
            setError(true);
            return;
        }

        // Group servers by name
        const groups: Record<string, ServerWithHistory[]> = {};
        servers.forEach(server => {
            if (!groups[server.name]) {
                groups[server.name] = [];
            }
            groups[server.name].push(server);
        });

        // Sort servers within each group
        Object.keys(groups).forEach(groupName => {
            groups[groupName].sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1;
                return (b.currentData?.players || 0) - (a.currentData?.players || 0);
            });
        });

        // Sort the groups according to player count (desc)
        const sortedGroups: Record<string, ServerWithHistory[]> = Object.fromEntries(
            Object.entries(groups).sort((a, b) => {
                const aPlayers = a[1].reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);
                const bPlayers = b[1].reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);
                return bPlayers - aPlayers; // descending order
            })
        );

        setServerGroups(sortedGroups);
        setTotalServers(servers.length);
        setOnlineServers(servers.filter(s => s.online).length);
        setTotalPlayers(servers.reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0));
    };

    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const handleExpandAll = () => {
        setExpandedGroups(new Set(Object.keys(serverGroups)));
    };

    const handleCollapseAll = () => {
        setExpandedGroups(new Set());
    };

    const toggleGroupExpanded = (groupName: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupName)) {
            newExpanded.delete(groupName);
        } else {
            newExpanded.add(groupName);
        }
        setExpandedGroups(newExpanded);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            {/* Animated background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
                <div
                    className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
                    style={{animationDelay: '1s'}}></div>
                <div
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-green-500/5 rounded-full blur-3xl animate-pulse"
                    style={{animationDelay: '2s'}}></div>
            </div>

            <div className="relative container mx-auto p-6">
                <header
                    className="bg-slate-800/30 backdrop-blur-md border border-cyan-500/30 text-white p-6 rounded-xl shadow-2xl mb-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-cyan-400">Mindustry Server Monitor</h1>
                            <p className="mt-2 text-sm text-gray-300">Real-time player counts and status</p>
                        </div>
                        <div className="flex items-center">
              <span className={`px-4 py-2 rounded-full text-sm flex items-center border backdrop-blur-sm ${
                  connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      connectionStatus === 'reconnecting' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                          'bg-red-500/20 text-red-400 border-red-500/30'
              }`}>
                <span className="inline-block w-2 h-2 rounded-full bg-current mr-2"></span>
                  {connectionStatus === 'connected' ? 'Connected' :
                      connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                          'Connection Error'}
              </span>
                        </div>
                    </div>
                </header>

                <div className="mb-6 flex flex-wrap items-center justify-between">
                    <div className="mb-4 sm:mb-0">
                        <h2 className="text-xl font-semibold text-white">Server Status</h2>
                        <p className="text-sm text-gray-400">Last updated: {lastUpdated}</p>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            onClick={handleExpandAll}
                            className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-4 py-2 rounded-lg text-sm transition-colors backdrop-blur-sm"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={handleCollapseAll}
                            className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 border border-slate-600/30 px-4 py-2 rounded-lg text-sm transition-colors backdrop-blur-sm"
                        >
                            Collapse All
                        </button>
                    </div>
                </div>

                <div className="mb-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl">
                            <div className="text-gray-400 text-sm">Total Servers</div>
                            <div className="text-2xl font-bold text-white">{totalServers}</div>
                        </div>
                        <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl">
                            <div className="text-gray-400 text-sm">Online Servers</div>
                            <div className="text-2xl font-bold text-green-400">{onlineServers}</div>
                        </div>
                        <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl">
                            <div className="text-gray-400 text-sm">Total Players</div>
                            <div
                                className="text-2xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">{totalPlayers}</div>
                        </div>
                        <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl">
                            <div className="text-gray-400 text-sm">Server Groups</div>
                            <div className="text-2xl font-bold text-white">{Object.keys(serverGroups).length}</div>
                        </div>
                    </div>
                </div>

                {loading && (
                    <div
                        className="text-center p-8 bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl mb-6">
                        <div
                            className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-cyan-400 border-t-transparent"></div>
                        <p className="mt-4 text-gray-300">Loading server data...</p>
                    </div>
                )}

                {error && (
                    <div
                        className="bg-red-500/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-xl backdrop-blur-sm mb-6">
                        <span className="block sm:inline">Failed to load server data. Please try again later.</span>
                    </div>
                )}

                <div className="space-y-4">
                    {Object.entries(serverGroups).map(([groupName, servers]) => (
                        <ServerGroup
                            key={groupName}
                            name={groupName}
                            servers={servers}
                            expanded={expandedGroups.has(groupName)}
                            onToggleExpand={() => toggleGroupExpanded(groupName)}
                        />
                    ))}
                </div>

                <footer className="mt-8 text-center text-sm text-gray-500 py-6">
                    <p>Mindustry Server Monitor | Last updated: {lastUpdated}</p>
                </footer>
            </div>
        </div>
    );
}

export default App;