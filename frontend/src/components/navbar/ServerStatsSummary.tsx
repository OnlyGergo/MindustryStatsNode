import React from "react";

interface ServerStatsSummaryProps {
  onlineServers: number;
  totalServers: number;
  totalPlayers: number;
}

/** Sidebar header counts: centred and larger on mobile, spread across the row on desktop. */
const ServerStatsSummary: React.FC<ServerStatsSummaryProps> = ({
  onlineServers,
  totalServers,
  totalPlayers,
}) => (
  <div className="w-full flex items-center justify-center gap-2 text-[15px] font-semibold text-tx split:justify-between split:text-xs split:font-normal split:text-dim">
    <span>
      <b className="text-good split:text-sm">{onlineServers}</b> / {totalServers} online
    </span>
    <span>
      <b className="text-acc split:text-sm">{totalPlayers}</b> players
    </span>
  </div>
);

export default ServerStatsSummary;
