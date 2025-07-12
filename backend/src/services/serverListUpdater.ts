import {SERVERS_SOURCE} from "../const";
import * as serverRepository from '../repositories/serverRepository';
import {ServerListElement} from "../models/ServerListElement";

export async function refreshServerList() {
    // For each source get all servers
    for (const url of SERVERS_SOURCE) {
        // Get the JSON
        const response = await fetch(url);
        const servers: ServerListElement[] = await response.json();
        await serverRepository.ensureServers(servers);
    }
}