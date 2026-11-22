import React from "react";
import { NetworkDetails } from "../../../../common/models/serverData.ts";

const nf = new Intl.NumberFormat("en-US");

/** Only plain web links reach an href; anything else (javascript:, data:) renders as text. */
const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url);

/** Server lists this network's servers appear on, as links out to each list. */
const NetworkSources: React.FC<{ sources: NetworkDetails["sources"] }> = ({ sources }) => {
  if (sources.length === 0) return null;

  return (
    <div className="text-xs text-dim">
      <span>Listed on </span>
      {sources.map((source, i) => (
        <React.Fragment key={`${source.url}-${i}`}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {isWebUrl(source.url) ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-acc2 font-semibold hover:underline"
            >
              {source.name}
            </a>
          ) : (
            <b className="text-acc2 font-semibold">{source.name}</b>
          )}
          <span> · {nf.format(source.servers)} {source.servers === 1 ? "server" : "servers"}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default NetworkSources;
