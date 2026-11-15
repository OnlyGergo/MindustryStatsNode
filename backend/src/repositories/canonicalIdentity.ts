// ─────────────────────────────────────────────────────────────────────────────
// canonicalIdentity.ts
// SQL fragments for resolving observation rows onto the server they belong to.
//
// `servers` is an observation stream, not an identity: a server that changes
// host or port gets a *new* row, and the old one is retired.  server_canonical
// is the identity layer on top — a union-find table where every row points at
// its family's root, and a root points at itself.  Merges repoint a whole
// family at once, so depth never exceeds 1 and a single equijoin resolves any
// member to its root; no recursive CTE is ever needed.
//
// Everything public is keyed on the canonical id.  Stats, however, are written
// against the raw server_id and stay that way forever: collapsing happens at
// read time, which is why a merge never invalidates a continuous aggregate.
//
// Two rules the query builders here encode:
//   * Player counts collapse across aliases with MAX, never SUM.  During a
//     migration both addresses answer for a while, and summing them would
//     double-count one real server.
//   * Family-level properties are per family, never per raw row: the server
//     group is read from the ROOT row, and aggregate exclusion from
//     aggregate_excluded_families (keyed on the root).
// ─────────────────────────────────────────────────────────────────────────────

/** The canonical id a raw server_id resolves to. */
export function canonicalOfSql(serverIdParam: string = ':serverId'): string {
    return `(SELECT canonical_id FROM server_canonical WHERE server_id = ${serverIdParam})`;
}

/**
 * Every raw server_id sharing a family with `serverIdParam`.
 *
 * Accepts any member id, not just a root, so a stale link to an alias still
 * resolves to the whole server rather than to the fragment it was minted from.
 */
export function serverFamilySql(serverIdParam: string = ':serverId'): string {
    return `SELECT sc.server_id
            FROM server_canonical sc
            WHERE sc.canonical_id = ${canonicalOfSql(serverIdParam)}`;
}

/**
 * Every raw server_id whose family ROOT satisfies `rootPredicate`.
 * The predicate sees the root's `servers` row as `root`.
 */
export function familyMembersSql(rootPredicate: string): string {
    return `SELECT sc.server_id
            FROM server_canonical sc
            JOIN servers root ON root.id = sc.canonical_id
            WHERE ${rootPredicate}`;
}

/** Join that hangs the canonical id off a relation's raw server_id. */
export function canonicalJoin(alias: string, sourceAlias: string): string {
    return `JOIN server_canonical ${alias} ON ${alias}.server_id = ${sourceAlias}.server_id`;
}

/**
 * Canonical ids of every family excluded from aggregates (hub/lobby servers).
 * Exclusion is a FAMILY property, stored once per root in
 * aggregate_excluded_families (collector migration 45) and kept on the
 * surviving root by merge/unmerge, so every read applies the same rule: the
 * charts, network scopes, server list, leaderboard and Wrapped all agree.
 */
export const EXCLUDED_FAMILIES_SQL = `SELECT canonical_id FROM aggregate_excluded_families`;

/** True when the family whose root row is `rootAlias` is not excluded. */
export function notExcludedRootSql(rootAlias: string = 'root'): string {
    return `${rootAlias}.id NOT IN (${EXCLUDED_FAMILIES_SQL})`;
}

/**
 * Filters a relation's raw server_id down to members of non-excluded families.
 * The excluded set is a handful of families, so this is a small NOT IN.
 */
export function aggregateExcludeSql(alias?: string): string {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}server_id NOT IN (
            SELECT xsc.server_id FROM server_canonical xsc
            JOIN aggregate_excluded_families xaf ON xaf.canonical_id = xsc.canonical_id)`;
}

/**
 * The live address of a family: the member the collector polls (its PRIMARY),
 * root as fallback. `where` (optional, sees the canonical row as `sc`) scopes
 * the scan to some families before the DISTINCT ON sort, for callers that
 * only need a few.
 *
 * The ordering must stay the same as GetServers' in
 * collector/internal/repository/servers.go, which polls only this member of a
 * merged family between daily full sweeps, so the shown address is the one
 * whose numbers are current.
 */
export function liveMemberSql(where?: string | null): string {
    return `
    SELECT DISTINCT ON (sc.canonical_id)
           sc.canonical_id,
           s.id   AS live_server_id,
           s.host,
           s.port,
           s.country_code,
           s.resolved_ip,
           s.updated_at
    FROM server_canonical sc
    JOIN servers s ON s.id = sc.server_id
    LEFT JOIN server_current lm_cur ON lm_cur.server_id = s.id
    ${where ? `WHERE ${where}` : ''}
    -- The root is the oldest observation, which makes it a stable identity but
    -- a stale address; what a visitor needs is whatever the server answers on
    -- today.  Retired rows sort last so they only win when the whole family is
    -- retired.  Among live members (an IP row and a domain row of one server,
    -- or an old address merged into its new one): online now, then a hostname
    -- over an IPv4 literal, then the newest row seen.
    ORDER BY sc.canonical_id,
             (s.retired_at IS NULL) DESC,
             COALESCE(lm_cur.online, FALSE) DESC,
             (s.host ~ '^[0-9.]+$') ASC,
             s.last_seen DESC NULLS LAST,
             s.id DESC
`;
}

/** Unscoped live-member query (every family). */
export const LIVE_MEMBER_SQL = liveMemberSql();
