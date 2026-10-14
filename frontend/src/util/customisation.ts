import type React from "react";
import {
  ACCENT_COLOR_RE,
  UPLOAD_ID_RE,
  uploadUrl,
  type PublicCustomisation,
} from "../../../common/models/customisation.ts";

/** "#rrggbb" + alpha -> rgba(). Caller has already validated the hex. */
const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Only ever a same-origin `/uploads/<uuid>`; anything else is dropped. */
const safeBackgroundUrl = (url: string | null | undefined): string | null => {
  if (!url || !url.startsWith("/uploads/")) return null;
  const id = url.slice("/uploads/".length);
  return UPLOAD_ID_RE.test(id) && url === uploadUrl(id) ? url : null;
};

/**
 * Scoped CSS variables (and background) for a server/network page. The backend validates
 * too, but these values land in a style attribute, so they are re-checked here.
 * Variable names match the @theme block in index.css; the utilities read them via var().
 */
export const customisationStyle = (c: PublicCustomisation | null): React.CSSProperties | undefined => {
  if (!c) return undefined;
  const style: Record<string, string> = {};

  if (c.accentColor && ACCENT_COLOR_RE.test(c.accentColor)) {
    const hex = c.accentColor.toLowerCase();
    style["--color-accent"] = hex;
    style["--color-accent-muted"] = rgba(hex, 0.12);
    style["--color-accent-border"] = rgba(hex, 0.25);
    style["--color-accent-hover"] = rgba(hex, 0.18);
    style["--scrollbar"] = hex + "3f";
  }

  const bg = safeBackgroundUrl(c.backgroundUrl);
  if (bg) {
    style["backgroundImage"] = `linear-gradient(rgba(15, 15, 15, 0.82), rgba(15, 15, 15, 0.82)), url("${bg}")`;
    style["backgroundSize"] = "cover";
    style["backgroundPosition"] = "center";
    style["backgroundAttachment"] = "fixed";
    // Translucent cards so the image shows through but text stays readable.
    style["--color-surface-1"] = "rgba(22, 22, 22, 0.88)";
    style["--color-surface-2"] = "rgba(29, 29, 29, 0.9)";
    style["--color-surface-3"] = "rgba(37, 37, 37, 0.9)";
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
    const r = await fetch(`${baseUrl}/api/${kind}/${id}/customisation`);
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<PublicCustomisation> | null;
    if (!j || typeof j !== "object") return null;
    return {
      accentColor: typeof j.accentColor === "string" ? j.accentColor : null,
      backgroundUrl: typeof j.backgroundUrl === "string" ? j.backgroundUrl : null,
    };
  } catch {
    return null;
  }
};
