import React, { useState } from 'react';
import ServerGroup from './ServerGroup';
import FlatServerList from './FlatServerList';
import {ServerWithHistory} from "../../../../common/models/serverData.ts";
import SearchBar from "../SearchBar.tsx";
import ToggleButton from "../ToggleButton.tsx";
import SortDropdown from "../SortDropdown.tsx";
import Tooltip from "../Tooltip.tsx";
import { useServerList } from "../../hooks/useServerList.ts";
import {COMMIT, VERSION} from "../../../../common/version.ts";
import { getConnectionStatusClasses } from "../../theme.ts";
import GlobalStatsChart from "../GlobalStatsChart.tsx";

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

    const connectionStatusInfo = getConnectionStatusClasses(connectionStatus);
    const [showGlobalStats, setShowGlobalStats] = useState(false);

    return (
        <>
        {/* Global Stats Modal */}
        {showGlobalStats && (
            <GlobalStatsChart onClose={() => setShowGlobalStats(false)} />
        )}
        
        <div className={`relative transition-all duration-300 ${
            isCollapsed ? 'w-16' : isMobile ? 'w-full' : 'w-1/3'
        } min-w-0 bg-neutral-900/20 backdrop-blur-md border-r border-neutral-700/50 flex flex-col h-screen`}>
            {/* Header - Improved design with connection status */}
            <div className="bg-gradient-to-r from-neutral-800/60 to-neutral-800/40 backdrop-blur-md border-b border-neutral-700/50 p-3 sm:p-4 flex items-center justify-between flex-shrink-0">
                {!isCollapsed && (
                    <div className="flex items-center gap-3">
                        {/* Logo/Icon */}
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        {/* Title and status */}
                        <div className="flex flex-col">
                            <h1 className="text-lg sm:text-xl font-bold text-white">
                                Mindustry <span className="text-orange-400">Tracker</span>
                            </h1>
                            <div className="flex items-center gap-1.5">
                                <Tooltip content={connectionStatusInfo.tooltip} position="bottom" delay={100}>
                                    <span className={`inline-block w-2 h-2 rounded-full ${connectionStatusInfo.dotColor}`}></span>
                                </Tooltip>
                                <span className="text-xs text-gray-500">{VERSION}</span>
                            </div>
                        </div>
                    </div>
                )}
                {/* Only show collapse button on desktop */}
                {!isMobile && (
                    <button
                        onClick={onToggleCollapse}
                        className="bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 p-2 rounded-lg transition-colors border border-neutral-600/50"
                    >
                        <svg className={`w-4 h-4 transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}
            </div>

            {!isCollapsed && (
                <>
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
                            <div 
                                className="bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 p-2 rounded-lg cursor-pointer hover:bg-neutral-700/30 hover:border-orange-500/30 transition-all group"
                                onClick={() => setShowGlobalStats(true)}
                            >
                                <div className="text-gray-400 text-xs flex items-center justify-center gap-1">
                                    Total Players
                                    <Tooltip content="View global player history" position="top" delay={200}>
                                        <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </Tooltip>
                                </div>
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
                        <p className="text-xs text-gray-500">Last updated: {lastUpdated} | Commit: {COMMIT}</p>
                    </div>
                </>
            )}
        </div>
        </>
    );
};

export default MasterPanel;
