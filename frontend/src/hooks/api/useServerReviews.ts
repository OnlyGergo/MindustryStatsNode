import { useCallback, useEffect, useState } from 'react';
import { api } from '../../util/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { MyReview, PublicReview, ReviewSort, ReviewSummary } from '../../../../common/models/reviews.ts';

const PER_PAGE = 10;

interface UseServerReviewsResult {
  summary: ReviewSummary | null;
  summaryLoading: boolean;
  reviews: PublicReview[];
  total: number;
  page: number;
  perPage: number;
  sort: ReviewSort;
  setSort: (sort: ReviewSort) => void;
  setPage: (page: number) => void;
  listLoading: boolean;
  /** null while logged out, or while still loading. */
  mine: MyReview | null;
  mineLoading: boolean;
  /** Re-fetches everything -- call after a PUT/DELETE against /reviews. */
  reload: () => void;
}

/**
 * Summary + paged list + "my review", fetched client-side (no SSR, same as
 * AuthContext -- keeps hydration identical). `mine` is only fetched once the
 * caller is known to be logged in, since the endpoint 401s otherwise.
 */
export function useServerReviews(serverId: number): UseServerReviewsResult {
  const { me } = useAuth();

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSortState] = useState<ReviewSort>('newest');
  const [listLoading, setListLoading] = useState(true);

  const [mine, setMine] = useState<MyReview | null>(null);
  const [mineLoading, setMineLoading] = useState(true);

  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // A new sort starts from page 1. Reset in the same update rather than in an
  // effect, which would first fetch the old page under the new sort.
  const setSort = useCallback((next: ReviewSort) => {
    setSortState(next);
    setPage(1);
  }, []);

  // A page number from the previous server could be out of range for this one.
  useEffect(() => {
    setPage(1);
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);

    api.api.servers({ id: serverId }).reviews.summary.get()
      .then(({ data }) => {
        if (!cancelled) setSummary(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverId, reloadTick]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);

    api.api.servers({ id: serverId }).reviews.get({
      query: { page: String(page), perPage: String(PER_PAGE), sort },
    })
      .then(({ data }) => {
        if (cancelled) return;
        setReviews(data?.reviews ?? []);
        setTotal(data?.total ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setReviews([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverId, page, sort, reloadTick]);

  useEffect(() => {
    if (!me) {
      setMine(null);
      setMineLoading(false);
      return;
    }

    let cancelled = false;
    setMineLoading(true);

    api.api.servers({ id: serverId }).reviews.mine.get()
      .then(({ data }) => {
        if (!cancelled) setMine(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setMine(null);
      })
      .finally(() => {
        if (!cancelled) setMineLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverId, me, reloadTick]);

  return {
    summary, summaryLoading,
    reviews, total, page, perPage: PER_PAGE, sort, setSort, setPage, listLoading,
    mine, mineLoading,
    reload,
  };
}
