import React, { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { ServerGroupEntry } from "../../hooks/useServerList.ts";
import { ServerListItem } from "../../../../common/models/serverData.ts";

/** How many servers the SSR page renders before the client has the full list. */
export const SSR_LIST_LIMIT = 50;

/** The first `limit` servers; whole groups, so a group's counts stay true. */
export const topOfList = (
  groups: ServerGroupEntry[],
  flat: ServerListItem[],
  limit: number = SSR_LIST_LIMIT,
): { groups: ServerGroupEntry[]; flat: ServerListItem[] } => {
  const top: ServerGroupEntry[] = [];
  let count = 0;
  for (const group of groups) {
    if (count >= limit) break;
    top.push(group);
    count += group.servers.length;
  }
  return { groups: top, flat: flat.slice(0, limit) };
};

/**
 * Hides what doesn't match `term`, over the markup alone (the page has no list
 * data yet). Matches like useServerList's search: the network name, the
 * address, and the text the item shows.
 */
const filterMarkup = (root: HTMLElement, term: string) => {
  const needle = term.trim().toLowerCase();
  root.querySelectorAll<HTMLElement>("[data-server]").forEach((item) => {
    const network = item.closest<HTMLElement>("[data-group]")?.dataset.group ?? item.dataset.network ?? "";
    const match = !needle
      || network.toLowerCase().includes(needle)
      || (item.dataset.server ?? "").includes(needle)
      || (item.textContent ?? "").toLowerCase().includes(needle);
    item.style.display = match ? "" : "none";
  });
  root.querySelectorAll<HTMLElement>("[data-group]").forEach((group) => {
    const anyShown = Array.from(group.querySelectorAll<HTMLElement>("[data-server]"))
      .some((item) => item.style.display !== "none");
    group.style.display = anyShown ? "" : "none";
  });
};

/**
 * The SSR top of the server list, as markup only. The server renders
 * `children`; the client renders an empty innerHTML placeholder, which React
 * neither hydrates nor touches (the same `__html` is never re-applied), so the
 * server's markup stays until the full list replaces this component. Until
 * then links navigate client-side through the router and search filters the
 * markup in place.
 */
const StaticServerList: React.FC<{ searchTerm: string; children?: React.ReactNode }> = ({
  searchTerm,
  children,
}) => {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) filterMarkup(ref.current, searchTerm);
  }, [searchTerm]);

  if (typeof window === "undefined") {
    return <div className="space-y-1.5">{children}</div>;
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin) return;
    e.preventDefault();
    void router.navigate({ href: url.pathname + url.search });
  };

  return (
    <div
      ref={ref}
      className="space-y-1.5"
      onClick={onClick}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: "" }}
    />
  );
};

export default StaticServerList;
