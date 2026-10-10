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
  mode: GameMode;
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

export interface ServerElement {
  id: number;
  name: string;
  groupId: number;
  host: string;
  port: number;
  currentData?: ServerData;
  lastSeen?: number;
  lastUpdated?: number;
  online: boolean;
  consecutiveFailures?: number;
  countryCode?: string | null;
  aggregateExclude: boolean;
  /** Raw mean rating across the server's family (F2), for display. `null`/absent when unrated. */
  rating?: number | null;
  /** How many reviews fed `rating`/`ratingScore`. 0 when unrated. */
  ratingCount?: number;
  /** Bayesian-shrunk rating, sort-only -- pulls a low-review-count server toward the sitewide mean so one 5-star review can't outrank an established server. `null` when unrated. */
  ratingScore?: number | null;
  /** 24h uptime in percent (0-100); only on network member lists. `null` = no samples. */
  uptime24h?: number | null;
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
  gameMode: GameMode;
  modeName: string | null;
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

export interface NetworkDetails {
  id: number;
  name: string;
  /** Players online right now: SUM over member families of the per-family MAX. */
  playersNow: number;
  /** Member families currently answering. */
  onlineServers: number;
  /** Fraction (0-1) of the site's players right now that are on this network. */
  siteShare: number;
  /** Mean network concurrency over the last 24h. Peaks below are network concurrency too (sum across servers per instant), not a single server's max. */
  avg24h: number;
  playerPeaks: {
    allTime: number;
    /** Hour bucket the all-time peak fell in; null when the network has no stats. */
    allTimeDate: Date | string | null;
    daily: number;
    weekly: number;
  };
  /** Percent 0-100 of polls the network's servers answered; `null` when there are no samples. */
  uptime: {
    last24h: number | null;
    last7d: number | null;
  };
  topServer: {
    id: number;
    players: number;
    name: string;
  } | null;
  activeServers: number;
  totalServers: number;
}

export interface ServerListStats {
  id: number;
  display_name: string;
  url: string;
  total_servers: number;
  active_servers: number;
  active_percentage: number;
}