import { BuildInfo } from "../version";

export interface ClientConfig {
  refreshInterval: number;
  build: BuildInfo
}

/** Mirrors the backend's DATA_COLLECTION_INTERVAL_MS default; used when /config can't be fetched. */
export const DEFAULT_REFRESH_INTERVAL_MS = 300_000;