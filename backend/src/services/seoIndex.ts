// Which server/network pages search engines should index. One set feeds both
// /sitemap.xml and the `indexable` flag on the details responses (which the
// page turns into `<meta name="robots" content="noindex">`), so a page is
// never in the sitemap while telling crawlers not to index it, or vice versa.
// The rules themselves are in serverRepository.getIndexableIds.

export interface IndexableIds {
    serverIds: ReadonlySet<number>;
    networkIds: ReadonlySet<number>;
}

const TTL_MS = 3_600_000;

export function createSeoIndex(
    load: () => Promise<{ serverIds: number[]; networkIds: number[] }>,
    now: () => number = Date.now,
) {
    let current: { ids: IndexableIds; at: number } | null = null;
    let inFlight: Promise<IndexableIds> | null = null;

    const refresh = (): Promise<IndexableIds> =>
        (inFlight ??= load()
            .then(({ serverIds, networkIds }) => {
                const ids = { serverIds: new Set(serverIds), networkIds: new Set(networkIds) };
                current = { ids, at: now() };
                return ids;
            })
            .finally(() => { inFlight = null; }));

    /** The current set; an expired one is served while it refreshes in the background. */
    const get = async (): Promise<IndexableIds> => {
        if (!current) return refresh();
        if (now() - current.at >= TTL_MS) refresh().catch(() => {});
        return current.ids;
    };

    return {
        get,
        /** Drops the set so the next read reloads it (merges, hub marks). */
        invalidate: (): void => { current = null; },
        isServerIndexable: async (canonicalId: number): Promise<boolean> => (await get()).serverIds.has(canonicalId),
        isNetworkIndexable: async (networkId: number): Promise<boolean> => (await get()).networkIds.has(networkId),
    };
}

// Lazy import keeps this module importable without a database (tests).
export const seoIndex = createSeoIndex(() =>
    import('../repositories/serverRepository.js').then((m) => m.getIndexableIds()));
