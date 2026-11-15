import React from "react";
import { Link } from "@tanstack/react-router";
import { MindustryText } from "../MindustryText.tsx";
import type { ServerRef } from "../../../../common/models/leaderboard.ts";
import { formatSigned } from "./format.ts";

/** ▲n / ▼n / NEW / — from rank vs previous rank (lower rank number = better). */
export const Movement: React.FC<{ rank: number; prevRank: number | null }> = ({ rank, prevRank }) => {
  if (prevRank == null) {
    return <span className="text-xs font-semibold text-accent">NEW</span>;
  }
  const diff = prevRank - rank;
  if (diff === 0) return <span className="text-tertiary">{"—"}</span>;
  return diff > 0 ? (
    <span className="text-xs text-green-400 whitespace-nowrap">{"▲"}{diff}</span>
  ) : (
    <span className="text-xs text-red-400 whitespace-nowrap">{"▼"}{-diff}</span>
  );
};

export const ServerName: React.FC<{ server: ServerRef }> = ({ server }) => (
  <div className="min-w-0">
    <Link
      to="/server/$serverId"
      params={{ serverId: String(server.id) }}
      className="text-primary hover:underline block truncate max-w-[16rem]"
    >
      {server.name ? <MindustryText text={server.name} /> : `Server #${server.id}`}
    </Link>
    {server.networkId != null && server.networkName && (
      <Link
        to="/network/$networkId"
        params={{ networkId: String(server.networkId) }}
        className="text-xs text-tertiary hover:text-accent hover:underline block truncate max-w-[16rem]"
      >
        {server.networkName}
      </Link>
    )}
  </div>
);

/** `pct` is a fraction (0.25 = +25%), as the API sends `deltaPct`. */
export const Delta: React.FC<{ delta: number; pct?: number | null }> = ({ delta, pct }) => (
  <span className={`whitespace-nowrap ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-tertiary"}`}>
    {formatSigned(delta)} h
    {pct != null && <span className="text-xs opacity-80"> ({formatSigned(pct * 100)}%)</span>}
  </span>
);

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

interface RankTableProps<T> {
  rows: T[];
  rowKey: (row: T) => string | number;
  columns: Column<T>[];
  /** Show a leading "#" rank column using this accessor. */
  rank?: (row: T, index: number) => number;
  /** Movement badge column. */
  movement?: (row: T) => { rank: number; prevRank: number | null };
}

/** Generic ranked table; scrolls inside its card on narrow screens. */
export function RankTable<T>({ rows, rowKey, columns, rank, movement }: RankTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-tertiary border-b border-subtle">
            {rank && <th className="text-left font-normal py-1 pr-2 w-8">#</th>}
            {movement && <th className="text-left font-normal py-1 pr-2 w-10" />}
            {columns.map((c) => (
              <th key={c.header} className={`font-normal py-1 px-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const m = movement?.(row);
            return (
              <tr key={rowKey(row)} className="border-b border-subtle last:border-0">
                {rank && <td className="py-1.5 pr-2 text-tertiary tabular-nums">{rank(row, i)}</td>}
                {m && (
                  <td className="py-1.5 pr-2">
                    <Movement rank={m.rank} prevRank={m.prevRank} />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={`py-1.5 px-2 tabular-nums ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const Section: React.FC<{ title: string; description: string; empty: boolean; children: React.ReactNode }> = ({
  title,
  description,
  empty,
  children,
}) => (
  <section className="bg-surface-secondary border border-subtle rounded p-3 sm:p-4 min-w-0">
    <h2 className="text-lg font-semibold text-primary">{title}</h2>
    <p className="text-xs text-tertiary mb-3">{description}</p>
    {empty ? <p className="text-sm text-tertiary">Nothing this time</p> : children}
  </section>
);

