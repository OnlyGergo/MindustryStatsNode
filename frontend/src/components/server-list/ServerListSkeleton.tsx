import React from "react";

const ROWS = 9;

/** Pulsing placeholder rows, sized like ServerItem (p-4, ~96px: name, description, map, status pill, players). */
const ServerListSkeleton: React.FC = () => (
  <div className="space-y-1.5 animate-pulse" aria-busy="true" role="status">
    <span className="sr-only">Loading servers…</span>
    {Array.from({ length: ROWS }, (_, i) => (
      <div key={i} className="p-4 flex items-start justify-between" aria-hidden="true">
        <div className="flex flex-col flex-1 min-w-0 mr-4">
          <div className="h-4 w-3/5 rounded bg-white/10 mb-1" />
          <div className="h-3 w-4/5 rounded bg-white/10 mb-2" />
          <div className="h-3 w-2/5 rounded bg-white/10" />
        </div>
        <div className="flex flex-col items-end">
          <div className="h-6 w-24 rounded border border-subtle bg-white/10 mb-1" />
          <div className="h-5 w-14 rounded bg-white/10" />
        </div>
      </div>
    ))}
  </div>
);

export default ServerListSkeleton;
