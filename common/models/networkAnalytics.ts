/** One cell of a network's activity profile. UTC; `dow` is ISO (1 = Monday ... 7 = Sunday). */
export interface NetworkActivityCell {
  dow: number;
  /** 0-23, UTC. */
  hour: number;
  /** Mean network players during that (weekday, hour). */
  avg: number;
}

export interface NetworkModeBreakdown {
  /** gamemode_registry.clean_name */
  mode: string;
  /** Online families currently on this mode. */
  servers: number;
  players: number;
}

export interface NetworkMapBreakdown {
  mapName: string;
  mode: string | null;
  /** Player-hours over the window (sum of hourly mean players). */
  playerHours: number;
}

export interface NetworkBreakdown {
  modes: NetworkModeBreakdown[];
  /** Most-played maps over the last 7 days. */
  maps: NetworkMapBreakdown[];
  /** Online families per game version. */
  versions: { version: number | null; versionType: string | null; servers: number }[];
  /** Families per country (live member's country code; null = unknown). */
  countries: { countryCode: string | null; servers: number }[];
}
