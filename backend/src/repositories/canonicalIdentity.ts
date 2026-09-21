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
//   * Family-level properties (server group, aggregate_exclude) are read from
//     the ROOT row, so a merge cannot leave half a family excluded.
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
 * Filters out the hub/lobby servers that should not reach aggregate charts.
 * Exclusion is decided by the family root, so merging an alias in cannot
 * smuggle its players back into a total the root is excluded from.
 */
export function aggregateExcludeSql(alias?: string): string {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}server_id IN (${familyMembersSql('NOT root.aggregate_exclude')})`;
}

/** The live address of a family: its newest non-retired member, root as fallback. */
export const LIVE_MEMBER_SQL = `
    SELECT DISTINCT ON (sc.canonical_id)
           sc.canonical_id,
           s.id   AS live_server_id,
           s.host,
           s.port,
           s.country_code
    FROM server_canonical sc
    JOIN servers s ON s.id = sc.server_id
    -- The root is the oldest observation, which makes it a stable identity but
    -- a stale address; what a visitor needs is whatever the server answers on
    -- today.  Retired rows sort last so they only win when the whole family is
    -- retired, and then the tie-break falls back to the newest row seen.
    ORDER BY sc.canonical_id,
             (s.retired_at IS NULL) DESC,
             s.last_seen DESC NULLS LAST,
             s.id DESC
`;
