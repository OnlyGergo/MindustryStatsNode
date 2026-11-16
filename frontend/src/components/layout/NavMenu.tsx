import React from "react";
import { Link } from "@tanstack/react-router";
import { useVisibleNavItems } from "./navItems.tsx";

/** Desktop page navigation: inline links, shown at `split` and wider. Mobile uses BottomDock. */
const NavMenu: React.FC = () => {
  const items = useVisibleNavItems();

  return (
    <nav aria-label="Pages" className="hidden split:flex items-center gap-0.5 mr-2 shrink-0">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="px-2.5 py-1 rounded-ui text-xs font-semibold transition-colors"
          activeProps={{ className: "text-tx bg-surf2 shadow-[inset_0_-2px_0_var(--acc)]", "aria-current": "page" }}
          inactiveProps={{ className: "text-dim hover:text-tx" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};

export default NavMenu;
