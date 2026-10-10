import React from "react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";

export interface TabNavItem {
  to: LinkProps["to"];
  label: string;
  /** Match only this exact URL as active (use for index tabs). */
  exact?: boolean;
}

/**
 * Horizontal tab bar for a section's child routes. Scrolls sideways on narrow
 * screens rather than wrapping.
 */
export const TabNav: React.FC<{ tabs: TabNavItem[] }> = ({ tabs }) => (
  <nav className="flex gap-4 px-4 border-b border-default overflow-x-auto shrink-0">
    {tabs.map((tab) => (
      <Link
        key={tab.to}
        to={tab.to}
        activeOptions={{ exact: tab.exact }}
        className="whitespace-nowrap text-sm font-medium py-2 px-1 border-b-2 transition-colors"
        activeProps={{ className: "text-accent border-accent" }}
        inactiveProps={{
          className: "text-secondary border-transparent hover:text-accent hover:border-accent/50",
        }}
      >
        {tab.label}
      </Link>
    ))}
  </nav>
);

export default TabNav;
