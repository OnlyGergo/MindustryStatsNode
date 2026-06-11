-- Create serverlists table to store server list sources
CREATE TABLE serverlists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on url for faster lookups
CREATE INDEX idx_serverlists_url ON serverlists (url);

-- Seed with the 4 sources (previously in const.ts)
INSERT INTO serverlists (name, url, display_name) VALUES
    ('servers_be', 'https://raw.githubusercontent.com/Anuken/MindustryServerList/refs/heads/main/servers_be.json', 'Mindustry Server List (BE)'),
    ('servers_v8', 'https://raw.githubusercontent.com/Anuken/MindustryServerList/refs/heads/main/servers_v8.json', 'Mindustry Server List (V8)'),
    ('servers_v7', 'https://raw.githubusercontent.com/Anuken/Mindustry/refs/heads/master/servers_v7.json', 'Mindustry (V7)'),
    ('servers_v6', 'https://raw.githubusercontent.com/Anuken/Mindustry/refs/heads/master/servers_v6.json', 'Mindustry (V6)');
