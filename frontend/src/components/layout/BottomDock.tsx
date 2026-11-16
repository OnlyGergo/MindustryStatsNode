import React from "react";
import { Link, useMatches } from "@tanstack/react-router";
import { ServersIcon, useVisibleNavItems } from "./navItems.tsx";

const SERVER_ROUTES = new Set(["/_browse/", "/_browse/server/$serverId", "/_browse/network/$networkId"]);

/** Mobile tab bar, last flex child of the shell. Hidden at `split` and wider. */
const BottomDock: React.FC = () => {
  const items = useVisibleNavItems();
  const onServers = useMatches({ select: (m) => SERVER_ROUTES.has(m[m.length - 1]?.routeId ?? "") });

  const base = "flex-1 flex flex-col items-center gap-[3px] pt-2 pb-3 text-[11px] font-semibold transition-colors [&_svg]:w-[22px] [&_svg]:h-[22px]";
  const cls = (active: boolean) => `${base} ${active ? "text-acc" : "text-dim"}`;

  return (
    <nav
      aria-label="Primary"
      className="split:hidden shrink-0 flex bg-topbg border-t border-bd pb-[env(safe-area-inset-bottom)]"
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
          activeProps={{ className: "text-acc", "aria-current": "page" }}
          inactiveProps={{ className: "text-dim" }}
        >
          {item.icon}
          {item.dockLabel ?? item.label}
        </Link>
      ))}
    </nav>
  );
};

export default BottomDock;
