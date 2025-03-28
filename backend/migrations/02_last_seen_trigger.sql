-- Create a function for the trigger to use
CREATE OR REPLACE FUNCTION update_server_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update last_seen if the server is online
    IF NEW.online = TRUE THEN
        UPDATE servers
        SET last_seen = NEW.timestamp
        WHERE id = NEW.server_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger that runs after inserting into server_stats
CREATE OR REPLACE TRIGGER trigger_update_server_last_seen
AFTER INSERT OR UPDATE ON server_stats
FOR EACH ROW
EXECUTE FUNCTION update_server_last_seen();

-- Initialize
UPDATE servers s
SET last_seen = sub.max_timestamp
FROM (
         SELECT server_id, MAX(timestamp) as max_timestamp
         FROM server_stats
         WHERE online = true
         GROUP BY server_id
     ) as sub
WHERE s.id = sub.server_id
  AND (s.last_seen IS NULL OR s.last_seen < sub.max_timestamp);