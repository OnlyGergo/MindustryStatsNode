import type React from "react";
import { fetchJsonWithRetry } from "./fetchRetry.ts";
import {
  ACCENT_COLOR_RE,
  UPLOAD_ID_RE,
  uploadUrl,
  type PublicCustomisation,
} from "../../../common/models/customisation.ts";
import { alpha, DEFAULT_THEME, themeVars, withAccent } from "../../../common/theme.ts";

/** Only ever a same-origin `/uploads/<uuid>`; anything else is dropped. */
const safeBackgroundUrl = (url: string | null | undefined): string | null => {
  if (!url || !url.startsWith("/uploads/")) return null;
  const id = url.slice("/uploads/".length);
  return UPLOAD_ID_RE.test(id) && url === uploadUrl(id) ? url : null;
};

/**
 * Theme overrides (and background) for a server/network page, applied on a wrapper
 * element that also gets `data-theme` (see DESIGN.md). The backend validates too, but
 * these values land in a style attribute, so they are re-checked here.
 */
export const customisationStyle = (c: PublicCustomisation | null): React.CSSProperties | undefined => {
  if (!c) return undefined;
  const style: Record<string, string> = {};

  if (c.accentColor && ACCENT_COLOR_RE.test(c.accentColor)) {
    // --onacc is derived from the accent's luminance, so text on accent fills stays readable.
    Object.assign(style, themeVars(withAccent({}, c.accentColor.toLowerCase())));
  }

  const bg = safeBackgroundUrl(c.backgroundUrl);
  if (bg) {
    style["backgroundImage"] =
      `linear-gradient(color-mix(in srgb, var(--bg) 82%, transparent), color-mix(in srgb, var(--bg) 82%, transparent)), url("${bg}")`;
    style["backgroundSize"] = "cover";
    style["backgroundPosition"] = "center";
    style["backgroundAttachment"] = "fixed";
    // Translucent surfaces so the image shows through but text stays readable. Concrete
    // values from the site theme: `--surf: color-mix(var(--surf) ...)` would be a cycle.
    style["--surf"] = alpha(DEFAULT_THEME.surf, 0.88);
    style["--surf2"] = alpha(DEFAULT_THEME.surf2, 0.9);
    style["--sidebg"] = alpha(DEFAULT_THEME.sidebg, 0.85);
  }

  return Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined;
};

/** Loader helper: a failed or malformed fetch must never break the page. */
export const fetchCustomisation = async (
  baseUrl: string,
  kind: "servers" | "networks",
  id: string,
): Promise<PublicCustomisation | null> => {
  try {
    const j = await fetchJsonWithRetry<Partial<PublicCustomisation> | null>(`${baseUrl}/api/${kind}/${id}/customisation`);
    if (!j || typeof j !== "object") return null;
    return {
      accentColor: typeof j.accentColor === "string" ? j.accentColor : null,
      backgroundUrl: typeof j.backgroundUrl === "string" ? j.backgroundUrl : null,
    };
  } catch {
    return null;
  }
};
