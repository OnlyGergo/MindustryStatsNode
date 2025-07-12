CREATE OR REPLACE FUNCTION add_server_and_group(
    p_group_name VARCHAR(255),
    p_host VARCHAR(255),
    p_port INTEGER
)
    RETURNS VOID
    LANGUAGE plpgsql
AS $$
DECLARE
    group_id INTEGER;
BEGIN
    -- Check if the server group exists, insert if not
    IF NOT EXISTS (
        SELECT 1
        FROM server_groups
        WHERE name = p_group_name
    ) THEN
        INSERT INTO server_groups (name)
        VALUES (p_group_name);
    END IF;

    -- Get the server group ID
    SELECT id INTO group_id
    FROM server_groups
    WHERE name = p_group_name;

    -- Check if the server exists, insert if not
    IF NOT EXISTS (
        SELECT 1
        FROM servers
        WHERE host = p_host AND port = p_port
    ) THEN
        INSERT INTO servers (host, port, server_group_id)
        VALUES (p_host, p_port, group_id);
    END IF;
END;
$$;