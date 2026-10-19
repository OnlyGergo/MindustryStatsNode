import { createIsomorphicFn } from '@tanstack/react-start';

export const getBaseUrl = createIsomorphicFn()
  .server(() => 'http://localhost:' + (process.env.PORT || 3000))
  .client(() => ''); // Client can add base from just window.location

/** Public origin for absolute URLs (canonical links); empty leaves them relative. */
export const getSiteOrigin = createIsomorphicFn()
  .server(() => process.env.SITE_ORIGIN ?? '')
  .client(() => window.location.origin);
