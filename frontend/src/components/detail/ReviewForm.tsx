import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.tsx";
import { StarRatingInput } from "./StarRating.tsx";
import { api } from "../../util/api.ts";
import { REVIEW_BODY_MAX } from "../../../../common/models/reviews.ts";
import type { MyReview } from "../../../../common/models/reviews.ts";
import { REVIEW_ASPECTS, type AspectRatings } from "../../../../common/models/ratings.ts";

// null = not rated -- distinct from "not yet touched" only in that both render the same
// empty StarRatingInput, so no third state is needed here.
const EMPTY_ASPECTS: AspectRatings = Object.fromEntries(REVIEW_ASPECTS.map((a) => [a.key, null])) as AspectRatings;

interface ReviewFormProps {
  serverId: number;
  mine: MyReview | null;
  mineLoading: boolean;
  /** Called after a successful PUT/DELETE, so the parent can reload summary/list/mine. */
  onChanged: () => void;
}

/**
 * 401/429 get fixed wording (the limiter's own message is terse). Otherwise our
 * routes' refusals (403 removed, 404, 422 profanity) carry a human `error`
 * string worth showing as-is; Elysia's own validation 422s don't, so those
 * fall through to the generic text.
 */
const errorMessageFor = (httpStatus: number, value: unknown): string => {
  if (httpStatus === 401) return "You need to be logged in to do that.";
  if (httpStatus === 429) return "Too many requests — please wait a moment and try again.";
  const message = (value as { error?: unknown } | null)?.error;
  if (typeof message === "string") return message;
  if (httpStatus === 422) return "Please check your review and try again.";
  return "Something went wrong. Please try again.";
};

const ReviewForm: React.FC<ReviewFormProps> = ({ serverId, mine, mineLoading, onChanged }) => {
  const { me, loading: authLoading, loginHref } = useAuth();

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [aspects, setAspects] = useState<AspectRatings>(EMPTY_ASPECTS);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill whenever the caller's existing review (re)loads -- e.g. after
  // switching servers, or after this form's own save/delete triggers a reload.
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? "");
    setAnonymous(mine?.anonymous ?? false);
    setAspects(mine?.aspects ?? EMPTY_ASPECTS);
  }, [mine]);

  // Keyed off the saved review, not the live edits: tied to `aspects`, clearing
  // the last one would snap the section shut under the user's cursor.
  const savedAnyAspect = REVIEW_ASPECTS.some((a) => mine?.aspects?.[a.key] != null);

  const handleDelete = async () => {
    if (!confirm("Delete your review?")) return;

    setDeleting(true);
    setError(null);
    try {
      const { error: apiError, status: httpStatus } = await api.api.servers({ id: serverId }).reviews.delete();
      if (apiError) {
        setError(errorMessageFor(httpStatus, apiError.value));
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  // Until /me answers, a logged-in visitor would otherwise see the login link flash.
  if (authLoading) return null;

  if (!me) {
    return (
      <a href={loginHref} className="button-accent inline-block text-xs sm:text-sm px-3 py-1.5">
        Log in with Discord to leave a review
      </a>
    );
  }

  if (mineLoading) {
    return <div className="text-sm text-tertiary">Loading…</div>;
  }

  if (mine?.removed) {
    return (
      <div className="flex flex-col gap-2 items-start">
        <div className="text-sm text-status-offline">Your review was removed by a moderator.</div>
        <button
          type="button"
          className="button-secondary text-xs sm:text-sm px-2 sm:px-3 py-1"
          disabled={deleting}
          onClick={handleDelete}
        >
          Delete
        </button>
        {error && <div className="text-sm text-status-offline">{error}</div>}
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError("Please select a rating.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { error: apiError, status: httpStatus } = await api.api.servers({ id: serverId }).reviews.put({
        rating,
        body: body.trim() ? body : null,
        anonymous,
        aspects,
      });
      if (apiError) {
        setError(errorMessageFor(httpStatus, apiError.value));
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <StarRatingInput value={rating} onChange={setRating} size={26} disabled={submitting} />

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, REVIEW_BODY_MAX))}
          maxLength={REVIEW_BODY_MAX}
          rows={3}
          placeholder="Share your experience with this server (optional)"
          disabled={submitting}
          className="w-full bg-surface-tertiary border border-subtle rounded p-2 text-sm text-primary resize-y"
        />
        <div className="text-xs text-tertiary text-right mt-0.5">{body.length}/{REVIEW_BODY_MAX}</div>
      </div>

      <details className="border border-subtle rounded" open={savedAnyAspect}>
        <summary className="cursor-pointer select-none text-xs sm:text-sm text-secondary px-2 py-1.5">
          Rate specifics (optional)
        </summary>
        <div className="flex flex-col gap-2 px-2 pb-2 pt-1">
          {REVIEW_ASPECTS.map((a) => (
            <div key={a.key} className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col min-w-28">
                <span className="text-xs sm:text-sm text-secondary">{a.label}</span>
                <span className="text-xs text-tertiary">{a.hint}</span>
              </div>
              <StarRatingInput
                value={aspects[a.key] ?? 0}
                onChange={(value) => setAspects((prev) => ({ ...prev, [a.key]: value }))}
                size={18}
                disabled={submitting}
              />
              {aspects[a.key] != null && (
                <button
                  type="button"
                  className="text-xs text-tertiary hover:text-secondary underline"
                  disabled={submitting}
                  onClick={() => setAspects((prev) => ({ ...prev, [a.key]: null }))}
                >
                  Clear
                </button>
              )}
            </div>
          ))}
        </div>
      </details>

      <label className="flex flex-wrap items-center gap-2 text-sm text-secondary">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          disabled={submitting}
        />
        Post anonymously
      </label>

      {error && <div className="text-sm text-status-offline">{error}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          className="button-accent text-xs sm:text-sm px-3 py-1.5 disabled:opacity-50"
          disabled={submitting || rating < 1}
        >
          {mine ? "Update" : "Submit"}
        </button>
        {mine && (
          <button
            type="button"
            className="button-secondary text-xs sm:text-sm px-3 py-1.5 disabled:opacity-50"
            disabled={deleting}
            onClick={handleDelete}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
};

export default ReviewForm;
