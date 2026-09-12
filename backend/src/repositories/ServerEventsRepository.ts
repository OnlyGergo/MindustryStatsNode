// ─────────────────────────────────────────────────────────────────────────────
// ServerEventsRepository.ts
// Chart annotations: the events that explain a shape in a graph rather than
// contributing to it (migration 29).
//
// One table drives both shapes — `ends_at IS NULL` is a point event (a version
// bump, the moment an address changed), a set `ends_at` is a span (an era of
// poor DNS resolution, an outage) — and a NULL `server_id` is a global event
// that belongs on every chart.
//
// Raw SQL, like the rest of the repositories; Sequelize is only the connection
// layer here.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { type ServerEvent, type ServerEventKind } from '../../../common/models/serverData.js';

interface RawEventRow {
    id: number;
    server_id: number | null;
    kind: ServerEventKind;
    occurred_at: Date;
    ends_at: Date | null;
    detail: Record<string, unknown> | null;
}

/**
 * Overlap test against the window the chart drew.
 *
 * A point event overlaps when its instant falls inside the window; a span
 * overlaps when it intersects at all, including the spans that started before
 * the window opened and are still running — those are precisely the ones worth
 * shading, and an `occurred_at BETWEEN` test would drop them.  COALESCE folds
 * both cases into one comparison: a point event is a span of zero length.
 *
 * Both bounds are inclusive.  The history queries push their end bound out by a
 * bucket to keep the bucket that is currently filling, so an event landing in
 * that last bucket has to be returned with it.
 */
const OVERLAPS_WINDOW = `
          e.occurred_at <= to_timestamp(:rangeEndMs / 1000.0)
      AND COALESCE(e.ends_at, e.occurred_at) >= to_timestamp(:rangeStartMs / 1000.0)`;

const SELECT_COLUMNS = `
        e.id,
        -- Never the raw stream id: the client only ever knows canonical ids, and
        -- an annotation on the address a server has since left still belongs to
        -- that server's chart.  NULL stays NULL — that is the global marker.
        sc.canonical_id AS server_id,
        e.kind,
        e.occurred_at,
        e.ends_at,
        e.detail`;

function toServerEvent(row: RawEventRow): ServerEvent {
    return {
        id:         Number(row.id),
        serverId:   row.server_id == null ? null : Number(row.server_id),
        kind:       row.kind,
        occurredAt: new Date(row.occurred_at).getTime(),
        // Explicit null rather than an absent key: ApiPacker takes its key list
        // from the first object it is handed, so a row that happens to be a
        // point event must still carry every column.
        endsAt:     row.ends_at == null ? null : new Date(row.ends_at).getTime(),
        detail:     row.detail ?? null,
    };
}

/**
 * Annotations for one identity's chart: the whole family's events plus the
 * global ones, which annotate every chart.
 *
 * `canonicalId` is a canonical server id; server_family() expands it to the
 * streams that may carry the rows, and the join maps them straight back up so
 * nothing stream-shaped escapes the repository.
 */
export async function getServerEvents(
    canonicalId: number,
    rangeStartMs: number,
    rangeEndMs: number
): Promise<ServerEvent[]> {
    const rows = await sequelize.query(`
        SELECT ${SELECT_COLUMNS}
        FROM server_events e
        LEFT JOIN server_canonical sc ON sc.server_id = e.server_id
        WHERE (
                  e.server_id IS NULL
               OR e.server_id IN (SELECT server_family(:canonicalId))
              )
          AND ${OVERLAPS_WINDOW}
        ORDER BY e.occurred_at, e.id
    `, {
        replacements: { canonicalId, rangeStartMs, rangeEndMs },
        type: QueryTypes.SELECT
    }) as RawEventRow[];

    return rows.map(toServerEvent);
}

/** Annotations that belong on every chart, for the charts that have no server. */
export async function getGlobalEvents(
    rangeStartMs: number,
    rangeEndMs: number
): Promise<ServerEvent[]> {
    const rows = await sequelize.query(`
        SELECT ${SELECT_COLUMNS}
        FROM server_events e
        -- Kept only so the two queries return the same columns; server_id is
        -- NULL on every row this one returns, so the join never matches.
        LEFT JOIN server_canonical sc ON sc.server_id = e.server_id
        WHERE e.server_id IS NULL
          AND ${OVERLAPS_WINDOW}
        ORDER BY e.occurred_at, e.id
    `, {
        replacements: { rangeStartMs, rangeEndMs },
        type: QueryTypes.SELECT
    }) as RawEventRow[];

    return rows.map(toServerEvent);
}
