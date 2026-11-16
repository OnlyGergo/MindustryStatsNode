import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import AccountMenu from "../navbar/AccountMenu.tsx";
import NavMenu from "./NavMenu.tsx";
import BackButton from "./BackButton.tsx";
import { usePageChrome } from "./usePageChrome.ts";
import { VERSION } from "../../../../common/version.ts";
import TowerLogo from "./TowerLogo.tsx";

/**
 * App-wide top bar. Hosts the brand (or Back button on mobile detail pages),
 * the page title (mobile), page navigation (desktop) and the account menu. Everything
 * responsive is CSS (`split:` variants), so SSR and client render the same.
 */
const TopBar: React.FC = () => {
  const { title, back } = usePageChrome();
  const [logoActive, setLogoActive] = useState(false);
  const logoHandlers = {
    onMouseEnter: () => setLogoActive(true),
    onMouseLeave: () => setLogoActive(false),
    onFocus: () => setLogoActive(true),
    onBlur: () => setLogoActive(false),
  };

  // `relative z-40` lifts the bar (and the AccountMenu dropdown overflowing it)
  // above the content row: backdrop-blur makes this bar its own stacking
  // context, which would otherwise paint beneath the later, positioned
  // MasterPanel / DetailShell siblings.
  return (
    <div className="relative z-40 bg-linear-to-r from-surf/60 to-surf/40 backdrop-blur-md border-b border-bd shrink-0 flex flex-col">
      <div className="h-11 split:h-12 px-3 split:px-4 flex items-center justify-between gap-2 split:gap-3 bg-surf">
        <Link to="/" className="hidden split:flex items-center gap-2.5 min-w-0" {...logoHandlers}>
          <TowerLogo active={logoActive} className="w-8 h-8 shrink-0" />
          <h1 className="text-base font-bold text-tx leading-none whitespace-nowrap">
            Mindustry <span className="text-acc">Tracker</span>
          </h1>
          <span className="text-xs text-dim">{VERSION}</span>
        </Link>

        <div className="split:hidden flex items-center min-w-0 flex-1 gap-3">
          {back ? (
            <BackButton />
          ) : (
            <Link to="/" aria-label="Home" className="flex items-center shrink-0">
              <TowerLogo className="w-4 h-4" />
            </Link>
          )}
          <h1 className="text-base font-semibold text-tx truncate flex-1 min-w-0">{title}</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <NavMenu />
          <AccountMenu />
        </div>
      </div>
    </div>
  );
};

export default TopBar;
