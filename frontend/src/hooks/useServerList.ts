import {useMemo, useState} from 'react';
import {ServerElement} from '../../../common/models/serverData';
import {removeColors} from '../util/mindustry';

// NOTE: This hook is purely client-side derived state (search/sort/group UI
// preferences) over data that's already fetched by `useApi`/the route loader.
// It doesn't perform its own network fetching, so no server function is
// needed here for the TanStack Start migration -- it keeps working as-is
// against whatever `rawServers` (SSR-hydrated or polled) is passed in.

export type SortCriteria = 'playerCount' | 'ping' | 'name' | 'rating';
export type SortDirection = 'asc' | 'desc';

/** One network's servers, in display order. An array keeps the order explicit --
 * a Record would silently reorder integer-like group names. */
export interface ServerGroupEntry {
  name: string;
  servers: ServerElement[];
}

export interface SortOption {
  key: SortCriteria;
  /** Short label for the trigger button + menu row, e.g. 'Players' */
  label: string;
  /** Direction applied when the user switches TO this criteria */
  defaultDirection: SortDirection;
  /** Human wording for each direction, e.g. { asc: 'Fewest first', desc: 'Most first' } */
  directionLabels: Record<SortDirection, string>;
  /** One-line explanation of the value used when the list is ungrouped */
  serverHint: string;
  /** One-line explanation of how the value is aggregated when grouped */
  groupHint: string;
  /** Value for a single server row. `null` means "unknown", which always sorts last. */
  getValue: (server: ServerElement) => number | string | null;
  /** Aggregated value for a whole group (network). `null` means "unknown", which always sorts last. */
  getGroupValue: (servers: ServerElement[], groupName: string) => number | string | null;
}

const getServerDisplayName = (server: ServerElement): string => {
  const cleaned = removeColors(server.currentData?.serverName ?? null)?.trim();
  return cleaned ? cleaned : server.name;
};

export const SORT_OPTIONS: SortOption[] = [
  {
    key: 'playerCount',
    label: 'Players',
    defaultDirection: 'desc',
    directionLabels: { desc: 'Most players first', asc: 'Fewest players first' },
    serverHint: 'Players on each server',
    groupHint: 'Total players per network (hubs excluded)',
    getValue: (server) => server.online ? (server.currentData?.players ?? 0) : 0,
    getGroupValue: (servers) => servers.reduce(
      (sum, server) => sum + (server.online && !server.aggregateExclude ? (server.currentData?.players ?? 0) : 0),
      0
    )
  },
  {
    key: 'ping',
    label: 'Ping',
    defaultDirection: 'asc',
    directionLabels: { asc: 'Lowest ping first', desc: 'Highest ping first' },
    serverHint: 'Ping of each server',
    groupHint: 'Average ping of a network’s online servers',
    getValue: (server) => server.online && typeof server.currentData?.ping === 'number'
      ? server.currentData.ping
      : null,
    getGroupValue: (servers) => {
      let total = 0;
      let counted = 0;
      servers.forEach(server => {
        const ping = server.currentData?.ping;
        if (server.online && typeof ping === 'number') {
          total += ping;
          counted += 1;
        }
      });
      return counted === 0 ? null : total / counted;
    }
  },
  {
    key: 'name',
    label: 'Name',
    defaultDirection: 'asc',
    directionLabels: { asc: 'A to Z', desc: 'Z to A' },
    serverHint: 'Server name',
    groupHint: 'Network name',
    getValue: (server) => getServerDisplayName(server),
    getGroupValue: (_servers, groupName) => groupName
  },
  {
    key: 'rating',
    label: 'Rating',
    defaultDirection: 'desc',
    directionLabels: { desc: 'Top rated first', asc: 'Lowest rated first' },
    serverHint: 'Review score (weighted by number of reviews)',
    groupHint: 'Best-rated server in each network',
    // Bayesian score, not the raw average: sorting on a raw 5.0 average from
    // one review would rank it above an established server with hundreds of
    // consistently-4-star reviews. Unrated servers are null, which the
    // shared compareSortValues logic below always sinks to the bottom.
    getValue: (server) => server.ratingScore ?? null,
    getGroupValue: (servers) => servers.reduce(
      (best: number | null, server) =>
        server.ratingScore != null && (best === null || server.ratingScore > best) ? server.ratingScore : best,
      null
    )
  }
];

const compareNumbers = (a: number, b: number): number => (a === b ? 0 : a < b ? -1 : 1);
const compareStrings = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const compareValues = (a: number | string, b: number | string): number => {
  if (typeof a === 'number' && typeof b === 'number') return compareNumbers(a, b);
  if (typeof a === 'string' && typeof b === 'string') return compareStrings(a, b);
  return compareStrings(String(a), String(b));
};

// Direction only ever flips entries we actually have a value for, so a server
// with an unknown ping sinks to the bottom of "lowest ping first" and of
// "highest ping first" alike, instead of counting as the largest ping.
const compareSortValues = (
  a: number | string | null,
  b: number | string | null,
  direction: SortDirection
): number => {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }

  const comparison = compareValues(a, b);
  return direction === 'desc' ? -comparison : comparison;
};

const makeServerComparator = (sortOption: SortOption, direction: SortDirection) =>
  (a: ServerElement, b: ServerElement): number => {
    if (a.online !== b.online) return a.online ? -1 : 1;

    const comparison = compareSortValues(sortOption.getValue(a), sortOption.getValue(b), direction);
    if (comparison !== 0) return comparison;

    return compareNumbers(a.id, b.id);
  };

const makeGroupComparator = (sortOption: SortOption, direction: SortDirection) =>
  (a: [string, ServerElement[]], b: [string, ServerElement[]]): number => {
    const aHasOnline = a[1].some(server => server.online);
    const bHasOnline = b[1].some(server => server.online);
    if (aHasOnline !== bHasOnline) return aHasOnline ? -1 : 1;

    const comparison = compareSortValues(
      sortOption.getGroupValue(a[1], a[0]),
      sortOption.getGroupValue(b[1], b[0]),
      direction
    );
    if (comparison !== 0) return comparison;

    return compareStrings(a[0], b[0]);
  };

export const useServerList = (rawServers: ServerElement[]) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isGrouped, setIsGrouped] = useState<boolean>(true);
  const [hideInactiveEnabled, setHideInactiveEnabled] = useState<boolean>(true);
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('playerCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const processedData = useMemo(() => {
    if (!rawServers || !Array.isArray(rawServers)) {
      return { serverGroups: [] as ServerGroupEntry[], flatServers: [] as ServerElement[] };
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

    // Step 3: Sort (and group) using the selected criteria/direction
    const sortOption = SORT_OPTIONS.find(option => option.key === sortCriteria) ?? SORT_OPTIONS[0];
    const serverComparator = makeServerComparator(sortOption, sortDirection);

    if (isGrouped) {
      const groups: Record<string, ServerElement[]> = {};
      filteredServers.forEach(server => {
        if (!groups[server.name]) {
          groups[server.name] = [];
        }
        groups[server.name].push(server);
      });

      Object.values(groups).forEach(members => members.sort(serverComparator));

      const groupComparator = makeGroupComparator(sortOption, sortDirection);
      const sortedGroups: ServerGroupEntry[] = Object.entries(groups)
        .sort(groupComparator)
        .map(([name, servers]) => ({ name, servers }));

      return { serverGroups: sortedGroups, flatServers: [] as ServerElement[] };
    } else {
      return { serverGroups: [] as ServerGroupEntry[], flatServers: [...filteredServers].sort(serverComparator) };
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
      const newOption = SORT_OPTIONS.find(option => option.key === criteria);
      setSortDirection(newOption ? newOption.defaultDirection : 'desc');
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
