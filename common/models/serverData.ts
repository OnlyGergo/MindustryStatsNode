export enum GameMode {
  SURVIVAL,
  SANDBOX,
  ATTACK,
  PVP,
  EDITOR
}

export interface HistoryPoint {
  timestamp: number;
  players: number;
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
}

export interface ServerConfig {
  name: string;
  address: string[];
}

export interface ServerHistory {
  timestamp: number;
  players: number;
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
}

export interface ServerDetails {
  mapHistory: Array<{timestamp: number, mapName: string, gameMode: GameMode}>;
  motdHistory: Array<{timestamp: number, name: string, motd: string, modeName: string}>;
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
}