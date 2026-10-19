import React from "react";
import { Link, useMatches } from "@tanstack/react-router";
import { ServersIcon, useVisibleNavItems } from "./navItems.tsx";

const SERVER_ROUTES = new Set(["/_browse/", "/_browse/server/$serverId", "/_browse/network/$networkId"]);

/** Mobile tab bar, last flex child of the shell. Hidden at `split` and wider. */
const BottomDock: React.FC = () => {
  const items = useVisibleNavItems();
  const onServers = useMatches({ select: (m) => SERVER_ROUTES.has(m[m.length - 1]?.routeId ?? "") });

  const base = "flex-1 min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors";
  const cls = (active: boolean) => `${base} ${active ? "text-accent" : "text-secondary"}`;

  return (
    <nav
      aria-label="Primary"
      className="split:hidden shrink-0 flex bg-linear-to-r from-surface-primary/60 to-surface-primary/40 backdrop-blur-md border-t border-default pb-[env(safe-area-inset-bottom)]"
    >
      <Link to="/" className={cls(onServers)} aria-current={onServers ? "page" : undefined}>
        <ServersIcon />
        Servers
      </Link>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={base}
          activeProps={{ className: "text-accent", "aria-current": "page" }}
          inactiveProps={{ className: "text-secondary" }}
        >
          <span className="[&_svg]:w-5 [&_svg]:h-5">{item.icon}</span>
          {item.dockLabel ?? item.label}
        </Link>
      ))}
    </nav>
  );
};

export default BottomDock;
