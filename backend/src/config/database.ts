import {Sequelize} from 'sequelize';
import {env} from './env.js';
import {createLogger} from '../logger.js';

const logger = createLogger("Database");

// Database configuration
const dbConfig = {
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  dialect: 'postgres',
  logging: logger.debug.bind(logger),
  pool: {
    max: 20,
    min: 0,
    idle: 30000,
    acquire: 2000,
  },
};

const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: 'postgres',
      logging: dbConfig.logging,
      pool: dbConfig.pool,
    }
);

export default sequelize;

export async function initDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    logger.info(`Connected to database ${dbConfig.database} successfully`);

    // Check if TimescaleDB extension exists
    const [results]: any = await sequelize.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
    );

    if (!results[0].exists) {
      logger.warn('TimescaleDB extension is not installed or enabled. Some features may not work correctly.');
    }

    // Run migrations if needed
    // This would now be handled by Sequelize migrations

  } catch (err) {
    logger.error('Failed to connect to database:', err);
    throw err;
  }
}