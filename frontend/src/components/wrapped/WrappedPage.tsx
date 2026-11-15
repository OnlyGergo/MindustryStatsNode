import React from "react";
import { Link } from "@tanstack/react-router";
import { MindustryText } from "../MindustryText.tsx";
import type { MapRow, WrappedReport } from "../../../../common/models/leaderboard.ts";
import { RankTable, ServerName } from "../leaderboard/RankTable.tsx";
import { flagEmoji, formatHours, formatInt, formatUtcDate, formatUtcDateTime } from "../leaderboard/format.ts";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const monthName = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

/** One story card: a title, one fact, content. */
const Card: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="bg-surface-secondary border border-subtle rounded p-4 sm:p-8 min-w-0">
    <h2 className="text-sm uppercase tracking-wide text-tertiary">{title}</h2>
    {note && <p className="text-xs text-tertiary">{note}</p>}
    <div className="mt-3 sm:mt-4">{children}</div>
  </section>
);

const Big: React.FC<{ value: React.ReactNode; label: string; hint?: React.ReactNode }> = ({ value, label, hint }) => (
  <div className="min-w-0">
    <div className="text-3xl sm:text-5xl font-bold text-accent tabular-nums break-words">{value}</div>
    <div className="text-sm text-secondary">{label}</div>
    {hint && <div className="text-xs text-tertiary">{hint}</div>}
  </div>
);

const MapName: React.FC<{ row: MapRow }> = ({ row }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="truncate max-w-[12rem] sm:max-w-[16rem]"><MindustryText text={row.mapName} /></span>
    {row.mode && (
      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-surface-tertiary border border-subtle text-secondary shrink-0">
        {row.mode}
      </span>
    )}
  </div>
);

const WrappedPage: React.FC<{ report: WrappedReport; onPlayStory?: () => void }> = ({ report: r, onPlayStory }) => {
  const bestMonthOf = new Map(r.bestMonths.map((b) => [b.id, b]));
  const winner = r.serverOfTheYear;
  const winnerBest = winner ? bestMonthOf.get(winner.id) : undefined;
  const maxMonth = Math.max(1, ...r.months.map((m) => m.playerHours));

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6 bg-surface-primary">
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <header className="bg-surface-secondary border border-subtle rounded p-6 sm:p-12 text-center">
          <h1 className="text-4xl sm:text-6xl font-bold text-accent">{r.year} Wrapped</h1>
          <p className="text-sm sm:text-base text-secondary mt-2">
            {r.final ? `The year in Mindustry, ${r.year}.` : `so far · as of ${formatUtcDate(r.asOf)}`}
          </p>
          {onPlayStory && (
            <button
              type="button"
              onClick={onPlayStory}
              className="mt-4 px-4 py-1.5 rounded-full bg-accent-muted border border-accent-border text-accent text-sm hover:bg-accent-hover cursor-pointer"
            >
              Play story
            </button>
          )}
        </header>

        <Card title="The year in numbers">
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <Big value={formatHours(r.headline.playerHours)} label="player-hours" />
            <Big
              value={formatInt(r.headline.peakPlayers)}
              label="players at the busiest moment"
              hint={r.headline.peakAt != null ? formatUtcDateTime(r.headline.peakAt) : undefined}
            />
            <Big value={formatInt(r.headline.activeServers)} label="servers with players" />
            <Big value={formatInt(r.headline.mapsPlayed)} label="different maps played" />
          </div>
        </Card>

        {winner && (
          <Card title="Server of the year" note="Most player-hours.">
            <div className="text-2xl sm:text-4xl font-bold text-primary break-words">
              <Link to="/server/$serverId" params={{ serverId: String(winner.id) }} className="hover:underline">
                {winner.name ? <MindustryText text={winner.name} /> : `Server #${winner.id}`}
              </Link>
            </div>
            {winner.networkId != null && winner.networkName && (
              <Link
                to="/network/$networkId"
                params={{ networkId: String(winner.networkId) }}
                className="text-sm text-tertiary hover:text-accent hover:underline"
              >
                {winner.networkName}
              </Link>
            )}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Big value={formatHours(winner.playerHours)} label="player-hours" />
              {winnerBest && (
                <Big
                  value={monthName(winnerBest.month)}
                  label="its best month"
                  hint={formatHours(winnerBest.playerHours)}
                />
              )}
            </div>
          </Card>
        )}

        {r.busiestDay && (
          <Card title="Busiest day">
            <Big
              value={formatUtcDate(r.busiestDay.day)}
              label="the day with the most player-hours"
              hint={formatHours(r.busiestDay.playerHours)}
            />
          </Card>
        )}

        <Card title="Player-hours by month">
          <div className="flex items-end gap-1 sm:gap-2 h-40" role="img" aria-label="Player-hours per month">
            {Array.from({ length: 12 }, (_, i) => {
              const m = r.months.find((x) => new Date(x.month).getUTCMonth() === i);
              const h = m ? (m.playerHours / maxMonth) * 100 : 0;
              return (
                <div key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center">
                  <div
                    className="w-full bg-accent rounded-t"
                    style={{ height: `${h}%`, minHeight: m && m.playerHours > 0 ? 2 : 0 }}
                    title={m ? `${monthName(m.month)}: ${formatHours(m.playerHours)}` : undefined}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 sm:gap-2 mt-1">
            {MONTH_INITIALS.map((c, i) => (
              <div key={i} className="flex-1 text-center text-xs text-tertiary">
                {c}
              </div>
            ))}
          </div>
        </Card>

        {r.topServers.length > 0 && (
          <Card title="Top 10 servers" note="Most player-hours, with each one's best month.">
            <RankTable
              rows={r.topServers}
              rowKey={(s) => s.id}
              rank={(s) => s.rank}
              columns={[
                { header: "Server", cell: (s) => <ServerName server={s} /> },
                { header: "Player-hours", cell: (s) => formatHours(s.playerHours), align: "right" },
                {
                  header: "Best month",
                  cell: (s) => {
                    const b = bestMonthOf.get(s.id);
                    return b ? monthName(b.month) : "—";
                  },
                  align: "right",
                },
              ]}
            />
          </Card>
        )}

        {r.climbers.length > 0 && (
          <Card
            title="Biggest climbers"
            note={
              r.climbersFrom != null && r.climbersFrom > Date.UTC(r.year, 0, 1)
                ? `Gain in player-hours, ${formatUtcDate(r.climbersFrom)} to ${formatUtcDate(r.asOf)} vs the same dates in ${r.year - 1}.`
                : `Gain in player-hours vs the same dates in ${r.year - 1}.`
            }
          >
            <RankTable
              rows={r.climbers}
              rowKey={(s) => s.id}
              rank={(_, i) => i + 1}
              columns={[
                { header: "Server", cell: (s) => <ServerName server={s} /> },
                { header: String(r.year - 1), cell: (s) => formatHours(s.prevPlayerHours), align: "right" },
                { header: String(r.year), cell: (s) => formatHours(s.playerHours), align: "right" },
              ]}
            />
          </Card>
        )}

        {r.topMaps.length > 0 && (
          <Card title="Top maps" note="Most played by player-hours.">
            <RankTable
              rows={r.topMaps.slice(0, 10)}
              rowKey={(m) => `${m.mapName}|${m.mode ?? ""}`}
              rank={(m) => m.rank}
              columns={[
                { header: "Map", cell: (m) => <MapName row={m} /> },
                { header: "Player-hours", cell: (m) => formatHours(m.playerHours), align: "right" },
              ]}
            />
            {r.mapPerMode.length > 0 && (
              <>
                <h3 className="text-sm text-secondary mt-4 mb-2">Most played map per mode</h3>
                <div className="flex flex-wrap gap-2">
                  {r.mapPerMode.map((m) => (
                    <span
                      key={m.mode}
                      className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded bg-surface-tertiary border border-subtle text-xs"
                    >
                      <span className="uppercase text-secondary shrink-0">{m.mode}</span>
                      <span className="text-primary truncate"><MindustryText text={m.mapName} /></span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}

        {r.modes.length > 0 && (
          <Card title="Gamemodes" note="Share of all player-hours.">
            <ul className="space-y-2">
              {r.modes.map((m) => (
                <li key={m.mode}>
                  <div className="flex justify-between text-sm gap-2">
                    <span className="truncate text-primary">{m.mode}</span>
                    <span className="tabular-nums whitespace-nowrap">{(m.share * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded bg-surface-tertiary overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, m.share * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {r.records.length > 0 && (
          <Card title="Records set" note="Servers that set their all-time peak this year.">
            <RankTable
              rows={r.records}
              rowKey={(s) => s.id}
              columns={[
                { header: "Server", cell: (s) => <ServerName server={s} /> },
                { header: "Peak", cell: (s) => `${formatInt(s.peak)} players`, align: "right" },
                { header: "When", cell: (s) => formatUtcDateTime(s.peakAt), align: "right" },
              ]}
            />
          </Card>
        )}

        {r.newcomers.length > 0 && (
          <Card title="Newcomers of the year" note="New servers that drew the most players.">
            <RankTable
              rows={r.newcomers}
              rowKey={(s) => s.id}
              columns={[
                { header: "Server", cell: (s) => <ServerName server={s} /> },
                { header: "First seen", cell: (s) => formatUtcDate(s.firstSeen), align: "right" },
                { header: "Player-hours", cell: (s) => formatHours(s.playerHours), align: "right" },
              ]}
            />
          </Card>
        )}

        {r.networks.length > 0 && (
          <Card title="Top networks" note="Combined player-hours.">
            <RankTable
              rows={r.networks}
              rowKey={(n) => n.id}
              rank={(_, i) => i + 1}
              columns={[
                {
                  header: "Network",
                  cell: (n) => (
                    <Link
                      to="/network/$networkId"
                      params={{ networkId: String(n.id) }}
                      className="text-primary hover:underline block truncate max-w-[12rem] sm:max-w-[16rem]"
                    >
                      {n.name}
                    </Link>
                  ),
                },
                { header: "Servers", cell: (n) => formatInt(n.servers), align: "right" },
                { header: "Player-hours", cell: (n) => formatHours(n.playerHours), align: "right" },
              ]}
            />
          </Card>
        )}

        {r.countries.length > 0 && (
          <Card title="Top countries" note="Where servers are hosted, by player-hours.">
            <RankTable
              rows={r.countries}
              rowKey={(c) => c.countryCode}
              columns={[
                {
                  header: "Country",
                  cell: (c) => (
                    <span>
                      {flagEmoji(c.countryCode)} {c.countryCode.toUpperCase()}
                    </span>
                  ),
                },
                { header: "Servers", cell: (c) => formatInt(c.servers), align: "right" },
                { header: "Player-hours", cell: (c) => formatHours(c.playerHours), align: "right" },
              ]}
            />
          </Card>
        )}
      </div>
    </div>
  );
};

export default WrappedPage;
