import React from "react";
import { NetworkDetails } from "../../../../common/models/serverData.ts";

const nf = new Intl.NumberFormat("en-US");

const formatShare = (share: number): string => {
  const pct = share * 100;
  if (pct <= 0) return "0%";
  return pct < 1 ? "<1%" : `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded min-w-0">
    <div className="text-xl sm:text-2xl font-bold text-accent truncate">{value}</div>
    <div className="text-xs sm:text-sm text-tertiary">{label}</div>
    {hint && <div className="text-xs text-tertiary truncate">{hint}</div>}
  </div>
);

const NetworkStatsRow: React.FC<{ details: NetworkDetails }> = ({ details }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
    <Stat label="Players online" value={nf.format(details.playersNow)} />
    <Stat
      label="Servers online"
      value={`${details.onlineServers}/${details.totalServers}`}
    />
    <Stat label="Share of all players" value={formatShare(details.siteShare)} />
    <Stat label="24h average" value={nf.format(Math.round(details.avg24h))} />
  </div>
);

export default NetworkStatsRow;
