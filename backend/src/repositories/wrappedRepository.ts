// ─────────────────────────────────────────────────────────────────────────────
// wrappedRepository.ts
// Extra read-only queries only the yearly "Wrapped" report needs. Player-hours
// use the same definition as getFamilyHours: per (family, hour) the MAX of
// sum_players / samples across aliases, then summed. Timestamps leave SQL as
// epoch seconds computed on a UTC-truncated `timestamp`, so the node-pg
// timezone parsing of `timestamp without time zone` never gets involved.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import type { ServerRef } from '../../../common/models/leaderboard.js';
import { aggregateExcludeSql } from './canonicalIdentity.js';
import { attachServerRefs } from './leaderboardRepository.js';
import { round1 } from './leaderboardMath.js';

const STREAKS = 10;

/** Per (family, hour) player-hours; `idFilter` optionally narrows families. */
const famHourCte = (idFilter = '') => `
    fam_hour AS (
        SELECT sc.canonical_id, st.bucket,
               MAX(st.sum_players::float8 / NULLIF(st.samples, 0)) AS ph
        FROM server_stats_1h st
        JOIN server_canonical sc ON sc.server_id = st.server_id
        WHERE st.bucket >= :start AND st.bucket < :end
          AND ${aggregateExcludeSql('st')}
          ${idFilter}
        GROUP BY sc.canonical_id, st.bucket
    )`;

/** First hourly bucket on record, or null on an empty database. */
export async function getDataStart(): Promise<Date | null> {
    const [row] = await sequelize.query<{ first: Date | null }>(
        `SELECT MIN(bucket) AS first FROM server_stats_1h`,
        { type: QueryTypes.SELECT },
    );
    return row?.first ? new Date(row.first) : null;
}

/** Epoch ms of the first of every UTC month overlapping [start, end). */
function monthStarts(start: Date, end: Date): number[] {
    const out: number[] = [];
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let t = Date.UTC(y, m, 1); t < end.getTime(); t = Date.UTC(y, ++m, 1)) out.push(t);
    return out;
}

export async function getMonthlyPlayerHours(
    start: Date,
    end: Date,
): Promise<{ month: number; playerHours: number }[]> {
    const rows = await sequelize.query<{ month: number; ph: number }>(`
        WITH ${famHourCte()}
        SELECT EXTRACT(EPOCH FROM date_trunc('month', bucket AT TIME ZONE 'UTC'))::float8 AS month,
               SUM(ph)::float8 AS ph
        FROM fam_hour
        GROUP BY 1
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    const byMonth = new Map(rows.map((r) => [Number(r.month) * 1000, Number(r.ph) || 0]));
    return monthStarts(start, end).map((month) => ({ month, playerHours: round1(byMonth.get(month) ?? 0) }));
}

export async function getBusiestDay(
    start: Date,
    end: Date,
): Promise<{ day: number; playerHours: number } | null> {
    const [row] = await sequelize.query<{ day: number; ph: number }>(`
        WITH ${famHourCte()}
        SELECT EXTRACT(EPOCH FROM date_trunc('day', bucket AT TIME ZONE 'UTC'))::float8 AS day,
               SUM(ph)::float8 AS ph
        FROM fam_hour
        GROUP BY 1
        ORDER BY ph DESC NULLS LAST, day ASC
        LIMIT 1
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    return row && Number(row.ph) > 0 ? { day: Number(row.day) * 1000, playerHours: round1(Number(row.ph)) } : null;
}

/** Each family's busiest month (by player-hours) in the range. Families with no hours are absent. */
export async function getBestMonths(
    start: Date,
    end: Date,
    ids: number[],
): Promise<{ id: number; month: number; playerHours: number }[]> {
    if (ids.length === 0) return [];
    const rows = await sequelize.query<{ id: number; month: number; ph: number }>(`
        WITH ${famHourCte('AND sc.canonical_id IN (:ids)')},
        per_month AS (
            SELECT canonical_id, date_trunc('month', bucket AT TIME ZONE 'UTC') AS m, SUM(ph) AS ph
            FROM fam_hour
            GROUP BY canonical_id, 2
        )
        SELECT DISTINCT ON (canonical_id)
               canonical_id AS id, EXTRACT(EPOCH FROM m)::float8 AS month, ph::float8 AS ph
        FROM per_month
        ORDER BY canonical_id, ph DESC, m ASC
    `, { replacements: { start, end, ids }, type: QueryTypes.SELECT });
    return rows
        .filter((r) => Number(r.ph) > 0)
        .map((r) => ({ id: Number(r.id), month: Number(r.month) * 1000, playerHours: round1(Number(r.ph)) }));
}

export type StreakRow = ServerRef & { days: number; from: number; to: number };

/**
 * Longest run of consecutive UTC days a family was online (any alias with
 * online_samples > 0 in any hour of the day). One row per family: its best run.
 */
export async function getLongestStreaks(start: Date, end: Date): Promise<StreakRow[]> {
    const rows = await sequelize.query<{ id: number; days: number; from: number; to: number }>(`
        WITH online_days AS (
            SELECT DISTINCT sc.canonical_id,
                   date_trunc('day', st.bucket AT TIME ZONE 'UTC') AS day
            FROM server_stats_1h st
            JOIN server_canonical sc ON sc.server_id = st.server_id
            WHERE st.bucket >= :start AND st.bucket < :end
              AND st.online_samples > 0
              AND ${aggregateExcludeSql('st')}
        ),
        islands AS (
            SELECT canonical_id, day,
                   day - (ROW_NUMBER() OVER (PARTITION BY canonical_id ORDER BY day) * INTERVAL '1 day') AS grp
            FROM online_days
        ),
        runs AS (
            SELECT canonical_id, COUNT(*) AS days, MIN(day) AS first_day, MAX(day) AS last_day
            FROM islands
            GROUP BY canonical_id, grp
        ),
        best AS (
            SELECT DISTINCT ON (canonical_id) canonical_id, days, first_day, last_day
            FROM runs
            ORDER BY canonical_id, days DESC, first_day ASC
        )
        SELECT canonical_id AS id, days::int AS days,
               EXTRACT(EPOCH FROM first_day)::float8 AS "from",
               EXTRACT(EPOCH FROM last_day)::float8  AS "to"
        FROM best
        ORDER BY days DESC, first_day ASC, canonical_id ASC
        LIMIT ${STREAKS}
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    const refs = await attachServerRefs(rows.map((r) => Number(r.id)));
    return rows.map((r) => {
        const id = Number(r.id);
        return {
            ...(refs.get(id) ?? { id, name: null, networkId: null, networkName: null }),
            days: Number(r.days),
            from: Number(r.from) * 1000,
            to: Number(r.to) * 1000,
        };
    });
}
