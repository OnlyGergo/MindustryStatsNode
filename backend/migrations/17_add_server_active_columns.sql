-- Add inactivity_excluded column to servers table
ALTER TABLE servers 
    ADD COLUMN inactivity_excluded BOOLEAN NOT NULL DEFAULT FALSE;

-- Add active virtual generated column (false if last_seen is older than 2 weeks)
-- Note: This is computed regardless of inactivity_excluded - the column is for filtering in queries
ALTER TABLE servers 
    ADD COLUMN active BOOLEAN GENERATED ALWAYS AS (
        CASE 
            WHEN last_seen IS NULL THEN FALSE
            WHEN last_seen < NOW() - INTERVAL '14 days' THEN FALSE
            ELSE TRUE
        END
    ) STORED;

-- Create index on active column for efficient queries
CREATE INDEX idx_servers_active ON servers (active);
CREATE INDEX idx_servers_inactivity_excluded ON servers (inactivity_excluded);
