import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DATA_FILE = path.join(process.cwd(), 'data', 'history.json');

// Database configuration
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mindustry_stats',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

interface ServerHistory {
    timestamp: number;
    players: number;
}

interface ServerData {
    ping: number;
    host: string;
    port: number;
    serverName: string;
    mapName: string;
    players: number;
    wave: number;
    version: number;
    versionType: string;
    mode: number;
    playerLimit: number;
    description: string;
    modeName: string;
    online: boolean;
}

interface ServerWithHistory {
    name: string;
    host: string;
    port: number;
    currentData?: ServerData;
    history: ServerHistory[];
    lastUpdated?: number;
    online: boolean;
    consecutiveFailures?: number;
}

async function migrateData() {
    console.log('Starting migration from JSON to TimescaleDB...');

    try {
        // Read JSON file
        const jsonData = await fs.readFile(DATA_FILE, 'utf8');
        const servers: ServerWithHistory[] = JSON.parse(jsonData);

        console.log(`Found ${servers.length} servers to migrate`);

        // Create a client from the pool for transaction
        const client = await pool.connect();

        try {
            // Start transaction
            await client.query('BEGIN');

            for (const server of servers) {
                // Insert server and get ID
                const serverResult = await client.query(
                    `INSERT INTO servers (name, host, port) 
           VALUES ($1, $2, $3)
           ON CONFLICT (host, port) 
           DO UPDATE SET name = $1, updated_at = NOW()
           RETURNING id`,
                    [server.name, server.host, server.port]
                );

                const serverId = serverResult.rows[0].id;
                console.log(`Processing server ${server.name} (${server.host}:${server.port}), ID: ${serverId}`);

                // Handle current data
                if (server.currentData) {
                    const data = server.currentData;

                    // Insert current MOTD
                    await client.query(
                        `INSERT INTO server_motds 
             (server_id, valid_from, server_name, description, mode_name)
             VALUES ($1, $2, $3, $4, $5)`,
                        [
                            serverId,
                            new Date(server.lastUpdated || Date.now()),
                            data.serverName,
                            data.description,
                            data.modeName
                        ]
                    );

                    // Insert current map
                    await client.query(
                        `INSERT INTO server_maps 
             (server_id, valid_from, map_name, game_mode)
             VALUES ($1, $2, $3, $4)`,
                        [
                            serverId,
                            new Date(server.lastUpdated || Date.now()),
                            data.mapName,
                            data.mode
                        ]
                    );
                }

                // Batch insert history records for better performance
                if (server.history.length > 0) {
                    // Prepare data for batch insert
                    const values = server.history.map(point => {
                        const timestamp = new Date(point.timestamp);
                        return `(${serverId}, '${timestamp.toISOString()}', ${point.players}, true)`;
                    }).join(',');

                    await client.query(`
            INSERT INTO server_stats 
            (server_id, timestamp, players, online)
            VALUES ${values}
          `);

                    console.log(`Inserted ${server.history.length} history points for ${server.name}`);
                }
            }

            // Commit transaction
            await client.query('COMMIT');
            console.log('Migration completed successfully!');

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error during migration, rolling back:', err);
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

// Run migration
migrateData().catch(err => {
    console.error('Unhandled error during migration:', err);
    process.exit(1);
});