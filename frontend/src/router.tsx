import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import type { ServerListItem } from '../../common/models/serverData';

/**
 * Per-request (getRouter runs once per SSR request) holder for the full server
 * list: the `_browse` loader fills it on the server and the SSR render reads it.
 * Unlike loader data it is never serialised into the page, which is the point.
 */
export interface SsrServerList {
  rows: ServerListItem[] | null;
}

export interface RouterContext {
  head: string;
  ssrServerList: SsrServerList;
}

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    context: {
      head: '',
      ssrServerList: { rows: null } as SsrServerList,
    },
    defaultPreload: 'intent',
    // Skip hovers that only pass over a link on the way somewhere else.
    defaultPreloadDelay: 100,
    scrollRestoration: true,
    // A preloaded match stays usable this long, so repeated hovers and the click
    // that follows reuse it instead of re-running the loader each time.
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: (error) => {
        // Log error on server terminal
        console.error('TanStack Router SSR Error:', error);

        return (
          <div>
            <h1>Something went wrong!</h1>
            <pre>{error.info?.componentStack}</pre>
          </div>
        );
      },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Short page title for the top bar. A function receives the route's loader data. */
    title?: string | ((loaderData: any) => string);
    /** Show a Back button (mobile) instead of the brand icon. */
    back?: boolean;
  }
}
