import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'mindustry_stats',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create the connection pool
const pool = new Pool(dbConfig);

// Initialize database connection
export async function initDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    console.log('Connected to database successfully');
    
    // Check if TimescaleDB extension exists
    const result = await client.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
    );
    
    if (!result.rows[0].exists) {
      console.warn('TimescaleDB extension is not installed or enabled. Some features may not work correctly.');
    }
    
    client.release();
    
    // Run migrations if needed
    await runMigrations();
    
  } catch (err) {
    console.error('Failed to connect to database:', err);
    throw err;
  }
}

// Function to run database migrations
async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Get list of applied migrations
    const { rows: appliedMigrations } = await client.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const appliedMigrationNames = appliedMigrations.map(row => row.name);
    
    // Read migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');
    let migrationFiles: string[] = [];
    
    try {
      migrationFiles = await fs.promises.readdir(migrationsDir);
      migrationFiles.sort(); // Ensure migrations run in order
    } catch (err) {
      console.warn('Migrations directory not found, skipping migrations');
      return;
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    // Apply new migrations
    for (const file of migrationFiles) {
      if (!file.endsWith('.sql')) continue;
      
      if (!appliedMigrationNames.includes(file)) {
        console.log(`Applying migration: ${file}`);
        
        const migrationPath = path.join(migrationsDir, file);
        const migrationSql = await fs.promises.readFile(migrationPath, 'utf8');
        
        // Execute migration
        await client.query(migrationSql);
        
        // Record migration
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [file]
        );
        
        console.log(`Migration applied: ${file}`);
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
  } catch (err) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Export query functions
export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;