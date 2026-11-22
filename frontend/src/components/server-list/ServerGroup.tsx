import React from "react";
import ServerItem from "./ServerItem";
import { ServerListItem } from "../../../../common/models/serverData.ts";
import { Link } from "@tanstack/react-router";

const ServerGroup: React.FC<{
  name: string;
  servers: ServerListItem[];
  expanded: boolean;
  /** Called with this group's name; stable, so the memo below holds. */
  onToggleExpand: (name: string) => void;
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
  const onlineServersCount = servers.filter((s) => s.online).length;
  const totalPlayers = servers.reduce(
    (sum, server) =>
      sum + (server.aggregateExclude ? 0 : server.currentData?.players || 0),
    0,
  );

  const toggle = () => onToggleExpand(name);

  return (
    <div
      data-group={name}
      className={`mx-3 mb-2 bg-surf border border-bd rounded-ui overflow-hidden split:m-0 split:bg-transparent split:border-0 split:border-b split:rounded-none ${
        isSelected ? "split:bg-surf2 split:shadow-[inset_3px_0_0_var(--acc)]" : ""
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="flex items-center gap-0.5 py-2.5 pl-3 pr-2 split:py-1.5 split:pr-1.5 cursor-pointer"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          toggle();
        }}
      >
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="font-head font-bold text-acc text-2xl split:text-[19px] min-w-8 leading-none">{totalPlayers}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-[15px] split:text-[13px] text-tx truncate">{name}</span>
            <span className="block text-xs split:text-[11px] text-dim">
              {onlineServersCount}/{servers.length} online
            </span>
          </span>
        </div>
        <Link
          to="/network/$networkId"
          params={{ networkId: String(networkId) }}
          onClick={(e) => e.stopPropagation()}
          className={`ib ${isSelected ? "text-acc border-acc" : ""}`}
          title="View network graph"
          aria-label={`Open stats for ${name}`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 20v-8h4v8zM10 20V5h4v15zM16 20v-5h4v5z" />
          </svg>
        </Link>
        <span className="w-[30px] h-[34px] flex items-center justify-center text-acc" aria-hidden="true">
          <svg
            className={`w-[18px] h-[18px] transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
      {/* Rendered even when collapsed, so every server link is in the SSR HTML for crawlers. */}
      <div className={expanded ? "border-t border-bd bg-bg divide-y divide-bd" : "hidden"}>
        {servers.map((server) => (
          <ServerItem
            key={`${server.host}-${server.port}`}
            server={server}
            isSelected={server.id == selectedServerId}
          />
        ))}
      </div>
    </div>
  );
};

// Memoised: typing in search or toggling one group must not re-render every other group.
export default React.memo(ServerGroup);