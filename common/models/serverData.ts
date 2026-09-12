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

/**
 * A server as the site refers to it: one *identity*, which may be several
 * observation streams stitched together (see migration 29).  `id` is the
 * canonical server id — the only id any endpoint accepts or returns.
 */
export interface ServerElement {
  id: number;
  /** Public sequential reference, numbered in first-seen order. */
  displayRef: number;
  name: string;
  groupId: number;
  /** Address the identity is answering on today, not the one it started on. */
  host: string;
  port: number;
  currentData?: ServerData;
  lastSeen?: number;
  lastUpdated?: number;
  online: boolean;
  consecutiveFailures?: number;
  countryCode?: string | null;
}

/**
 * Chart annotations.  One stream drives both shapes: `endsAt === null` is a
 * point event (drawn as a dashed vertical line), a set `endsAt` is a span
 * (drawn as a shaded band).
 */
export type ServerEventKind = 'address_change' | 'version_change' | 'data_quality';

export interface ServerEvent {
  id: number;
  /** null = a global event, annotating every chart rather than one server's. */
  serverId: number | null;
  kind: ServerEventKind;
  /** ms epoch. */
  occurredAt: number;
  /** ms epoch, or null for a point event. */
  endsAt: number | null;
  detail: Record<string, unknown> | null;
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
  playerPeaks: {
    allTime: number;
    daily: number;
    weekly: number;
  };
  topServer: {
    id: number;
    host: string;
    port: number;
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