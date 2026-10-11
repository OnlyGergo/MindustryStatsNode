import React from "react";
import { useParams } from "@tanstack/react-router";
import ServerGroup from "./ServerGroup";
import FlatServerList from "./FlatServerList";
import ServerListControls, { CollapseToggle } from "./ServerListControls.tsx";
import ServerListFooter from "./ServerListFooter.tsx";
import { useServerList } from "../../hooks/useServerList.ts";
import ServerStatsSummary from "../navbar/ServerStatsSummary.tsx";
import { useServerListData } from "../../context/ServerListContext.tsx";
import { useBrowseLayout } from "../../context/BrowseLayoutContext.tsx";

interface ServerListPanelProps {
  /** Below `split` the list is only shown on the index route; at `split`+ it is always shown. */
  mobileVisible: boolean;
}

const ServerListPanel: React.FC<ServerListPanelProps> = ({ mobileVisible }) => {
  const {
    serverGroups: rawServerGroups,
    totalServers,
    onlineServers,
    totalPlayers,
    loading,
    error,
    lastUpdated,
  } = useServerListData();

  const {
    isMasterPanelCollapsed,
    expandedGroups,
    toggleGroupExpanded: onToggleGroup,
    handleToggleCollapse,
  } = useBrowseLayout();

  const { networkId, serverId } = useParams({ strict: false });

  const selectedNetworkId = Number(networkId);
  const selectedServerId = Number(serverId);

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
    sortOptions,
  } = useServerList(rawServers);

  // Collapse only exists at split+: below it the panel always renders as normal.
  let visibility: string;
  if (isMasterPanelCollapsed) visibility = mobileVisible ? "flex split:hidden" : "hidden";
  else visibility = mobileVisible ? "flex" : "hidden split:flex";

  return (
    <>
      {isMasterPanelCollapsed && (
        <div className="hidden split:block m-2 align-top">
          <CollapseToggle collapsed onClick={handleToggleCollapse} />
        </div>
      )}
      <div
        className={`relative ${visibility} w-full split:w-3/12 split:min-w-sm bg-surface-primary backdrop-blur-md border-r border-default flex-col h-full`}
      >
        <div className="border-b border-subtle shrink-0">
          <div className="flex justify-center items-center h-5 split:h-auto split:pt-3 split:pb-0">
            <ServerStatsSummary
              onlineServers={onlineServers}
              totalServers={totalServers}
              totalPlayers={totalPlayers}
            />
          </div>
          <ServerListControls
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            isGrouped={isGrouped}
            onToggleGrouping={toggleGrouping}
            hideInactiveEnabled={hideInactiveEnabled}
            onToggleHideInactive={toggleHideInactive}
            sortOptions={sortOptions}
            sortCriteria={sortCriteria}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            collapsed={isMasterPanelCollapsed}
            onToggleCollapse={handleToggleCollapse}
          />
        </div>

        {/* Server List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          {loading && (
              <div className="text-center p-4 bg-surface-secondary backdrop-blur-md border border-default rounded mb-2">
                <div className="inline-block animate-spin rounded h-5 w-5 border-2 border-accent border-t-transparent"></div>
                <p className="mt-2 text-sm text-secondary">Loading server data...</p>
              </div>
          )}

          {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-400 px-3 py-2 text-sm rounded backdrop-blur-sm mb-2">
                Failed to load server data. Please try again later.
              </div>
          )}

          {!loading && !error && (
              <div className="space-y-1.5">
                {isGrouped ? (
                    processedServerGroups.map(({ name: groupName, servers }) => {
                      const groupId = servers.length > 0 ? servers[0].groupId : 0;
                      const isNetworkSelected = selectedNetworkId === groupId;
                      return (
                          <ServerGroup
                              key={groupName}
                              name={groupName}
                              servers={servers}
                              expanded={expandedGroups.has(groupName)}
                              onToggleExpand={() => onToggleGroup(groupName)}
                              isSelected={isNetworkSelected}
                              networkId={groupId}
                              selectedServerId={selectedServerId}
                          />
                      );
                    })
                ) : (
                    <FlatServerList servers={flatServers} selectedServerId={selectedServerId} />
                )}
              </div>
          )}
        </div>

        <ServerListFooter lastUpdated={lastUpdated} />
      </div>
    </>
  );
};

export default ServerListPanel;
