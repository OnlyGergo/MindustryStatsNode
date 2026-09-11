import React from "react";
import { useParams } from "@tanstack/react-router";
import ServerGroup from "./ServerGroup";
import FlatServerList from "./FlatServerList";
import SearchBar from "../SearchBar.tsx";
import ToggleButton from "../ToggleButton.tsx";
import SortDropdown from "../SortDropdown.tsx";
import Tooltip from "../Tooltip.tsx";
import { useServerList } from "../../hooks/useServerList.ts";
import { COMMIT, SOURCE } from "../../../../common/version.ts";
import { useSidebar } from "../../context/SidebarContext.tsx";
import {formatRelativeTime} from "../../util/general.ts";

const MasterPanel: React.FC = () => {
  const {
    isMasterPanelCollapsed: isCollapsed,
    serverGroups: rawServerGroups,
    expandedGroups,
    toggleGroupExpanded: onToggleGroup,
    loading,
    error,
    isMobile,
    lastUpdated
  } = useSidebar();

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

  if (isCollapsed) {
    return null;
  }

  return (
      <div
          className={`relative ${
              isMobile ? "w-full" : "w-3/12 min-w-sm"
          } bg-surface-primary backdrop-blur-md border-r border-default flex flex-col h-full`}
      >
        {/* Controls */}
        <div className="px-4 py-3 border-b border-subtle shrink-0">
          <div className="mb-2.5">
            <SearchBar onSearchValueChange={setSearchTerm} value={searchTerm} />
          </div>

          {/* Three controls fit one row down to a ~373px panel (the desktop
              floor is 384px); narrower than that the row wraps and the sort
              control takes a full-width second row, rather than truncating. */}
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip
                content={isGrouped ? "Switch to flat list view showing all servers" : "Group servers by their cluster names"}
                position="top"
                delay={300}
                className="flex-1 basis-27 min-w-0"
            >
              <ToggleButton
                  isActive={isGrouped}
                  onClick={toggleGrouping}
                  activeText="Ungroup"
                  inactiveText="Group"
                  sizeClassName="px-3 py-2 text-sm"
                  className="w-full"
              />
            </Tooltip>

            <Tooltip
                content={hideInactiveEnabled ? "Show all servers including inactive ones" : "Hide servers offline for more than 7 days"}
                position="top"
                delay={300}
                className="flex-1 basis-27 min-w-0"
            >
              <ToggleButton
                  isActive={hideInactiveEnabled}
                  onClick={toggleHideInactive}
                  activeText="Show All"
                  inactiveText="Hide Inactive"
                  activeColor="bg-orange-500/20 hover:bg-orange-500/40 text-orange-400 border-orange-500/40"
                  inactiveColor="bg-neutral-600/20 hover:bg-neutral-600/40 text-neutral-400 border-neutral-600/40"
                  sizeClassName="px-3 py-2 text-sm"
                  className="w-full"
              />
            </Tooltip>

            <div className="flex-1 basis-27 min-w-0">
              <SortDropdown
                  sortOptions={sortOptions}
                  currentCriteria={sortCriteria}
                  currentDirection={sortDirection}
                  isGrouped={isGrouped}
                  onSortChange={handleSortChange}
              />
            </div>
          </div>
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

        {/* Footer */}
        <div className="px-3 py-2 border-t border-default shrink-0">
          <p className="text-xs text-tertiary flex items-center justify-between">
          <span>Last Updated: {formatRelativeTime(lastUpdated)}</span>
          <span>
            Commit:{" "}

            <a className="hover:underline hover:text-accent"
              target="_blank"
              rel="noopener noreferrer"
              href={`${SOURCE}/commit/${COMMIT}`}
            >
            {COMMIT}
            </a>
          </span>

          <a
            href={SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-accent transition-colors"
            title="View source on GitHub"
          >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" className="hover:scale-110 transition-transform">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
          </svg>
          <span>Source</span>
        </a>
      </p>
</div>
</div>
);
};

export default MasterPanel;
