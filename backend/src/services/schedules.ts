import {DATA_COLLECTION_INTERVAL_MILLISECONDS, SERVER_LIST_COLLECTION_INTERVAL_MILLISECONDS} from "../const";
import {collectServerData} from "./dataCollector";
import {createLogger} from "../logger";
import {refreshServerList} from "./serverListUpdater";

const logger = createLogger("Scheduler");
const shutdownListeners: Function[] = []

export async function initSchedules() {
    logger.info("Starting Schedules");
    // Server list first so we have a fresh set of server list
    await scheduleServerListCollection();
    await scheduleDataCollection();

    // Listen for shutdown events
    const shutdownHandler = async () => {
        logger.info('Shutting down server...');
        shutdownListeners.forEach((listener) => listener());
        process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);  // Handle Ctrl+C
    process.on('SIGTERM', shutdownHandler); // Handle termination signal
    logger.info("Schedules Ready");
}

async function scheduleDataCollection() {
    // Initial data collection
    await collectServerData();

    // Schedule periodic collection
    const timeout = setInterval(
        async () => await collectServerData(),
        DATA_COLLECTION_INTERVAL_MILLISECONDS
    );

    // Add to shut down listeners, so we can gracefully shut down
    shutdownListeners.push(() => clearInterval(timeout));
}

async function scheduleServerListCollection() {
    // Initial data collection
    await collectServerData();

    // Schedule periodic collection
    const timeout = setInterval(
        async () => await refreshServerList(),
        SERVER_LIST_COLLECTION_INTERVAL_MILLISECONDS
    );

    // Add to shut down listeners, so we can gracefully shut down
    shutdownListeners.push(() => clearInterval(timeout));
}