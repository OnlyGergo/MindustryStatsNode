-- F9 aspect ratings: three fixed nullable columns rather than an EAV table,
-- so the summary is a plain `AVG(x) FILTER (WHERE x IS NOT NULL)`.
-- The canonical list of aspects lives in common/models/ratings.ts, so adding
-- a fourth aspect means one new column here in a new migration plus one line there.
-- No GRANT is needed because app_user_rw already has table-level SELECT/INSERT/UPDATE/DELETE
-- on server_reviews from migration 33, and column additions inherit table privileges.

alter table server_reviews
    add column if not exists rating_maps       smallint check (rating_maps between 1 and 5),
    add column if not exists rating_moderation smallint check (rating_moderation between 1 and 5),
    add column if not exists rating_lag        smallint check (rating_lag between 1 and 5);
