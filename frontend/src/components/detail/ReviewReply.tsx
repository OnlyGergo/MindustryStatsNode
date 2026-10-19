import React, { useState } from "react";
import { api } from "../../util/api.ts";
import { formatDate } from "../../util/general.ts";
import { REPLY_BODY_MAX, type ReviewReply as ReviewReplyData } from "../../../../common/models/reviews.ts";
import { containsProfanity } from "../../../../common/profanity.ts";

interface ReviewReplyProps {
  serverId: number;
  reviewId: string;
  reply: ReviewReplyData | null;
  /** The viewer owns this server (or is an admin), so gets the inline reply box. */
  canReply: boolean;
  /** Called after a successful PUT/DELETE, so the parent can reload the list. */
  onChanged: () => void;
}

/** Same idea as ReviewForm's: our refusals carry a human `error`, Elysia's validation 422s don't. */
const errorMessageFor = (httpStatus: number, value: unknown): string => {
  if (httpStatus === 401) return "You need to be logged in to do that.";
  if (httpStatus === 429) return "Too many requests — please wait a moment and try again.";
  const message = (value as { error?: unknown } | null)?.error;
  if (typeof message === "string") return message;
  if (httpStatus === 422) return "Please check your reply and try again.";
  return "Something went wrong. Please try again.";
};

/**
 * F5: the owner's response under a review (Google Maps style), plus an inline
 * editor for anyone who manages the server. Plain text only, rendered with
 * React escaping and whitespace-pre-line, same as review bodies.
 */
const ReviewReply: React.FC<ReviewReplyProps> = ({ serverId, reviewId, reply, canReply, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replyApi = api.api.servers({ id: serverId }).reviews({ reviewId }).reply;

  const startEditing = () => {
    setDraft(reply?.body ?? "");
    setError(null);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) {
      setError("Your reply is empty.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: apiError, status: httpStatus } = await replyApi.put({ body: draft });
      if (apiError) {
        setError(errorMessageFor(httpStatus, apiError.value));
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

  const handleDelete = async () => {
    if (!confirm("Delete this reply?")) return;

    setBusy(true);
    setError(null);
    try {
      const { error: apiError, status: httpStatus } = await replyApi.delete();
      if (apiError) {
        setError(errorMessageFor(httpStatus, apiError.value));
        return;
      }
      onChanged();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const hasProfanity = containsProfanity(draft);
    return (
      <form onSubmit={handleSave} className="mt-3 ml-3 sm:ml-6 pl-3 border-l-2 border-accent flex flex-col gap-2">
        <span className="text-xs font-medium text-secondary">Response from the owner</span>
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, REPLY_BODY_MAX))}
            maxLength={REPLY_BODY_MAX}
            rows={3}
            placeholder="Reply publicly to this review"
            disabled={busy}
            autoFocus
            className="w-full bg-surface-secondary border border-subtle rounded p-2 text-sm text-primary resize-y"
          />
          <div className="flex justify-between gap-2 mt-0.5">
            <span className="text-xs text-status-offline">
              {hasProfanity && "Please remove inappropriate language before submitting."}
            </span>
            <span className="text-xs text-tertiary shrink-0">{draft.length}/{REPLY_BODY_MAX}</span>
          </div>
        </div>
        {error && <div className="text-sm text-status-offline">{error}</div>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="button-accent text-xs sm:text-sm px-3 py-1 disabled:opacity-50"
            disabled={busy || !draft.trim() || hasProfanity}
          >
            {reply ? "Update reply" : "Post reply"}
          </button>
          <button
            type="button"
            className="button-secondary text-xs sm:text-sm px-3 py-1 disabled:opacity-50"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (!reply) {
    if (!canReply) return null;
    return (
      <button
        type="button"
        className="mt-2 text-xs text-tertiary hover:text-accent underline"
        onClick={startEditing}
      >
        Reply as owner
      </button>
    );
  }

  return (
    <div className="mt-3 ml-3 sm:ml-6 pl-3 border-l-2 border-accent">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={reply.author.avatarUrl}
            alt=""
            className="w-5 h-5 rounded-full shrink-0"
            width={20}
            height={20}
          />
          <span className="text-xs text-secondary truncate">
            Response from the owner,{" "}
            <a
              href={reply.author.profileUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-primary hover:text-accent"
            >
              {reply.author.name}
            </a>
          </span>
        </div>
        <span className="text-xs text-tertiary shrink-0">{formatDate(reply.updatedAt)}</span>
      </div>
      <p className="text-sm text-secondary whitespace-pre-line wrap-break-word">{reply.body}</p>
      {canReply && (
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            className="text-xs text-tertiary hover:text-accent underline disabled:opacity-50"
            disabled={busy}
            onClick={startEditing}
          >
            Edit
          </button>
          <button
            type="button"
            className="text-xs text-tertiary hover:text-status-offline underline disabled:opacity-50"
            disabled={busy}
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      )}
      {error && <div className="text-sm text-status-offline mt-1">{error}</div>}
    </div>
  );
};

export default ReviewReply;
