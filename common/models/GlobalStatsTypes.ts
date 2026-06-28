// Gamemode history entry - player count per mode per time bucket
export interface GamemodeHistoryEntry {
    timestamp: number;
    modeName: string;
    players: number | null;
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
    modeName: string;
    serverCount: number;
    cleanName: string;
}
