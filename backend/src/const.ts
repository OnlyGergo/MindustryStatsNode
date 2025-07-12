import os from "os";

// Data Collection
export const MAX_HISTORY_HOURS = 36;  // 1.5 Days
export const MAX_HISTORY_POINTS = 288 * 3; // Store 36 hours of data at 5-minute intervals
export const MAX_CONCURRENT_QUERIES = Math.max(4, Math.floor(os.cpus().length * 1.5)); // 1.5x CPU cores, at least 4
export const DATA_COLLECTION_INTERVAL_MILLISECONDS = 5 * 60 * 1000; // Every 5 minutes
export const SERVER_LIST_COLLECTION_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1000; // Every day
export const MINDUSTRY_TIMEOUT_MILLISECONDS = 1000;  // 1 Second

export const SERVERS_SOURCE = [
    "https://raw.githubusercontent.com/Anuken/MindustryServerList/refs/heads/main/servers_be.json",
    "https://raw.githubusercontent.com/Anuken/MindustryServerList/refs/heads/main/servers_v8.json",
    "https://raw.githubusercontent.com/Anuken/Mindustry/refs/heads/master/servers_v7.json",
    "https://raw.githubusercontent.com/Anuken/Mindustry/refs/heads/master/servers_v6.json"
]