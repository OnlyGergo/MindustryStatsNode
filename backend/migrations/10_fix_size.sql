BEGIN;
-- 1. Add the column back
ALTER TABLE public.server_stats ADD COLUMN id BIGSERIAL;

-- 2. Re-add the ID as the Primary Key (Sequelize's requirement)
-- Note: This will drop the (server_id, timestamp) PK we just made
ALTER TABLE public.server_stats DROP CONSTRAINT server_stats_pkey;
ALTER TABLE public.server_stats ADD PRIMARY KEY (id);
COMMIT;