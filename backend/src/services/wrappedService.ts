import type { WrappedReport } from '../../../common/models/leaderboard.js';
import { nextSlot } from './leaderboardScheduler.js';

// Lazy imports keep this module (and its tests) importable without a database.
type Logger = Pick<ReturnType<typeof import('../logger.js').createLogger>, 'info' | 'error'>;
let loggerPromise: Promise<Logger> | null = null;
const getLogger = (): Promise<Logger> =>
    (loggerPromise ??= import('../logger.js').then((m) => m.createLogger('Wrapped')));
const defaultLog = (level: 'info' | 'error', msg: string, err?: unknown): void => {
    void getLogger().then((l) => (err === undefined ? l[level](msg) : l[level](msg, err))).catch(() => {});
};

const HOUR_MS = 3_600_000;
const MIN_YEAR = 2000;
const NEWCOMER_GRACE_MS = 14 * 24 * HOUR_MS;

export type WrappedResult =
    | { kind: 'ok'; report: WrappedReport }
    | { kind: 'building' }
    | { kind: 'not_found' };

export interface WrappedRange {
    year: number;
    start: Date;
    end: Date;
    final: boolean;
}

/** [Jan 1, min(now, Jan 1 next year)) in UTC; `final` once the year is over. */
export function rangeOf(year: number, now: Date): WrappedRange {
    const start = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    const final = now.getTime() >= yearEnd.getTime();
    return { year, start, end: final ? yearEnd : now, final };
}

export interface WrappedDeps {
    now: () => Date;
    getDataStart: () => Promise<Date | null>;
    build: (range: WrappedRange, dataStart: Date) => Promise<WrappedReport>;
    log?: (level: 'info' | 'error', msg: string, err?: unknown) => void;
}

interface Entry {
    report: WrappedReport;
    builtAt: Date;
    /** `generation` when the build started; older entries are stale. */
    generation: number;
}

export function createWrappedService(deps: WrappedDeps) {
    const log = deps.log ?? defaultLog;
    const cache = new Map<number, Entry>();
    const inFlight = new Map<number, Promise<void>>();
    let dataStart: Date | null = null;
    // Bumped by invalidate() (merges/unmerges). A build that started before
    // the bump read pre-merge identities, so it lands already stale.
    let generation = 0;

    const startBuild = (range: WrappedRange, ds: Date, builtAt: Date): void => {
        if (inFlight.has(range.year)) return;
        const gen = generation;
        const run = (async () => {
            // Yield so `finally` cannot run before the map entry exists.
            await Promise.resolve();
            try {
                const report = await deps.build(range, ds);
                cache.set(range.year, { report, builtAt, generation: gen });
                log('info', `Wrapped ${range.year} built in ${deps.now().getTime() - builtAt.getTime()}ms`);
            } catch (err) {
                log('error', `Wrapped ${range.year} build failed; keeping the previous report`, err);
            } finally {
                inFlight.delete(range.year);
            }
        })();
        inFlight.set(range.year, run);
    };

    const isFresh = (e: Entry, range: WrappedRange, now: Date): boolean => {
        if (e.generation !== generation) return false;
        if (e.report.final) return true;
        // Built while the year was open, but it has ended since: needs the final pass.
        if (range.final) return false;
        return now.getTime() < nextSlot(e.builtAt).getTime();
    };

    async function getWrapped(year: number, now: Date = deps.now()): Promise<WrappedResult> {
        if (!Number.isInteger(year) || year < MIN_YEAR || year > now.getUTCFullYear()) return { kind: 'not_found' };
        const range = rangeOf(year, now);
        if (!dataStart) dataStart = await deps.getDataStart();
        if (!dataStart || range.end.getTime() <= dataStart.getTime()) return { kind: 'not_found' };

        const entry = cache.get(year);
        if (!entry) {
            startBuild(range, dataStart, now);
            return { kind: 'building' };
        }
        if (!isFresh(entry, range, now)) startBuild(range, dataStart, now);
        return { kind: 'ok', report: entry.report };
    }

    /** Resolves when no build is running (for tests). */
    async function idle(): Promise<void> {
        while (inFlight.size > 0) await Promise.all([...inFlight.values()]);
    }

    /**
     * Marks every year stale, final ones included. Stale reports keep being
     * served while the next request rebuilds them in the background.
     */
    function invalidate(): void {
        generation++;
    }

    return { getWrapped, idle, invalidate };
}

// ─── Default wiring ─────────────────────────────────────────────────────────

async function buildWrapped(range: WrappedRange, dataStart: Date): Promise<WrappedReport> {
    const lb = await import('../repositories/leaderboardRepository.js');
    const wr = await import('../repositories/wrappedRepository.js');
    const { start, end } = range;
    const opts = { withPrevious: false };

    // Climbers: second half vs first half. Both halves need the same length
    // in whole hours so the "previous" window is exactly [start, mid).
    // The halves start where data does, so a year whose collection began
    // part-way through does not compare against an empty first half.
    const climbStart = Math.max(start.getTime(), dataStart.getTime());
    const totalHours = Math.max(0, Math.floor((end.getTime() - climbStart) / HOUR_MS));
    const halfHours = Math.floor(totalHours / 2);
    const mid = new Date(climbStart + halfHours * HOUR_MS);
    const climbEnd = new Date(mid.getTime() + halfHours * HOUR_MS);

    // Heavy year scans, in batches of at most 4 concurrent queries.
    const [families, maps, peak, climberFamilies] = await Promise.all([
        lb.getFamilyHours(start, end, opts),
        lb.getMapAggregates(start, end, opts),
        lb.getPeakHour(start, end),
        halfHours > 0 ? lb.getFamilyHours(mid, climbEnd) : Promise.resolve([]),
    ]);
    const [records, months, busiestDay, streaks] = await Promise.all([
        lb.getRecords(start, end),
        wr.getMonthlyPlayerHours(start, end),
        wr.getBusiestDay(start, end),
        wr.getLongestStreaks(start, end),
    ]);
    const topServers = (await lb.getTopServers(families)).slice(0, 10);
    // Every server tracked when collection began looks "new" in that year, so
    // newcomers only count from a grace period after the first data point.
    const newcomersFrom = new Date(Math.max(start.getTime(), dataStart.getTime() + NEWCOMER_GRACE_MS));
    const [bestMonths, newcomers, networks, waves, climbers] = await Promise.all([
        wr.getBestMonths(start, end, topServers.map((s) => s.id)),
        newcomersFrom < end ? lb.getNewcomers(newcomersFrom, end, families) : Promise.resolve([]),
        lb.getNetworks(families),
        lb.getWaves(families),
        lb.getMovers(climberFamilies, 50, 'up'),
    ]);

    const { topMaps } = lb.buildMapSections(maps, 200);
    const bestPerMode = new Map<string, { mapName: string; cur: number }>();
    for (const m of maps) {
        const mode = m.mode ?? 'Unknown';
        const best = bestPerMode.get(mode);
        if (m.cur > 0 && (!best || m.cur > best.cur)) bestPerMode.set(mode, { mapName: m.mapName, cur: m.cur });
    }
    const mapPerMode = [...bestPerMode.entries()]
        .sort((a, b) => b[1].cur - a[1].cur || a[0].localeCompare(b[0]))
        .map(([mode, b]) => ({ mode, mapName: b.mapName, playerHours: Math.round(b.cur * 10) / 10 }));

    return {
        year: range.year,
        final: range.final,
        asOf: end.getTime(),
        dataStart: dataStart.getTime(),
        headline: lb.buildHeadline(families, maps, peak),
        serverOfTheYear: topServers[0] ?? null,
        topServers,
        bestMonths,
        climbers,
        topMaps,
        mapPerMode,
        modes: lb.buildModeShares(maps),
        networks,
        newcomers,
        records,
        streaks,
        waves,
        countries: lb.getCountries(families),
        months,
        busiestDay,
    };
}

const defaultService = createWrappedService({
    now: () => new Date(),
    getDataStart: async () => (await import('../repositories/wrappedRepository.js')).getDataStart(),
    build: buildWrapped,
});

export const getWrapped = (year: number, now?: Date): Promise<WrappedResult> =>
    defaultService.getWrapped(year, now);

/** After a merge/unmerge: every year rebuilds on its next request. */
export const invalidateWrapped = (): void => defaultService.invalidate();
