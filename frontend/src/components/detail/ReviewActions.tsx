import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext.tsx";
import { api } from "../../util/api.ts";
import { apiErrorMessage } from "../../util/apiError.ts";
import { REPORT_NOTE_MAX, REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from "../../../../common/models/reviews.ts";

interface ReviewActionsProps {
  serverId: number;
  reviewId: string;
  /** Called after an admin removes the review, so the list reloads without it. */
  onRemoved: () => void;
}

/**
 * Report (any logged-in user) and Remove (admins) for one review card. Hidden
 * while logged out: the public payload carries no author id, so the server is
 * what refuses a report on your own review.
 */
const ReviewActions: React.FC<ReviewActionsProps> = ({ serverId, reviewId, onRemoved }) => {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  if (!me) return null;

  const review = api.api.servers({ id: serverId }).reviews({ reviewId });

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const { error: apiError, status } = await review.report.post({ reason, note: note.trim() ? note : null });
      if (apiError) {
        setError(apiErrorMessage(status, apiError.value, "You can't report your own review."));
        return;
      }
      setReported(true);
      setOpen(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    const removeReason = prompt("Reason for removing this review (stored, not shown publicly):");
    if (!removeReason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: apiError, status } = await api.api.admin.reviews({ id: reviewId }).patch({
        action: "remove",
        reason: removeReason.trim(),
      });
      if (apiError) {
        setError(apiErrorMessage(status, apiError.value));
        return;
      }
      onRemoved();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex justify-end gap-3 text-xs">
        {reported ? (
          <span className="text-tertiary">Reported. Thanks, a moderator will take a look.</span>
        ) : (
          !open && (
            <button type="button" className="text-tertiary hover:text-secondary underline" onClick={() => setOpen(true)}>
              Report
            </button>
          )
        )}
        {me.isAdmin && (
          <button
            type="button"
            className="text-status-offline hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={handleRemove}
          >
            Remove
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleReport} className="flex flex-col gap-2 mt-2 border-t border-subtle pt-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
            disabled={busy}
            aria-label="Reason for reporting"
            className="bg-surface-secondary border border-subtle rounded px-2 py-1 text-xs sm:text-sm text-primary"
          >
            <option value="" disabled>Why are you reporting this review?</option>
            {REPORT_REASONS.map((key) => (
              <option key={key} value={key}>{REPORT_REASON_LABELS[key]}</option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, REPORT_NOTE_MAX))}
            maxLength={REPORT_NOTE_MAX}
            rows={2}
            placeholder="Anything the moderator should know (optional)"
            disabled={busy}
            className="w-full bg-surface-secondary border border-subtle rounded p-2 text-xs sm:text-sm text-primary resize-y"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="button-accent text-xs px-3 py-1 disabled:opacity-50"
              disabled={busy || !reason}
            >
              Send report
            </button>
            <button
              type="button"
              className="button-secondary text-xs px-3 py-1"
              disabled={busy}
              onClick={() => { setOpen(false); setError(null); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-xs text-status-offline mt-1 text-right">{error}</div>}
    </div>
  );
};

export default ReviewActions;
