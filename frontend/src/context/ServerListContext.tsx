import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ServerListItem } from "../../../common/models/serverData";
import useApi from "../hooks/useApi.ts";

/** Header counts; the SSR page carries these instead of the list itself. */
export interface ServerListSummary {
  totalServers: number;
  onlineServers: number;
  totalPlayers: number;
}

interface ServerListContextValue extends ServerListSummary {
  serverGroups: Record<string, ServerListItem[]>;
  /**
   * The list isn't in this page's data yet: the SSR render shows the top of it
   * as markup only, which the client keeps unhydrated until its own fetch lands.
   */
  staticList: boolean;
  error: boolean;
  lastUpdated: Date;
}

const ServerListContext = createContext<ServerListContextValue | null>(null);

export const useServerListData = (): ServerListContextValue => {
  const ctx = useContext(ServerListContext);
  if (!ctx) {
    throw new Error("useServerListData must be used within a ServerListProvider");
  }
  return ctx;
};

interface ServerListProviderProps {
  /** Present when the `_browse` loader ran in the browser (a client navigation). */
  initialData: ServerListItem[] | null;
  /** The full list, during SSR only (see `SsrServerList` in router.tsx). */
  ssrRows: ServerListItem[] | null;
  summary: ServerListSummary;
  children: React.ReactNode;
}

const buildServerGroups = (servers: ServerListItem[]): Record<string, ServerListItem[]> => {
  const groups: Record<string, ServerListItem[]> = {};
  servers.forEach((server) => {
    if (!groups[server.name]) groups[server.name] = [];
    groups[server.name].push(server);
  });
  return groups;
};

export const summariseServers = (servers: ServerListItem[]): ServerListSummary => ({
  totalServers: servers.length,
  onlineServers: servers.filter((s) => s.online).length,
  totalPlayers: servers.reduce((sum, s) => sum + (s.aggregateExclude ? 0 : s.currentData?.players || 0), 0),
});

export const ServerListProvider: React.FC<ServerListProviderProps> = ({
  initialData,
  ssrRows,
  summary,
  children,
}) => {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const { data, error } = useApi(initialData);

  useEffect(() => {
    if (!data) return;
    setLastUpdated(new Date());
  }, [data]);

  // Ordering isn't decided here: the sidebar's own sort/filter state lives in
  // `useServerList`, which re-sorts these groups for display.
  const value = useMemo<ServerListContextValue>(() => {
    // Until the client has its own copy, render what the server had (the
    // client has nothing, and keeps the server's markup instead).
    const servers = data ?? ssrRows ?? [];
    return {
      serverGroups: buildServerGroups(servers),
      ...(data ? summariseServers(data) : summary),
      staticList: !data,
      error: !!error && !data,
      lastUpdated,
    };
  }, [data, ssrRows, summary, error, lastUpdated]);

  return (
    <ServerListContext.Provider value={value}>
      {children}
    </ServerListContext.Provider>
  );
};
