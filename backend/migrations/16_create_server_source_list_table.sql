-- Create server_source_list table to track server origins
CREATE TABLE server_source_list (
    id SERIAL PRIMARY KEY,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    serverlist_id INTEGER NOT NULL REFERENCES serverlists(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (server_id, serverlist_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_server_source_list_server_id ON server_source_list (server_id);
CREATE INDEX idx_server_source_list_serverlist_id ON server_source_list (serverlist_id);
CREATE INDEX idx_server_source_list_last_seen ON server_source_list (last_seen);
