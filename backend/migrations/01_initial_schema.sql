-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create servers table
CREATE TABLE servers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(host, port)
);

-- Create server stats table (will be converted to hypertable)
CREATE TABLE server_stats (
  id SERIAL,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  players INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER,
  wave INTEGER,
  version INTEGER,
  version_type VARCHAR(50),
  ping INTEGER,
  online BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id, timestamp)
);

-- Create MOTDs table with period tracking
CREATE TABLE server_motds (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  server_name VARCHAR(255),
  description TEXT,
  mode_name VARCHAR(100)
);

-- Create Maps table with period tracking
CREATE TABLE server_maps (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  map_name VARCHAR(255) NOT NULL,
  game_mode SMALLINT
);

-- Convert server_stats to a hypertable
SELECT create_hypertable('server_stats', 'timestamp');

-- Create indexes for faster queries
CREATE INDEX idx_server_stats_server_id ON server_stats (server_id, timestamp DESC);
CREATE INDEX idx_server_motds_server_id ON server_motds (server_id, valid_from DESC);
CREATE INDEX idx_server_maps_server_id ON server_maps (server_id, valid_from DESC);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to update the updated_at column
CREATE TRIGGER update_servers_updated_at
BEFORE UPDATE ON servers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();