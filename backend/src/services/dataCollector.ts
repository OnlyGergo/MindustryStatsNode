import {ServerConfig, ServerWithHistory} from '../../../common/models/serverData';
import {queryServer} from './mindustryService';
import * as serverRepository from '../repositories/serverRepository';
import os from 'os';

const MAX_HISTORY_POINTS = 288 * 3; // Store 36 hours of data at 5-minute intervals
const MAX_CONCURRENT_QUERIES = Math.max(4, Math.floor(os.cpus().length * 1.5)); // 1.5x CPU cores, at least 4

// In-memory cache of the latest data
let serverDataCache: ServerWithHistory[] = [];
let wsClients: Set<any> = new Set();

// Server status update listeners
const updateListeners: Array<(servers: ServerWithHistory[]) => void> = [];

export function registerWebSocketClient(client: any) {
    wsClients.add(client);

    // Send initial data as welcome message
    client.send(JSON.stringify({
        type: 'init',
        data: serverDataCache
    }));

    // Remove client when they disconnect
    client.on('close', () => {
        wsClients.delete(client);
    });
}

export function broadcastUpdate(data: any) {
    const message = JSON.stringify(data);
    for (const client of wsClients) {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    }
}

export function onServerUpdate(callback: (servers: ServerWithHistory[]) => void) {
    updateListeners.push(callback);
}

export async function initDataStorage(): Promise<void> {
    try {
        // Load servers from database
        serverDataCache = await serverRepository.getAllServersWithHistory(36);

        // Mark all servers as offline initially
        serverDataCache.forEach(server => {
            server.online = false;
            if (server.currentData) {
                server.currentData.online = false;
            }
        });

    } catch (err) {
        console.error('Failed to initialize data storage:', err);
        serverDataCache = [];
    }
}

// Process a batch of servers concurrently
async function processBatch(batch: Array<{ config: ServerConfig, address: string }>) {
    const promises = batch.map(async ({config, address}) => {
        try {
            const [host, portStr] = address.split(':');
            const port = parseInt(portStr, 10) || 6567;

            if (!host || isNaN(port)) {
                return;  // Don't use default port - this could be a lobby server (Add something to handle this in future)
            }

            const serverData = await queryServer(address);
            const timestamp = Date.now();

            // Find server in cache
            let serverEntry = serverDataCache.find(
                s => s.host === host && s.port === port
            );

            // First, upsert server in database to get a valid server object with ID
            const server = await serverRepository.upsertServer({
                name: config.name,
                host,
                port,
                // If server exists in cache, use its last seen time, otherwise use current time as it's new
                // and won't exist in database either
                // Always timestamp if server online
                lastSeen: serverData?.online ? timestamp : serverEntry?.lastSeen || timestamp
            });

            // If server not in cache, create a new entry - database would've also had an instance created
            if (!serverEntry) {
                serverEntry = {
                    id: server.id,
                    name: server.name,
                    host,
                    port,
                    history: [],
                    lastSeen: timestamp,
                    lastUpdated: timestamp,
                    online: false,
                    consecutiveFailures: 0
                };
                serverDataCache.push(serverEntry);
            }

            if (serverData) {
                // Save server data to DB
                await serverRepository.saveServerStats(server.id, serverData);
                await serverRepository.saveMotdIfChanged(server.id, serverData);
                await serverRepository.saveMapIfChanged(server.id, serverData);

                // Update current data in memory
                serverEntry.currentData = serverData;
                serverEntry.lastUpdated = timestamp;
                serverEntry.lastSeen = timestamp;
                serverEntry.online = true;
                serverEntry.consecutiveFailures = 0;

                // Add to history only since we have new data
                serverEntry.history.push({
                    timestamp,
                    players: serverData.players!
                });

                // Trim history if too long
                if (serverEntry.history.length > MAX_HISTORY_POINTS) {
                    serverEntry.history = serverEntry.history.slice(-MAX_HISTORY_POINTS);
                }
            } else {
                // Server is offline or unreachable
                serverEntry.online = false;
                serverEntry.lastUpdated = timestamp;
                serverEntry.consecutiveFailures = (serverEntry.consecutiveFailures || 0) + 1;

                // Save offline status to DB
                await serverRepository.saveServerStats(server.id, {
                    ping: null,
                    host: host,
                    port: port,
                    serverName: null,
                    mapName: null,
                    players: null,
                    wave: null,
                    version: null,
                    versionType: null,
                    mode: null,
                    playerLimit: null,
                    description: null,
                    modeName: null,
                    online: false,
                });
            }
        } catch (err) {
            // Error already logged in queryServer
            console.error(err);
        }
    });

    await Promise.all(promises);
}

export async function collectServerData(servers: ServerConfig[]): Promise<void> {
    console.time('Server data collection');

    // Create flattened list of all servers
    const allServers: Array<{ config: ServerConfig, address: string }> = [];

    for (const server of servers) {
        for (const address of server.address) {
            allServers.push({config: server, address});
        }
    }

    // Process in batches to limit concurrency
    const batches: Array<Array<{ config: ServerConfig, address: string }>> = [];

    for (let i = 0; i < allServers.length; i += MAX_CONCURRENT_QUERIES) {
        batches.push(allServers.slice(i, i + MAX_CONCURRENT_QUERIES));
    }

    for (const batch of batches) {
        await processBatch(batch);
    }

    // Notify listeners
    for (const listener of updateListeners) {
        listener(serverDataCache);
    }

    // Broadcast update to WebSocket clients
    broadcastUpdate({
        type: 'update',
        data: serverDataCache,
        timestamp: Date.now()
    });

    console.timeEnd('Server data collection');
}
