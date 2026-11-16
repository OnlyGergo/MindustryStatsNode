import React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import NetworkHistoryChart from "./NetworkHistoryChart.tsx";
import NetworkServerShare from "./NetworkServerShare.tsx";
import NetworkActivity from "./NetworkActivity.tsx";
import NetworkBreakdown from "./NetworkBreakdown.tsx";
import NetworkServerList from "./NetworkServerList.tsx";
import NetworkStatsRow from "./NetworkStatsRow.tsx";
import NetworkSources from "./NetworkSources.tsx";
import ShareButton from "../ShareButton.tsx";
import { NetworkDetails } from "../../../../common/models/serverData.ts";
import CustomisePanel from "./CustomisePanel.tsx";
import { useAuth } from "../../context/AuthContext.tsx";
import { MindustryText } from "../MindustryText.tsx";
import Panel from "../ui/Panel.tsx";
import PageHead from "../ui/PageHead.tsx";

const NetworkDetail: React.FC<{ details: NetworkDetails; }> = ({
  details
}) => {
  const { me } = useAuth();
  const router = useRouter();
  const canCustomise = !!me && (me.isAdmin || me.owns.networks.includes(details.id));
  const { topServer } = details;

  return (
    <div className="page-scroll">
      <div className="page">
        <PageHead
          title={String(details.name)}
          sub={
            <>
              Network
              {topServer && (
                <>
                  {" · Top server: "}
                  <Link
                    to="/server/$serverId"
                    params={{ serverId: String(topServer.id) }}
                    className="text-acc hover:underline"
                  >
                    <MindustryText text={topServer.name} />
                  </Link>
                  {` (${topServer.players} players)`}
                </>
              )}
            </>
          }
          right={
            <>
              <span className="hidden split:block text-right">
                <NetworkSources sources={details.sources} />
              </span>
              <ShareButton networkId={details.id} className="btn-acc" />
            </>
          }
        />

        <NetworkStatsRow details={details} />
        <div className="split:hidden">
          <NetworkSources sources={details.sources} />
        </div>

        {canCustomise && (
          <CustomisePanel
            target={{ networkId: details.id }}
            onSaved={() => void router.invalidate()}
          />
        )}

        <div className="panel-row">
          <Panel title="Player history" size="lg">
            <div className="h-80 sm:h-96">
              <NetworkHistoryChart network={details} />
            </div>
          </Panel>
          <NetworkActivity networkId={details.id} />
        </div>

        <NetworkBreakdown networkId={details.id} />

        <div className="panel-row">
          <NetworkServerList networkId={details.id} />
          <NetworkServerShare networkId={details.id} />
        </div>
      </div>
    </div>
  );
};

export default NetworkDetail;
