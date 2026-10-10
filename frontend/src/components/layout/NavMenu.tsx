import React from "react";
import { Link } from "@tanstack/react-router";
import { useVisibleNavItems } from "./navItems.tsx";

/** Desktop page navigation: inline links, shown at `split` and wider. Mobile uses BottomDock. */
const NavMenu: React.FC = () => {
  const items = useVisibleNavItems();

  return (
    <nav className="hidden split:flex items-center gap-2 sm:gap-3 shrink-0">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="flex items-center gap-1.5 text-sm font-medium py-2 px-1 border-b-2 transition-colors"
          activeProps={{ className: "text-accent border-accent" }}
          inactiveProps={{
            className: "text-secondary border-transparent hover:text-accent hover:border-accent/50",
          }}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
};

export default NavMenu;
