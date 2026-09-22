import { Sequelize } from 'sequelize';
import { env } from './env.js';
import { createLogger } from '../logger.js';

const logger = createLogger('UserDatabase');

// Second connection: user-content tables only (users, user_sessions, and every
// table F2+ adds). Authenticates as a role in app_user_rw, which only has
// SELECT on servers/server_canonical/server_groups plus write access to the
// tables each migration explicitly grants it -- see
// collector/migrations/32_users_sessions.sql. Falls back to DB_USER/DB_PASSWORD
// when USERDB_* is unset, which does not enforce that split (see warning below).
if (!env.USERDB_USER || !env.USERDB_PASSWORD) {
  logger.warn(
    'USERDB_USER/USERDB_PASSWORD not set; falling back to DB_USER/DB_PASSWORD. ' +
      'The app_user_rw write-access split is not enforced against this connection.',
  );
}

const userDbConfig = {
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  database: env.DB_NAME,
  username: env.USERDB_USER ?? env.DB_USER,
  password: env.USERDB_PASSWORD ?? env.DB_PASSWORD,
  dialect: 'postgres',
  logging: logger.debug.bind(logger),
  pool: {
    max: 5,
    min: 0,
    idle: 10000,
    acquire: 30000,
  },
};

const userSequelize = new Sequelize(
  userDbConfig.database,
  userDbConfig.username,
  userDbConfig.password,
  {
    host: userDbConfig.host,
    port: userDbConfig.port,
    dialect: 'postgres',
    logging: userDbConfig.logging,
    pool: userDbConfig.pool,
  },
);

export default userSequelize;

export async function initUserDatabase(): Promise<void> {
  try {
    await userSequelize.authenticate();
    logger.info(`Connected to user-content database ${userDbConfig.database} successfully`);
  } catch (err) {
    logger.error('Failed to connect to user-content database:', err);
    throw err;
  }
}
