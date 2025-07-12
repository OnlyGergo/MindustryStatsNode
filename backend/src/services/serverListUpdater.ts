import {SERVERS_SOURCE} from "../const";
import * as serverRepository from '../repositories/serverRepository';
import {ServerListElement} from "../models/ServerListElement";
import {createLogger} from "../logger";
const logger = createLogger("Server List Updater");

export async function refreshServerList() {
    let serverCount = 0;
    const startTime = Date.now();
    logger.info("Refreshing servers...");

    // For each source get all servers
    for (const url of SERVERS_SOURCE) {
        // Get the JSON
        const response = await fetch(url);
        const servers: ServerListElement[] = await response.json();
        serverCount += servers.length;
        await serverRepository.ensureServers(servers);
    }

    const timeTaken = (Date.now() - startTime) / 1000;
    logger.info(`Found ${serverCount} total servers in ${timeTaken.toFixed(2)} seconds.`);
}