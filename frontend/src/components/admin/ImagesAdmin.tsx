import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../util/api.ts";
import { apiErrorMessage } from "../../util/apiError.ts";
import { TargetLabel, UserLabel } from "./OwnersAdmin.tsx";
import type { AdminImage, ImageStatus } from "../../../../common/models/customisation.ts";

const FILTERS: { status: ImageStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const REASON_MAX = 500;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const ImageCard: React.FC<{
  image: AdminImage;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}> = ({ image, busy, onApprove, onReject }) => (
  <li className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] gap-3 bg-surface-secondary border border-subtle rounded p-2 sm:p-3">
    <a href={image.url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={image.url}
        alt="Uploaded background"
        loading="lazy"
        className="w-full aspect-video object-cover rounded bg-surface-tertiary"
      />
    </a>

    <div className="flex flex-col gap-2 min-w-0 text-sm">
      {image.uploader ? (
        <UserLabel
          avatarUrl={image.uploader.avatarUrl}
          name={image.uploader.name}
          sub={image.uploader.discordId}
        />
      ) : (
        <span className="text-tertiary">Uploader deleted their account</span>
      )}
      <TargetLabel target={image.target} />
      <span className="text-xs text-tertiary">
        {image.width}×{image.height} · {formatBytes(image.bytes)} · {image.mime} ·{" "}
        {dateFormat.format(image.createdAt)}
      </span>
      {image.status !== "pending" && (
        <span className="text-xs text-secondary wrap-break-word">
          {image.status === "approved" ? "Approved" : "Rejected"}
          {image.reviewedBy ? ` by ${image.reviewedBy.name}` : ""}
          {image.reviewedAt ? ` · ${dateFormat.format(image.reviewedAt)}` : ""}
          {image.rejectReason ? ` — ${image.rejectReason}` : ""}
        </span>
      )}
    </div>

    <div className="flex sm:flex-col gap-2 items-start sm:items-end">
      {image.status === "pending" && (
        <button
          type="button"
          className="button-accent text-xs px-2 py-1 disabled:opacity-50"
          disabled={busy}
          onClick={onApprove}
        >
          Approve
        </button>
      )}
      {image.status !== "rejected" && (
        <button
          type="button"
          className="button-secondary text-xs px-2 py-1 disabled:opacity-50"
          disabled={busy}
          onClick={onReject}
        >
          {image.status === "approved" ? "Take down" : "Reject"}
        </button>
      )}
    </div>
  </li>
);

const ImagesAdmin: React.FC = () => {
  const [status, setStatus] = useState<ImageStatus>("pending");
  const [images, setImages] = useState<AdminImage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error, status: httpStatus } = await api.api.admin.images.get({ query: { status } });
      if (error) {
        setLoadError(apiErrorMessage(httpStatus, error.value, "Only admins can do that."));
        return;
      }
      setImages(data ?? []);
      setLoadError(null);
    } catch {
      setLoadError("Could not load images.");
    }
  }, [status]);

  useEffect(() => {
    setImages(null);
    void load();
  }, [load]);

  const run = async (image: AdminImage, action: "approve" | "reject", reason?: string) => {
    setBusyId(image.id);
    setActionError(null);
    try {
      const endpoint = api.api.admin.images({ id: image.id });
      const { error, status: httpStatus } =
        action === "approve" ? await endpoint.approve.post() : await endpoint.reject.post({ reason });
      if (error) {
        if (httpStatus === 409) setActionError("Already reviewed by someone else — the list was refreshed.");
        else if (httpStatus === 404) setActionError("That image no longer exists — the list was refreshed.");
        else {
          setActionError(apiErrorMessage(httpStatus, error.value, "Only admins can do that."));
          return;
        }
      }
      await load();
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = (image: AdminImage) => {
    const takedown = image.status === "approved";
    if (takedown && !confirm("Take down this approved image? It will stop showing immediately.")) return;
    const input = prompt(`${takedown ? "Take down" : "Reject"} — reason (optional, max ${REASON_MAX} characters):`, "");
    if (input === null) return;
    const reason = input.trim().slice(0, REASON_MAX);
    void run(image, "reject", reason || undefined);
  };

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-4xl">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.status}
            type="button"
            aria-pressed={status === f.status}
            className={`${status === f.status ? "button-accent" : "button-secondary"} text-xs sm:text-sm px-3 py-1.5`}
            onClick={() => setStatus(f.status)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-primary">
          {FILTERS.find((f) => f.status === status)?.label} images
          {images ? <span className="text-tertiary font-normal"> ({images.length})</span> : null}
        </h2>

        {loadError && <div className="text-sm text-status-offline">{loadError}</div>}
        {actionError && <div className="text-sm text-status-offline">{actionError}</div>}
        {!images && !loadError && <div className="text-sm text-tertiary">Loading…</div>}
        {images?.length === 0 && <div className="text-sm text-tertiary">Nothing here.</div>}

        {images && images.length > 0 && (
          <ul className="flex flex-col gap-2">
            {images.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                busy={busyId === image.id}
                onApprove={() => void run(image, "approve")}
                onReject={() => handleReject(image)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ImagesAdmin;
