import { Elysia } from 'elysia';
import { seoIndex } from '../../services/seoIndex.js';
import { buildInfo } from '../../../../common/version.js';
import { apiConfig } from '../context.js';
import { StrictNoQuery } from '../lib/schemas.js';
import { withCache } from '../middleware/cache.js';

const publicOrigin = (request: Request): string => new URL(request.url).origin.replace('http://', 'https://');

export const metaRoutes = new Elysia()
  .get('/config', () => ({
    refreshInterval: apiConfig.DATA_COLLECTION_INTERVAL_MS,
    build: buildInfo,
  }), { query: StrictNoQuery })

  // /admin is client-rendered and auth-gated anyway. Thin pages are kept out of
  // the index with `noindex` instead of Disallow, which would stop crawlers
  // from ever seeing that tag. /api stays crawlable: Google's
  // renderer fetches it for the charts, and blocking it would leave them empty.
  .get('/robots.txt', ({ request, set }) => {
    set.headers['Content-Type'] = 'text/plain; charset=utf-8';
    return `User-agent: *\nDisallow: /admin\n\nSitemap: ${publicOrigin(request)}/sitemap.xml\n`;
  }, { query: StrictNoQuery })

  .get('/sitemap.xml', async ({ request, set }) => {
    const baseUrl = publicOrigin(request);
    // /inactive is left out: a list of dead servers is thin, and is noindex too.
    const staticPaths = ['/', '/global', '/leaderboard'];
    const { serverIds, networkIds } = await seoIndex.get();

    const paths = [
      ...staticPaths,
      ...[...serverIds].sort((a, b) => a - b).map((id) => `/server/${id}`),
      ...[...networkIds].sort((a, b) => a - b).map((id) => `/network/${id}`),
    ];

    const urlEntries = paths
      .map((p) => `  <url><loc>${baseUrl}${p}</loc></url>`)
      .join('\n');

    set.headers['Content-Type'] = 'application/xml';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;
  }, {
    query: StrictNoQuery,
    ...withCache({ ttlMs: 3_600_000 }), // 1 hour TTL, sitemap doesn't need to be fresh-to-the-minute
  });
