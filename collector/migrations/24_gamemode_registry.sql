-- ─────────────────────────────────────────────────────────────────────────────
-- 24_gamemode_registry.sql
--
-- `server_maps_registry` carried the gamemode inline as (game_mode, mode_name),
-- so every gamemode chart grouped a smallint + a raw text column (colour codes
-- and all) and then had to strip those colour codes per row in JS before the
-- rows could be merged.  Two registry rows that are the same gamemode spelled
-- with different colour tags therefore came back as two separate series.
--
-- This lifts the gamemode into its own tiny registry:
--     server_maps_registry.gamemode_id -> gamemode_registry.id
-- so reads group on one smallint and take an already-cleaned display name
-- straight out of the table.
--
-- `server_stats` is deliberately left alone: it keeps exactly one map FK, and
-- the gamemode is reached through it.  server_maps_registry is ~22k rows /
-- ~4.5 MB and lives entirely in shared buffers, so the extra hop is a hash join
-- against a table that is already resident — effectively free, and far cheaper
-- than another column on a ~50M row compressed hypertable (which would mean
-- decompressing and rewriting the whole history).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── Registry ────────────────────────────────────────────────────────────────
-- game_mode  : the vanilla Mindustry enum value (0..4).
-- mode_name  : the raw name the server reported, colour codes and all.  Kept
--              verbatim so the natural key stays byte-exact with what the
--              collector sees; '' for servers that report no custom name.
-- clean_name : display name — removeColorsFromMindustry(mode_name), falling
--              back to the vanilla name when that leaves nothing.  Precomputed
--              here so the read path never runs the regex per row.
CREATE TABLE gamemode_registry
(
    id         smallserial PRIMARY KEY,
    game_mode  smallint NOT NULL,
    mode_name  text     NOT NULL DEFAULT '',
    clean_name text     NOT NULL DEFAULT '',
    CONSTRAINT uq_gamemode UNIQUE (game_mode, mode_name)
);

ALTER TABLE server_maps_registry
    ADD COLUMN gamemode_id smallint REFERENCES gamemode_registry (id);


-- ─── Backfill ────────────────────────────────────────────────────────────────
-- clean_name mirrors common/Gamemode.ts:getModeName() exactly:
--   removeColorsFromMindustry() strips /\[([a-zA-Z0-9#]*?)]/g, and an empty or
--   colour-code-only mode_name falls through to the vanilla enum name.
INSERT INTO gamemode_registry (game_mode, mode_name, clean_name)
SELECT DISTINCT
    COALESCE(r.game_mode, 0),
    COALESCE(r.mode_name, ''),
    COALESCE(
        NULLIF(regexp_replace(COALESCE(r.mode_name, ''), '\[[a-zA-Z0-9#]*\]', '', 'g'), ''),
        (ARRAY ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'])[COALESCE(r.game_mode, 0) + 1],
        'Unknown'
    )
FROM server_maps_registry r
ON CONFLICT (game_mode, mode_name) DO NOTHING;

UPDATE server_maps_registry r
SET gamemode_id = g.id
FROM gamemode_registry g
WHERE g.game_mode = COALESCE(r.game_mode, 0)
  AND g.mode_name = COALESCE(r.mode_name, '');

-- Every map row now points at a gamemode, and bulkSaveMaps() always supplies
-- one, so the read path can use plain inner joins.
ALTER TABLE server_maps_registry
    ALTER COLUMN gamemode_id SET NOT NULL;

-- Drives the gamemode -> maps direction (gamemode list, per-mode filtering).
-- The maps -> gamemode direction is a hash join against a resident table and
-- needs no index of its own.
CREATE INDEX idx_server_maps_registry_gamemode
    ON server_maps_registry (gamemode_id);

COMMIT;
