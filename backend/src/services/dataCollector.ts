import {ServerWithHistory} from '../../../common/models/serverData';
import {getServerData} from './mindustryService';
import * as serverRepository from '../repositories/serverRepository';
import {getServers, ServerRecord} from "../repositories/serverRepository";
import {
    DATA_COLLECTION_INTERVAL_MILLISECONDS,
    MAX_CONCURRENT_QUERIES,
    MAX_HISTORY_HOURS,
    MAX_HISTORY_POINTS
} from "../const";
import {createLogger} from "../logger";

const logger = createLogger("Collector");

// In-memory cache of the latest data
let serverDataCache: ServerWithHistory[] = [];
let wsClients: Set<any> = new Set();

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

export async function initDataStorage(): Promise<void> {
    try {
        // Load servers from database
        serverDataCache = await serverRepository.getAllServersWithHistory(MAX_HISTORY_HOURS);

        // Mark all servers as offline initially
        serverDataCache.forEach(server => {
            server.online = false;
            if (server.currentData) {
                server.currentData.online = false;
            }
        });

    } catch (err) {
        logger.error('Failed to initialize data storage:', err);
        serverDataCache = [];
    }
}

// Process a batch of servers concurrently
async function processBatch(batch: Array<ServerRecord>) {
    const promises = batch.map(async (record) => {
        try {
            const serverData = await getServerData(record.host, record.port);
            const timestamp = Date.now();

            // Find server in cache
            let serverEntry = serverDataCache.find(
                s => s.host === record.host && s.port === record.port
            );

            // If server not in cache, create a new entry - database already has one
            if (!serverEntry) {
                serverEntry = {
                    id: record.id,
                    name: record.name,
                    host: record.host,
                    port: record.port,
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
                await serverRepository.saveServerStats(record.id, serverData);
                await serverRepository.saveMotdIfChanged(record.id, serverData);
                await serverRepository.saveMapIfChanged(record.id, serverData);

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
                await serverRepository.saveServerStats(record.id, {
                    ping: null,
                    host: record.host,
                    port: record.port,
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
            logger.error(err);
        }
    });

    await Promise.all(promises);
}

export async function collectServerData(): Promise<void> {
    const startTime = Date.now();
    logger.info("Started Server Collection...")

    // Process in batches to limit concurrency
    const batches: Array<Array<ServerRecord>> = [];
    const allServers = await getServers();

    for (let i = 0; i < allServers.length; i += MAX_CONCURRENT_QUERIES) {
        batches.push(allServers.slice(i, i + MAX_CONCURRENT_QUERIES));
    }

    for (const batch of batches) {
        await processBatch(batch);
    }

    // Broadcast update to WebSocket clients
    broadcastUpdate({
        type: 'update',
        data: serverDataCache,
        timestamp: Date.now()
    });

   const timeTaken = (Date.now() - startTime) / 1000;
   logger.info("Completed Server Collection in " + timeTaken.toFixed(2) + " seconds");
}
