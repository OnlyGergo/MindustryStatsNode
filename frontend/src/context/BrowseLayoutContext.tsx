import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useResponsive } from "../hooks/useResponsive";

interface BrowseLayoutContextValue {
  isMasterPanelCollapsed: boolean;
  showMasterPanel: boolean;
  isMobile: boolean;
  expandedGroups: Set<string>;
  toggleGroupExpanded: (groupName: string) => void;
  handleToggleCollapse: () => void;
}

const BrowseLayoutContext = createContext<BrowseLayoutContextValue | null>(null);

export const useBrowseLayout = (): BrowseLayoutContextValue => {
  const ctx = useContext(BrowseLayoutContext);
  if (!ctx) {
    throw new Error("useBrowseLayout must be used within a BrowseLayoutProvider");
  }
  return ctx;
};

export const BrowseLayoutProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isMasterPanelCollapsed, setIsMasterPanelCollapsed] =
    useState<boolean>(false);
  const [showMasterPanel, setShowMasterPanel] = useState<boolean>(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { isMobile } = useResponsive();
  const navigate = useNavigate();

  // Mark as hydrated to ensure SSR/client match
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // On mobile, only the home route ('/') shows the master list.
  // Only update after hydration to avoid SSR mismatch
  useEffect(() => {
    if (!isHydrated) return;
    if (isMobile) {
      setShowMasterPanel(pathname === "/");
      setIsMasterPanelCollapsed(false);
    }
  }, [isMobile, pathname, isHydrated]);

  const toggleGroupExpanded = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (!newExpanded.has(groupName)) {
      newExpanded.add(groupName);
    } else {
      newExpanded.delete(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const handleToggleCollapse = () => {
    if (isMobile) {
      // navigate to index so they can click any link
      navigate({ to: "/" });
      setShowMasterPanel(!showMasterPanel);
    } else {
      setIsMasterPanelCollapsed(!isMasterPanelCollapsed);
    }
  };

  const value: BrowseLayoutContextValue = {
    isMasterPanelCollapsed,
    showMasterPanel,
    isMobile,
    expandedGroups,
    toggleGroupExpanded,
    handleToggleCollapse,
  };

  return (
    <BrowseLayoutContext.Provider value={value}>
      {children}
    </BrowseLayoutContext.Provider>
  );
};
