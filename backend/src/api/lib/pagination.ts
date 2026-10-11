export interface Pagination {
  page: number;
  perPage: number;
}

/**
 * The one place page/perPage are interpreted. Handlers and cache keys both use it, so
 * `page=1`, `page=01`, `page=1abc` and an omitted page are the same request and the same
 * cache entry, and out-of-range values clamp instead of minting new keys.
 */
export function parsePagination(
  query: { page?: string; perPage?: string },
  defaultPerPage: number,
  maxPerPage: number,
): Pagination {
  return {
    page: Math.min(Math.max(parseInt(query.page ?? '', 10) || 1, 1), MAX_PAGE),
    perPage: Math.min(Math.max(parseInt(query.perPage ?? '', 10) || defaultPerPage, 1), maxPerPage),
  };
}

const MAX_PAGE = 10_000;

export const paginationKey = (p: Pagination): string => `${p.page}:${p.perPage}`;
