import React from "react";
import type { Headline } from "../../../../common/models/leaderboard.ts";
import { formatHours, formatInt, formatSigned, formatUtcDateTime, pctChange } from "./format.ts";

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="bg-surface-secondary border border-subtle p-2 sm:p-3 rounded min-w-0">
    <div className="text-xl sm:text-2xl font-bold text-accent truncate">{value}</div>
    <div className="text-xs sm:text-sm text-tertiary">{label}</div>
    {hint && <div className="text-xs text-tertiary truncate">{hint}</div>}
  </div>
);

const Change: React.FC<{ cur: number; prev: number; unit?: string }> = ({ cur, prev, unit = "" }) => {
  const pct = pctChange(cur, prev);
  const diff = cur - prev;
  const text = pct != null ? `${formatSigned(pct)}%` : `${formatSigned(diff)}${unit}`;
  return (
    <span className={diff >= 0 ? "text-green-400" : "text-red-400"}>
      {diff >= 0 ? "▲" : "▼"} {text.replace(/^[+−]/, "")} vs previous
    </span>
  );
};

const HeadlineCards: React.FC<{ headline: Headline }> = ({ headline: h }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
    <Stat
      label="Player-hours"
      value={formatHours(h.playerHours)}
      hint={<Change cur={h.playerHours} prev={h.prevPlayerHours} />}
    />
    <Stat
      label="Peak players"
      value={formatInt(h.peakPlayers)}
      hint={h.peakAt != null ? `at ${formatUtcDateTime(h.peakAt)}` : undefined}
    />
    <Stat
      label="Active servers"
      value={formatInt(h.activeServers)}
      hint={<Change cur={h.activeServers} prev={h.prevActiveServers} />}
    />
    <Stat label="Maps played" value={formatInt(h.mapsPlayed)} />
  </div>
);

export default HeadlineCards;
