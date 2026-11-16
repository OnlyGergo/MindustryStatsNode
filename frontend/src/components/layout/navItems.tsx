import React from "react";
import { useAuth } from "../../context/AuthContext.tsx";
import { AuthMe } from "../../../../common/models/auth";

export interface NavItem {
  to: "/inactive" | "/global" | "/leaderboard" | "/admin";
  label: string;
  /** Shorter label for the mobile dock. */
  dockLabel?: string;
  icon?: React.ReactNode;
  /** Hidden when this returns false. Always shown when omitted. */
  visible?: (me: AuthMe | null) => boolean;
}

/** Line icons from the theme preview: 24px grid, 1.8 stroke, currentColor. */
const Ico: React.FC<{ d: React.ReactNode }> = ({ d }) => (
  <svg
    className="w-4 h-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

export const ServersIcon: React.FC = () => (
  <Ico
    d={
      <>
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 7h.01M7 17h.01" />
      </>
    }
  />
);

export const navItems: NavItem[] = [
  {
    to: "/inactive",
    label: "Inactive servers",
    dockLabel: "Inactive",
    icon: <Ico d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
  },
  {
    to: "/global",
    label: "Global",
    icon: <Ico d={<path d="M5 20v-8M12 20V4M19 20v-5" />} />,
  },
  {
    to: "/leaderboard",
    label: "Leaderboard",
    dockLabel: "Top",
    icon: <Ico d={<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M9 20h6" />} />,
  },
  {
    to: "/admin",
    label: "Admin",
    visible: (me) => !!me?.isAdmin,
    icon: <Ico d={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />} />,
  },
];

export const useVisibleNavItems = (): NavItem[] => {
  const { me } = useAuth();
  return navItems.filter((item) => !item.visible || item.visible(me));
};
