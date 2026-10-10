import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ServerElement } from "../../../common/models/serverData";
import useApi from "../hooks/useApi.ts";

interface ServerListContextValue {
  serverGroups: Record<string, ServerElement[]>;
  totalServers: number;
  onlineServers: number;
  totalPlayers: number;
  loading: boolean;
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
  initialData: ServerElement[] | null;
  children: React.ReactNode;
}

const buildServerGroups = (servers: ServerElement[]): Record<string, ServerElement[]> => {
  const groups: Record<string, ServerElement[]> = {};
  servers.forEach((server) => {
    if (!groups[server.name]) groups[server.name] = [];
    groups[server.name].push(server);
  });
  return groups;
};

const computeTotalPlayers = (servers: ServerElement[]): number =>
  servers.reduce((sum, s) => sum + (s.aggregateExclude ? 0 : s.currentData?.players || 0), 0);

export const ServerListProvider: React.FC<ServerListProviderProps> = ({
  initialData,
  children,
}) => {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const { data } = useApi(initialData);

  useEffect(() => {
    if (!data) return;
    setLastUpdated(new Date());
  }, [data]);

  // Ordering isn't decided here: the sidebar's own sort/filter state lives in
  // `useServerList`, which re-sorts these groups for display.
  const value = useMemo<ServerListContextValue>(() => {
    const servers = Array.isArray(data) ? data : [];
    return {
      serverGroups: buildServerGroups(servers),
      totalServers: servers.length,
      onlineServers: servers.filter((s) => s.online).length,
      totalPlayers: computeTotalPlayers(servers),
      loading: !data,
      error: !!data && !Array.isArray(data),
      lastUpdated,
    };
  }, [data, lastUpdated]);

  return (
    <ServerListContext.Provider value={value}>
      {children}
    </ServerListContext.Provider>
  );
};
