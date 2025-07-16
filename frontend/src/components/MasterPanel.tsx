import React from 'react';
import { ServerWithHistory } from '../../../common/models/serverData';
import ServerGroup from './ServerGroup';

interface MasterPanelProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    connectionStatus: string;
    totalServers: number;
    onlineServers: number;
    totalPlayers: number;
    serverGroups: Record<string, ServerWithHistory[]>;
    expandedGroups: Set<string>;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onToggleGroup: (groupName: string) => void;
    onServerSelect: (server: ServerWithHistory) => void;
    selectedServer: ServerWithHistory | null;
    loading: boolean;
    error: boolean;
    lastUpdated: string;
    isMobile: boolean;
}

const MasterPanel: React.FC<MasterPanelProps> = ({
                                                     isCollapsed,
                                                     onToggleCollapse,
                                                     connectionStatus,
                                                     totalServers,
                                                     onlineServers,
                                                     totalPlayers,
                                                     serverGroups,
                                                     expandedGroups,
                                                     onExpandAll,
                                                     onCollapseAll,
                                                     onToggleGroup,
                                                     onServerSelect,
                                                     selectedServer,
                                                     loading,
                                                     error,
                                                     lastUpdated,
                                                     isMobile
                                                 }) => {
    return (
        <div className={`relative transition-all duration-300 ${
            isCollapsed ? 'w-16' : isMobile ? 'w-full' : 'w-1/3'
        } min-w-0 bg-slate-800/20 backdrop-blur-md border-r border-slate-700/50 flex flex-col h-screen`}>
            {/* Header */}
            <div className="bg-slate-700/40 backdrop-blur-md border-b border-slate-600/50 p-4 flex items-center justify-between flex-shrink-0">
                {!isCollapsed && (
                    <div className="bg-slate-600/60 backdrop-blur-md border border-slate-500/50 px-4 py-2 rounded-lg">
                        <h1 className="text-xl font-bold text-cyan-400">Mindustry Tracker</h1>
                    </div>
                )}
                <button
                    onClick={onToggleCollapse}
                    className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 p-2 rounded-lg transition-colors border border-slate-600/50"
                >
                    <svg className={`w-4 h-4 transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {!isCollapsed && (
                <>
                    {/* Connection Status */}
                    <div className="p-4 border-b border-slate-700/50 flex-shrink-0">
                        <span className={`px-3 py-1 rounded-full text-xs flex items-center border backdrop-blur-sm ${
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

                    {/* Stats */}
                    <div className="p-4 border-b border-slate-700/50 flex-shrink-0">
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-2 rounded-lg">
                                <div className="text-gray-400 text-xs">Total Servers</div>
                                <div className="text-lg font-bold text-white">{totalServers}</div>
                            </div>
                            <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-2 rounded-lg">
                                <div className="text-gray-400 text-xs">Online</div>
                                <div className="text-lg font-bold text-green-400">{onlineServers}</div>
                            </div>
                            <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-2 rounded-lg">
                                <div className="text-gray-400 text-xs">Total Players</div>
                                <div className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">{totalPlayers}</div>
                            </div>
                            <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 p-2 rounded-lg">
                                <div className="text-gray-400 text-xs">Groups</div>
                                <div className="text-lg font-bold text-white">{Object.keys(serverGroups).length}</div>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="p-4 border-b border-slate-700/50 flex space-x-2 flex-shrink-0">
                        <button
                            onClick={onExpandAll}
                            className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-lg text-xs transition-colors backdrop-blur-sm flex-1"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={onCollapseAll}
                            className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 border border-slate-600/30 px-3 py-1 rounded-lg text-xs transition-colors backdrop-blur-sm flex-1"
                        >
                            Collapse All
                        </button>
                    </div>

                    {/* Server List */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-0">
                        {loading && (
                            <div className="text-center p-8 bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-xl mb-6">
                                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-cyan-400 border-t-transparent"></div>
                                <p className="mt-4 text-gray-300">Loading server data...</p>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-xl backdrop-blur-sm mb-6">
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
                                    onToggleExpand={() => onToggleGroup(groupName)}
                                    onServerSelect={onServerSelect}
                                    selectedServer={selectedServer}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-700/50 flex-shrink-0">
                        <p className="text-xs text-gray-500">Last updated: {lastUpdated}</p>
                    </div>
                </>
            )}
        </div>
    );
};

export default MasterPanel;