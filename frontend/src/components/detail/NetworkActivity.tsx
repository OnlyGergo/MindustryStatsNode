import { useMemo, useState } from "react";
import { NetworkActivityCell } from "../../../../common/models/networkAnalytics.ts";
import { useNetworkActivity } from "../../hooks/api/useNetworkAnalytics.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";
import { useNearViewport } from "../../hooks/useNearViewport.ts";
import Panel from "../ui/Panel.tsx";
import Segmented from "../ui/Segmented.tsx";

const DAYS = [7, 28, 90] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// 2024-01-01 is a Monday, so ISO dow n maps to day 1 + (n - 1) of that week.
const REFERENCE_MONDAY_UTC = Date.UTC(2024, 0, 1);

interface LocalCell { dow: number; hour: number; avg: number }

/**
 * Shifts UTC (weekday, hour) cells into the viewer's timezone using the current
 * offset (a window spanning a DST change is shown with today's offset). For
 * half-hour offsets the cell lands on the hour it overlaps most.
 */
function toLocal(cells: NetworkActivityCell[], offsetMinutes: number): LocalCell[] {
  return cells.map((c) => {
    const shifted = new Date(REFERENCE_MONDAY_UTC + ((c.dow - 1) * 24 + c.hour) * 3_600_000 - offsetMinutes * 60_000);
    return { dow: ((shifted.getUTCDay() + 6) % 7) + 1, hour: shifted.getUTCHours(), avg: c.avg };
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

const NetworkActivity = ({ networkId }: { networkId: number }) => {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [ref, near] = useNearViewport<HTMLElement>();
  const { data, loading, error } = useNetworkActivity(networkId, days, near);

  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "local time"; }
  }, []);

  const { grid, max } = useMemo(() => {
    const g = new Map<string, number>();
    let m = 0;
    if (data) {
      for (const c of toLocal(data, new Date().getTimezoneOffset())) {
        g.set(`${c.dow}-${c.hour}`, c.avg);
        if (c.avg > m) m = c.avg;
      }
    }
    return { grid: g, max: m };
  }, [data]);

  return (
    <Panel
      ref={ref}
      title="When it’s busy"
      size="md"
      controls={
        <Segmented
          aria-label="Activity window"
          options={DAYS.map((d) => ({ value: d, label: `${d}d` }))}
          value={days}
          onChange={setDays}
        />
      }
    >
      <p className="text-xs text-dim mb-1.5">Avg players by weekday and hour · {tz}</p>

      <div className="relative min-h-24">
        {loading && <LoadingSpinner showText={false} />}
        {error && <p className="text-sm text-bad">{error}</p>}
        {!loading && !error && max === 0 && <p className="text-sm text-dim">No activity data for this window.</p>}

        {!error && max > 0 && (
          <div className={loading ? "opacity-30" : ""}>
            <div className="grid gap-0.5 items-center" style={{ gridTemplateColumns: "30px repeat(24, minmax(0, 1fr))" }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[10px] text-dim whitespace-nowrap">
                  {h % 3 === 0 ? pad(h) : ""}
                </div>
              ))}
              {WEEKDAYS.map((name, i) => (
                <Row key={name} name={name} dow={i + 1} grid={grid} max={max} />
              ))}
            </div>
            <div className="flex items-center gap-1 mt-2 text-[11px] text-dim">
              <span>Quieter</span>
              {[0.18, 0.41, 0.65, 0.9, 1].map((f) => (
                <i key={f} className="block w-3.5 h-2 rounded-xs" style={{ background: shade(f) }} />
              ))}
              <span>Busier (max {Math.round(max).toLocaleString()})</span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
};

/**
 * Accent at increasing strength, with the busiest cells in the lighter --top.
 * The title on each cell carries the exact value.
 */
const shade = (fraction: number): string =>
  fraction > 0.92
    ? "var(--top)"
    : `color-mix(in srgb, var(--acc) ${Math.round(Math.max(0.1, fraction) * 85)}%, transparent)`;

const Row = ({ name, dow, grid, max }: { name: string; dow: number; grid: Map<string, number>; max: number }) => (
  <>
    <div className="text-[11px] text-dim">{name}</div>
    {HOURS.map((h) => {
      const v = grid.get(`${dow}-${h}`);
      return (
        <div
          key={h}
          title={v == null ? `${name} ${pad(h)}:00 – no data` : `${name} ${pad(h)}:00 – avg ${Math.round(v).toLocaleString()}`}
          className="h-[17px] rounded-xs bg-surf2"
          style={v == null ? undefined : { background: shade(v / max) }}
        />
      );
    })}
  </>
);

export default NetworkActivity;
