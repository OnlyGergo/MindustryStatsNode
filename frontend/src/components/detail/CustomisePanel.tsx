import React, { useCallback, useRef, useState } from "react";
import { api } from "../../util/api.ts";
import { apiErrorMessage } from "../../util/apiError.ts";
import { ACCENT_COLOR_RE, type OwnerCustomisationState, type OwnerImage } from "../../../../common/models/customisation.ts";

type Target = { networkId: number } | { serverId: number };

interface CustomisePanelProps {
  target: Target;
  /** Called after a successful save, so the page can re-fetch its public customisation. */
  onSaved: () => void;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const FALLBACK_COLOR = "#ff6b35";

const forbidden = "You don't have permission to customise this.";

const STATUS_LABEL: Record<OwnerImage["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};
const STATUS_CLASS: Record<OwnerImage["status"], string> = {
  pending: "text-secondary border-subtle",
  approved: "text-status-online border-status-online",
  rejected: "text-status-offline border-status-offline",
};

/** Pending/rejected files 404 for non-admin owners, so a failed load shows a placeholder. */
const Thumb: React.FC<{ image: OwnerImage }> = ({ image }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full aspect-video bg-surface-tertiary rounded flex items-center justify-center text-xs text-tertiary">
        No preview
      </div>
    );
  }
  return (
    <img
      src={image.url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full aspect-video object-cover rounded"
    />
  );
};

const CustomisePanel: React.FC<CustomisePanelProps> = ({ target, onSaved }) => {
  const isNetwork = "networkId" in target;
  const targetKey = isNetwork ? `n${target.networkId}` : `s${target.serverId}`;
  const defaultName = isNetwork ? "site default" : "network default";

  const [state, setState] = useState<OwnerCustomisationState | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accent, setAccent] = useState<string | null>(null);
  const [hexText, setHexText] = useState("");
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = useCallback((s: OwnerCustomisationState) => {
    setState(s);
    setAccent(s.accentColor);
    setHexText(s.accentColor ?? "");
    setBackgroundId(s.backgroundImageId);
  }, []);

  const query = isNetwork ? { networkId: target.networkId } : { serverId: target.serverId };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError, status } = await api.api.owner.customisation.get({ query });
      if (apiError) {
        setError(apiErrorMessage(status, apiError.value, forbidden));
        return;
      }
      apply(data);
      setLoadedKey(targetKey);
    } catch {
      setError("Could not load your customisation settings.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, apply]);

  // Loaded when opened (not on page load), and again if the page switches target while open.
  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open && loadedKey !== targetKey && !loading) void load();
  };

  const setHex = (value: string) => {
    setHexText(value);
    if (ACCENT_COLOR_RE.test(value)) setAccent(value.toLowerCase());
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That image is too large. The limit is 2 MB.");
      return;
    }
    setUploading(true);
    try {
      // Eden sends multipart automatically when the body holds a File.
      const { error: apiError, status } = await api.api.owner.images.post({ file, ...query });
      if (apiError) {
        setError(apiErrorMessage(status, apiError.value, forbidden));
        return;
      }
      setNotice("Uploaded — awaiting admin approval.");
      const res = await api.api.owner.customisation.get({ query });
      // Refresh only the image list; unsaved edits to accent/background stay.
      if (res.data) setState(res.data);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (hexText && !ACCENT_COLOR_RE.test(hexText)) {
      setError("Accent colour must look like #1a2b3c.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: apiError, status } = await api.api.owner.customisation.put({
        target: isNetwork ? { networkId: target.networkId } : { serverId: target.serverId },
        accentColor: accent,
        backgroundImageId: backgroundId,
      });
      if (apiError) {
        setError(apiErrorMessage(status, apiError.value, forbidden));
        return;
      }
      apply(data);
      setNotice("Saved.");
      onSaved();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploading;

  return (
    <details
      onToggle={handleToggle}
      className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6"
    >
      <summary className="cursor-pointer text-base sm:text-lg font-semibold text-primary">
        {isNetwork ? "Customise network defaults" : "Customise this server"}
      </summary>

      <div className="mt-3 sm:mt-4 flex flex-col gap-4 text-xs sm:text-sm">
        {!isNetwork && (
          <p className="text-tertiary">Empty fields fall back to the network's defaults.</p>
        )}
        {loading && <div className="text-tertiary">Loading…</div>}

        {state && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-secondary">Accent colour</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent colour"
                  value={accent ?? FALLBACK_COLOR}
                  disabled={busy}
                  onChange={(e) => {
                    setAccent(e.target.value);
                    setHexText(e.target.value);
                  }}
                  className="h-8 w-10 bg-surface-tertiary border border-subtle rounded"
                />
                <input
                  type="text"
                  value={hexText}
                  maxLength={7}
                  placeholder="#ff6b35"
                  disabled={busy}
                  onChange={(e) => setHex(e.target.value.trim())}
                  className="w-28 bg-surface-tertiary border border-subtle rounded p-2 text-primary"
                />
                <button
                  type="button"
                  className="button-secondary px-2 py-1"
                  disabled={busy || accent === null}
                  onClick={() => {
                    setAccent(null);
                    setHexText("");
                  }}
                >
                  Use {defaultName}
                </button>
              </div>
              {accent === null && <span className="text-tertiary">Using the {defaultName}.</span>}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-secondary">Background image</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setBackgroundId(null)}
                  className={`border rounded p-2 text-left bg-surface-tertiary ${
                    backgroundId === null ? "border-accent" : "border-subtle"
                  }`}
                >
                  <div className="w-full aspect-video flex items-center justify-center text-tertiary">None</div>
                  <div className="mt-1 text-tertiary">Use {defaultName}</div>
                </button>
                {state.images.map((image) => {
                  const selectable = image.status === "approved";
                  return (
                    <button
                      key={image.id}
                      type="button"
                      disabled={busy || !selectable}
                      aria-pressed={backgroundId === image.id}
                      onClick={() => setBackgroundId(image.id)}
                      className={`border rounded p-2 text-left bg-surface-tertiary ${
                        backgroundId === image.id ? "border-accent" : "border-subtle"
                      } ${selectable ? "" : "cursor-not-allowed"}`}
                    >
                      <Thumb image={image} />
                      <div className="mt-1 flex flex-col gap-0.5">
                        <span className={`self-start border rounded px-1 ${STATUS_CLASS[image.status]}`}>
                          {STATUS_LABEL[image.status]}
                        </span>
                        {image.status === "rejected" && image.rejectReason && (
                          <span className="text-tertiary wrap-break-word">{image.rejectReason}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {state.images.length === 0 && <span className="text-tertiary">No images uploaded yet.</span>}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void handleUpload(e)}
                />
                <button
                  type="button"
                  className="button-secondary px-2 py-1 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload an image"}
                </button>
                <span className="text-tertiary">PNG, JPEG or WebP, up to 2 MB. Images need admin approval.</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="button-accent px-3 py-1.5 disabled:opacity-50"
                disabled={busy}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {notice && <span className="text-status-online">{notice}</span>}
            </div>
          </>
        )}

        {error && <div className="text-status-offline">{error}</div>}
      </div>
    </details>
  );
};

export default CustomisePanel;
