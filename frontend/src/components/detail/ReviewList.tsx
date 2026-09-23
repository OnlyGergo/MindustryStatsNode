import React from "react";
import { StarRatingDisplay } from "./StarRating.tsx";
import { formatDate } from "../../util/general.ts";
import type { PublicReview, ReviewSort } from "../../../../common/models/reviews.ts";

interface ReviewListProps {
  reviews: PublicReview[];
  total: number;
  page: number;
  perPage: number;
  sort: ReviewSort;
  loading: boolean;
  onSortChange: (sort: ReviewSort) => void;
  onPageChange: (page: number) => void;
}

const SORT_LABELS: Record<ReviewSort, string> = {
  newest: "Newest",
  highest: "Highest",
  lowest: "Lowest",
};

const ReviewList: React.FC<ReviewListProps> = ({
  reviews, total, page, perPage, sort, loading, onSortChange, onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm text-tertiary">
          {total} review{total === 1 ? "" : "s"}
        </span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as ReviewSort)}
          className="bg-surface-tertiary border border-subtle rounded px-2 py-1 text-xs sm:text-sm text-primary"
          aria-label="Sort reviews"
        >
          {(Object.keys(SORT_LABELS) as ReviewSort[]).map((key) => (
            <option key={key} value={key}>{SORT_LABELS[key]}</option>
          ))}
        </select>
      </div>

      {loading && reviews.length === 0 && (
        <div className="text-sm text-tertiary">Loading…</div>
      )}
      {!loading && reviews.length === 0 && (
        <div className="text-sm text-tertiary">No reviews yet</div>
      )}

      <div className="flex flex-col gap-3">
        {reviews.map((review) => (
          <div key={review.id} className="border border-subtle rounded p-3 sm:p-4 bg-surface-tertiary">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {review.author ? (
                  <>
                    <img
                      src={review.author.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full shrink-0"
                      width={24}
                      height={24}
                    />
                    <a
                      href={review.author.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-sm font-medium text-primary hover:text-accent truncate"
                    >
                      {review.author.name}
                    </a>
                  </>
                ) : (
                  <>
                    <span className="w-6 h-6 rounded-full bg-surface-secondary shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium text-secondary">Anonymous</span>
                  </>
                )}
              </div>
              <span className="text-xs text-tertiary shrink-0">{formatDate(review.updatedAt)}</span>
            </div>

            <StarRatingDisplay value={review.rating} size={14} className="mb-2" />

            {review.body && (
              <p className="text-sm text-secondary whitespace-pre-line wrap-break-word">{review.body}</p>
            )}
          </div>
        ))}
      </div>

      {total > perPage && (
        <div className="flex items-center justify-center gap-3 mt-1">
          <button
            type="button"
            className="button-secondary text-xs sm:text-sm px-2 sm:px-3 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </button>
          <span className="text-xs sm:text-sm text-tertiary">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="button-secondary text-xs sm:text-sm px-2 sm:px-3 py-1 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ReviewList;
