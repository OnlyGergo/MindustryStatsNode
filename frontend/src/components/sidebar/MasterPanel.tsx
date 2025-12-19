import React from 'react';
import ServerGroup from './ServerGroup';
import FlatServerList from './FlatServerList';
import {ServerWithHistory} from "../../../../common/models/serverData.ts";
import SearchBar from "../SearchBar.tsx";
import ToggleButton from "../ToggleButton.tsx";
import SortDropdown from "../SortDropdown.tsx";
import Tooltip from "../Tooltip.tsx";
import { useServerList } from "../../hooks/useServerList.ts";
import {COMMIT, VERSION} from "../../../../common/version.ts";

interface MasterPanelProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    connectionStatus: string;
    totalServers: number;
    onlineServers: number;
    totalPlayers: number;
    serverGroups: Record<string, ServerWithHistory[]>;
    expandedGroups: Set<string>;
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
                                                     serverGroups: rawServerGroups,
                                                     expandedGroups,
                                                     onToggleGroup,
                                                     onServerSelect,
                                                     selectedServer,
                                                     loading,
                                                     error,
                                                     lastUpdated,
                                                     isMobile
                                                 }) => {
    // Convert grouped data to flat array for the hook
    const rawServers = React.useMemo(() => {
        return Object.values(rawServerGroups).flat();
    }, [rawServerGroups]);

    const {
        serverGroups: processedServerGroups,
        flatServers,
        searchTerm,
        isGrouped,
        hideInactiveEnabled,
        sortCriteria,
        sortDirection,
        setSearchTerm,
        toggleGrouping,
        toggleHideInactive,
        handleSortChange,
        sortOptions
    } = useServerList(rawServers);

    return (
        <div className={`relative transition-all duration-300 ${
            isCollapsed ? 'w-16' : isMobile ? 'w-full' : 'w-1/3'
        } min-w-0 bg-neutral-900/20 backdrop-blur-md border-r border-neutral-700/50 flex flex-col h-screen`}>
            {/* Header */}
            <div className="bg-neutral-800/40 backdrop-blur-md border-b border-neutral-700/50 p-4 flex items-center justify-between flex-shrink-0">
                {!isCollapsed && (
                    <div className="bg-neutral-700/60 backdrop-blur-md border border-orange-500/30 px-4 py-2 rounded-lg">
                        <h1 className="text-xl font-bold text-orange-400">Mindustry Tracker</h1>
                    </div>
                )}
                <button
                    onClick={onToggleCollapse}
                    className="bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 p-2 rounded-lg transition-colors border border-neutral-600/50"
                >
                    <svg className={`w-4 h-4 transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            </div>

            {!isCollapsed && (
                <>
                    {/* Connection Status */}
                    <div className="p-4 border-b border-neutral-700/50 flex-shrink-0">
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
                    <div className="p-4 border-b border-neutral-700/50 flex-shrink-0">
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 p-2 rounded-lg">
                                <div className="text-gray-400 text-xs">Online / Total Servers</div>
                                <div className="flex items-center justify-center space-x-2">
                                    <span className="text-lg font-bold text-green-400">{onlineServers}</span>
                                    <span className="text-lg font-bold text-gray-400"> / </span>
                                    <span className="text-lg font-bold text-white">{totalServers}</span>
                                </div>
                            </div>
                            <div className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 p-2 rounded-lg">
                                <div className="text-gray-400 text-xs">Total Players</div>
                                <div className="text-lg font-bold text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">{totalPlayers}</div>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="p-4 border-b border-neutral-700/50 flex-shrink-0">
                        {/* Search Bar */}
                        <div className="mb-3">
                            <SearchBar
                                onSearchValueChange={setSearchTerm}
                                value={searchTerm}
                            />
                        </div>

                        {/* Control Buttons */}
                        <div className="flex flex-wrap gap-2 mb-3">
                            <Tooltip
                                content={isGrouped ? "Switch to flat list view showing all servers" : "Group servers by their cluster names"}
                                position="top"
                                delay={300}
                                className="flex-1 min-w-0"
                            >
                                <ToggleButton
                                    isActive={isGrouped}
                                    onClick={toggleGrouping}
                                    activeText="Ungroup"
                                    inactiveText="Group"
                                    className="w-full"
                                />
                            </Tooltip>

                            <Tooltip
                                content={hideInactiveEnabled ? "Show all servers including inactive ones" : "Hide servers that have been offline for more than 7 days"}
                                position="top"
                                delay={300}
                                className="flex-1 min-w-0"
                            >
                                <ToggleButton
                                    isActive={hideInactiveEnabled}
                                    onClick={toggleHideInactive}
                                    activeText="Show All"
                                    inactiveText="Hide Inactive"
                                    activeColor="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30"
                                    inactiveColor="bg-neutral-600/20 hover:bg-neutral-600/30 text-neutral-400 border-neutral-600/30"
                                    className="w-full"
                                />
                            </Tooltip>

                            {/* Sort Dropdown */}
                            <SortDropdown
                                sortOptions={sortOptions}
                                currentCriteria={sortCriteria}
                                currentDirection={sortDirection}
                                onSortChange={handleSortChange}
                            />
                        </div>


                    </div>

                    {/* Server List */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-0">
                        {loading && (
                            <div className="text-center p-8 bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl mb-6">
                                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-400 border-t-transparent"></div>
                                <p className="mt-4 text-gray-300">Loading server data...</p>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-xl backdrop-blur-sm mb-6">
                                <span className="block sm:inline">Failed to load server data. Please try again later.</span>
                            </div>
                        )}

                        {!loading && !error && (
                            <div className="space-y-4">
                                {isGrouped ? (
                                    // Grouped view
                                    Object.entries(processedServerGroups).map(([groupName, servers]) => (
                                        <ServerGroup
                                            key={groupName}
                                            name={groupName}
                                            servers={servers}
                                            expanded={expandedGroups.has(groupName)}
                                            onToggleExpand={() => onToggleGroup(groupName)}
                                            onServerSelect={onServerSelect}
                                            selectedServer={selectedServer}
                                        />
                                    ))
                                ) : (
                                    // Flat view
                                    <FlatServerList
                                        servers={flatServers}
                                        onServerSelect={onServerSelect}
                                        selectedServer={selectedServer}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-neutral-700/50 flex-shrink-0">
                        <p className="text-xs text-gray-500">Last updated: {lastUpdated} | Version: {VERSION} | Commit: {COMMIT}</p>
                    </div>
                </>
            )}
        </div>
    );
};

export default MasterPanel;
