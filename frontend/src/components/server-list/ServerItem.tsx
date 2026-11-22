import React from "react";
import { formatTextLines } from "../../util/mindustry.ts";
import { ServerListItem } from "../../../../common/models/serverData.ts";
import { Link } from "@tanstack/react-router";
import { CompactStarRatingDisplay } from "../detail/StarRating.tsx";
import { MindustryText } from "../MindustryText.tsx";

const ServerItem: React.FC<{
  server: ServerListItem;
  isSelected: boolean;
}> = ({ server, isSelected }) => {
  const serverData = server.currentData;

  return (
    <Link
      to="/server/$serverId"
      params={{ serverId: String(server.id) }}
      // Read by StaticServerList's search, which only has the markup.
      data-server={`${server.host}:${server.port}`}
      data-network={server.name}
      className={`group px-3 py-2.5 flex items-start justify-between gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_88px] transition-colors ${
        isSelected ? "bg-acc/12 shadow-[inset_3px_0_0_var(--acc)]" : "hover:bg-surf2"
      }`}
    >
      <div className="flex-1 min-w-0">
        {serverData?.serverName && (
          <div className="flex items-center gap-2 min-w-0">
            {server.countryCode && (
              <span
                className="shrink-0 text-[10px] font-bold text-dim border border-bd rounded-[3px] px-1 leading-[15px]"
                title={server.countryCode}
              >
                {server.countryCode}
              </span>
            )}
            <span className="text-sm font-semibold text-tx truncate group-hover:underline">
              <MindustryText text={serverData.serverName} />
            </span>
          </div>
        )}

        {serverData?.description && (
          <div className="text-xs text-dim mt-0.5 line-clamp-2 break-words">
            {formatTextLines(serverData.description).map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                <MindustryText text={line} />
              </React.Fragment>
            ))}
          </div>
        )}

        {server.online && serverData && (
          <div className="text-xs text-dim mt-0.5 truncate">
            <MindustryText text={serverData.mapName || "Unknown"} />
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end text-right">
        <span className={server.online ? "pill-good" : "pill-bad"}>
          {server.online ? `Online · ${serverData?.ping ?? "N/A"}ms` : "Offline"}
        </span>
        {server.online && serverData && (
          <>
            <CompactStarRatingDisplay value={server.ratingScore ?? -1} className="mt-1" />
            <div className="font-head font-bold text-lg leading-tight text-acc">
              {serverData.players}
              <small className="text-dim font-normal text-[13px] font-sans"> / {serverData.playerLimit}</small>
            </div>
          </>
        )}
      </div>
    </Link>
  );
};

export default React.memo(ServerItem);
