import React from "react";
import { NetworkDetails } from "../../../../common/models/serverData.ts";
import StatStrip, { type StatItem } from "../ui/StatStrip.tsx";

const nf = new Intl.NumberFormat("en-US");

/** Percent 0-100 -> "99%"; null (no samples) -> an em dash, never 0%. */
export const formatUptime = (pct: number | null | undefined): string =>
  pct == null ? "—" : `${pct >= 99.5 && pct < 100 ? pct.toFixed(1) : Math.round(pct)}%`;

const formatShare = (share: number): string => {
  const pct = share * 100;
  if (pct <= 0) return "0%";
  return pct < 1 ? "<1%" : `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
};

/**
 * Week-on-week change hint. Null when either window is missing or the previous
 * week was 0 (a percentage change from zero is meaningless).
 */
export const trendHint = (
  current: number | null | undefined,
  previous: number | null | undefined,
): React.ReactNode => {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span className={up ? "text-good" : "text-bad"}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs prev. week
    </span>
  );
};

/** The network page's stat strip: live numbers, averages, rating and peaks in one box. */
const NetworkStatsRow: React.FC<{ details: NetworkDetails }> = ({ details }) => {
  const { rating, trend, playerPeaks } = details;
  const peakDate = playerPeaks.allTimeDate ? new Date(playerPeaks.allTimeDate) : null;
  const items: StatItem[] = [
    { label: "Players online", value: nf.format(details.playersNow) },
    { label: "Servers online", value: `${details.onlineServers}/${details.totalServers}` },
    { label: "Share of all players", value: formatShare(details.siteShare) },
    { label: "24h average", value: nf.format(Math.round(details.avg24h)) },
    {
      label: "7d average",
      value: trend.avgPlayers7d == null ? "—" : nf.format(Math.round(trend.avgPlayers7d)),
      sub: trendHint(trend.avgPlayers7d, trend.avgPlayersPrev7d),
    },
    {
      label: "Uptime (24h)",
      value: formatUptime(details.uptime.last24h),
      sub: `7d: ${formatUptime(details.uptime.last7d)}`,
    },
    {
      label: "Rating",
      value: rating.count > 0 && rating.average != null ? `${rating.average.toFixed(1)} ★` : "No reviews",
      sub: rating.count > 0 ? `(${nf.format(rating.count)})` : undefined,
    },
    { label: "Peak today", value: playerPeaks.daily },
    { label: "Peak this week", value: playerPeaks.weekly },
    {
      label: "Peak all time",
      value: playerPeaks.allTime,
      sub: peakDate && !Number.isNaN(peakDate.getTime()) ? peakDate.toLocaleDateString() : undefined,
    },
  ];
  return <StatStrip items={items} />;
};

export default NetworkStatsRow;
