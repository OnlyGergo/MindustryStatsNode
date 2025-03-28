-- Create server_groups table
CREATE TABLE server_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add server_group_id to servers table
ALTER TABLE servers
    ADD COLUMN server_group_id INTEGER;

-- Migrate existing server names to the server_groups table
INSERT INTO server_groups (name)
SELECT DISTINCT name FROM servers;

-- Update servers table to reference the new server_groups
UPDATE servers
SET server_group_id = server_groups.id
FROM server_groups
WHERE servers.name = server_groups.name;

-- Make server_group_id column NOT NULL and add foreign key
ALTER TABLE servers
    ALTER COLUMN server_group_id SET NOT NULL,
    ADD CONSTRAINT fk_server_group FOREIGN KEY (server_group_id) REFERENCES server_groups(id);

-- Remove name column from servers as it's now in server_groups
ALTER TABLE servers
    DROP COLUMN name;

-- Create index on server_group_id
CREATE INDEX idx_servers_server_group_id ON servers(server_group_id);

-- Add triggers to automatically update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_server_groups_timestamp
    BEFORE UPDATE ON server_groups
    FOR EACH ROW
EXECUTE FUNCTION update_timestamp();