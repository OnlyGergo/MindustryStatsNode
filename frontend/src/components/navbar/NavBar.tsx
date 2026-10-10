import React from "react";
import {Link, useNavigate, useRouterState} from "@tanstack/react-router";
import AccountMenu from "./AccountMenu.tsx";
import { usePageTitle } from "../../context/PageTitleContext.tsx";
import { useResponsive } from "../../hooks/useResponsive.ts";
import { VERSION } from "../../../../common/version.ts";
import Icon from "../../../public/favicon.svg?react";

const BrandMark: React.FC = () => (
  <span className="flex items-center">
    <Icon className="w-4 h-4 shrink-0"/>
  </span>
);

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="button-secondary p-2 mr-3 shrink-0">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  </button>
);

const NavLink: React.FC<{
    to: string;
    active: boolean;
    children: React.ReactNode;
    icon?: React.ReactNode;
}> = ({ to, active, children, icon }) => (
    <Link
        to={to}
        className={`flex items-center gap-1.5 text-sm font-medium py-2 px-1 border-b-2 transition-colors ${
            active
                ? "text-accent border-accent"
                : "text-secondary border-transparent hover:text-accent hover:border-accent/50"
        }`}
    >
        {icon}
        {children}
    </Link>
);

/**
 * App-wide top navigation bar. Hosts the brand, navigation to the stats
 * pages and the account menu. It lives outside the `_browse` layout, so it
 * has no access to the server list. On mobile, while a detail page is open
 * (any path other than "/"), it collapses down to a back-button + page-title
 * bar instead.
 */
const NavBar: React.FC = () => {
  const { pageTitle } = usePageTitle();
  const { isMobile } = useResponsive();
  const navigate = useNavigate();

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isMobileDetailView = isMobile && pathname !== "/";

  if (isMobileDetailView) {
    return (
      <div className="bg-surface-primary backdrop-blur-md border-b border-default h-14 px-4 flex items-center shrink-0">
        <BackButton onClick={() => navigate({ to: "/" })} />
        <h2 className="text-lg font-semibold text-primary truncate">{pageTitle}</h2>
      </div>
    );
  }

  const navLinks = (
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <NavLink
              to="/inactive"
              active={pathname === "/inactive"}
          >
              Inactive Servers
          </NavLink>

          <NavLink
              to="/global"
              active={pathname === "/global"}
              icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                  </svg>
              }
          >
              Global
          </NavLink>
      <AccountMenu />
    </div>
  );

  // `relative z-40` lifts the bar (and the AccountMenu dropdown overflowing it)
  // above the content row: backdrop-blur makes this bar its own stacking
  // context, which would otherwise paint beneath the later, positioned
  // MasterPanel / DetailShell siblings.
  return (
    <div className="relative z-40 bg-linear-to-r from-surface-primary/60 to-surface-primary/40 backdrop-blur-md border-b border-default shrink-0 flex flex-col">
      <div className="h-14 px-4 flex items-center justify-between gap-3 bg-surface-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark />
          {!isMobile && (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base font-bold text-primary leading-none whitespace-nowrap">
                Mindustry <span className="text-accent">Tracker</span>
              </h1>
              <span className="text-xs text-secondary">{VERSION}</span>
            </div>
          )}
        </div>

        {navLinks}
      </div>
    </div>
  );
};

export default NavBar;
export { BrandMark };
