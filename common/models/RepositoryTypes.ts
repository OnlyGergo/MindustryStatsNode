export interface ServerRecord {
    id: number;
    name: string;
    host: string;
    port: number;
    created_at: Date;
    updated_at: Date;
}

export interface ServerInput {
    name: string;
    host: string;
    port: number;
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

export interface ServerListInfo {
    id: number;
    name: string;
    url: string;
    display_name: string;
}

export interface InactiveServerInfo {
    id: number;
    host: string;
    port: number;
    lastSeen: number | null;
    serverLists: ServerListInfo[];
    inactivity_excluded: boolean;
}

export interface ServerListStats {
    id: number;
    display_name: string;
    url: string;
    total_servers: number;
    active_servers: number;
    active_percentage: number;
}