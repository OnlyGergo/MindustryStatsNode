import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

interface BrowseLayoutContextValue {
  /** Desktop-only (split+) collapse of the list into a rail; below split the list is never hidden by it. */
  isMasterPanelCollapsed: boolean;
  expandedGroups: Set<string>;
  toggleGroupExpanded: (groupName: string) => void;
  handleToggleCollapse: () => void;
}

const COLLAPSE_KEY = "browse.listCollapsed";

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
  // SSR and first client render are always expanded; the stored value is applied after hydration.
  const [isMasterPanelCollapsed, setIsMasterPanelCollapsed] = useState<boolean>(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setIsMasterPanelCollapsed(true);
    } catch {
      // storage blocked: stay expanded
    }
  }, []);

  const toggleGroupExpanded = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (!newExpanded.has(groupName)) {
      newExpanded.add(groupName);
    } else {
      newExpanded.delete(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const handleToggleCollapse = useCallback(() => {
    setIsMasterPanelCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value: BrowseLayoutContextValue = {
    isMasterPanelCollapsed,
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
