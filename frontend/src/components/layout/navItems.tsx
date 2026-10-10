import React from "react";
import { useAuth } from "../../context/AuthContext.tsx";
import { AuthMe } from "../../../../common/models/auth";

export interface NavItem {
  to: "/inactive" | "/global";
  label: string;
  icon?: React.ReactNode;
  /** Hidden when this returns false. Always shown when omitted. */
  visible?: (me: AuthMe | null) => boolean;
}

export const navItems: NavItem[] = [
  { to: "/inactive", label: "Inactive Servers" },
  {
    to: "/global",
    label: "Global",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
];

export const useVisibleNavItems = (): NavItem[] => {
  const { me } = useAuth();
  return navItems.filter((item) => !item.visible || item.visible(me));
};
