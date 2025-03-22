export enum GameMode {
  SURVIVAL,
  SANDBOX,
  ATTACK,
  PVP,
  EDITOR
}

export interface ServerData {
  ping: number;
  host: string;
  port: number;
  serverName: string;
  mapName: string;
  players: number;
  wave: number;
  version: number;
  versionType: string;
  mode: GameMode;
  playerLimit: number;
  description: string;
  modeName: string;
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
  name: string;
  host: string;
  port: number;
  currentData?: ServerData;
  history: ServerHistory[];
  lastUpdated?: number;
  online: boolean;
  consecutiveFailures?: number;
}