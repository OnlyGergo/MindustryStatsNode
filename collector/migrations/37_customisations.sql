-- Per-server / per-network customisation (F4): accent colour + background.
--
-- One row per target, exactly one of server_group_id / server_id. A network
-- row is the default for every server in it; a server row overrides it field
-- by field (a NULL field falls through to the network's), resolved at read
-- time by the backend.
--
-- server_id is the raw servers.id the owner was looking at, never the family
-- root. As with server_reviews, a merge can leave a row on each alias of one
-- family, so the partial unique index below only stops duplicates per raw id;
-- reads take the family's newest row, and the backend's write path collapses
-- the family back to one row (repointing server_id) every time it saves.
--
-- accent_color is validated against /^#[0-9a-f]{6}$/i by the backend too; the
-- CHECK here is the backstop, since it is written straight into a style
-- attribute. background_image_id may only point at an approved image -- the
-- backend checks that on write, and un-sets it if the image is later rejected.
--
-- Same explicit-GRANT rule as every user-content migration.

create table if not exists customisations (
    id                  bigserial primary key,
    server_group_id     integer references server_groups (id) on delete cascade,
    -- The raw servers.id the owner was looking at, never the family root.
    server_id           integer references servers (id) on delete cascade,
    accent_color        char(7) check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
    background_image_id uuid references uploaded_images (id) on delete set null,
    updated_by          bigint references users (id) on delete set null,
    updated_at          timestamptz not null default now(),
    constraint customisations_exactly_one_target check (num_nonnulls(server_group_id, server_id) = 1)
);

create unique index if not exists customisations_server_group_id_uq
    on customisations (server_group_id) where server_group_id is not null;
create unique index if not exists customisations_server_id_uq
    on customisations (server_id) where server_id is not null;
-- Un-setting a rejected image.
create index if not exists customisations_background_image_id_idx
    on customisations (background_image_id) where background_image_id is not null;

grant select, insert, update, delete on customisations to app_user_rw;
grant usage, select on sequence customisations_id_seq to app_user_rw;
