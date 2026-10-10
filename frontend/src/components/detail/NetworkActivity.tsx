import { useMemo, useState } from "react";
import { NetworkActivityCell } from "../../../../common/models/networkAnalytics.ts";
import { useNetworkActivity } from "../../hooks/api/useNetworkAnalytics.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";

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
  const { data, loading, error } = useNetworkActivity(networkId, days);

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
    <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-primary">When it's busy</h2>
          <p className="text-xs text-tertiary">Average players by weekday and hour, in {tz}</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Activity window">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`px-3 py-1 text-sm ${days === d ? "button-accent" : "button-secondary"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-24">
        {loading && <LoadingSpinner showText={false} />}
        {error && <p className="text-sm text-status-offline">{error}</p>}
        {!loading && !error && max === 0 && <p className="text-sm text-tertiary">No activity data for this window.</p>}

        {!error && max > 0 && (
          <div className={`overflow-x-auto ${loading ? "opacity-30" : ""}`}>
            <div className="min-w-[34rem]">
              <div className="grid gap-px" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}>
                <div />
                {HOURS.map((h) => (
                  <div key={h} className="text-[10px] text-tertiary text-center">
                    {h % 3 === 0 ? pad(h) : ""}
                  </div>
                ))}
                {WEEKDAYS.map((name, i) => (
                  <Row key={name} name={name} dow={i + 1} grid={grid} max={max} />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-tertiary">
                <span>Quieter</span>
                {[0.1, 0.3, 0.5, 0.75, 1].map((f) => (
                  <span key={f} className="inline-block w-5 h-3 rounded-sm border border-subtle" style={{ background: shade(f) }} />
                ))}
                <span>Busier (max {Math.round(max).toLocaleString()})</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Accent at increasing strength; the title on each cell carries the exact value. */
const shade = (fraction: number): string =>
  `color-mix(in srgb, var(--color-accent) ${Math.round(8 + fraction * 92)}%, transparent)`;

const Row = ({ name, dow, grid, max }: { name: string; dow: number; grid: Map<string, number>; max: number }) => (
  <>
    <div className="text-xs text-tertiary pr-1 flex items-center">{name}</div>
    {HOURS.map((h) => {
      const v = grid.get(`${dow}-${h}`);
      return (
        <div
          key={h}
          title={v == null ? `${name} ${pad(h)}:00 – no data` : `${name} ${pad(h)}:00 – avg ${Math.round(v).toLocaleString()}`}
          className="h-5 sm:h-6 rounded-sm bg-surface-tertiary"
          style={v == null ? undefined : { background: shade(v / max) }}
        />
      );
    })}
  </>
);

export default NetworkActivity;
