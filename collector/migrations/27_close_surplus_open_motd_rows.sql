-- Closes the surplus open rows in server_motds_history.
--
-- ServerMotdHistory's model never declared valid_from/valid_to, and Sequelize
-- drops undeclared columns from update() without complaining -- so the "close
-- the previous row" step ran with an empty SET clause and every MOTD change
-- added another row with valid_to IS NULL.  Migration 26 repaired the rows that
-- existed then; this closes the ones that accumulated since, and the model fix
-- shipped alongside stops them coming back.
--
-- Each superseded row is closed at the moment the next one opened, which is the
-- same rule migration 26 used, so the chain stays contiguous.
WITH ordered AS (
    SELECT id,
           valid_from,
           LEAD(valid_from) OVER (PARTITION BY server_id ORDER BY valid_from, id) AS next_from
    FROM public.server_motds_history
    WHERE valid_to IS NULL
)
UPDATE public.server_motds_history h
SET valid_to = o.next_from
FROM ordered o
WHERE h.id = o.id
  AND h.valid_from = o.valid_from
  AND h.valid_to IS NULL
  AND o.next_from IS NOT NULL;
