import React from "react";
import type { Headline } from "../../../../common/models/leaderboard.ts";
import { formatHours, formatInt, formatSigned, formatUtcDateTime, pctChange } from "./format.ts";
import StatStrip from "../ui/StatStrip.tsx";

const Change: React.FC<{ cur: number; prev: number; unit?: string }> = ({ cur, prev, unit = "" }) => {
  const pct = pctChange(cur, prev);
  const diff = cur - prev;
  const text = pct != null ? `${formatSigned(pct)}%` : `${formatSigned(diff)}${unit}`;
  return (
    <span className={diff >= 0 ? "text-good" : "text-bad"}>
      {diff >= 0 ? "▲" : "▼"} {text.replace(/^[+−]/, "")} vs previous
    </span>
  );
};

const HeadlineCards: React.FC<{ headline: Headline }> = ({ headline: h }) => (
  <StatStrip
    items={[
      { label: "Player-hours", value: formatHours(h.playerHours), sub: <Change cur={h.playerHours} prev={h.prevPlayerHours} /> },
      { label: "Peak players", value: formatInt(h.peakPlayers), sub: h.peakAt != null ? formatUtcDateTime(h.peakAt) : undefined },
      { label: "Active servers", value: formatInt(h.activeServers), sub: <Change cur={h.activeServers} prev={h.prevActiveServers} /> },
      { label: "Maps played", value: formatInt(h.mapsPlayed) },
    ]}
  />
);

export default HeadlineCards;
