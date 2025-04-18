-- Migration: Fix duplicate map and motd entries
-- For server_motds table
WITH duplicate_motds AS (
    SELECT
        server_id,
        server_name,
        description,
        mode_name,
        MIN(valid_from) AS earliest_valid_from,
        array_agg(id) AS id_list
    FROM server_motds
    WHERE valid_to IS NULL
    GROUP BY server_id, server_name, description, mode_name
    HAVING COUNT(*) > 1
),
     ids_to_keep AS (
         SELECT
             MIN(id_list[1]) AS id_to_keep
         FROM duplicate_motds
     )
DELETE FROM server_motds
WHERE valid_to IS NULL
  AND id NOT IN (SELECT id_to_keep FROM ids_to_keep)
  AND server_id IN (
    SELECT server_id FROM duplicate_motds
);

-- Update the valid_from dates to the earliest date
UPDATE server_motds sm
SET valid_from = dm.earliest_valid_from
FROM (
         SELECT
             id_list[1] AS id,
             earliest_valid_from
         FROM (
                  SELECT
                      MIN(valid_from) AS earliest_valid_from,
                      array_agg(id) AS id_list
                  FROM server_motds
                  WHERE valid_to IS NULL
                  GROUP BY server_id, server_name, description, mode_name
                  HAVING COUNT(*) > 1
              ) subq
     ) dm
WHERE sm.id = dm.id;

-- For server_maps table
-- For server_maps table
WITH duplicate_maps AS (
    SELECT
        server_id,
        map_name,
        game_mode,
        MIN(valid_from) AS earliest_valid_from,
        array_agg(id) AS id_list
    FROM server_maps
    WHERE valid_to IS NULL
    GROUP BY server_id, map_name, game_mode
    HAVING COUNT(*) > 1
),
     ids_to_keep AS (
         SELECT
             MIN(id_list[1]) AS id_to_keep
         FROM duplicate_maps
     )
DELETE FROM server_maps
WHERE valid_to IS NULL
  AND id NOT IN (SELECT id_to_keep FROM ids_to_keep)
  AND server_id IN (
    SELECT server_id FROM duplicate_maps
);

-- Update the valid_from dates to the earliest date
UPDATE server_maps sm
SET valid_from = dm.earliest_valid_from
FROM (
         SELECT
             id_list[1] AS id,
             earliest_valid_from
         FROM (
                  SELECT
                      MIN(valid_from) AS earliest_valid_from,
                      array_agg(id) AS id_list
                  FROM server_maps
                  WHERE valid_to IS NULL
                  GROUP BY server_id, map_name, game_mode
                  HAVING COUNT(*) > 1
              ) subq
     ) dm
WHERE sm.id = dm.id;