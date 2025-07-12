import { createServer } from './server';
import {env} from "./config/env";
import {createLogger} from "./logger";

const logger = createLogger("Entry");

async function main() {
  try {
    logger.info("Starting Mindustry Stats...");
    const server = await createServer();
    
    server.listen(env.PORT, () => {
      logger.info(`Server running at http://localhost:${env.PORT}`);
      logger.info(`WebSocket server running at ws://localhost:${env.PORT}/ws`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();