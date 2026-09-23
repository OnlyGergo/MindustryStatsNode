import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.tsx";
import { StarRatingInput } from "./StarRating.tsx";
import { api } from "../../util/api.ts";
import { REVIEW_BODY_MAX } from "../../../../common/models/reviews.ts";
import type { MyReview } from "../../../../common/models/reviews.ts";

interface ReviewFormProps {
  serverId: number;
  mine: MyReview | null;
  mineLoading: boolean;
  /** Called after a successful PUT/DELETE, so the parent can reload summary/list/mine. */
  onChanged: () => void;
}

/** Maps the API's HTTP status codes onto the messages the spec asks the form to show inline. */
const errorMessageFor = (httpStatus: number): string => {
  switch (httpStatus) {
    case 401: return "You need to be logged in to do that.";
    case 403: return "That request was refused.";
    case 404: return "Server not found.";
    case 422: return "Please remove inappropriate language from your review.";
    case 429: return "Too many requests — please wait a moment and try again.";
    default: return "Something went wrong. Please try again.";
  }
};

const ReviewForm: React.FC<ReviewFormProps> = ({ serverId, mine, mineLoading, onChanged }) => {
  const { me, loginHref } = useAuth();

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill whenever the caller's existing review (re)loads -- e.g. after
  // switching servers, or after this form's own save/delete triggers a reload.
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? "");
    setAnonymous(mine?.anonymous ?? false);
  }, [mine]);

  const handleDelete = async () => {
    if (!confirm("Delete your review?")) return;

    setDeleting(true);
    setError(null);
    try {
      const { error: apiError, status: httpStatus } = await api.api.servers({ id: serverId }).reviews.delete();
      if (apiError) {
        setError(errorMessageFor(httpStatus));
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

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
      });
      if (apiError) {
        setError(errorMessageFor(httpStatus));
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

      <label className="flex flex-wrap items-center gap-2 text-sm text-secondary">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          disabled={submitting}
        />
        Post anonymously
        <span className="text-xs text-tertiary">
          (Your name and avatar are hidden from everyone except site admins)
        </span>
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
