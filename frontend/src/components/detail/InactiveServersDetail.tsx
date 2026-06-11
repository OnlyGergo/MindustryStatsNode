import React, {useEffect, useState} from 'react';
import {InactiveServer, ServerListStats} from '../../../../common/models/serverData';

const API_BASE = import.meta.env.VITE_API_URL || '';

const InactiveServersDetail: React.FC = () => {
    const [inactiveServers, setInactiveServers] = useState<InactiveServer[]>([]);
    const [stats, setStats] = useState<ServerListStats[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [serversRes, statsRes] = await Promise.all([
                    fetch(`${API_BASE}/api/inactive-servers`),
                    fetch(`${API_BASE}/api/serverlist-stats`)
                ]);

                if (!serversRes.ok) {
                    throw new Error('Failed to fetch inactive servers');
                }
                if (!statsRes.ok) {
                    throw new Error('Failed to fetch server list stats');
                }

                const serversData: InactiveServer[] = await serversRes.json();
                const statsData: ServerListStats[] = await statsRes.json();

                setInactiveServers(serversData);
                setStats(statsData);
                setLoading(false);
            } catch (err) {
                console.error('Error fetching inactive servers data:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const toggleExclusion = async (serverId: number, currentStatus: boolean) => {
        try {
            const response = await fetch(`${API_BASE}/api/servers/${serverId}/inactivity-excluded`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inactivity_excluded: !currentStatus })
            });

            if (!response.ok) {
                throw new Error('Failed to update exclusion status');
            }

            setInactiveServers(prev =>
                prev.map(server =>
                    server.id === serverId
                        ? { ...server, inactivity_excluded: !currentStatus }
                        : server
                )
            );
        } catch (err) {
            console.error('Error toggling exclusion:', err);
        }
    };

    const formatDate = (timestamp: number | null) => {
        if (!timestamp) return 'Never';
        return new Date(timestamp).toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-gray-400">Loading inactive servers...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-red-400">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Inactive Servers</h1>

            {/* Server List Statistics */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Server List Statistics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map(stat => (
                        <div key={stat.id} className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4">
                            <h3 className="text-sm font-medium text-gray-400 mb-1">{stat.display_name}</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-white">{stat.active_servers}</span>
                                <span className="text-gray-400">/ {stat.total_servers}</span>
                            </div>
                            <div className="mt-2">
                                <div className="w-full bg-neutral-700 rounded-full h-2">
                                    <div
                                        className="bg-orange-500 h-2 rounded-full"
                                        style={{ width: `${stat.active_percentage}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{stat.active_percentage}% active</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Inactive Servers Table */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">
                    Inactive Servers ({inactiveServers.length})
                </h2>
                {inactiveServers.length === 0 ? (
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-8 text-center">
                        <p className="text-gray-400">No inactive servers found</p>
                    </div>
                ) : (
                    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-neutral-700/50">
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            Server
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            Last Seen
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            Server Lists
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            Inactivity Excluded
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-700/50">
                                    {inactiveServers.map(server => (
                                        <tr key={server.id} className="hover:bg-neutral-700/30">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-white">
                                                    {server.host}:{server.port}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-300">
                                                    {formatDate(server.lastSeen)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {server.serverLists.length > 0 ? (
                                                        server.serverLists.map(list => (
                                                            <span
                                                                key={list.id}
                                                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-neutral-700 text-gray-300"
                                                            >
                                                                {list.display_name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-sm text-gray-500">Unknown</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => toggleExclusion(server.id, server.inactivity_excluded)}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                        server.inactivity_excluded
                                                            ? 'bg-orange-500'
                                                            : 'bg-neutral-600'
                                                    }`}
                                                >
                                                    <span
                                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                            server.inactivity_excluded
                                                                ? 'translate-x-6'
                                                                : 'translate-x-1'
                                                        }`}
                                                    />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InactiveServersDetail;
