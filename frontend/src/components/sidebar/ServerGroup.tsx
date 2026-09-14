import React from "react";
import ServerItem from "./ServerItem";
import { ServerElement } from "../../../../common/models/serverData.ts";
import { useNavigate } from "@tanstack/react-router";

const ServerGroup: React.FC<{
  name: string;
  servers: ServerElement[];
  expanded: boolean;
  onToggleExpand: () => void;
  selectedServerId: number;
  isSelected: boolean;
  networkId: number;
}> = ({
  name,
  servers,
  expanded,
  onToggleExpand,
  selectedServerId,
  isSelected,
  networkId
}) => {
  const navigate = useNavigate();

  const onlineServersCount = servers.filter((s) => s.online).length;
  const totalPlayers = servers.reduce(
    (sum, server) =>
      sum + (server.aggregateExclude ? 0 : server.currentData?.players || 0),
    0,
  );

  return (
    <div
      className={`card-base backdrop-blur-md overflow-hidden transition-all ${
        isSelected ? "border-accent" : "border-default"
      }`}
    >
      <div
        className={`bg-surface-secondary backdrop-blur-sm px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-accent-hover transition-colors ${
          expanded ? "border-b border-subtle" : ""
        }`}
        onClick={onToggleExpand}
      >
        <div>
          <h3 className="font-semibold text-primary text-sm">{name}</h3>
          <p className="text-xs text-secondary">
            {onlineServersCount}/{servers.length} online, {totalPlayers} players
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate({to: `/network/${networkId}`}).then(() => {});
            }}
            className={`p-1.5 ${isSelected ? "button-accent" : "button-secondary"}`}
            title="View network graph"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </button>
          <span className="text-lg font-bold text-accent">
            {totalPlayers}
          </span>
          <svg
            className={`h-4 w-4 text-accent transform transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="divide-y divide-subtle">
          {servers.map((server) => (
            <ServerItem
              key={`${server.host}-${server.port}`}
              server={server}
              isSelected={server.id == selectedServerId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ServerGroup;