import {useMemo, useState} from 'react';
import {ServerElement} from '../../../common/models/serverData';
import {isHub} from '../util/mindustry';

export type SortCriteria = 'ping' | 'playerCount' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface SortOption {
  key: SortCriteria;
  label: string;
  getValue: (server: ServerElement) => number | string;
}

const SORT_OPTIONS: SortOption[] = [
  {
    key: 'ping',
    label: 'Ping',
    getValue: (server) => server.currentData?.ping || 9999
  },
  {
    key: 'playerCount',
    label: 'Player Count',
    getValue: (server) => isHub(server) ? -1 : (server.currentData?.players || 0)
  },
  {
    key: 'name',
    label: 'Server Name',
    getValue: (server) => server.name || ''
  }
];

export const useServerList = (rawServers: ServerElement[]) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isGrouped, setIsGrouped] = useState<boolean>(true);
  const [hideInactiveEnabled, setHideInactiveEnabled] = useState<boolean>(true);
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('playerCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const processedData = useMemo(() => {
    if (!rawServers || !Array.isArray(rawServers)) {
      return { serverGroups: {}, flatServers: [] };
    }

    // Step 1: Apply search filter
    let filteredServers = rawServers.filter(server => {
      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();
      return (
        server.name.toLowerCase().includes(searchLower) ||
        server.currentData?.serverName?.toLowerCase().includes(searchLower) ||
        server.currentData?.description?.toLowerCase().includes(searchLower) ||
        server.currentData?.mapName?.toLowerCase().includes(searchLower) ||
        `${server.host}:${server.port}`.includes(searchLower)
      );
    });

    // Step 2: Apply hide inactive filter
    if (hideInactiveEnabled) {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      filteredServers = filteredServers.filter(server => {
        if (server.online) return true;
        return server.lastSeen && server.lastSeen > oneWeekAgo;
      });
    }

    // Step 3: Apply sorting
    const sortOption = SORT_OPTIONS.find(option => option.key === sortCriteria);
    if (sortOption) {
      filteredServers.sort((a, b) => {
        const aValue = sortOption.getValue(a);
        const bValue = sortOption.getValue(b);

        // Always prioritize online servers
        if (a.online !== b.online) {
          return a.online ? -1 : 1;
        }

        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else {
          comparison = (aValue as number) - (bValue as number);
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    // Step 4: Add isHidden property and group if needed
    const serversWithHidden = filteredServers.map(server => ({
      ...server,
      isHidden: false
    }));

    if (isGrouped) {
      // Group servers by name
      const groups: Record<string, ServerElement[]> = {};
      serversWithHidden.forEach(server => {
        if (!groups[server.name]) {
          groups[server.name] = [];
        }
        groups[server.name].push(server);
      });

      // Sort groups by total player count (descending)
      const sortedGroups: Record<string, ServerElement[]> = Object.fromEntries(
        Object.entries(groups).sort((a, b) => {
          const aPlayers = a[1].reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);
          const bPlayers = b[1].reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);
          return bPlayers - aPlayers;
        })
      );

      return { serverGroups: sortedGroups, flatServers: [] };
    } else {
      return { serverGroups: {}, flatServers: serversWithHidden };
    }
  }, [rawServers, searchTerm, isGrouped, hideInactiveEnabled, sortCriteria, sortDirection]);

  const toggleGrouping = () => setIsGrouped(!isGrouped);
  const toggleHideInactive = () => setHideInactiveEnabled(!hideInactiveEnabled);

  const handleSortChange = (criteria: SortCriteria, direction?: SortDirection) => {
    setSortCriteria(criteria);
    if (direction) {
      setSortDirection(direction);
    } else if (criteria === sortCriteria) {
      // Toggle direction if same criteria selected
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default direction for new criteria
      setSortDirection(criteria === 'ping' ? 'asc' : 'desc');
    }
  };

  return {
    // Processed data
    serverGroups: processedData.serverGroups,
    flatServers: processedData.flatServers,

    // State
    searchTerm,
    isGrouped,
    hideInactiveEnabled,
    sortCriteria,
    sortDirection,

    // Actions
    setSearchTerm,
    toggleGrouping,
    toggleHideInactive,
    handleSortChange,

    // Constants
    sortOptions: SORT_OPTIONS
  };
};
