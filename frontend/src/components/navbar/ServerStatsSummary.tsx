import React from "react";

interface ServerStatsSummaryProps {
  onlineServers: number;
  totalServers: number;
  totalPlayers: number;
}

const ServerStatsSummary: React.FC<ServerStatsSummaryProps> = ({
  onlineServers,
  totalServers,
  totalPlayers,
}) => (
  <div className="flex items-center gap-2 text-sm text-dim">
    <span className="font-semibold text-good">{onlineServers}</span>
    <span>/</span>
    <span className="font-semibold text-tx">{totalServers}</span>
    <span className="hidden sm:inline">online</span>
    <span className="text-dim">·</span>
    <span className="font-semibold text-acc">{totalPlayers}</span>
    <span className="hidden sm:inline">players</span>
  </div>
);

export default ServerStatsSummary;
