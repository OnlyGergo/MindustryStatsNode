import React from "react";
import { NetworkDetails } from "../../../../common/models/serverData.ts";

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
    <span className={up ? "text-green-400" : "text-red-400"}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs prev. week
    </span>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded min-w-0">
    <div className="text-xl sm:text-2xl font-bold text-accent truncate">{value}</div>
    <div className="text-xs sm:text-sm text-tertiary">{label}</div>
    {hint && <div className="text-xs text-tertiary truncate">{hint}</div>}
  </div>
);

const NetworkStatsRow: React.FC<{ details: NetworkDetails }> = ({ details }) => {
  const { rating, trend } = details;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      <Stat label="Players online" value={nf.format(details.playersNow)} />
      <Stat
        label="Servers online"
        value={`${details.onlineServers}/${details.totalServers}`}
      />
      <Stat label="Share of all players" value={formatShare(details.siteShare)} />
      <Stat label="24h average" value={nf.format(Math.round(details.avg24h))} />
      <Stat
        label="7d average"
        value={trend.avgPlayers7d == null ? "—" : nf.format(Math.round(trend.avgPlayers7d))}
        hint={trendHint(trend.avgPlayers7d, trend.avgPlayersPrev7d)}
      />
      <Stat
        label="Uptime (24h)"
        value={formatUptime(details.uptime.last24h)}
        hint={`7d: ${formatUptime(details.uptime.last7d)}`}
      />
      <Stat
        label="Rating"
        value={
          rating.count > 0 && rating.average != null
            ? `${rating.average.toFixed(1)} ★`
            : "No reviews"
        }
        hint={rating.count > 0 ? `(${nf.format(rating.count)} ${rating.count === 1 ? "review" : "reviews"})` : undefined}
      />
    </div>
  );
};

export default NetworkStatsRow;
