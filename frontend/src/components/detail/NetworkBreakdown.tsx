import { NetworkBreakdown as Breakdown } from "../../../../common/models/networkAnalytics.ts";
import { useNetworkBreakdown } from "../../hooks/api/useNetworkAnalytics.ts";
import { countryCodeToFlag } from "../../util/general.ts";
import { removeColors } from "../../util/mindustry.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";

const nf = new Intl.NumberFormat("en-US");

const Chip = ({ children, count }: { children: React.ReactNode; count: number }) => (
  <span className="inline-flex items-center gap-1.5 bg-surface-tertiary border border-subtle rounded px-2 py-1 text-xs sm:text-sm text-primary">
    {children}
    <span className="text-tertiary">{count}</span>
  </span>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <h3 className="font-medium text-accent mb-2 text-sm sm:text-base">{title}</h3>
    {children}
  </div>
);

const Content = ({ data }: { data: Breakdown }) => {
  const maxPlayers = Math.max(1, ...data.modes.map((m) => m.players));
  const maxHours = Math.max(1, ...data.maps.map((m) => m.playerHours));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Section title="Gamemodes now">
        {data.modes.length === 0 ? (
          <p className="text-sm text-tertiary">No servers online.</p>
        ) : (
          <ul className="space-y-2">
            {data.modes.map((m) => (
              <li key={m.mode}>
                <div className="flex justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-primary truncate">{m.mode}</span>
                  <span className="text-tertiary shrink-0">
                    {nf.format(m.players)} players · {m.servers} server{m.servers === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2 mt-1 rounded bg-surface-tertiary overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${(m.players / maxPlayers) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Most played maps (7 days)">
        {data.maps.length === 0 ? (
          <p className="text-sm text-tertiary">No map data yet.</p>
        ) : (
          <ol className="space-y-2">
            {data.maps.map((m, i) => (
              <li key={`${m.mapName}-${m.mode}-${i}`}>
                <div className="flex justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-primary truncate">
                    {removeColors(m.mapName) || m.mapName}
                    {m.mode && <span className="text-tertiary"> · {m.mode}</span>}
                  </span>
                  <span className="text-tertiary shrink-0">{nf.format(Math.round(m.playerHours))} player-h</span>
                </div>
                <div className="h-1.5 mt-1 rounded bg-surface-tertiary overflow-hidden">
                  <div className="h-full bg-accent-muted border-r border-accent" style={{ width: `${(m.playerHours / maxHours) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Versions">
        <div className="flex flex-wrap gap-2">
          {data.versions.length === 0 && <p className="text-sm text-tertiary">No servers online.</p>}
          {data.versions.map((v) => (
            <Chip key={`${v.versionType}-${v.version}`} count={v.servers}>
              {v.version == null ? "Unknown" : `${v.versionType ? `${v.versionType} ` : ""}${v.version}`}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Countries">
        <div className="flex flex-wrap gap-2">
          {data.countries.map((c) => (
            <Chip key={c.countryCode ?? "unknown"} count={c.servers}>
              <span title={c.countryCode ?? "Unknown"}>{countryCodeToFlag(c.countryCode)}</span>
              {c.countryCode ?? "Unknown"}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
};

const NetworkBreakdown = ({ networkId }: { networkId: number }) => {
  const { data, loading, error } = useNetworkBreakdown(networkId);

  return (
    <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
      <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">Breakdown</h2>
      <div className="relative min-h-24">
        {loading && <LoadingSpinner showText={false} />}
        {error && <p className="text-sm text-status-offline">{error}</p>}
        {data && <Content data={data} />}
      </div>
    </div>
  );
};

export default NetworkBreakdown;
