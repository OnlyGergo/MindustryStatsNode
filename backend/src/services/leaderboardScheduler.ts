import {
    LEADERBOARD_WINDOWS,
    NOISE_FLOOR_PH,
    WINDOW_HOURS,
    type LeaderboardReport,
    type LeaderboardSections,
    type LeaderboardWindow,
} from '../../../common/models/leaderboard.js';

// The logger and the repository pull in env/database config, which validates
// the environment at import time. Loading them lazily keeps this module (and
// its tests) importable without a database.
type Logger = Pick<ReturnType<typeof import('../logger.js').createLogger>, 'info' | 'error'>;
let loggerPromise: Promise<Logger> | null = null;
const getLogger = (): Promise<Logger> =>
    (loggerPromise ??= import('../logger.js').then((m) => m.createLogger('Leaderboard')));
const log = (level: 'info' | 'error', msg: string, err?: unknown): void => {
    void getLogger().then((l) => (err === undefined ? l[level](msg) : l[level](msg, err))).catch(() => {});
};

/** UTC hours at which the report is rebuilt. */
const SLOT_HOURS = [7, 19];
const RETRY_MS = 15 * 60 * 1000;
const HOUR_MS = 3_600_000;

/** The next 07:00 or 19:00 UTC strictly after `now`. */
export function nextSlot(now: Date): Date {
    const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (const h of SLOT_HOURS) {
        const t = day + h * HOUR_MS;
        if (t > now.getTime()) return new Date(t);
    }
    return new Date(day + 24 * HOUR_MS + SLOT_HOURS[0]! * HOUR_MS);
}

export interface LeaderboardDeps {
    now: () => Date;
    build: (start: Date, end: Date, noiseFloor: number) => Promise<LeaderboardSections>;
    /** Defaults to the app logger; tests pass a no-op. */
    log?: (level: 'info' | 'error', msg: string, err?: unknown) => void;
}

const defaultDeps: LeaderboardDeps = {
    now: () => new Date(),
    build: async (start, end, floor) =>
        (await import('../repositories/leaderboardRepository.js')).getLeaderboardSections(start, end, floor),
};

let current: LeaderboardReport | null = null;
let inFlight: Promise<LeaderboardReport> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export function getLeaderboard(): LeaderboardReport | null {
    return current;
}

/** Builds all windows sequentially; concurrent callers share one run. */
export function rebuildLeaderboard(deps: LeaderboardDeps = defaultDeps): Promise<LeaderboardReport> {
    if (inFlight) return inFlight;
    const run = (async () => {
        // Yield first, so `finally` can never run before `inFlight = run` below
        // (a synchronous throw would otherwise leave a rejected promise cached).
        await Promise.resolve();
        try {
            const end = deps.now();
            const windows = {} as Record<LeaderboardWindow, LeaderboardSections>;
            for (const w of LEADERBOARD_WINDOWS) {
                const start = new Date(end.getTime() - WINDOW_HOURS[w] * HOUR_MS);
                windows[w] = await deps.build(start, end, NOISE_FLOOR_PH[w]);
            }
            const report: LeaderboardReport = {
                generatedAt: end.getTime(),
                nextRefreshAt: nextSlot(end).getTime(),
                windows,
            };
            current = report;
            (deps.log ?? log)('info', `Leaderboard rebuilt in ${deps.now().getTime() - end.getTime()}ms`);
            return report;
        } catch (err) {
            (deps.log ?? log)('error', 'Leaderboard rebuild failed; keeping the previous report', err);
            throw err;
        } finally {
            inFlight = null;
        }
    })();
    inFlight = run;
    return run;
}

function schedule(delayMs: number, deps: LeaderboardDeps): void {
    if (!running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        rebuildLeaderboard(deps).then(
            () => schedule(nextSlot(deps.now()).getTime() - deps.now().getTime(), deps),
            () => schedule(RETRY_MS, deps),
        );
    }, Math.max(0, delayMs));
}

/** Builds once now (not awaited), then at every 07:00 / 19:00 UTC. */
export function startLeaderboard(deps: LeaderboardDeps = defaultDeps): void {
    if (running) return;
    running = true;
    // A failed boot build retries like a failed scheduled one.
    schedule(nextSlot(deps.now()).getTime() - deps.now().getTime(), deps);
    rebuildLeaderboard(deps).catch(() => schedule(RETRY_MS, deps));
}

export function stopLeaderboard(): void {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
}
