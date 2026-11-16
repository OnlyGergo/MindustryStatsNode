import React from "react";
import CopyButton from "../CopyButton.tsx";
import { useInactiveServersData } from "../../hooks/useInactiveServersData.ts";
import { useNavigate } from "@tanstack/react-router";
import Panel from "../ui/Panel.tsx";
import PageHead from "../ui/PageHead.tsx";

const InactiveServersDetail: React.FC = () => {
  const { inactiveServers, stats, loading, error } = useInactiveServersData();
  const navigator = useNavigate();

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-dim">Loading inactive servers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-bad">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page">
        <PageHead
          title="Inactive servers"
          sub={`Servers that have stopped reporting, ${inactiveServers.length} in total`}
        />

        <Panel title="Server list statistics">
          {/* Cells wrap and grow, so any number of lists fills the row. */}
          <div className="flex flex-wrap -mx-3 -my-1">
            {stats.map((stat) => (
              <div key={stat.id} className="flex-[1_1_180px] px-3.5 py-2 border-l border-bd first:border-l-0">
                <div className="text-xs text-dim">{stat.display_name}</div>
                <div className="font-head font-bold text-[22px] leading-tight">
                  {stat.active_servers} <small className="text-[13px] text-dim font-sans font-normal">/ {stat.total_servers}</small>
                </div>
                <div className="track my-1">
                  <i className="track-fill" style={{ width: `${stat.active_percentage}%` }} />
                </div>
                <div className="text-xs text-dim">{stat.active_percentage}% active</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Inactive servers (${inactiveServers.length})`}>
          {inactiveServers.length === 0 ? (
            <p className="text-dim text-center py-6">No inactive servers found</p>
          ) : (
            <div className="overflow-x-auto -mx-3">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="label-caps text-left">
                    <th className="px-3 pb-1.5 font-normal">Group</th>
                    <th className="px-3 pb-1.5 font-normal">Last seen</th>
                    <th className="px-3 pb-1.5 font-normal">Server lists</th>
                    <th className="px-3 pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {inactiveServers.map((server) => (
                    <tr key={server.id} className="border-t border-bd hover:bg-surf2 transition-colors">
                      <td className="px-3 py-1.5 font-semibold text-tx">{server.group_name}</td>
                      <td className="px-3 py-1.5 text-xs text-dim whitespace-nowrap">{formatDate(server.lastSeen)}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {server.serverLists.length > 0 ? (
                            server.serverLists.map((list) => (
                              <span key={list.id} className="tag">{list.display_name}</span>
                            ))
                          ) : (
                            <span className="text-xs text-dim">Unknown</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex gap-1.5 justify-end">
                          <CopyButton text={`${server.host}:${server.port}`} className="btn-acc" />
                          <button onClick={() => navigator({ to: `/server/${server.id}` })} className="btn">
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default InactiveServersDetail;
