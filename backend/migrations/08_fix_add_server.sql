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
    -- Insert or get existing server group
    INSERT INTO server_groups (name)
    VALUES (p_group_name)
    ON CONFLICT (name) DO NOTHING;

    -- Get the server group ID
    SELECT id INTO group_id
    FROM server_groups
    WHERE name = p_group_name;

    -- Insert server if it doesn't exist
    INSERT INTO servers (host, port, server_group_id)
    VALUES (p_host, p_port, group_id)
    ON CONFLICT (host, port) DO NOTHING;
END;
$$;