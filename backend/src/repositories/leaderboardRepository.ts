// ─────────────────────────────────────────────────────────────────────────────
// leaderboardRepository.ts
// Read-only queries behind the leaderboard / Wrapped reports. Every function
// takes a window [start, end); the comparison window is the equally long one
// immediately before it, [start - (end - start), start).
//
// Player-hours = the mean players of each hour bucket (sum_players / samples),
// summed over the window. Aliases of one server collapse with MAX per
// (family, hour), never SUM, then hours add up per family.
// ─────────────────────────────────────────────────────────────────────────────

import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';
import type {
    CountryRow,
    Headline,
    LeaderboardSections,
    MapRow,
    ModeShareRow,
    MoverRow,
    NetworkRow,
    NewcomerRow,
    RankedServer,
    RecordRow,
    ReliabilityRow,
    ServerRef,
    WaveRow,
} from '../../../common/models/leaderboard.js';
import { aggregateExcludeSql, liveMemberSql } from './canonicalIdentity.js';
import { rawHourMapCte } from './playerHoursSql.js';
import { pickMovers, rankTop, round1, shareOf } from './leaderboardMath.js';

const TOP_SERVERS = 20;
const TOP_MAPS = 20;
const TOP_SMALL = 10;
const HOUR_MS = 3_600_000;

interface Window {
    start: Date;
    end: Date;
    prevStart: Date;
}

function windowOf(start: Date, end: Date): Window {
    return { start, end, prevStart: new Date(start.getTime() - (end.getTime() - start.getTime())) };
}

const replacementsOf = (w: Window, extra: Record<string, unknown> = {}) => ({
    start: w.start,
    end: w.end,
    prevStart: w.prevStart,
    ...extra,
});

// Per (family, hour): mean players, peak players and highest wave, aliases
// collapsed with MAX. Scans both windows once; callers split on :start.
const FAMILY_HOUR_CTE = `
    fam_hour AS (
        SELECT sc.canonical_id, st.bucket,
               MAX(st.sum_players::float8 / NULLIF(st.samples, 0)) AS ph,
               MAX(st.max_players) AS max_players,
               MAX(st.max_wave)    AS max_wave
        FROM server_stats_1h st
        JOIN server_canonical sc ON sc.server_id = st.server_id
        WHERE st.bucket >= :prevStart AND st.bucket < :end
          AND ${aggregateExcludeSql('st')}
        GROUP BY sc.canonical_id, st.bucket
    )`;

export interface FamilyHours {
    id: number;
    groupId: number | null;
    countryCode: string | null;
    cur: number;
    prev: number;
    maxWave: number;
}

/** Player-hours for every family active in either window, with its network and live country. */
export async function getFamilyHours(start: Date, end: Date): Promise<FamilyHours[]> {
    const w = windowOf(start, end);
    const rows = await sequelize.query<{
        id: number; group_id: number | null; country_code: string | null;
        cur: number | null; prev: number | null; max_wave: number | null;
    }>(`
        WITH ${FAMILY_HOUR_CTE},
        fam AS (
            SELECT canonical_id,
                   COALESCE(SUM(ph) FILTER (WHERE bucket >= :start), 0)::float8 AS cur,
                   COALESCE(SUM(ph) FILTER (WHERE bucket <  :start), 0)::float8 AS prev,
                   COALESCE(MAX(max_wave) FILTER (WHERE bucket >= :start), 0)   AS max_wave
            FROM fam_hour
            GROUP BY canonical_id
        ),
        live AS (${liveMemberSql('sc.canonical_id IN (SELECT canonical_id FROM fam)')})
        SELECT f.canonical_id AS id, root.server_group_id AS group_id, live.country_code,
               f.cur, f.prev, f.max_wave
        FROM fam f
        JOIN servers root ON root.id = f.canonical_id
        LEFT JOIN live ON live.canonical_id = f.canonical_id
        WHERE f.cur > 0 OR f.prev > 0
    `, { replacements: replacementsOf(w), type: QueryTypes.SELECT });
    return rows.map((r) => ({
        id: Number(r.id),
        groupId: r.group_id == null ? null : Number(r.group_id),
        countryCode: r.country_code,
        cur: Number(r.cur) || 0,
        prev: Number(r.prev) || 0,
        maxWave: Number(r.max_wave) || 0,
    }));
}

/** Display name (latest open MOTD) and network (from the family root) for canonical ids. */
export async function attachServerRefs(ids: number[]): Promise<Map<number, ServerRef>> {
    const refs = new Map<number, ServerRef>();
    if (ids.length === 0) return refs;
    const [names, networks] = await Promise.all([
        sequelize.query<{ canonical_id: number; server_name: string | null }>(`
            SELECT DISTINCT ON (sc.canonical_id) sc.canonical_id, r.server_name
            FROM server_motds_history h
            JOIN server_canonical sc ON sc.server_id = h.server_id
            JOIN server_motds_registry r ON r.id = h.motd_id
            WHERE h.valid_to IS NULL AND sc.canonical_id IN (:ids)
            ORDER BY sc.canonical_id, h.valid_from DESC
        `, { replacements: { ids }, type: QueryTypes.SELECT }),
        sequelize.query<{ id: number; network_id: number | null; network_name: string | null }>(`
            SELECT root.id, root.server_group_id AS network_id, sg.name AS network_name
            FROM servers root
            LEFT JOIN server_groups sg ON sg.id = root.server_group_id
            WHERE root.id IN (:ids)
        `, { replacements: { ids }, type: QueryTypes.SELECT }),
    ]);
    const nameOf = new Map<number, string | null>();
    for (const n of names) nameOf.set(Number(n.canonical_id), n.server_name || null);
    for (const n of networks) {
        const id = Number(n.id);
        refs.set(id, {
            id,
            name: nameOf.get(id) ?? null,
            networkId: n.network_id == null ? null : Number(n.network_id),
            networkName: n.network_name,
        });
    }
    for (const id of ids) {
        if (!refs.has(id)) refs.set(id, { id, name: nameOf.get(id) ?? null, networkId: null, networkName: null });
    }
    return refs;
}

const refOf = (refs: Map<number, ServerRef>, id: number): ServerRef =>
    refs.get(id) ?? { id, name: null, networkId: null, networkName: null };

// ─── Section builders over family rows (pure given the rows) ────────────────

const asScored = (families: FamilyHours[]) => families.map((f) => ({ key: f.id, cur: f.cur, prev: f.prev }));

export async function getTopServers(families: FamilyHours[]): Promise<RankedServer[]> {
    const ranked = rankTop(asScored(families), TOP_SERVERS);
    const refs = await attachServerRefs(ranked.map((r) => r.key));
    return ranked.map((r) => ({
        ...refOf(refs, r.key),
        playerHours: round1(r.cur),
        prevPlayerHours: round1(r.prev),
        rank: r.rank,
        prevRank: r.prevRank,
    }));
}

export async function getMovers(
    families: FamilyHours[],
    floor: number,
    direction: 'up' | 'down',
): Promise<MoverRow[]> {
    const picked = pickMovers(asScored(families), floor, TOP_SMALL, direction);
    const refs = await attachServerRefs(picked.map((r) => r.key));
    return picked.map((r) => ({
        ...refOf(refs, r.key),
        playerHours: round1(r.cur),
        prevPlayerHours: round1(r.prev),
        delta: round1(r.delta),
        deltaPct: r.deltaPct == null ? null : Math.round(r.deltaPct * 10000) / 10000,
    }));
}

export async function getNetworks(families: FamilyHours[]): Promise<NetworkRow[]> {
    const byGroup = new Map<number, { servers: number; cur: number; prev: number }>();
    for (const f of families) {
        if (f.groupId == null) continue;
        const g = byGroup.get(f.groupId) ?? { servers: 0, cur: 0, prev: 0 };
        g.cur += f.cur;
        g.prev += f.prev;
        if (f.cur > 0) g.servers++;
        byGroup.set(f.groupId, g);
    }
    const top = [...byGroup.entries()]
        .filter(([, g]) => g.cur > 0)
        .sort((a, b) => b[1].cur - a[1].cur || a[0] - b[0])
        .slice(0, TOP_SMALL);
    if (top.length === 0) return [];
    const names = await sequelize.query<{ id: number; name: string }>(
        `SELECT id, name FROM server_groups WHERE id IN (:ids)`,
        { replacements: { ids: top.map(([id]) => id) }, type: QueryTypes.SELECT },
    );
    const nameOf = new Map(names.map((n) => [Number(n.id), n.name]));
    return top.map(([id, g]) => ({
        id,
        name: nameOf.get(id) ?? `Network ${id}`,
        servers: g.servers,
        playerHours: round1(g.cur),
        prevPlayerHours: round1(g.prev),
    }));
}

export function getCountries(families: FamilyHours[]): CountryRow[] {
    const byCountry = new Map<string, { servers: number; cur: number; prev: number }>();
    for (const f of families) {
        if (!f.countryCode) continue;
        const c = byCountry.get(f.countryCode) ?? { servers: 0, cur: 0, prev: 0 };
        c.cur += f.cur;
        c.prev += f.prev;
        if (f.cur > 0) c.servers++;
        byCountry.set(f.countryCode, c);
    }
    return [...byCountry.entries()]
        .filter(([, c]) => c.cur > 0)
        .sort((a, b) => b[1].cur - a[1].cur || a[0].localeCompare(b[0]))
        .slice(0, TOP_SMALL)
        .map(([countryCode, c]) => ({
            countryCode,
            servers: c.servers,
            playerHours: round1(c.cur),
            prevPlayerHours: round1(c.prev),
        }));
}

export async function getWaves(families: FamilyHours[]): Promise<WaveRow[]> {
    const top = families
        .filter((f) => f.maxWave > 0)
        .sort((a, b) => b.maxWave - a.maxWave || b.cur - a.cur || a.id - b.id)
        .slice(0, TOP_SMALL);
    const refs = await attachServerRefs(top.map((f) => f.id));
    return top.map((f) => ({ ...refOf(refs, f.id), maxWave: f.maxWave }));
}

// ─── Section queries ────────────────────────────────────────────────────────

/** Servers whose family ROOT first appeared in the window, busiest first. */
export async function getNewcomers(start: Date, end: Date, families: FamilyHours[]): Promise<NewcomerRow[]> {
    const rows = await sequelize.query<{ id: number; created_at: Date }>(`
        SELECT root.id, root.created_at
        FROM servers root
        JOIN server_canonical sc ON sc.server_id = root.id AND sc.canonical_id = root.id
        WHERE root.created_at >= :start AND root.created_at < :end
          AND NOT root.aggregate_exclude
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    const cur = new Map(families.map((f) => [f.id, f.cur]));
    const top = rows
        .map((r) => ({ id: Number(r.id), firstSeen: new Date(r.created_at).getTime(), ph: cur.get(Number(r.id)) ?? 0 }))
        .sort((a, b) => b.ph - a.ph || a.firstSeen - b.firstSeen || a.id - b.id)
        .slice(0, TOP_SMALL);
    const refs = await attachServerRefs(top.map((t) => t.id));
    return top.map((t) => ({ ...refOf(refs, t.id), firstSeen: t.firstSeen, playerHours: round1(t.ph) }));
}

/**
 * Families whose all-time peak was set inside the window. The family's peak is
 * the highest across every alias at any time, so an alias that beat its own
 * old number but not its sibling's does not count as a record.
 */
export async function getRecords(start: Date, end: Date): Promise<RecordRow[]> {
    const rows = await sequelize.query<{ id: number; peak: number; peak_at: Date }>(`
        SELECT * FROM (
            SELECT DISTINCT ON (sc.canonical_id)
                   sc.canonical_id AS id, p.all_time_peak AS peak, p.peak_at
            FROM server_peaks p
            JOIN server_canonical sc ON sc.server_id = p.server_id
            WHERE sc.canonical_id IN (
                      SELECT sc2.canonical_id
                      FROM server_peaks p2
                      JOIN server_canonical sc2 ON sc2.server_id = p2.server_id
                      WHERE p2.peak_at >= :start AND p2.peak_at < :end)
              AND ${aggregateExcludeSql('p')}
            ORDER BY sc.canonical_id, p.all_time_peak DESC, p.peak_at ASC
        ) fam
        WHERE peak_at >= :start AND peak_at < :end
        ORDER BY peak DESC, id
        LIMIT ${TOP_SMALL}
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    const refs = await attachServerRefs(rows.map((r) => Number(r.id)));
    return rows.map((r) => ({
        ...refOf(refs, Number(r.id)),
        peak: Number(r.peak),
        peakAt: new Date(r.peak_at).getTime(),
    }));
}

/** Best uptime among families with enough traffic (>= floor player-hours). */
export async function getReliable(
    start: Date,
    end: Date,
    floor: number,
    families: FamilyHours[],
): Promise<ReliabilityRow[]> {
    const rows = await sequelize.query<{ id: number; uptime: number }>(`
        SELECT canonical_id AS id, MAX(uptime)::float8 AS uptime
        FROM (
            SELECT sc.canonical_id, st.server_id,
                   SUM(st.online_samples)::float8 / NULLIF(SUM(st.samples), 0) AS uptime
            FROM server_stats_1h st
            JOIN server_canonical sc ON sc.server_id = st.server_id
            WHERE st.bucket >= :start AND st.bucket < :end
              AND ${aggregateExcludeSql('st')}
            GROUP BY sc.canonical_id, st.server_id
        ) per_server
        GROUP BY canonical_id
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    const cur = new Map(families.map((f) => [f.id, f.cur]));
    const top = rows
        .map((r) => ({ id: Number(r.id), uptime: Math.min(1, Number(r.uptime) || 0), ph: cur.get(Number(r.id)) ?? 0 }))
        .filter((r) => r.ph >= floor)
        .sort((a, b) => b.uptime - a.uptime || b.ph - a.ph || a.id - b.id)
        .slice(0, TOP_SMALL);
    const refs = await attachServerRefs(top.map((t) => t.id));
    return top.map((t) => ({
        ...refOf(refs, t.id),
        uptime: Math.round(t.uptime * 10000) / 10000,
        playerHours: round1(t.ph),
    }));
}

interface MapAgg {
    mapName: string;
    mode: string | null;
    servers: number;
    cur: number;
    prev: number;
}

/** Player-hours per (map name, mode), both windows, for every map seen in either. */
export async function getMapAggregates(start: Date, end: Date): Promise<MapAgg[]> {
    const w = windowOf(start, end);
    const rows = await sequelize.query<{
        map_name: string; mode: string | null; servers: number | null; cur: number | null; prev: number | null;
    }>(`
        WITH ${rawHourMapCte(`st.bucket >= :prevStart AND st.bucket < :end AND ${aggregateExcludeSql('st')}`)},
        -- One server can log a map under several registry rows: those add up
        -- per SERVER first, and only then do aliases collapse with MAX, so two
        -- addresses reporting the same map under different rows are not summed.
        per_server_key AS (
            SELECT r.server_id, r.bucket, mr.map_name, gr.clean_name AS mode,
                   SUM(r.contribution) AS c
            FROM per_raw r
            JOIN server_maps_registry mr   ON mr.id = r.map_registry_id
            LEFT JOIN gamemode_registry gr ON gr.id = mr.gamemode_id
            WHERE r.contribution IS NOT NULL
            GROUP BY r.server_id, r.bucket, mr.map_name, gr.clean_name
        ),
        per_key AS (
            SELECT sc.canonical_id, k.bucket, k.map_name, k.mode, MAX(k.c) AS c
            FROM per_server_key k
            JOIN server_canonical sc ON sc.server_id = k.server_id
            GROUP BY sc.canonical_id, k.bucket, k.map_name, k.mode
        )
        SELECT map_name, mode,
               COUNT(DISTINCT canonical_id) FILTER (WHERE bucket >= :start AND c > 0) AS servers,
               COALESCE(SUM(c) FILTER (WHERE bucket >= :start), 0)::float8 AS cur,
               COALESCE(SUM(c) FILTER (WHERE bucket <  :start), 0)::float8 AS prev
        FROM per_key
        GROUP BY map_name, mode
    `, { replacements: replacementsOf(w), type: QueryTypes.SELECT });
    return rows.map((r) => ({
        mapName: r.map_name,
        mode: r.mode,
        servers: Number(r.servers) || 0,
        cur: Number(r.cur) || 0,
        prev: Number(r.prev) || 0,
    }));
}

const mapKey = (m: { mapName: string; mode: string | null }) => `${m.mode ?? ''}\u0000${m.mapName}`;

export function buildMapSections(maps: MapAgg[], floor: number): { topMaps: MapRow[]; risingMaps: MapRow[] } {
    const byKey = new Map(maps.map((m) => [mapKey(m), m]));
    const scored = maps.map((m) => ({ key: mapKey(m), cur: m.cur, prev: m.prev }));
    const toRow = (key: string, rank: number, prevRank: number | null): MapRow => {
        const m = byKey.get(key)!;
        return {
            mapName: m.mapName,
            mode: m.mode,
            servers: m.servers,
            playerHours: round1(m.cur),
            prevPlayerHours: round1(m.prev),
            rank,
            prevRank,
        };
    };
    const topMaps = rankTop(scored, TOP_MAPS).map((r) => toRow(r.key, r.rank, r.prevRank));
    // Rising maps keep their overall rank so the UI can show the same arrows.
    const fullRank = new Map(rankTop(scored, scored.length).map((r) => [r.key, r]));
    const risingMaps = pickMovers(scored, floor, TOP_SMALL, 'up').map((r) => {
        const ranked = fullRank.get(r.key);
        return toRow(r.key, ranked?.rank ?? 0, ranked?.prevRank ?? null);
    });
    return { topMaps, risingMaps };
}

export function buildModeShares(maps: MapAgg[]): ModeShareRow[] {
    const byMode = new Map<string, { cur: number; prev: number }>();
    let totalCur = 0;
    let totalPrev = 0;
    for (const m of maps) {
        const mode = m.mode ?? 'Unknown';
        const e = byMode.get(mode) ?? { cur: 0, prev: 0 };
        e.cur += m.cur;
        e.prev += m.prev;
        byMode.set(mode, e);
        totalCur += m.cur;
        totalPrev += m.prev;
    }
    return [...byMode.entries()]
        .filter(([, e]) => e.cur > 0 || e.prev > 0)
        .sort((a, b) => b[1].cur - a[1].cur || a[0].localeCompare(b[0]))
        .map(([mode, e]) => ({
            mode,
            playerHours: round1(e.cur),
            prevPlayerHours: round1(e.prev),
            share: shareOf(e.cur, totalCur),
            prevShare: shareOf(e.prev, totalPrev),
        }));
}

/** Windows up to this long read the 5-minute aggregate for the peak instant. */
const PEAK_5M_MAX_MS = 31 * 24 * HOUR_MS;

/**
 * Busiest instant: per bucket, the sum over families of their peak players
 * (the chart's three-step shape). Summing per-server maxima is only honest
 * when the bucket is short, so leaderboard windows read 5-minute buckets; a
 * year (Wrapped) falls back to hourly, matching the yearly chart's own tier.
 */
export async function getPeakHour(start: Date, end: Date): Promise<{ peakPlayers: number; peakAt: number | null }> {
    const table = end.getTime() - start.getTime() <= PEAK_5M_MAX_MS ? 'server_stats_5m' : 'server_stats_1h';
    const [row] = await sequelize.query<{ bucket: Date; players: number }>(`
        SELECT fp.bucket, SUM(fp.max_players)::int AS players
        FROM (
            SELECT sc.canonical_id, st.bucket, MAX(st.max_players) AS max_players
            FROM ${table} st
            JOIN server_canonical sc ON sc.server_id = st.server_id
            WHERE st.bucket >= :start AND st.bucket < :end
              AND ${aggregateExcludeSql('st')}
            GROUP BY sc.canonical_id, st.bucket
        ) fp
        GROUP BY fp.bucket
        ORDER BY players DESC NULLS LAST, fp.bucket ASC
        LIMIT 1
    `, { replacements: { start, end }, type: QueryTypes.SELECT });
    return row
        ? { peakPlayers: Number(row.players) || 0, peakAt: new Date(row.bucket).getTime() }
        : { peakPlayers: 0, peakAt: null };
}

export function buildHeadline(
    families: FamilyHours[],
    maps: MapAgg[],
    peak: { peakPlayers: number; peakAt: number | null },
): Headline {
    let playerHours = 0, prevPlayerHours = 0, activeServers = 0, prevActiveServers = 0;
    for (const f of families) {
        playerHours += f.cur;
        prevPlayerHours += f.prev;
        if (f.cur > 0) activeServers++;
        if (f.prev > 0) prevActiveServers++;
    }
    const mapsPlayed = new Set(maps.filter((m) => m.cur > 0).map((m) => m.mapName)).size;
    return {
        playerHours: round1(playerHours),
        prevPlayerHours: round1(prevPlayerHours),
        peakPlayers: peak.peakPlayers,
        peakAt: peak.peakAt,
        activeServers,
        prevActiveServers,
        mapsPlayed,
    };
}

/** Every section for one window. `noiseFloor` is the player-hour floor for movers/rising/reliable. */
export async function getLeaderboardSections(
    start: Date,
    end: Date,
    noiseFloor: number,
): Promise<LeaderboardSections> {
    const [families, maps, peak, records] = await Promise.all([
        getFamilyHours(start, end),
        getMapAggregates(start, end),
        getPeakHour(start, end),
        getRecords(start, end),
    ]);
    const { topMaps, risingMaps } = buildMapSections(maps, noiseFloor);
    const [topServers, movers, losers, networks, newcomers, reliable, waves] = await Promise.all([
        getTopServers(families),
        getMovers(families, noiseFloor, 'up'),
        getMovers(families, noiseFloor, 'down'),
        getNetworks(families),
        getNewcomers(start, end, families),
        getReliable(start, end, noiseFloor, families),
        getWaves(families),
    ]);
    return {
        headline: buildHeadline(families, maps, peak),
        topServers,
        movers,
        losers,
        topMaps,
        risingMaps,
        modes: buildModeShares(maps),
        networks,
        newcomers,
        records,
        reliable,
        waves,
        countries: getCountries(families),
    };
}
