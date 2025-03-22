import React, { useState, useEffect } from 'react';
import { ServerWithHistory } from  '../../common/models/serverData';
import ServerGroup from './components/ServerGroup';
import useWebSocket from './hooks/useWebSocket';

const App: React.FC = () => {
    const [serverGroups, setServerGroups] = useState<Record<string, ServerWithHistory[]>>({});
    const [lastUpdated, setLastUpdated] = useState<string>('Loading...');
    const [totalServers, setTotalServers] = useState<number>(0);
    const [onlineServers, setOnlineServers] = useState<number>(0);
    const [totalPlayers, setTotalPlayers] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);

    const { connectionStatus, data } = useWebSocket();

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

        setServerGroups(groups);
        setTotalServers(servers.length);
        setOnlineServers(servers.filter(s => s.online).length);
        setTotalPlayers(servers.reduce((sum, server) => sum + (server.currentData?.players || 0), 0));
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
        <div className="bg-gray-100 min-h-screen text-gray-800">
            <div className="container mx-auto p-4">
                <header className="bg-indigo-600 text-white p-4 rounded-lg shadow mb-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold">Mindustry Server Monitor</h1>
                            <p className="mt-1 text-sm opacity-90">Real-time player counts and status</p>
                        </div>
                        <div className="flex items-center">
              <span
                  className={`px-2 py-1 rounded text-xs flex items-center ${
                      connectionStatus === 'connected' ? 'bg-green-500' :
                          connectionStatus === 'reconnecting' ? 'bg-yellow-500 blink' :
                              'bg-red-500'
                  }`}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-white mr-1"></span>
                  {connectionStatus === 'connected' ? 'Connected' :
                      connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                          'Connection Error'}
              </span>
                        </div>
                    </div>
                </header>

                <div className="mb-4 flex flex-wrap items-center justify-between">
                    <div className="mb-2 sm:mb-0">
                        <h2 className="text-lg font-semibold">Server Status</h2>
                        <p className="text-xs text-gray-600">Last updated: {lastUpdated}</p>
                    </div>
                    <div className="flex space-x-2">
                        <button
                            onClick={handleExpandAll}
                            className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={handleCollapseAll}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            Collapse All
                        </button>
                    </div>
                </div>

                <div className="mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
                        <div className="bg-white p-2 rounded shadow stats-card">
                            <div className="text-gray-600">Total Servers</div>
                            <div className="text-xl font-bold">{totalServers}</div>
                        </div>
                        <div className="bg-white p-2 rounded shadow stats-card">
                            <div className="text-gray-600">Online Servers</div>
                            <div className="text-xl font-bold text-green-600">{onlineServers}</div>
                        </div>
                        <div className="bg-white p-2 rounded shadow stats-card">
                            <div className="text-gray-600">Total Players</div>
                            <div className="text-xl font-bold text-indigo-600">{totalPlayers}</div>
                        </div>
                        <div className="bg-white p-2 rounded shadow stats-card">
                            <div className="text-gray-600">Server Groups</div>
                            <div className="text-xl font-bold">{Object.keys(serverGroups).length}</div>
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="text-center p-8 bg-white rounded-lg shadow mb-4">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-indigo-500 border-t-transparent"></div>
                        <p className="mt-2">Loading server data...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
                        <span className="block sm:inline">Failed to load server data. Please try again later.</span>
                    </div>
                )}

                <div className="space-y-3">
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

                <footer className="mt-6 text-center text-xs text-gray-500 py-4">
                    <p>Mindustry Server Monitor | Last updated: {lastUpdated}</p>
                </footer>
            </div>
        </div>
    );
};

export default App;