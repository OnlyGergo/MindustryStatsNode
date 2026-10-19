import { useEffect, useState } from "react";
import { ClientConfig } from "../../../common/models/ClientConfig";
import { getBaseUrl } from "../util/getApi";

const MAX_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;

// Shared across every hook instance, so N consumers cost one request.
// Reset on final failure so a later mount (e.g. after navigation) can try again.
let configPromise: Promise<ClientConfig> | null = null;
let cachedConfig: ClientConfig | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchConfigWithRetry(): Promise<ClientConfig> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
    }
    try {
      const response = await fetch(`${getBaseUrl()}/config`);
      if (!response.ok) throw new Error(`Failed to fetch client config (status ${response.status})`);
      return (await response.json()) as ClientConfig;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to fetch client config");
}

function loadConfig(): Promise<ClientConfig> {
  if (!configPromise) {
    configPromise = fetchConfigWithRetry().then(
      (data) => {
        cachedConfig = data;
        return data;
      },
      (err) => {
        configPromise = null;
        throw err;
      },
    );
  }
  return configPromise;
}

/**
 * Client-only: the fetch runs in an effect, so nothing is requested during SSR
 * (the server render always sees `loading: true`).
 */
export function useClientConfig() {
  const [config, setConfig] = useState<ClientConfig | null>(cachedConfig);
  const [loading, setLoading] = useState<boolean>(cachedConfig === null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedConfig) return;

    let cancelled = false;
    loadConfig().then(
      (data) => {
        if (cancelled) return;
        setConfig(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching client config:", err);
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading, error };
}
