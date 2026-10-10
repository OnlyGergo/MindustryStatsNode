import React, { useCallback, useRef, useState } from "react";
import SearchBar from "../SearchBar.tsx";
import ToggleButton from "../ToggleButton.tsx";
import SortDropdown from "../SortDropdown.tsx";
import Tooltip from "../Tooltip.tsx";
import { useDismiss } from "../../hooks/useDismiss.ts";
import type { SortCriteria, SortDirection, SortOption } from "../../hooks/useServerList.ts";
import { BROWSE_SEARCH_DEFAULTS } from "../../routes/-browseSearch.ts";

export const CollapseToggle: React.FC<{ collapsed: boolean; onClick: () => void; className?: string }> = ({ collapsed, onClick, className }) => (
  <button
    onClick={onClick}
    className={`bg-accent-muted hover:bg-accent-hover text-accent p-1 rounded transition-colors border border-accent shrink-0 ${className ?? ""}`}
    title={collapsed ? "Expand server list" : "Collapse server list"}
  >
    <svg
      className={`w-4 h-4 transform transition-transform ${collapsed ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
    </svg>
  </button>
);

interface ServerListControlsProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  isGrouped: boolean;
  onToggleGrouping: () => void;
  hideInactiveEnabled: boolean;
  onToggleHideInactive: () => void;
  sortOptions: SortOption[];
  sortCriteria: SortCriteria;
  sortDirection: SortDirection;
  onSortChange: (criteria: SortCriteria, direction?: SortDirection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ServerListControls: React.FC<ServerListControlsProps> = ({
  searchTerm,
  onSearchChange,
  isGrouped,
  onToggleGrouping,
  hideInactiveEnabled,
  onToggleHideInactive,
  sortOptions,
  sortCriteria,
  sortDirection,
  onSortChange,
  collapsed,
  onToggleCollapse,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  useDismiss(filtersRef, filtersOpen, closeFilters);

  const d = BROWSE_SEARCH_DEFAULTS;
  const activeCount =
    (isGrouped !== d.grouped ? 1 : 0) +
    (hideInactiveEnabled !== !d.inactive ? 1 : 0) +
    (sortCriteria !== d.sort || sortDirection !== d.dir ? 1 : 0);

  const groupTip = isGrouped ? "Switch to flat list view showing all servers" : "Group servers by their cluster names";
  const inactiveTip = hideInactiveEnabled ? "Show all servers including inactive ones" : "Hide servers offline for more than 7 days";

  const groupButton = (
    <ToggleButton
      isActive={isGrouped}
      onClick={onToggleGrouping}
      activeText="Ungroup"
      inactiveText="Group"
      sizeClassName="px-3 py-2 text-sm"
      className="w-full"
    />
  );
  const inactiveButton = (
    <ToggleButton
      isActive={hideInactiveEnabled}
      onClick={onToggleHideInactive}
      activeText="Show All"
      inactiveText="Hide Inactive"
      activeColor="bg-orange-500/20 hover:bg-orange-500/40 text-orange-400 border-orange-500/40"
      inactiveColor="bg-neutral-600/20 hover:bg-neutral-600/40 text-neutral-400 border-neutral-600/40"
      sizeClassName="px-3 py-2 text-sm"
      className="w-full"
    />
  );
  const sortDropdown = (
    <SortDropdown
      sortOptions={sortOptions}
      currentCriteria={sortCriteria}
      currentDirection={sortDirection}
      isGrouped={isGrouped}
      onSortChange={onSortChange}
    />
  );

  return (
    <div className="px-3 py-1.5 split:px-4 split:py-3">
      {/* Row 1: search + (mobile) filters + (desktop) collapse */}
      <div className="flex items-center gap-2 split:mb-2.5">
        <div className="flex-1 min-w-0 flex [&_input]:py-2 split:[&_input]:py-1 [&_input]:text-sm split:[&_input]:text-xs">
          <SearchBar onSearchValueChange={onSearchChange} value={searchTerm} />
        </div>

        <div className="relative split:hidden shrink-0" ref={filtersRef}>
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={filtersOpen}
            aria-label={activeCount > 0 ? `Filters (${activeCount} changed)` : "Filters"}
            onClick={() => setFiltersOpen((o) => !o)}
            className="button-secondary relative h-9 px-3 rounded text-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6h18M6 12h12M10 18h4" />
            </svg>
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] leading-4 text-center text-black font-semibold">
                {activeCount}
              </span>
            )}
          </button>

          {filtersOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 w-64 max-w-[calc(100vw-1.5rem)] p-2 space-y-2 bg-surface-secondary border border-default backdrop-blur-md rounded shadow-xl">
              {groupButton}
              {inactiveButton}
              {sortDropdown}
            </div>
          )}
        </div>

        <CollapseToggle collapsed={collapsed} onClick={onToggleCollapse} className="hidden split:flex" />
      </div>

      {/* Row 2 (desktop): three controls fit one row down to a ~373px panel (the desktop
          floor is 384px); narrower than that the row wraps and the sort
          control takes a full-width second row, rather than truncating. */}
      <div className="hidden split:flex flex-wrap items-center gap-2">
        <Tooltip content={groupTip} position="top" delay={300} className="flex-1 basis-27 min-w-0">
          {groupButton}
        </Tooltip>
        <Tooltip content={inactiveTip} position="top" delay={300} className="flex-1 basis-27 min-w-0">
          {inactiveButton}
        </Tooltip>
        <div className="flex-1 basis-27 min-w-0">{sortDropdown}</div>
      </div>
    </div>
  );
};

export default ServerListControls;
