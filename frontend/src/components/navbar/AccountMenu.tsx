import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext.tsx";

const DiscordGlyph: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.128c-.598.35-1.22.647-1.873.892a.076.076 0 0 0-.04.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" />
  </svg>
);

/**
 * Right-hand-side account control for the navbar: a "Log in with Discord" link
 * while logged out, or an avatar with a dropdown menu while logged in. Renders
 * nothing while the initial /me fetch is in flight, to avoid a layout jump.
 */
const AccountMenu: React.FC = () => {
  const { me, loading, logout, loginHref } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  if (loading) {
    // Reserve a small fixed-width slot so nothing shifts once the fetch resolves.
    return <div className="w-8 h-8 shrink-0" aria-hidden="true" />;
  }

  if (!me) {
    return (
      <a
        href={loginHref}
        className="button-secondary flex items-center gap-1.5 text-sm font-medium px-3 py-2 shrink-0"
      >
        <DiscordGlyph />
        <span className="hidden sm:inline">Log in with Discord</span>
        <span className="sm:hidden">Log in</span>
      </a>
    );
  }

  const displayName = me.globalName ?? me.username;

  return (
    <div className="relative shrink-0" ref={menuRef} onKeyDown={handleEscape}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={displayName}
        onClick={() => setIsOpen(!isOpen)}
        className="block rounded-full border border-default hover:border-accent transition-colors"
      >
        <img
          src={me.avatarUrl}
          alt=""
          width={28}
          height={28}
          className="rounded-full"
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 z-50 w-48 max-w-[calc(100vw-2rem)] bg-surface-secondary border border-default backdrop-blur-md rounded shadow-xl overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-subtle">
            <span className="text-sm font-medium text-primary truncate block">{displayName}</span>
          </div>

          {me.isAdmin && (
            <a
              href="/admin"
              role="menuitem"
              className="block w-full text-left px-3 py-2 text-sm text-secondary hover:bg-accent-hover hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Admin
            </a>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-accent-hover hover:text-primary transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
