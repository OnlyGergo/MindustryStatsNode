export const LEADERBOARD_WINDOWS = ['24h', '7d', '30d'] as const;
export type LeaderboardWindow = typeof LEADERBOARD_WINDOWS[number];

export const WINDOW_HOURS: Record<LeaderboardWindow, number> = { '24h': 24, '7d': 168, '30d': 720 };

/** Movers/losers/reliability need max(cur, prev) >= this many player-hours. */
export const NOISE_FLOOR_PH: Record<LeaderboardWindow, number> = { '24h': 5, '7d': 20, '30d': 50 };

/** A server family as shown in a table. `id` is the canonical id. */
export interface ServerRef {
    id: number;
    /** Raw MOTD name, colour codes intact (stripped client-side). */
    name: string | null;
    networkId: number | null;
    networkName: string | null;
}

export interface RankedServer extends ServerRef {
    playerHours: number;
    prevPlayerHours: number;
    rank: number;
    /** null = NEW (not in the previous top 100). */
    prevRank: number | null;
}

export interface MoverRow extends ServerRef {
    playerHours: number;
    prevPlayerHours: number;
    delta: number;
    /** null when prev = 0. */
    deltaPct: number | null;
}

export interface MapRow {
    mapName: string;
    mode: string | null;
    servers: number;
    playerHours: number;
    prevPlayerHours: number;
    rank: number;
    prevRank: number | null;
}

export interface ModeShareRow {
    mode: string;
    playerHours: number;
    prevPlayerHours: number;
    /** 0..1 */
    share: number;
    prevShare: number;
}

export interface NetworkRow {
    id: number;
    name: string;
    servers: number;
    playerHours: number;
    prevPlayerHours: number;
}

export interface NewcomerRow extends ServerRef {
    /** epoch ms */
    firstSeen: number;
    playerHours: number;
}

export interface RecordRow extends ServerRef {
    peak: number;
    /** epoch ms */
    peakAt: number;
}

export interface ReliabilityRow extends ServerRef {
    /** 0..1 */
    uptime: number;
    playerHours: number;
}

export interface WaveRow extends ServerRef {
    maxWave: number;
}

export interface CountryRow {
    countryCode: string;
    servers: number;
    playerHours: number;
    prevPlayerHours: number;
}

export interface Headline {
    playerHours: number;
    prevPlayerHours: number;
    peakPlayers: number;
    /** epoch ms of the busiest hour, null when nothing was recorded. */
    peakAt: number | null;
    activeServers: number;
    prevActiveServers: number;
    mapsPlayed: number;
}

export interface LeaderboardSections {
    headline: Headline;
    topServers: RankedServer[];
    movers: MoverRow[];
    losers: MoverRow[];
    topMaps: MapRow[];
    risingMaps: MapRow[];
    modes: ModeShareRow[];
    networks: NetworkRow[];
    newcomers: NewcomerRow[];
    records: RecordRow[];
    reliable: ReliabilityRow[];
    waves: WaveRow[];
    countries: CountryRow[];
}

export interface LeaderboardReport {
    /** epoch ms */
    generatedAt: number;
    /** epoch ms */
    nextRefreshAt: number;
    windows: Record<LeaderboardWindow, LeaderboardSections>;
}

export interface WrappedReport {
    year: number;
    /** false while the year is still open (year to date). */
    final: boolean;
    /** epoch ms the range ends at (now for year to date, else 1 Jan next year). */
    asOf: number;
    /** epoch ms of the first stats bucket on record. */
    dataStart: number;
    headline: Headline;
    serverOfTheYear: RankedServer | null;
    topServers: RankedServer[];
    /** Best month for each of `topServers`. */
    bestMonths: { id: number; month: number; playerHours: number }[];
    /**
     * Gain over the same dates a year earlier (`prevPlayerHours`). Empty
     * until there is a year of data to compare against.
     */
    climbers: MoverRow[];
    /**
     * epoch ms the climber comparison starts at: 1 Jan, or later while last
     * year was only partly collected. Runs to `asOf`. null with no climbers.
     */
    climbersFrom: number | null;
    topMaps: MapRow[];
    mapPerMode: { mode: string; mapName: string; playerHours: number }[];
    modes: ModeShareRow[];
    networks: NetworkRow[];
    newcomers: NewcomerRow[];
    records: RecordRow[];
    waves: WaveRow[];
    countries: CountryRow[];
    /** One entry per UTC month in range; month = epoch ms of its start. */
    months: { month: number; playerHours: number }[];
    busiestDay: { day: number; playerHours: number } | null;
}
