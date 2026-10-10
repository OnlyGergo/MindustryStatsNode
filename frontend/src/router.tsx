import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    context: {
      head: '',
    },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
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
