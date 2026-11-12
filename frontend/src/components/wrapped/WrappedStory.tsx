import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MindustryText } from "../MindustryText.tsx";
import type { WrappedReport } from "../../../../common/models/leaderboard.ts";
import { flagEmoji, formatHours, formatInt, formatUtcDate, formatUtcDateTime } from "../leaderboard/format.ts";
import { useCountUp } from "./useCountUp.ts";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const monthName = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

const delay = (s: number): React.CSSProperties => ({ animationDelay: `${s}s` });

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="wr-fade text-xs sm:text-sm uppercase tracking-[0.25em] text-accent mb-4">{children}</p>
);

const Huge: React.FC<{ children: React.ReactNode; d?: number; small?: boolean }> = ({ children, d = 0.2, small }) => (
  <div
    className={`wr-pop font-extrabold text-primary tabular-nums break-words leading-tight ${
      small ? "text-4xl sm:text-6xl" : "text-5xl sm:text-8xl"
    }`}
    style={delay(d)}
  >
    {children}
  </div>
);

const Sub: React.FC<{ children: React.ReactNode; d?: number }> = ({ children, d = 0.6 }) => (
  <p className="wr-rise text-base sm:text-xl text-secondary mt-3" style={delay(d)}>
    {children}
  </p>
);

const ServerLink: React.FC<{ id: number; name: string | null; className?: string }> = ({ id, name, className }) => (
  <Link to="/server/$serverId" params={{ serverId: String(id) }} className={`hover:underline ${className ?? ""}`}>
    {name ? <MindustryText text={name} /> : `Server #${id}`}
  </Link>
);

const NetworkLink: React.FC<{ id: number; name: string; className?: string }> = ({ id, name, className }) => (
  <Link
    to="/network/$networkId"
    params={{ networkId: String(id) }}
    className={`hover:text-accent hover:underline ${className ?? ""}`}
  >
    {name}
  </Link>
);

const CountHours: React.FC<{ value: number; instant: boolean }> = ({ value, instant }) => {
  const v = useCountUp(value, 1800, instant);
  return <>{formatInt(v)}</>;
};

const CountInt: React.FC<{ value: number; instant: boolean }> = ({ value, instant }) => {
  const v = useCountUp(value, 1400, instant);
  return <>{formatInt(v)}</>;
};

interface Slide {
  key: string;
  /** auto-advance time in ms */
  ms: number;
  label: string;
  node: React.ReactNode;
}

function buildSlides(r: WrappedReport, instant: boolean): Slide[] {
  const s: Slide[] = [];
  const bestMonthOf = new Map(r.bestMonths.map((b) => [b.id, b]));

  s.push({
    key: "intro",
    ms: 5000,
    label: "Introduction",
    node: (
      <>
        <Kicker>{r.final ? "The year in Mindustry" : `As of ${formatUtcDate(r.asOf)}`}</Kicker>
        <Huge>{r.year} Wrapped</Huge>
        {!r.final && <Sub>so far</Sub>}
        <Sub d={1}>Let&apos;s look back.</Sub>
      </>
    ),
  });

  if (r.headline.playerHours > 0) {
    s.push({
      key: "hours",
      ms: 6000,
      label: "Total player-hours",
      node: (
        <>
          <Kicker>Together, players spent</Kicker>
          <Huge>
            <CountHours value={r.headline.playerHours} instant={instant} />
          </Huge>
          <Sub d={0.4}>hours playing Mindustry</Sub>
        </>
      ),
    });
  }

  if (r.headline.peakPlayers > 0) {
    s.push({
      key: "peak",
      ms: 6000,
      label: "Peak players",
      node: (
        <>
          <Kicker>The busiest moment</Kicker>
          <Huge>
            <CountInt value={r.headline.peakPlayers} instant={instant} />
          </Huge>
          <Sub d={0.4}>players online at once</Sub>
          {r.headline.peakAt != null && <Sub d={0.9}>{formatUtcDateTime(r.headline.peakAt)}</Sub>}
        </>
      ),
    });
  }

  if (r.headline.activeServers > 0 || r.headline.mapsPlayed > 0) {
    s.push({
      key: "scale",
      ms: 6000,
      label: "Servers and maps",
      node: (
        <div className="grid gap-8 sm:gap-10">
          <div>
            <Huge small>
              <CountInt value={r.headline.activeServers} instant={instant} />
            </Huge>
            <Sub d={0.4}>servers had players</Sub>
          </div>
          <div>
            <Huge small d={0.9}>
              <CountInt value={r.headline.mapsPlayed} instant={instant} />
            </Huge>
            <Sub d={1.1}>different maps were played</Sub>
          </div>
        </div>
      ),
    });
  }

  const winner = r.serverOfTheYear;
  if (winner) {
    const best = bestMonthOf.get(winner.id);
    s.push({
      key: "winner",
      ms: 8000,
      label: "Server of the year",
      node: (
        <>
          <Kicker>Server of the year</Kicker>
          <p className="wr-fade text-secondary mb-3" style={delay(0.4)}>
            And the winner is…
          </p>
          <div className="wr-pop text-4xl sm:text-7xl font-extrabold break-words leading-tight" style={delay(1.4)}>
            <ServerLink id={winner.id} name={winner.name} className="text-accent" />
          </div>
          {winner.networkId != null && winner.networkName && (
            <div className="wr-rise mt-2 text-secondary" style={delay(1.9)}>
              <NetworkLink id={winner.networkId} name={winner.networkName} />
            </div>
          )}
          <Sub d={2.2}>
            {formatHours(winner.playerHours)} played
            {best ? `, best in ${monthName(best.month)}` : ""}
          </Sub>
        </>
      ),
    });
  }

  if (r.busiestDay) {
    s.push({
      key: "day",
      ms: 6000,
      label: "Busiest day",
      node: (
        <>
          <Kicker>The busiest day</Kicker>
          <Huge small>{formatUtcDate(r.busiestDay.day)}</Huge>
          <Sub d={0.6}>{formatHours(r.busiestDay.playerHours)} played in a single day</Sub>
        </>
      ),
    });
  }

  if (r.months.some((m) => m.playerHours > 0)) {
    const max = Math.max(1, ...r.months.map((m) => m.playerHours));
    const best = r.months.reduce((a, b) => (b.playerHours > a.playerHours ? b : a));
    s.push({
      key: "months",
      ms: 8000,
      label: "Player-hours by month",
      node: (
        <>
          <Kicker>Month by month</Kicker>
          <div className="flex items-end gap-1.5 sm:gap-3 h-48 sm:h-64 w-full" role="img" aria-label="Player-hours per month">
            {Array.from({ length: 12 }, (_, i) => {
              const m = r.months.find((x) => new Date(x.month).getUTCMonth() === i);
              const h = m ? (m.playerHours / max) * 100 : 0;
              const isBest = m === best;
              return (
                <div key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end">
                  <div
                    className={`wr-grow-y w-full rounded-t ${isBest ? "bg-accent shadow-[0_0_24px_rgba(255,107,53,0.7)]" : "bg-accent/35"}`}
                    style={{ height: `${h}%`, minHeight: m && m.playerHours > 0 ? 3 : 0, ...delay(0.3 + i * 0.3) }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1.5 sm:gap-3 mt-2">
            {MONTH_INITIALS.map((c, i) => (
              <div key={i} className="flex-1 text-center text-xs text-tertiary">
                {c}
              </div>
            ))}
          </div>
          <Sub d={4.2}>
            {monthName(best.month)} was the best month with {formatHours(best.playerHours)}.
          </Sub>
        </>
      ),
    });
  }

  if (r.topServers.length > 0) {
    s.push({
      key: "top",
      ms: 10000,
      label: "Top servers",
      node: (
        <>
          <Kicker>Top servers</Kicker>
          <ol className="space-y-3 sm:space-y-4">
            {r.topServers.slice(0, 5).map((t, i) => (
              <li
                key={t.id}
                className="wr-rise flex items-baseline gap-3 min-w-0"
                style={delay(0.4 + i * 0.8)}
              >
                <span className="text-2xl sm:text-4xl font-extrabold text-accent tabular-nums w-8 sm:w-12 shrink-0">
                  {t.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <ServerLink id={t.id} name={t.name} className="block truncate text-lg sm:text-3xl font-bold text-primary" />
                  <div className="text-xs sm:text-sm text-tertiary">{formatHours(t.playerHours)}</div>
                </div>
              </li>
            ))}
          </ol>
        </>
      ),
    });
  }

  const climber = r.climbers[0];
  if (climber) {
    s.push({
      key: "climber",
      ms: 7000,
      label: "Biggest climber",
      node: (
        <>
          <Kicker>Biggest climber</Kicker>
          <div className="wr-pop text-4xl sm:text-6xl font-extrabold break-words leading-tight" style={delay(0.3)}>
            <ServerLink id={climber.id} name={climber.name} className="text-primary" />
          </div>
          <Sub d={0.9}>
            from {formatHours(climber.prevPlayerHours)} in {r.year - 1} to{" "}
            <span className="text-accent font-bold">{formatHours(climber.playerHours)}</span>
          </Sub>
        </>
      ),
    });
  }

  const topMap = r.topMaps[0];
  if (topMap) {
    s.push({
      key: "map",
      ms: 7000,
      label: "Top map",
      node: (
        <>
          <Kicker>Most played map</Kicker>
          <Huge small>
            <MindustryText text={topMap.mapName} />
          </Huge>
          <Sub d={0.6}>
            {formatHours(topMap.playerHours)}
            {topMap.mode ? ` · ${topMap.mode}` : ""}
          </Sub>
          {r.mapPerMode.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {r.mapPerMode.slice(0, 6).map((m, i) => (
                <span
                  key={m.mode}
                  className="wr-rise inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full bg-white/10 text-xs sm:text-sm"
                  style={delay(1 + i * 0.25)}
                >
                  <span className="uppercase text-secondary shrink-0">{m.mode}</span>
                  <span className="truncate">
                    <MindustryText text={m.mapName} />
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      ),
    });
  }

  if (r.modes.length > 0) {
    s.push({
      key: "modes",
      ms: 7000,
      label: "Gamemodes",
      node: (
        <>
          <Kicker>How we played</Kicker>
          <ul className="space-y-4 sm:space-y-5">
            {r.modes.slice(0, 5).map((m, i) => (
              <li key={m.mode}>
                <div className="flex justify-between gap-2 text-base sm:text-2xl font-bold">
                  <span className="truncate">{m.mode}</span>
                  <span className="tabular-nums text-accent">{(m.share * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2.5 sm:h-3 rounded-full bg-white/10 overflow-hidden mt-1">
                  <div
                    className="wr-grow-x h-full bg-accent rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, m.share * 100))}%`, ...delay(0.3 + i * 0.35) }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  const net = r.networks[0];
  if (net) {
    s.push({
      key: "network",
      ms: 6000,
      label: "Top network",
      node: (
        <>
          <Kicker>Top network</Kicker>
          <div className="wr-pop text-4xl sm:text-7xl font-extrabold break-words leading-tight" style={delay(0.3)}>
            <NetworkLink id={net.id} name={net.name} className="text-primary" />
          </div>
          <Sub d={0.9}>
            {formatHours(net.playerHours)} across {formatInt(net.servers)} servers
          </Sub>
        </>
      ),
    });
  }

  const country = r.countries[0];
  if (country) {
    s.push({
      key: "country",
      ms: 6000,
      label: "Top country",
      node: (
        <>
          <Kicker>Top hosting country</Kicker>
          <div className="wr-pop text-7xl sm:text-9xl leading-none" style={delay(0.3)}>
            {flagEmoji(country.countryCode)}
          </div>
          <Huge small d={0.6}>
            {country.countryCode.toUpperCase()}
          </Huge>
          <Sub d={1}>
            {formatHours(country.playerHours)} on {formatInt(country.servers)} servers
          </Sub>
        </>
      ),
    });
  }

  if (r.newcomers.length > 0) {
    s.push({
      key: "newcomers",
      ms: 8000,
      label: "Newcomers",
      node: (
        <>
          <Kicker>New this year</Kicker>
          <ul className="space-y-4">
            {r.newcomers.slice(0, 3).map((n, i) => (
              <li key={n.id} className="wr-rise min-w-0" style={delay(0.4 + i * 0.8)}>
                <ServerLink id={n.id} name={n.name} className="block truncate text-xl sm:text-4xl font-bold text-primary" />
                <div className="text-xs sm:text-sm text-tertiary">
                  since {formatUtcDate(n.firstSeen)} · {formatHours(n.playerHours)}
                </div>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  return s;
}

const HOLD_MS = 220;
const SWIPE_PX = 50;

interface Props {
  report: WrappedReport;
  onSkip: () => void;
}

const WrappedStory: React.FC<Props> = ({ report, onSkip }) => {
  const [reduced, setReduced] = useState(false);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => buildSlides(report, reduced), [report, reduced]);
  // The outro is one extra slide after the data slides.
  const total = slides.length + 1;
  const last = total - 1;
  const isOutro = index === last;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  const next = useCallback(() => setIndex((i) => Math.min(last, i + 1)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const replay = useCallback(() => {
    setIndex(0);
    setReplayKey((k) => k + 1);
  }, []);

  const down = useRef<{ x: number; y: number; t: number; holdTimer: number; wasHeld: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const holdTimer = window.setTimeout(() => {
      if (down.current) down.current.wasHeld = true;
      setHeld(true);
    }, HOLD_MS);
    down.current = { x: e.clientX, y: e.clientY, t: Date.now(), holdTimer, wasHeld: false };
  };

  const finishPointer = (e: React.PointerEvent, cancelled: boolean) => {
    const d = down.current;
    down.current = null;
    if (!d) return;
    window.clearTimeout(d.holdTimer);
    setHeld(false);
    if (cancelled || d.wasHeld) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
      return;
    }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    // Links and buttons keep their own behaviour.
    if ((e.target as HTMLElement).closest("a, button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 1 / 3) prev();
    else if (x > 2 / 3) next();
    else if (!isOutro) next();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onSkip();
      return;
    }
    const interactive = (e.target as HTMLElement).closest("a, button");
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === " " && !interactive) {
      e.preventDefault();
      next();
    }
  };

  const autoplay = !reduced;
  const running = autoplay && !held && !paused && !hidden && !isOutro;
  const current = isOutro ? null : slides[index];
  const label = current ? current.label : "Wrap-up";

  return (
    <div
      ref={stageRef}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${report.year} Wrapped story`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={(e) => finishPointer(e, false)}
      onPointerCancel={(e) => finishPointer(e, true)}
      onPointerLeave={(e) => down.current && finishPointer(e, true)}
      onContextMenu={(e) => e.preventDefault()}
      className="relative h-full w-full overflow-hidden bg-[#0a0a0a] text-primary select-none outline-none touch-pan-y"
    >
      {/* Animated accent glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="wr-glow absolute -top-1/4 -left-1/4 w-[80%] h-[80%] rounded-full bg-accent/30 blur-[120px]" />
        <div
          className="wr-glow absolute -bottom-1/4 -right-1/4 w-[70%] h-[70%] rounded-full bg-[#ff2e63]/20 blur-[120px]"
          style={{ animationDelay: "-4s" }}
        />
      </div>

      {/* Progress segments */}
      <div className="absolute top-0 inset-x-0 z-10 px-3 pt-3 flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
            {i < index || (i === index && (isOutro || !autoplay)) ? (
              <div className="h-full w-full bg-white" />
            ) : i === index ? (
              <div
                key={`${replayKey}-${index}`}
                className="wr-progress h-full w-full bg-white"
                style={{
                  animationDuration: `${current?.ms ?? 0}ms`,
                  animationPlayState: running ? "running" : "paused",
                }}
                onAnimationEnd={next}
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* Top controls */}
      <div className="absolute top-6 inset-x-0 z-10 px-3 flex items-center justify-between text-sm">
        <span className="text-white/60 tabular-nums" aria-hidden>
          {index + 1} / {total}
        </span>
        <div className="flex gap-2">
          {autoplay && !isOutro && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Resume story" : "Pause story"}
              className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              {paused ? "Play" : "Pause"}
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Slide */}
      <div
        key={`${replayKey}-${index}`}
        className="relative z-[1] h-full flex flex-col justify-center px-6 sm:px-16 pt-16 pb-10 max-w-3xl mx-auto"
        aria-live="polite"
        aria-label={`Slide ${index + 1} of ${total}: ${label}`}
      >
        {current ? (
          current.node
        ) : (
          <>
            <Kicker>That&apos;s a wrap</Kicker>
            <Huge small>Thanks for playing in {report.year}.</Huge>
            <div className="wr-rise flex flex-wrap gap-3 mt-10" style={delay(0.6)}>
              <button
                type="button"
                onClick={onSkip}
                className="px-5 py-3 rounded-full bg-accent text-black font-bold hover:brightness-110 cursor-pointer"
              >
                See full summary
              </button>
              <button
                type="button"
                onClick={replay}
                className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 font-semibold cursor-pointer"
              >
                Replay
              </button>
            </div>
          </>
        )}
      </div>

      {/* Visible nav for mouse/keyboard users; tap zones cover touch */}
      <button
        type="button"
        onClick={prev}
        disabled={index === 0}
        aria-label="Previous slide"
        className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
      >
        {"‹"}
      </button>
      <button
        type="button"
        onClick={next}
        disabled={isOutro}
        aria-label="Next slide"
        className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
      >
        {"›"}
      </button>
    </div>
  );
};

export default WrappedStory;
