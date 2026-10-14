import React, { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../../util/api.ts";
import { apiErrorMessage } from "../../util/apiError.ts";
import { formatDate } from "../../util/general.ts";
import { StarRatingDisplay } from "../detail/StarRating.tsx";
import {
  REPORT_REASON_LABELS, REVIEW_BODY_MAX,
  type AdminReview, type AdminReviewPage, type AdminUser, type ModerationView,
} from "../../../../common/models/reviews.ts";

const VIEWS: { key: ModerationView; label: string }[] = [
  { key: "open", label: "Open reports" },
  { key: "removed", label: "Removed reviews" },
  { key: "dismissed", label: "Dismissed" },
];

const UserChip: React.FC<{ user: AdminUser }> = ({ user }) => (
  <a
    href={user.profileUrl}
    target="_blank"
    rel="noopener noreferrer nofollow"
    className="inline-flex items-center gap-1.5 min-w-0 text-primary hover:text-accent"
    title={`Discord ID ${user.discordId}`}
  >
    <img src={user.avatarUrl} alt="" width={20} height={20} className="w-5 h-5 rounded-full shrink-0" />
    <span className="truncate">{user.name}</span>
  </a>
);

type Patch =
  | { action: "remove"; reason: string }
  | { action: "restore" }
  | { action: "edit"; body: string | null };

const ReviewCard: React.FC<{ review: AdminReview; onChanged: () => void }> = ({ review, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOpenReports = review.reports.some((r) => r.status === "open");

  const run = async (call: () => Promise<{ error: { value: unknown } | null; status: number }>) => {
    setBusy(true);
    setError(null);
    try {
      const { error: apiError, status } = await call();
      if (apiError) {
        setError(apiErrorMessage(status, apiError.value));
        return;
      }
      setEditing(false);
      onChanged();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const patch = (body: Patch) => run(() => api.api.admin.reviews({ id: review.id }).patch(body));

  const patchReply = (body: { action: "remove"; reason: string } | { action: "restore" }) =>
    run(() => api.api.admin.reviews({ id: review.id }).reply.patch(body));

  const askReason = (what: string): string | null => {
    const reason = prompt(`Reason for removing this ${what} (stored, not shown publicly):`);
    return reason?.trim() || null;
  };

  const handleRemove = () => {
    const reason = askReason("review");
    if (reason) void patch({ action: "remove", reason });
  };

  const handleRemoveReply = () => {
    const reason = askReason("reply");
    if (reason) void patchReply({ action: "remove", reason });
  };

  return (
    <div className="border border-subtle rounded p-3 sm:p-4 bg-surface-secondary flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <UserChip user={review.author} />
          {review.anonymous && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-tertiary">posted anonymously</span>
          )}
          <span className="text-tertiary">on</span>
          <Link
            to="/server/$serverId"
            params={{ serverId: String(review.serverId) }}
            className="text-primary hover:text-accent truncate"
          >
            {review.serverAddress}
          </Link>
        </div>
        <span className="text-xs text-tertiary">{formatDate(review.updatedAt)}</span>
      </div>

      <StarRatingDisplay value={review.rating} size={14} />

      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, REVIEW_BODY_MAX))}
            maxLength={REVIEW_BODY_MAX}
            rows={4}
            disabled={busy}
            className="w-full bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary resize-y"
          />
          <div className="text-xs text-tertiary text-right">{draft.length}/{REVIEW_BODY_MAX}</div>
        </div>
      ) : review.body ? (
        <p className="text-sm text-secondary whitespace-pre-line wrap-break-word">{review.body}</p>
      ) : (
        <p className="text-sm text-tertiary italic">No review text</p>
      )}

      {review.removedAt != null && (
        <div className="text-xs text-status-offline">
          Removed {formatDate(review.removedAt)}
          {review.removedBy && <> by {review.removedBy.name}</>}
          {review.removedReason && <>: <span className="whitespace-pre-line">{review.removedReason}</span></>}
        </div>
      )}

      {review.reply && (
        <div className="ml-3 sm:ml-6 pl-3 border-l-2 border-accent flex flex-col gap-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-secondary">Owner reply from</span>
            <UserChip user={review.reply.author} />
            <span className="text-tertiary">{formatDate(review.reply.updatedAt)}</span>
          </div>
          <p className="text-sm text-secondary whitespace-pre-line wrap-break-word">{review.reply.body}</p>
          {review.reply.removedAt != null ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-status-offline">
                Reply removed {formatDate(review.reply.removedAt)}
                {review.reply.removedReason && <>: {review.reply.removedReason}</>}
              </span>
              <button
                type="button"
                className="underline text-tertiary hover:text-secondary disabled:opacity-50"
                disabled={busy}
                onClick={() => void patchReply({ action: "restore" })}
              >
                Restore reply
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="self-start underline text-status-offline disabled:opacity-50"
              disabled={busy}
              onClick={handleRemoveReply}
            >
              Remove reply
            </button>
          )}
        </div>
      )}

      {review.reports.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-subtle pt-2">
          {review.reports.map((report) => (
            <li key={report.id} className="text-xs flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-primary">{REPORT_REASON_LABELS[report.reason] ?? report.reason}</span>
                <span className="text-tertiary">from</span>
                <UserChip user={report.reporter} />
                <span className="text-tertiary">{formatDate(report.createdAt)}</span>
                {report.status !== "open" && <span className="text-tertiary">({report.status})</span>}
              </div>
              {report.note && <p className="text-secondary whitespace-pre-line wrap-break-word">{report.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              type="button"
              className="button-accent text-xs px-3 py-1 disabled:opacity-50"
              disabled={busy}
              onClick={() => void patch({ action: "edit", body: draft.trim() ? draft : null })}
            >
              Save edit
            </button>
            <button
              type="button"
              className="button-secondary text-xs px-3 py-1"
              disabled={busy}
              onClick={() => { setEditing(false); setDraft(review.body ?? ""); }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {hasOpenReports && (
              <button
                type="button"
                className="button-secondary text-xs px-3 py-1 disabled:opacity-50"
                disabled={busy}
                onClick={() => void run(() => api.api.admin.reviews({ id: review.id }).reports.dismiss.post())}
              >
                Dismiss reports
              </button>
            )}
            <button
              type="button"
              className="button-secondary text-xs px-3 py-1 disabled:opacity-50"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            {review.removedAt != null ? (
              <button
                type="button"
                className="button-secondary text-xs px-3 py-1 disabled:opacity-50"
                disabled={busy}
                onClick={() => void patch({ action: "restore" })}
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                className="button-secondary text-xs px-3 py-1 text-status-offline disabled:opacity-50"
                disabled={busy}
                onClick={handleRemove}
              >
                Remove
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="text-xs text-status-offline">{error}</div>}
    </div>
  );
};

/** The moderation queue (F7): reviews grouped with their reports, real authors shown. */
const ReportsAdmin: React.FC = () => {
  const [view, setView] = useState<ModerationView>("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminReviewPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.api.admin.reports.get({ query: { view, page: String(page) } })
      .then(({ data: result, error: apiError, status }) => {
        if (cancelled) return;
        if (apiError) {
          setError(apiErrorMessage(status, apiError.value));
          setData(null);
          return;
        }
        setData(result);
      })
      .catch(() => {
        if (!cancelled) setError("Something went wrong. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [view, page, reloadTick]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-4xl">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => { setView(v.key); setPage(1); }}
            className={`text-xs sm:text-sm px-3 py-1 ${view === v.key ? "button-accent" : "button-secondary"}`}
          >
            {v.label}
          </button>
        ))}
        {data && <span className="text-xs text-tertiary ml-auto">{data.total} review{data.total === 1 ? "" : "s"}</span>}
      </div>

      {error && <div className="text-sm text-status-offline">{error}</div>}
      {loading && !data && <div className="text-sm text-tertiary">Loading…</div>}
      {!loading && data && data.reviews.length === 0 && (
        <div className="text-sm text-tertiary">Nothing here.</div>
      )}

      {data?.reviews.map((review) => (
        <ReviewCard key={review.id} review={review} onChanged={reload} />
      ))}

      {data && data.total > data.perPage && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="button-secondary text-xs sm:text-sm px-2 sm:px-3 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </button>
          <span className="text-xs sm:text-sm text-tertiary">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="button-secondary text-xs sm:text-sm px-2 sm:px-3 py-1 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ReportsAdmin;
