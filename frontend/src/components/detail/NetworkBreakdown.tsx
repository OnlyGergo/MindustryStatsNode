import { NetworkBreakdown as Breakdown } from "../../../../common/models/networkAnalytics.ts";
import { useNetworkBreakdown } from "../../hooks/api/useNetworkAnalytics.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";
import { MindustryText } from "../MindustryText.tsx";
import { useNearViewport } from "../../hooks/useNearViewport.ts";
import Panel from "../ui/Panel.tsx";

const nf = new Intl.NumberFormat("en-US");

const Chip = ({ children, count }: { children: React.ReactNode; count: number }) => (
  <span className="tag inline-flex items-center gap-1.5 text-tx">
    {children}
    <span className="text-dim">{count}</span>
  </span>
);

const Bar = ({ pct, alt }: { pct: number; alt?: boolean }) => (
  <div className="track mt-0.5">
    <i className={alt ? "track-fill-2" : "track-fill"} style={{ width: `${pct}%` }} />
  </div>
);

const Modes = ({ data }: { data: Breakdown }) => {
  const maxPlayers = Math.max(1, ...data.modes.map((m) => m.players));
  if (data.modes.length === 0) return <p className="text-sm text-dim">No servers online.</p>;
  return (
    <ul>
      {data.modes.map((m) => (
        <li key={m.mode} className="py-[3px]">
          <div className="flex justify-between gap-2 text-xs">
            <b className="font-semibold text-tx truncate">{m.mode}</b>
            <span className="text-dim shrink-0">
              {nf.format(m.players)} player{m.players === 1 ? "" : "s"} · {m.servers} server{m.servers === 1 ? "" : "s"}
            </span>
          </div>
          <Bar pct={(m.players / maxPlayers) * 100} />
        </li>
      ))}
    </ul>
  );
};

const Maps = ({ data }: { data: Breakdown }) => {
  const maxHours = Math.max(1, ...data.maps.map((m) => m.playerHours));
  if (data.maps.length === 0) return <p className="text-sm text-dim">No map data yet.</p>;
  return (
    <ol>
      {data.maps.map((m, i) => (
        <li key={`${m.mapName}-${m.mode}-${i}`} className="flex items-center gap-2 py-0.5">
          <span className="font-head font-bold text-[11px] text-dim min-w-4">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate">
                <b className="font-semibold text-tx"><MindustryText text={m.mapName} /></b>
                {m.mode && <span className="text-dim"> · {m.mode}</span>}
              </span>
              <span className="text-dim shrink-0 whitespace-nowrap">{nf.format(Math.round(m.playerHours))} h</span>
            </div>
            <Bar pct={(m.playerHours / maxHours) * 100} alt />
          </div>
        </li>
      ))}
    </ol>
  );
};

const Composition = ({ data }: { data: Breakdown }) => (
  <>
    <h3 className="label-caps mb-1.5">Versions</h3>
    <div className="flex flex-wrap gap-1.5 mb-3">
      {data.versions.length === 0 && <p className="text-sm text-dim">No servers online.</p>}
      {data.versions.map((v) => (
        <Chip key={`${v.versionType}-${v.version}`} count={v.servers}>
          {v.version == null ? "Unknown" : `${v.versionType ? `${v.versionType} ` : ""}${v.version}`}
        </Chip>
      ))}
    </div>
    <h3 className="label-caps mb-1.5">Countries</h3>
    <div className="flex flex-wrap gap-1.5">
      {data.countries.map((c) => (
        <Chip key={c.countryCode ?? "unknown"} count={c.servers}>
          {c.countryCode ?? "Unknown"}
        </Chip>
      ))}
    </div>
  </>
);

/** Gamemodes, maps and versions/countries as three panels in one wrapping row (one fetch). */
const NetworkBreakdown = ({ networkId }: { networkId: number }) => {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const { data, loading, error } = useNetworkBreakdown(networkId, near);

  const body = (render: (d: Breakdown) => React.ReactNode) => (
    <div className="relative min-h-16">
      {loading && <LoadingSpinner showText={false} />}
      {error && <p className="text-sm text-bad">{error}</p>}
      {data && render(data)}
    </div>
  );

  return (
    <div ref={ref} className="panel-row">
      <Panel title="Gamemodes now" size="sm">{body((d) => <Modes data={d} />)}</Panel>
      <Panel title="Most played maps · 7 days" size="md">{body((d) => <Maps data={d} />)}</Panel>
      <Panel title="Versions & countries" size="sm">{body((d) => <Composition data={d} />)}</Panel>
    </div>
  );
};

export default NetworkBreakdown;
