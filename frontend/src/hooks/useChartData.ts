import { useEffect, useState } from "react";
import { getBaseUrl } from "../util/getApi.ts";

/** Matches the server's chart `withCache` TTLs, so a client hit is never staler than a server one. */
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 40;

interface Entry {
    at: number;
    value?: unknown;
    pending?: Promise<unknown>;
}

// Keyed by URL. A Map keeps insertion order, so deleting and re-setting on
// every read makes the first key the least recently used.
const cache = new Map<string, Entry>();

function readFresh<T>(url: string): T | undefined {
    const entry = cache.get(url);
    if (!entry || entry.value === undefined || Date.now() - entry.at > TTL_MS) return undefined;
    cache.delete(url);
    cache.set(url, entry);
    return entry.value as T;
}

/**
 * Fetches and parses a chart endpoint, sharing one request between concurrent
 * callers and serving repeats from memory until the TTL lapses. `parse` runs
 * once per fetch, so any per-response transform belongs there.
 */
export function loadChartData<T>(url: string, parse: (json: unknown) => T): Promise<T> {
    const fresh = readFresh<T>(url);
    if (fresh !== undefined) return Promise.resolve(fresh);
    const inFlight = cache.get(url)?.pending;
    if (inFlight) return inFlight as Promise<T>;

    const pending = fetch(`${getBaseUrl()}${url}`)
        .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}: ${r.statusText}`)))
        .then(parse)
        .then((value) => {
            cache.set(url, { at: Date.now(), value });
            while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
            return value;
        })
        .catch((err) => {
            cache.delete(url);
            throw err;
        });
    cache.set(url, { at: Date.now(), pending });
    return pending;
}

interface ChartDataState<T> {
    url: string | null;
    data: T | undefined;
    error: string | null;
}

/** A response the route loader already fetched (during SSR), handed to the hook as raw JSON. */
export interface InitialChartData {
    url: string;
    json: unknown;
    /** When the loader fetched it (ms), so the seeded cache entry ages from then, not from hydration. */
    at: number;
}

/**
 * Chart data for `url` (null: nothing to fetch yet). While a new URL loads,
 * `data` keeps the previous response so the chart can stay up, dimmed, instead
 * of blanking; a response for a URL that is no longer current is dropped.
 * `parse` must be stable (module-level), since it is an effect dependency.
 *
 * `initial` (read on mount only) is the loader's copy of one URL: it renders
 * straight away on the server and the client alike, so hydration matches, and
 * in the browser it seeds the cache so the effect below never refetches it.
 */
export function useChartData<T>(
    url: string | null,
    parse: (json: unknown) => T,
    errorMessage: string,
    initial?: InitialChartData | null,
) {
    const [state, setState] = useState<ChartDataState<T>>(() => {
        if (!initial) return { url: null, data: undefined, error: null };
        const data = parse(initial.json);
        // The server-side cache is shared between requests; only seed the browser's.
        if (typeof window !== "undefined") cache.set(initial.url, { at: initial.at, value: data });
        return { url: initial.url, data, error: null };
    });
    const fresh = url === null ? undefined : readFresh<T>(url);

    useEffect(() => {
        if (url === null) return;
        let current = true;
        loadChartData(url, parse)
            .then((data) => { if (current) setState({ url, data, error: null }); })
            .catch((err) => {
                if (!current) return;
                console.error(`Error fetching ${url}:`, err);
                setState({ url, data: undefined, error: errorMessage });
            });
        return () => { current = false; };
    }, [url, parse, errorMessage]);

    const settled = state.url === url;
    return {
        data: fresh ?? state.data,
        loading: url !== null && fresh === undefined && !settled,
        error: settled ? state.error : null,
    };
}
