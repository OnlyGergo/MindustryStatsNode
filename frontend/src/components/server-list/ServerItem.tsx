import React from "react";
import { formatTextLines } from "../../util/mindustry.ts";
import { countryCodeToFlag } from "../../util/general.ts";
import { ServerListItem } from "../../../../common/models/serverData.ts";
import { Link } from "@tanstack/react-router";
import { CompactStarRatingDisplay } from "../detail/StarRating.tsx";
import { MindustryText } from "../MindustryText.tsx";

const ServerItem: React.FC<{
  server: ServerListItem;
  isSelected: boolean;
}> = ({ server, isSelected }) => {
  const serverData = server.currentData;
  //const serverStatus = server.online ? 'Online' : server.lastSeen ? 'Offline - Last Seen ' + formatDate(server.lastSeen) : 'Offline';
  const statusClass = server.online
    ? "bg-good/15 text-good border-good/40"
    : "bg-bad/15 text-bad border-bad/40";

  const flagEmoji = countryCodeToFlag(server.countryCode);

  return (
    <Link
      to="/server/$serverId"
      params={{ serverId: String(server.id) }}
      // Read by StaticServerList's search, which only has the markup.
      data-server={`${server.host}:${server.port}`}
      data-network={server.name}
      className={`p-4 cursor-pointer transition-colors flex [content-visibility:auto] [contain-intrinsic-size:auto_96px] items-start justify-between ${
        isSelected
          ? "bg-acc/12 border-l-4 border-bd"
          : "hover:bg-acc/18 border-bd"
      }`}
    >
      <div className="flex flex-col flex-1 min-w-0 mr-4">
        {serverData?.serverName && (
          <div className="text-sm font-bold text-tx truncate mb-1 flex items-center gap-1.5">
            <span className="text-base" title={server.countryCode || "Unknown"}>
              {flagEmoji}
            </span>
            <MindustryText text={serverData.serverName} />
          </div>
        )}

        {serverData?.description && (
          <div className="text-xs text-dim truncate mb-2">
            {formatTextLines(serverData.description).map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                <MindustryText text={line} />
              </React.Fragment>
            ))}
          </div>
        )}

        {server.online && serverData && (
          <div className="text-xs text-dim">
            <MindustryText text={serverData.mapName || "Unknown"}/>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end">
        <span
          className={`${statusClass} text-xs px-2 py-1 rounded border mb-1`}
        >
          {server.online
            ? "Online - " + (serverData?.ping ?? "N/A") + "ms"
            : "Offline"}
        </span>
        {server.online && serverData && (
          <div className="text-right">
            <CompactStarRatingDisplay value={server.ratingScore ?? -1} />
            <div className="text-lg font-bold text-acc">
              {String(serverData.players)}
              <span className="text-dim ml-1">
                / {String(serverData.playerLimit)}
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default React.memo(ServerItem);
