import React from "react";
import { formatUnsafeText, removeColors } from "../../util/mindustry.ts";
import { countryCodeToFlag } from "../../util/general.ts";
import { ServerElement } from "../../../../common/models/serverData.ts";
import { useNavigate } from "@tanstack/react-router";
import { CompactStarRatingDisplay } from "../detail/StarRating.tsx";

const ServerItem: React.FC<{
  server: ServerElement;
  isSelected: boolean;
}> = ({ server, isSelected }) => {
  const serverData = server.currentData;
  //const serverStatus = server.online ? 'Online' : server.lastSeen ? 'Offline - Last Seen ' + formatDate(server.lastSeen) : 'Offline';
  const statusClass = server.online
    ? "bg-status-online text-status-online border-status-online"
    : "bg-status-offline text-status-offline border-status-offline";

  const flagEmoji = countryCodeToFlag(server.countryCode);
  const navigate = useNavigate();

  return (
    <div
      className={`p-4 cursor-pointer transition-colors flex items-start justify-between ${
        isSelected
          ? "bg-accent-muted border-l-4 border-default"
          : "hover:bg-accent-hover border-default"
      }`}
      onClick={() => navigate({ to: `/server/${server.id}` })}
    >
      <div className="flex flex-col flex-1 min-w-0 mr-4">
        {serverData?.serverName && (
          <div className="text-sm font-bold text-primary truncate mb-1 flex items-center gap-1.5">
            <span className="text-base" title={server.countryCode || "Unknown"}>
              {flagEmoji}
            </span>
            <span>{String(removeColors(serverData.serverName))}</span>
          </div>
        )}

        {serverData?.description && (
          <div
            className="text-xs text-secondary truncate mb-2"
            dangerouslySetInnerHTML={{
              __html: formatUnsafeText(serverData.description),
            }}
          ></div>
        )}

        {server.online && serverData && (
          <div className="text-xs text-tertiary">
            <span>{String(removeColors(serverData.mapName)) || "Unknown"}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end">
        <span
          className={`${statusClass} text-xs px-2 py-1 rounded border backdrop-blur-sm mb-1`}
        >
          {server.online
            ? "Online - " + (serverData?.ping ?? "N/A") + "ms"
            : "Offline"}
        </span>
        {server.online && serverData && (
          <div className="text-right">
            <CompactStarRatingDisplay value={server.ratingScore ?? -1} />
            <div className="text-lg font-bold text-accent">
              {String(serverData.players)}
              <span className="text-tertiary ml-1">
                / {String(serverData.playerLimit)}
              </span>
            </div>
            <div className="text-xs text-tertiary">players</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServerItem;
