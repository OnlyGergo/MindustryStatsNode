export const SITE_NAME = "Mindustry Tracker";

/**
 * Characters only Mindustry's own font can draw: its item/block/team icons live in
 * the Private Use Areas (mostly U+E000-U+F8FF, the planes 15-16 ones for safety),
 * so a browser tab, a bookmark or a search result shows them as tofu boxes. They
 * stand in for a word, so they become a space. Also the replacement char, unpaired
 * surrogates and control characters.
 */
const UNDRAWABLE = /[\uE000-\uF8FF\u{F0000}-\u{10FFFF}\uFFFD\u0000-\u001F\u007F-\u009F]|[\uD800-\uDFFF]/gu;
/** Invisible formatting (zero-width space, direction marks, BOM); not ZWJ/ZWNJ, which emoji sequences need. */
const INVISIBLE = /[\u200B\u200E\u200F\u2060\uFEFF]/g;

/** A name made safe for plain-text contexts (document title): Mindustry glyphs removed, whitespace collapsed. */
export const plainTitle = (text: string): string =>
  text.replace(INVISIBLE, "").replace(UNDRAWABLE, " ").replace(/\s+/g, " ").trim();

/** Document title for a page: `<page> · Mindustry Tracker`. Pure text, so it is the same during SSR and in the browser. */
export const docTitle = (title: string): string => {
  const clean = plainTitle(title);
  return clean ? `${clean} · ${SITE_NAME}` : SITE_NAME;
};

/**
 * Robots meta for a thin page: kept out of the index (and out of /sitemap.xml,
 * which reads the same rules) but its links still followed. Empty when the page
 * is indexable, so it can be spread into a route's `meta` unconditionally.
 */
export const noindexUnless = (indexable: boolean | undefined): { name: string; content: string }[] =>
  indexable ? [] : [{ name: "robots", content: "noindex, follow" }];
