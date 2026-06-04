export enum GameMode {
  SURVIVAL,
  SANDBOX,
  ATTACK,
  PVP,
  EDITOR
}

export interface ServerData {
  ping: number | null;
  host: string;
  port: number;
  serverName: string | null;
  mapName: string | null;
  players: number | null;
  wave: number | null;
  version: number | null;
  versionType: string | null;
  mode: GameMode | null;
  playerLimit: number | null;
  description: string | null;
  modeName: string | null;
  online: boolean;
  countryCode?: string | null;
}

export interface ServerHistory {
  timestamp: number;
  players: number | null;
}

export interface ServerWithHistory {
  id: number;
  name: string;
  host: string;
  port: number;
  currentData?: ServerData;
  history: ServerHistory[];
  lastSeen?: number;
  lastUpdated?: number;
  online: boolean;
  consecutiveFailures?: number;
  countryCode?: string | null;
}

export interface ServerMotdData {
  id: number;
  serverId: number;
  validFrom: Date;
  validTo: Date | null;
  serverName: string | null;
  description: string | null;
  modeName: string | null;
}

export interface ServerMapData {
  id: number;
  serverId: number;
  validFrom: Date;
  validTo: Date | null;
  mapName: string;
  gameMode: GameMode | null;
}

export interface ServerDetails {
  playerPeaks: {
    allTime: number;
    allTimeDate: Date;
    daily: number;
    weekly: number;
  };
  uptime: {
    last24h: number;
    last7d: number;
  };

  allMaps: ServerMapData[];
  allMotds: ServerMotdData[];
  // Keep single current records for convenience
  currentMotd: ServerMotdData | null;
  currentMap: ServerMapData | null;
}