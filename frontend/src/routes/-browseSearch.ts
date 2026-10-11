import { SORT_OPTIONS } from '../hooks/useServerList';
import type { SortCriteria, SortDirection } from '../hooks/useServerList';

/** Server-list preferences carried in the URL of every `_browse` page. */
export interface BrowseSearch {
  q: string;
  sort: SortCriteria;
  dir: SortDirection;
  grouped: boolean;
  /** true = show inactive servers (the old `hideInactiveEnabled` is `!inactive`). */
  inactive: boolean;
}

// `dir` has a fixed default (not per-sort) so stripping stays consistent.
export const BROWSE_SEARCH_DEFAULTS: BrowseSearch = {
  q: '',
  sort: 'playerCount',
  dir: 'desc',
  grouped: true,
  inactive: false,
};

const parseBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return fallback;
};

/** Tolerant: anything unrecognised falls back to the default, never throws. */
export const parseBrowseSearch = (input: Partial<Record<keyof BrowseSearch, unknown>>): BrowseSearch => {
  const d = BROWSE_SEARCH_DEFAULTS;
  const q = typeof input.q === 'string' || typeof input.q === 'number' ? String(input.q).trim().slice(0, 200) : d.q;
  const sort = SORT_OPTIONS.some(o => o.key === input.sort) ? (input.sort as SortCriteria) : d.sort;
  const dir = input.dir === 'asc' || input.dir === 'desc' ? input.dir : d.dir;
  return {
    q,
    sort,
    dir,
    grouped: parseBool(input.grouped, d.grouped),
    inactive: parseBool(input.inactive, d.inactive),
  };
};
