import React from "react";
import { Link } from "@tanstack/react-router";
import { LEADERBOARD_WINDOWS } from "../../../../common/models/leaderboard.ts";
import type {
  LeaderboardReport,
  LeaderboardWindow,
  MapRow,
  MoverRow,
} from "../../../../common/models/leaderboard.ts";
import { MindustryText } from "../MindustryText.tsx";
import { formatRelativeTime } from "../../util/general.ts";
import HeadlineCards from "./HeadlineCards.tsx";
import { Delta, RankTable, Section, ServerName } from "./RankTable.tsx";
import type { Column } from "./RankTable.tsx";
import PageHead from "../ui/PageHead.tsx";
import { flagEmoji, formatHours, formatInt, formatUtcDate, formatUtcDateTime, formatUtcTime } from "./format.ts";

const PREVIOUS: Record<LeaderboardWindow, string> = {
  "24h": "previous 24 hours",
  "7d": "previous 7 days",
  "30d": "previous 30 days",
};

const WindowTabs: React.FC<{ active: LeaderboardWindow }> = ({ active }) => (
  <nav className="seg" aria-label="Time window">
    {LEADERBOARD_WINDOWS.map((w) => (
      <Link
        key={w}
        to="/leaderboard"
        search={(prev) => ({ ...prev, w })}
        replace
        aria-current={w === active ? "page" : undefined}
        className={`seg-btn ${w === active ? "relative bg-acc border-acc text-onacc hover:text-onacc" : ""}`}
      >
        {w}
      </Link>
    ))}
  </nav>
);

const moverColumns: Column<MoverRow>[] = [
  { header: "Server", cell: (r) => <ServerName server={r} /> },
  { header: "Now", cell: (r) => formatHours(r.playerHours), align: "right" },
  { header: "Change", cell: (r) => <Delta delta={r.delta} pct={r.deltaPct} />, align: "right" },
];

const MapName: React.FC<{ row: MapRow }> = ({ row }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="truncate max-w-[14rem]"><MindustryText text={row.mapName} /></span>
    {row.mode && (
      <span className="tag text-[10px] uppercase shrink-0">
        {row.mode}
      </span>
    )}
  </div>
);

const mapColumns: Column<MapRow>[] = [
  { header: "Map", cell: (r) => <MapName row={r} /> },
  { header: "Servers", cell: (r) => formatInt(r.servers), align: "right" },
  { header: "Player-hours", cell: (r) => formatHours(r.playerHours), align: "right" },
];

const LeaderboardPage: React.FC<{ report: LeaderboardReport; window: LeaderboardWindow }> = ({ report, window: w }) => {
  const s = report.windows[w];
  return (
    <div className="page-scroll">
      <div className="page">
        <PageHead
          title="Leaderboard"
          sub={
            <>
              {/* Relative time depends on the clock, so server and browser may differ. */}
              Updated <span suppressHydrationWarning>{formatRelativeTime(report.generatedAt)}</span> · next refresh{" "}
              {formatUtcTime(report.nextRefreshAt)} UTC · vs the {PREVIOUS[w]}
            </>
          }
          right={
            <>
              <Link
                to="/wrapped/$year"
                params={{ year: String(new Date(report.generatedAt).getUTCFullYear()) }}
                className="btn-fill"
              >
                {new Date(report.generatedAt).getUTCFullYear()} Wrapped →
              </Link>
              <WindowTabs active={w} />
            </>
          }
        />

        <HeadlineCards headline={s.headline} />

        <div className="panel-row">
          <Section title="Top servers" description="Most player-hours in this window." empty={!s.topServers.length}>
            <RankTable
              rows={s.topServers}
              rowKey={(r) => r.id}
              rank={(r) => r.rank}
              movement={(r) => r}
              columns={[
                { header: "Server", cell: (r) => <ServerName server={r} /> },
                { header: "Player-hours", cell: (r) => formatHours(r.playerHours), align: "right" },
              ]}
            />
          </Section>

          <div className="panel-md flex flex-col gap-3 min-w-0">
            <Section title="Top movers" description={`Biggest gain in player-hours vs the ${PREVIOUS[w]}.`} empty={!s.movers.length}>
              <RankTable rows={s.movers} rowKey={(r) => r.id} columns={moverColumns} />
            </Section>
            <Section title="Top losers" description={`Biggest drop in player-hours vs the ${PREVIOUS[w]}.`} empty={!s.losers.length}>
              <RankTable rows={s.losers} rowKey={(r) => r.id} columns={moverColumns} />
            </Section>
          </div>

          <Section title="Top maps" description="Most-played maps by player-hours." empty={!s.topMaps.length}>
            <RankTable
              rows={s.topMaps}
              rowKey={(r) => `${r.mapName}|${r.mode ?? ""}`}
              rank={(r) => r.rank}
              movement={(r) => r}
              columns={mapColumns}
            />
          </Section>

          <Section title="Rising maps" description={`Maps climbing fastest vs the ${PREVIOUS[w]}.`} empty={!s.risingMaps.length}>
            <RankTable
              rows={s.risingMaps}
              rowKey={(r) => `${r.mapName}|${r.mode ?? ""}`}
              movement={(r) => r}
              columns={mapColumns}
            />
          </Section>

          <Section title="Gamemode share" description="Share of all player-hours, and the change in percentage points." empty={!s.modes.length}>
            <ul className="space-y-1.5">
              {s.modes.map((m) => {
                const pp = Math.round((m.share - m.prevShare) * 1000) / 10;
                return (
                  <li key={m.mode}>
                    <div className="flex justify-between text-xs gap-2">
                      <b className="truncate font-semibold text-tx">{m.mode}</b>
                      <span className="tabular-nums whitespace-nowrap">
                        {(m.share * 100).toFixed(1)}%{" "}
                        <span className={`text-xs ${pp >= 0 ? "text-good" : "text-bad"}`}>
                          {pp >= 0 ? "+" : "−"}
                          {Math.abs(pp).toFixed(1)} pp
                        </span>
                      </span>
                    </div>
                    <div className="track mt-0.5">
                      <i className="track-fill" style={{ width: `${Math.min(100, Math.max(0, m.share * 100))}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Top networks" description="Server networks by combined player-hours." empty={!s.networks.length}>
            <RankTable
              rows={s.networks}
              rowKey={(r) => r.id}
              rank={(_, i) => i + 1}
              columns={[
                {
                  header: "Network",
                  cell: (r) => (
                    <Link
                      to="/network/$networkId"
                      params={{ networkId: String(r.id) }}
                      className="text-tx hover:underline block truncate max-w-[16rem]"
                    >
                      {r.name}
                    </Link>
                  ),
                },
                { header: "Servers", cell: (r) => formatInt(r.servers), align: "right" },
                { header: "Player-hours", cell: (r) => formatHours(r.playerHours), align: "right" },
                { header: "Change", cell: (r) => <Delta delta={r.playerHours - r.prevPlayerHours} />, align: "right" },
              ]}
            />
          </Section>

          <Section title="Newcomers" description="New servers that already draw players." empty={!s.newcomers.length}>
            <RankTable
              rows={s.newcomers}
              rowKey={(r) => r.id}
              columns={[
                { header: "Server", cell: (r) => <ServerName server={r} /> },
                { header: "First seen", cell: (r) => formatUtcDate(r.firstSeen), align: "right" },
                { header: "Player-hours", cell: (r) => formatHours(r.playerHours), align: "right" },
              ]}
            />
          </Section>

          <Section title="Records broken" description="Servers that set a new all-time peak." empty={!s.records.length}>
            <RankTable
              rows={s.records}
              rowKey={(r) => r.id}
              columns={[
                { header: "Server", cell: (r) => <ServerName server={r} /> },
                { header: "Peak", cell: (r) => `${formatInt(r.peak)} players`, align: "right" },
                { header: "When", cell: (r) => formatUtcDateTime(r.peakAt), align: "right" },
              ]}
            />
          </Section>

          <Section title="Most reliable" description="Highest uptime among busy servers." empty={!s.reliable.length}>
            <RankTable
              rows={s.reliable}
              rowKey={(r) => r.id}
              columns={[
                { header: "Server", cell: (r) => <ServerName server={r} /> },
                { header: "Uptime", cell: (r) => `${(r.uptime * 100).toFixed(1)}%`, align: "right" },
                { header: "Player-hours", cell: (r) => formatHours(r.playerHours), align: "right" },
              ]}
            />
          </Section>

          <Section title="Deepest waves" description="Highest wave reached in this window." empty={!s.waves.length}>
            <RankTable
              rows={s.waves}
              rowKey={(r) => r.id}
              columns={[
                { header: "Server", cell: (r) => <ServerName server={r} /> },
                { header: "Wave", cell: (r) => formatInt(r.maxWave), align: "right" },
              ]}
            />
          </Section>

          <Section title="Top countries" description="Where servers are hosted, by player-hours." empty={!s.countries.length}>
            <RankTable
              rows={s.countries}
              rowKey={(r) => r.countryCode}
              columns={[
                {
                  header: "Country",
                  cell: (r) => (
                    <span>
                      {flagEmoji(r.countryCode)} {r.countryCode.toUpperCase()}
                    </span>
                  ),
                },
                { header: "Servers", cell: (r) => formatInt(r.servers), align: "right" },
                { header: "Player-hours", cell: (r) => formatHours(r.playerHours), align: "right" },
                { header: "Change", cell: (r) => <Delta delta={r.playerHours - r.prevPlayerHours} />, align: "right" },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
};

export default LeaderboardPage;
