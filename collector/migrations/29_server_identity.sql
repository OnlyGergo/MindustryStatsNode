-- ─────────────────────────────────────────────────────────────────────────────
-- 29_server_identity.sql
--
-- Splits "a row in `servers`" into two ideas that were previously the same one:
--
--   * an *observation stream* — one (host, port) we have polled.  A server that
--     moves address, or whose DNS name is re-pointed, produces a second stream.
--   * an *identity* — the thing the site shows on /server/:id, which may be
--     several streams stitched together.
--
-- The stitching lives in `server_canonical` rather than in `servers` itself, so
-- merging two streams never rewrites a single `server_stats` row.  That is the
-- whole point: rewriting server_id on historical rows would invalidate every
-- continuous aggregate built in migration 21, and chunks old enough to have
-- been dropped by a retention policy could not be rewritten at all.  A merge
-- here is one UPDATE against a table with one narrow row per server, and it is
-- reversible by writing that row back.
--
-- Reads collapse aliases at query time: peak per raw server_id first (the
-- existing per-server dedup), then JOIN server_canonical and take MAX across
-- the family — never SUM, because the two streams of a migrating server overlap
-- for as long as the old address keeps answering.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── servers: an observation stream, not a merged identity ───────────────────

-- (host, port) is only unique among *live* streams now: a retired stream keeps
-- its address so its history stays attributable, and the address is free to be
-- claimed by a new stream (a recycled VPS IP, a DNS name pointed elsewhere).
ALTER TABLE servers DROP CONSTRAINT servers_host_port_key;

ALTER TABLE servers ADD COLUMN retired_at timestamptz;

-- 'game'    — a real, playable server; the only role that reaches listings and
--             aggregate stats.
-- 'hub'     — a lobby/hub that mirrors other servers' player counts, so counting
--             it double counts players.
-- 'test'    — a server run for testing, ours or someone else's.
-- 'unknown' — classified as "not plain game" but not yet sorted.
ALTER TABLE servers ADD COLUMN role text NOT NULL DEFAULT 'game'
    CONSTRAINT servers_role_check CHECK (role IN ('game', 'hub', 'test', 'unknown'));

CREATE UNIQUE INDEX uq_server_address_active
    ON servers (host, port) WHERE retired_at IS NULL;

-- Partial: 'game' is the overwhelming majority and is never looked up through
-- this index (the listings ask for it by *excluding* the exceptions), so the
-- index only has to carry the handful of rows that are not 'game'.
CREATE INDEX idx_servers_role ON servers (role) WHERE role <> 'game';


-- ─── display_ref: the public-facing id ───────────────────────────────────────
--
-- `servers.id` now gains a row every time an address changes, so it is dense in
-- streams but sparse in identities.  display_ref numbers the identities in the
-- order we first saw them, which is what a "server #482" style reference wants.
CREATE SEQUENCE server_ref_seq;

ALTER TABLE servers ADD COLUMN display_ref integer;

-- Backfilled in first-seen order.  Deliberately not done by adding the column
-- WITH a nextval() default: that assigns values in physical row order, which is
-- insertion order only until the first UPDATE moves a row.
UPDATE servers s
SET display_ref = ordered.rn
FROM (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM servers
) ordered
WHERE s.id = ordered.id;

SELECT setval('server_ref_seq', COALESCE((SELECT MAX(display_ref) FROM servers), 0) + 1, false);

ALTER TABLE servers ALTER COLUMN display_ref SET DEFAULT nextval('server_ref_seq');
ALTER TABLE servers ALTER COLUMN display_ref SET NOT NULL;
ALTER TABLE servers ADD CONSTRAINT servers_display_ref_key UNIQUE (display_ref);
ALTER SEQUENCE server_ref_seq OWNED BY servers.display_ref;


-- ─── server_canonical: union-find over streams ───────────────────────────────
--
-- Every server has a row; a stream that has not been merged into anything
-- points at itself.  Because every server is present, reads JOIN rather than
-- LEFT JOIN + COALESCE, and "collapse to identity" costs one hash join against
-- a table small enough to stay resident.
CREATE TABLE server_canonical (
    server_id    integer PRIMARY KEY REFERENCES servers ON DELETE CASCADE,
    canonical_id integer NOT NULL REFERENCES servers
);

CREATE INDEX idx_server_canonical_canonical_id ON server_canonical (canonical_id);

INSERT INTO server_canonical (server_id, canonical_id)
SELECT id, id FROM servers;

-- Keeping the invariant "every server has a row" out of the writers: the
-- collector inserts servers from two different statements and a future one
-- would have to remember as well.
CREATE FUNCTION server_canonical_seed() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    INSERT INTO server_canonical (server_id, canonical_id)
    VALUES (NEW.id, NEW.id)
    ON CONFLICT (server_id) DO NOTHING;
    RETURN NULL;
END;
$$;

CREATE TRIGGER servers_seed_canonical
    AFTER INSERT ON servers
    FOR EACH ROW EXECUTE FUNCTION server_canonical_seed();

-- Depth is never allowed to exceed 1: a canonical_id must itself be a root.
-- Reads rely on it — they resolve an alias with a single join instead of a
-- recursive CTE — and the merge below maintains it by repointing a whole family
-- at once.  Deferred to commit so a merge statement is judged on its result
-- rather than on the order Postgres happened to touch the rows in.
CREATE FUNCTION server_canonical_check_root() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    target integer;
BEGIN
    -- Re-read rather than trusting NEW: NEW is a snapshot from the moment the
    -- row changed, but this trigger runs at commit, and a transaction that
    -- inserts a server and then merges it would otherwise be judged on the
    -- self-pointing row the seed trigger wrote, not on the merge.
    SELECT canonical_id INTO target FROM server_canonical WHERE server_id = NEW.server_id;
    IF target IS NULL THEN
        RETURN NULL;                                    -- deleted later in the same transaction
    END IF;

    IF EXISTS (
        SELECT 1 FROM server_canonical root
        WHERE root.server_id = target
          AND root.canonical_id <> target
    ) THEN
        RAISE EXCEPTION
            'server_canonical: server % points at %, which is itself an alias — merge onto the family root instead',
            NEW.server_id, target;
    END IF;

    -- The other way a second level appears: demoting a root that still has
    -- aliases hanging off it, which strands them one hop too deep.
    IF target <> NEW.server_id AND EXISTS (
        SELECT 1 FROM server_canonical child
        WHERE child.canonical_id = NEW.server_id
          AND child.server_id <> NEW.server_id
    ) THEN
        RAISE EXCEPTION
            'server_canonical: server % is a family root — repoint the whole family, not the root alone',
            NEW.server_id;
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER server_canonical_root_only
    AFTER INSERT OR UPDATE ON server_canonical
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION server_canonical_check_root();

-- Merges are performed by hand.  Both halves are one statement:
--
--   -- MERGE :sourceId's family into :targetId's, keeping depth at 1
--   WITH root AS (SELECT canonical_id FROM server_canonical WHERE server_id = :targetId)
--   UPDATE server_canonical sc
--   SET canonical_id = (SELECT canonical_id FROM root)
--   WHERE sc.canonical_id = (SELECT canonical_id FROM server_canonical WHERE server_id = :sourceId);
--
--   -- UNMERGE: reset one stream to standalone.  Deliberately does not try to
--   -- split off the aliases merged in after it; those stay with the family.
--   UPDATE server_canonical SET canonical_id = server_id WHERE server_id = :sourceId;
--
-- Pick the oldest created_at as the root: it is stable, so a later merge does
-- not renumber an identity the site has already published.  Then retire the
-- dead address and annotate the switchover:
--
--   UPDATE servers SET retired_at = NOW() WHERE id = :sourceId;
--   INSERT INTO server_events (server_id, kind, occurred_at, detail)
--   VALUES (:targetRootId, 'address_change', :aliasFirstSeen,
--           jsonb_build_object('from', :oldAddress, 'to', :newAddress));


-- ─── server_events: the annotation stream ────────────────────────────────────
--
-- One table drives both annotation shapes on the charts: `ends_at IS NULL` is a
-- point event (a version bump, the moment an address changed) drawn as a dashed
-- vertical line, and a set `ends_at` is a span (an era of poor DNS resolution, a
-- global outage) drawn as a shaded band.
--
-- A NULL server_id is a global event — it annotates every chart rather than one
-- server's.
CREATE TABLE server_events (
    id          serial PRIMARY KEY,
    server_id   integer REFERENCES servers ON DELETE CASCADE,
    kind        text NOT NULL
        CONSTRAINT server_events_kind_check
            CHECK (kind IN ('address_change', 'version_change', 'data_quality')),
    occurred_at timestamptz NOT NULL,
    ends_at     timestamptz
        CONSTRAINT server_events_span_check CHECK (ends_at IS NULL OR ends_at >= occurred_at),
    detail      jsonb
);

CREATE INDEX idx_server_events_server_occurred ON server_events (server_id, occurred_at DESC);


-- ─── server_identity: one row per identity, ready to display ─────────────────
--
-- Two different rows of a family answer two different questions, and getting
-- them the wrong way round is the easy mistake here:
--
--   * the *root* owns the identity — its id is the canonical id every stats
--     query groups by, and its display_ref is the public reference.
--   * the *current* stream owns the address — after a migration the root holds
--     the address the server has already left, so host/port/country/group have
--     to come from the newest live stream instead.
--
-- Every read path joins this view rather than re-deriving that per query.
CREATE VIEW server_identity AS
WITH current_stream AS (
    SELECT DISTINCT ON (sc.canonical_id)
           sc.canonical_id,
           s.id AS server_id,
           s.host,
           s.port,
           s.country_code,
           s.server_group_id,
           s.role,
           s.inactivity_excluded
    FROM server_canonical sc
    JOIN servers s ON s.id = sc.server_id
    -- Live streams first, then the most recently seen; id breaks ties so the
    -- view is deterministic for a family that has never been polled.
    ORDER BY sc.canonical_id,
             (s.retired_at IS NULL) DESC,
             s.last_seen DESC NULLS LAST,
             s.id DESC
),
family AS (
    SELECT sc.canonical_id,
           max(s.last_seen)                   AS last_seen,
           max(s.updated_at)                  AS updated_at,
           bool_and(s.retired_at IS NOT NULL) AS retired,
           count(*)                           AS stream_count
    FROM server_canonical sc
    JOIN servers s ON s.id = sc.server_id
    GROUP BY sc.canonical_id
)
SELECT root.id                AS id,
       root.display_ref       AS display_ref,
       root.created_at        AS first_seen,
       cur.server_id          AS current_server_id,
       cur.host               AS host,
       cur.port               AS port,
       cur.country_code       AS country_code,
       cur.server_group_id    AS server_group_id,
       cur.role               AS role,
       cur.inactivity_excluded AS inactivity_excluded,
       fam.last_seen          AS last_seen,
       fam.updated_at         AS updated_at,
       fam.retired            AS retired,
       fam.stream_count       AS stream_count
FROM current_stream cur
JOIN servers root ON root.id = cur.canonical_id
JOIN family fam   ON fam.canonical_id = cur.canonical_id;


-- ─── server_family(): the streams behind one identity ────────────────────────
--
-- Sugar for the per-server queries that filter on a single identity, so they can
-- say `server_id IN (SELECT server_family(:id))` instead of repeating the join.
-- Aggregate queries that collapse *every* server still join server_canonical
-- directly — one hash join beats a function call per group.
CREATE FUNCTION server_family(canonical_id integer)
    RETURNS SETOF integer
    STABLE
    LANGUAGE sql AS
$$
SELECT sc.server_id FROM server_canonical sc WHERE sc.canonical_id = $1;
$$;

ALTER TABLE server_canonical OWNER TO postgres;
ALTER TABLE server_events OWNER TO postgres;
ALTER VIEW server_identity OWNER TO postgres;
ALTER FUNCTION server_canonical_seed() OWNER TO postgres;
ALTER FUNCTION server_canonical_check_root() OWNER TO postgres;
ALTER FUNCTION server_family(integer) OWNER TO postgres;
ALTER SEQUENCE server_ref_seq OWNER TO postgres;
