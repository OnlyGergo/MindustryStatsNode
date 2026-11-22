import React from "react";
import { useRouter } from "@tanstack/react-router";
import ServerHistoryChart from "./ServerHistoryChart.tsx";
import MapHistoryTable from "./table/MapHistoryTable.tsx";
import MotdHistoryTable from "./table/MotdHistoryTable.tsx";
import ReviewSummary from "./ReviewSummary.tsx";
import ReviewForm from "./ReviewForm.tsx";
import ReviewList from "./ReviewList.tsx";
import { formatDate } from "../../util/general.ts";
import CopyButton from "../CopyButton.tsx";
import ShareButton from "../ShareButton.tsx";
import { useServerReviews } from "../../hooks/api/useServerReviews.ts";
import { useChartData } from "../../hooks/useChartData.ts";
import {
  ServerDetails,
  ServerElement,
  ServerMapData,
  ServerMotdData,
} from "../../../../common/models/serverData.ts";
import CustomisePanel from "./CustomisePanel.tsx";
import { useAuth } from "../../context/AuthContext.tsx";
import { getModeName } from "../../../../common/Gamemode.ts";
import { MindustryText } from "../MindustryText.tsx";
import { removeColors } from "../../util/mindustry.ts";
import Panel from "../ui/Panel.tsx";
import PageHead from "../ui/PageHead.tsx";
import StatStrip, { type StatItem } from "../ui/StatStrip.tsx";

// Below the fold, so fetched after hydration rather than holding up SSR.
// The tables search client-side, so take the newest 100 of each in one go.
const HISTORY_LIMIT = 100;
const parseMaps = (json: unknown) => json as ServerMapData[];
const parseMotds = (json: unknown) => json as ServerMotdData[];

const ServerDetail: React.FC<{
  serverDataElement: ServerDetails & ServerElement;
}> = ({ serverDataElement }) => {
  const { me } = useAuth();
  const router = useRouter();
  // Owners (and admins) can customise the page and reply to reviews; the API re-checks both.
  const canCustomise =
    !!me &&
    (me.isAdmin ||
      me.owns.servers.includes(serverDataElement.id) ||
      me.owns.networks.includes(serverDataElement.groupId));
  const serverData = serverDataElement.currentData;
  const serverStatus = serverDataElement.online
    ? "Online"
    : serverDataElement.lastSeen
      ? `Offline - Last Seen ${formatDate(serverDataElement.lastSeen)}`
      : "Offline";
  
  const formatUptime = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const reviews = useServerReviews(serverDataElement.id);
  const maps = useChartData(
    `/api/servers/${serverDataElement.id}/map-history?perPage=${HISTORY_LIMIT}`,
    parseMaps,
    "Failed to load map history",
  );
  const motds = useChartData(
    `/api/servers/${serverDataElement.id}/motd-history?perPage=${HISTORY_LIMIT}`,
    parseMotds,
    "Failed to load MOTD history",
  );

  const peaks = serverDataElement.playerPeaks;
  const uptime = serverDataElement.uptime;
  const networkName = serverDataElement.name;

  const stats: StatItem[] = [
    ...(serverData
      ? [
          { label: "Map", value: <MindustryText text={serverData.mapName || "Unknown"} /> },
          { label: "Wave", value: serverData.wave || "0" },
          {
            label: "Mode",
            value: String(removeColors(serverData.modeName)) || getModeName(serverData.modeName, serverData.mode),
          },
          { label: "Version", value: `${serverData.versionType ?? ""} ${serverData.version ?? ""}`.trim() || "-" },
        ]
      : []),
    { label: "Peak today", value: peaks?.daily ?? "-" },
    { label: "Peak this week", value: peaks?.weekly ?? "-" },
    { label: "Peak all time", value: peaks?.allTime ?? "-" },
    { label: "Uptime 24h", value: uptime?.last24h !== undefined ? formatUptime(uptime.last24h) : "-" },
    { label: "Uptime 7d", value: uptime?.last7d !== undefined ? formatUptime(uptime.last7d) : "-" },
  ];

  return (
    <div className="page-scroll">
      <div className="page">
        <PageHead
          title={
            <span className="flex flex-wrap items-baseline gap-x-2 wrap-break-word">
              {networkName && (
                <>
                  <span>{networkName}</span>
                  <span className="text-dim font-normal">›</span>
                </>
              )}
              <span className="text-acc">
                <MindustryText text={serverData?.serverName ?? `${serverDataElement.host}:${serverDataElement.port}`} />
              </span>
            </span>
          }
          sub={serverData?.description && <MindustryText text={serverData.description} />}
          right={
            serverDataElement.online &&
            serverData && (
              <div className="text-right leading-none">
                <span className="font-head font-bold text-[34px] text-acc">{serverData.players}</span>
                <div className="text-xs text-dim mt-0.5">players online</div>
              </div>
            )
          }
        />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`${serverDataElement.online ? "pill-good" : "pill-bad"} font-semibold px-2.5`}>{serverStatus}</span>
          {serverDataElement.online && serverData && (
            <span className="text-dim">
              {serverData.players} / {serverData.playerLimit} players · {serverData.ping}ms
            </span>
          )}
          <CopyButton text={`${serverDataElement.host}:${serverDataElement.port}`} className="btn" />
          <ShareButton serverId={serverDataElement.id} className="btn-acc" />
        </div>

        <StatStrip items={stats} />

        {canCustomise && (
          <CustomisePanel
            target={{ serverId: serverDataElement.id }}
            onSaved={() => void router.invalidate()}
          />
        )}

        <Panel title="Player history">
          <div className="h-80 sm:h-96">
            <ServerHistoryChart {...serverDataElement} />
          </div>
        </Panel>

        <Panel title="Reviews">
          <div className="mb-4">
            <ReviewSummary summary={reviews.summary} loading={reviews.summaryLoading} />
          </div>
          <div className="mb-4 pb-4 border-b border-bd">
            <ReviewForm
              serverId={serverDataElement.id}
              mine={reviews.mine}
              mineLoading={reviews.mineLoading}
              onChanged={reviews.reload}
            />
          </div>
          <ReviewList
            serverId={serverDataElement.id}
            canReply={canCustomise}
            onChanged={reviews.reload}
            reviews={reviews.reviews}
            total={reviews.total}
            page={reviews.page}
            perPage={reviews.perPage}
            sort={reviews.sort}
            loading={reviews.listLoading}
            onSortChange={reviews.setSort}
            onPageChange={reviews.setPage}
          />
        </Panel>

        <div className="panel-row">
          <Panel title="Map history" size="md">
            <MapHistoryTable mapHistory={maps.data ?? []} loading={maps.loading} error={maps.error} />
          </Panel>
          <Panel title="MOTD history" size="md">
            <MotdHistoryTable motdHistory={motds.data ?? []} loading={motds.loading} error={motds.error} />
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default ServerDetail;