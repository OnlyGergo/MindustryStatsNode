import React from "react";
import { NetworkDetails } from "../../../../common/models/serverData.ts";

const nf = new Intl.NumberFormat("en-US");

/** Server lists this network's servers appear on, as links out to each list. */
const NetworkSources: React.FC<{ sources: NetworkDetails["sources"] }> = ({ sources }) => {
  if (sources.length === 0) return null;

  return (
    <div className="bg-surface-tertiary border border-subtle p-2 sm:p-3 rounded text-sm text-tertiary">
      <span className="text-xs sm:text-sm">Listed on: </span>
      {sources.map((source, i) => (
        <React.Fragment key={`${source.url}-${i}`}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {source.name}
          </a>
          <span> ({nf.format(source.servers)} {source.servers === 1 ? "server" : "servers"})</span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default NetworkSources;
