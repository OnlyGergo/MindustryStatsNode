import React from "react";
import { StarRatingDisplay } from "./StarRating.tsx";
import type { ReviewSummary as ReviewSummaryData } from "../../../../common/models/reviews.ts";

interface ReviewSummaryProps {
  summary: ReviewSummaryData | null;
  loading: boolean;
}

const ReviewSummary: React.FC<ReviewSummaryProps> = ({ summary, loading }) => {
  if (loading && !summary) {
    return <div className="text-sm text-tertiary">Loading…</div>;
  }

  if (!summary || summary.count === 0) {
    return <div className="text-sm text-tertiary">No reviews yet</div>;
  }

  const maxCount = Math.max(...summary.histogram, 1);

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
      <div className="flex flex-row sm:flex-col items-center sm:items-start gap-3 sm:gap-1 shrink-0">
        <div className="text-3xl sm:text-4xl font-bold text-primary">
          {summary.average?.toFixed(1) ?? "-"}
        </div>
        <div className="flex flex-col gap-1">
          <StarRatingDisplay value={summary.average ?? 0} size={16} />
          <div className="text-xs sm:text-sm text-tertiary">
            {summary.count} review{summary.count === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1 justify-center min-w-0">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.histogram[star - 1] ?? 0;
          const width = (count / maxCount) * 100;
          return (
            <div key={star} className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="w-3 text-tertiary text-right">{star}</span>
              <div className="flex-1 h-2 bg-surface-tertiary rounded overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${width}%` }} />
              </div>
              <span className="w-6 text-right text-tertiary">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewSummary;
