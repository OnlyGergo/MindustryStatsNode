// src/config/database.ts
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: ((process.env.NODE_ENV || 'development') === "development") ?
    (process.env.DEV_DB_NAME || 'mindustry_stats_dev') :
    (process.env.DB_NAME || 'mindustry_stats'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  dialect: 'postgres',
  logging: process.env.NODE_ENV !== 'production' ? console.log : false,
  pool: {
    max: 20,
    min: 0,
    idle: 30000,
    acquire: 2000
  }
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
    pool: dbConfig.pool
  }
);

export default sequelize;

export async function initDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log(`Connected to database ${dbConfig.database} successfully`);

    // Check if TimescaleDB extension exists
    const [results] = await sequelize.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
    );

    if (!results[0].exists) {
      console.warn('TimescaleDB extension is not installed or enabled. Some features may not work correctly.');
    }

    // Run migrations if needed
    // This would now be handled by Sequelize migrations

  } catch (err) {
    console.error('Failed to connect to database:', err);
    throw err;
  }
}