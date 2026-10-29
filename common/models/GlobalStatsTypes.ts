// Gamemode history, columnar: players[m][t] is modes[m] at timestamps[t].
// One row per (bucket, mode) repeated the mode name thousands of times; this is
// a fraction of the size, small enough to ride along in the SSR page.
export interface GamemodeHistory {
    timestamps: number[];
    modes: string[];
    players: (number | null)[][];
}

// Server share entry - player count per server with group info
export interface ServerShareEntry {
    timestamp: number;
    serverId: number;
    serverGroupId: number;
    serverName: string;
    groupName: string;
    players: number | null;
}

// Gamemode list item
export interface GamemodeInfo {
  registryId: number;
  gamemodeId: number;
  cleanModeName: string;
  serverCount: number;
}
