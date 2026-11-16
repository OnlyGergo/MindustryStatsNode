import React from "react";
import CopyButton from "../CopyButton.tsx";
import { useInactiveServersData } from "../../hooks/useInactiveServersData.ts";
import { useNavigate } from "@tanstack/react-router";

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
    <div className="h-full overflow-auto p-6 bg-surf">
      <h1 className="text-2xl font-bold text-tx mb-6">Inactive Servers</h1>

      {/* Server List Statistics */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-tx mb-4">
          Server List Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.id} className="bg-surf border border-bd rounded-ui p-4">
              <h3 className="text-sm font-medium text-dim mb-1">
                {stat.display_name}
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-tx">
                  {stat.active_servers}
                </span>
                <span className="text-dim">/ {stat.total_servers}</span>
              </div>
              <div className="mt-2">
                <div className="w-full bg-surf2 rounded h-2">
                  <div
                    className="bg-acc h-2 rounded"
                    style={{ width: `${stat.active_percentage}%` }}
                  />
                </div>
                <p className="text-xs text-dim mt-1">
                  {stat.active_percentage}% active
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inactive Servers Table */}
      <div>
        <h2 className="text-xl font-semibold text-tx mb-4">
          Inactive Servers ({inactiveServers.length})
        </h2>
        {inactiveServers.length === 0 ? (
          <div className="bg-surf border border-bd rounded-ui p-8 text-center">
            <p className="text-dim">No inactive servers found</p>
          </div>
        ) : (
          <div className="bg-surf border border-bd rounded-ui overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bd">
                    <th className="px-6 py-3 text-left text-xs font-medium text-dim uppercase tracking-wider">
                      Group
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-dim uppercase tracking-wider">
                      Last Seen
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-dim uppercase tracking-wider">
                      Server Lists
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-dim uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {inactiveServers.map((server) => (
                    <tr key={server.id} className="hover:bg-acc/18 transition-colors border-bd">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dim">
                          {server.group_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dim">
                          {formatDate(server.lastSeen)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {server.serverLists.length > 0 ? (
                            server.serverLists.map((list) => (
                              <span
                                key={list.id}
                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-surf2 text-dim"
                              >
                                {list.display_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-dim">
                              Unknown
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap inline-flex items-center">
                        <div className="text-sm font-medium text-tx">
                          <CopyButton text={`${server.host}:${server.port}`} className="bg-acc/12 hover:bg-acc/18 text-acc px-3 py-1 rounded transition-colors border border-acc shrink-0 text-sm" />
                        </div>
                        <button
                          onClick={() => navigator({ to: `/server/${server.id}` })}
                          className="bg-acc/12 hover:bg-acc/18 text-acc px-3 py-1 rounded transition-colors border border-acc shrink-0 text-sm ml-2"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InactiveServersDetail;
