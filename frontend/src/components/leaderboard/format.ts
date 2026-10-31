// Fixed locale: these render on the server, and the browser's must not differ.
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatHours = (v: number): string => `${nf.format(v)} h`;
export const formatInt = (v: number): string => nf.format(v);

/** Signed whole-number delta with a real minus sign. */
export const formatSigned = (v: number): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf.format(Math.abs(v))}`;

export const pctChange = (cur: number, prev: number): number | null =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

/** "2026-03-05" (UTC, so server and browser agree). */
export const formatUtcDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** "Mar 5, 14:00 UTC". */
export const formatUtcDateTime = (ms: number): string => {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${date}, ${d.toISOString().slice(11, 16)} UTC`;
};

export const formatUtcTime = (ms: number): string => new Date(ms).toISOString().slice(11, 16);

/** Regional-indicator flag emoji for a 2-letter code; empty when not a code. */
export const flagEmoji = (code: string): string =>
  /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "";
