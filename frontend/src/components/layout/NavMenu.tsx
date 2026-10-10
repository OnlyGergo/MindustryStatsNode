import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useVisibleNavItems } from "./navItems.tsx";
import { useDismiss } from "../../hooks/useDismiss.ts";
import { COMMIT, SOURCE } from "../../../../common/version.ts";

/**
 * Page navigation. At `split` and wider: inline links. Below it: a hamburger
 * button opening a dropdown sheet. Both are always rendered; CSS picks one.
 */
const NavMenu: React.FC = () => {
  const items = useVisibleNavItems();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(menuRef, isOpen, close);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const handleEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") triggerRef.current?.focus();
  };

  return (
    <>
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

      <div className="relative shrink-0 split:hidden" ref={menuRef} onKeyDown={handleEscape}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="Menu"
          onClick={() => setIsOpen(!isOpen)}
          className="button-secondary p-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {isOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 mt-1 z-50 w-56 max-w-[calc(100vw-2rem)] bg-surface-secondary border border-default backdrop-blur-md rounded shadow-xl overflow-hidden"
          >
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                onClick={close}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent-hover hover:text-primary"
                activeProps={{ className: "text-accent bg-accent-muted" }}
                inactiveProps={{ className: "text-secondary" }}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}

            <div className="px-3 py-2 border-t border-subtle text-xs text-tertiary flex items-center justify-between">
              <span>
                Commit:{" "}
                <a
                  className="hover:underline hover:text-accent"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`${SOURCE}/commit/${COMMIT}`}
                >
                  {COMMIT}
                </a>
              </span>
              <a
                href={SOURCE}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
                title="View source on GitHub"
              >
                Source
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default NavMenu;
