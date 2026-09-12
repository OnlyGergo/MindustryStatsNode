import { useEffect, useState } from "react";
import { ServerEvent } from "../../../../common/models/serverData.ts";
import { DateRangeOption } from "../../util/dateRangeConsts.ts";
import { ApiPacker } from "../../../../common/Packer.ts";
import { getBaseUrl } from "../../util/getApi.ts";

/**
 * The chart annotation stream (see migration 29 / `server_events`).
 *
 * Both endpoints mirror the history endpoints' query handling exactly, which is
 * the whole point: annotations have to be fetched over *the same window the
 * chart drew*, or a dashed line lands next to the bucket it is describing
 * rather than on it. The callers therefore pass the same range/custom dates
 * they handed `useHistory`, and the URLs are built the same way.
 *
 * Hand-fetched with `getBaseUrl()` + `ApiPacker.unpack` like the other hooks
 * here rather than through the Eden Treaty client in `util/api.ts` - these
 * routes return `ApiPacker`-packed 2D arrays, so treaty's inferred response
 * type is the packet envelope and not `ServerEvent[]`; it would have to be
 * unpacked and re-asserted anyway, with no type safety gained.
 */

interface ServerEventsState {
    events: ServerEvent[];
    loading: boolean;
    error: string | null;
}

const EMPTY: ServerEventsState = { events: [], loading: false, error: null };

function useEventStream(url: string | null): ServerEventsState {
    const [state, setState] = useState<ServerEventsState>(EMPTY);

    useEffect(() => {
        if (!url) {
            setState(EMPTY);
            return;
        }

        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));

        fetch(url)
            .then((r) => r.ok ? r.json() : Promise.reject("Unable to load chart annotations."))
            .then((r) => ApiPacker.unpack<ServerEvent>(r))
            .then((events: ServerEvent[]) => {
                if (!cancelled) setState({ events, loading: false, error: null });
            })
            .catch((err) => {
                if (cancelled) return;
                // Annotations are context, not content: a chart without them is
                // still a correct chart, so this never surfaces as a page error.
                console.error("Error fetching chart annotations:", err);
                setState({ events: [], loading: false, error: "Unable to load chart annotations." });
            });

        return () => { cancelled = true; };
    }, [url]);

    return state;
}

/**
 * Builds the query string the same way `useHistory` does, so the two requests
 * resolve to the same window server-side. Returns null when there is nothing
 * worth asking for - a half-filled or inverted custom range fetches nothing
 * rather than a window the chart isn't showing.
 */
function eventsUrl(
    base: string,
    range: DateRangeOption,
    customStartDate: string,
    customEndDate: string,
): string | null {
    if (range !== "custom") return `${base}?range=${range}`;

    if (!customStartDate || !customEndDate) return null;

    const startTs = new Date(customStartDate).getTime();
    const endTs = new Date(customEndDate).getTime();
    if (!(endTs > startTs)) return null;

    return `${base}?startDate=${startTs}&endDate=${endTs}`;
}

/**
 * Events for one server identity, plus the global ones - `id` is a canonical
 * identity id, the same one the history endpoint takes.
 */
export function useServerEvents(
    id: number | string | undefined,
    range: DateRangeOption,
    customStartDate = "",
    customEndDate = "",
): ServerEventsState {
    const url = id === undefined
        ? null
        : eventsUrl(`${getBaseUrl()}/api/servers/${id}/events`, range, customStartDate, customEndDate);

    return useEventStream(url);
}

/** Global events only - the ones that annotate every chart. */
export function useGlobalEvents(
    range: DateRangeOption,
    customStartDate = "",
    customEndDate = "",
): ServerEventsState {
    const url = eventsUrl(`${getBaseUrl()}/api/global/events`, range, customStartDate, customEndDate);

    return useEventStream(url);
}
