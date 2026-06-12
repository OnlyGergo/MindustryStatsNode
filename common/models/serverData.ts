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

const SERVER_ELEMENT_KEYS: (keyof ServerElement)[] = [
  'id',
  'name',
  'groupId',
  'host',
  'port',
  'currentData',
  'lastSeen',
  'lastUpdated',
  'online',
  'consecutiveFailures',
  'countryCode'
];

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
}
export function encodeServerElements(data: ServerElement[]): any[][] {
  const header = [...SERVER_ELEMENT_KEYS];

  const rows = data.map(item =>
      SERVER_ELEMENT_KEYS.map(key => {
        const value = item[key];

        // Handle optional or nested objects safely (like currentData)
        if (value && typeof value === 'object') {
          return JSON.stringify(value);
        }

        return value ?? null; // Normalize undefined to null for clean grid/CSV data
      })
  );

  return [header, ...rows];
}

export function decodeServerElements(matrix: any[][]): ServerElement[] {
  if (matrix.length <= 1) return [];

  const [header, ...rows] = matrix;

  return rows.map(row => {
    const obj = {} as any;

    header.forEach((key, index) => {
      let value = row[index];

      // Parse back nested JSON strings (like currentData)
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          value = JSON.parse(value);
        } catch {
          // Fallback to original string if JSON parsing fails
        }
      }

      // Only assign if it's not null/undefined to keep optional fields clean
      if (value !== null && value !== undefined) {
        obj[key] = value;
      }
    });

    return obj as ServerElement;
  });
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