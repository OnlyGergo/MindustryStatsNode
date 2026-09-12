// ─────────────────────────────────────────────────────────────────────────────
// identitySql.ts
// SQL fragments every read path needs now that `servers` is an observation
// stream table rather than a list of servers (migration 29).
//
// Two rules are repeated often enough to be worth naming once:
//
//   * collapsing a family of streams to the identity it belongs to, which every
//     aggregate query does between "peak per raw server_id" and "sum across
//     servers", and
//   * dropping the identities that are not plain game servers, which every
//     listing and every aggregate does so a hub — which mirrors other servers'
//     player counts — cannot double count players.
//
// Kept as fragments rather than a view or a function because the queries that
// use them are already hand-shaped around TimescaleDB's planner, and a wrapper
// would hide the join they need to place deliberately.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The identities that must not reach listings or aggregate stats: hubs, test
 * servers and anything classified as "not a plain game server" but not yet
 * sorted.
 *
 * Driven off `idx_servers_role`, the partial index that only carries the handful
 * of rows whose role is not 'game', so the exclusion set is read out of a tiny
 * index rather than by scanning `servers`.
 *
 * Evaluated over the *whole family*: an identity is dropped when any of its
 * streams is non-game.  Role describes the machine and not the address it
 * happens to answer on, and a merge only ever stitches together streams of the
 * same machine, so the two readings agree for any family a merge produced.
 *
 * Used by the listings too, rather than the cheaper `server_identity.role`
 * those could afford.  The two only diverge for a family with mixed roles —
 * which should not exist — but if one ever does, the divergence is the worst
 * possible shape: a server visible in the list and missing from the totals it
 * is supposed to contribute to.  One rule, applied everywhere, cannot drift.
 */
export const NON_GAME_CANONICAL_IDS = `
    SELECT role_family.canonical_id
    FROM servers role_stream
    JOIN server_canonical role_family ON role_family.server_id = role_stream.id
    WHERE role_stream.role <> 'game'`;

/**
 * Anti-join fragment keeping only 'game' identities.
 *
 * @param canonicalExpr the canonical id column to test, e.g. `sc.canonical_id`.
 */
export function gameIdentitiesOnly(canonicalExpr: string): string {
    return `${canonicalExpr} NOT IN (${NON_GAME_CANONICAL_IDS}\n    )`;
}
