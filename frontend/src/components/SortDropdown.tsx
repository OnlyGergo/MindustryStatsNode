import React, {useEffect, useRef, useState} from 'react';
import {SortCriteria, SortDirection, SortOption} from '../hooks/useServerList';

interface SortDropdownProps {
  sortOptions: SortOption[];
  currentCriteria: SortCriteria;
  currentDirection: SortDirection;
  /** true when the list is grouped by network — changes which hint is shown */
  isGrouped: boolean;
  onSortChange: (criteria: SortCriteria, direction?: SortDirection) => void;
}

const SortDropdown: React.FC<SortDropdownProps> = ({
  sortOptions,
  currentCriteria,
  currentDirection,
  isGrouped,
  onSortChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleEscape = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const currentOption = sortOptions.find(option => option.key === currentCriteria);

  const selectOption = (key: SortCriteria) => {
    onSortChange(key);
    setIsOpen(false);
  };

  const selectDirection = (direction: SortDirection) => {
    onSortChange(currentCriteria, direction);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleEscape}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={`Sort by ${currentOption?.label} — ${currentOption?.directionLabels[currentDirection]}`}
        aria-label={`Sort by ${currentOption?.label} — ${currentOption?.directionLabels[currentDirection]}`}
        onClick={() => setIsOpen(!isOpen)}
        className="button-secondary w-full px-3 py-2 rounded text-sm flex items-center justify-center gap-1.5 min-w-0"
      >
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h10M3 12h6M3 17h3M17 3v14m0 0l-4-4m4 4l4-4" />
        </svg>
        <span className="truncate">{currentOption?.label}</span>
        <svg
          className={`w-3 h-3 shrink-0 text-accent transition-transform ${
            currentDirection === 'asc' ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 z-50 w-64 max-w-[calc(100vw-2rem)] bg-surface-secondary border border-default backdrop-blur-md rounded shadow-xl"
        >
          <div className="text-xs text-tertiary uppercase tracking-wide px-3 pt-2 pb-1">
            {isGrouped ? 'Sort networks by' : 'Sort servers by'}
          </div>

          {sortOptions.map((option) => {
            const isSelected = option.key === currentCriteria;
            return (
              <button
                key={option.key}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => selectOption(option.key)}
                className="w-full text-left px-3 py-2 hover:bg-accent-hover transition-colors"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className={`text-sm ${isSelected ? 'text-accent font-medium' : 'text-secondary'}`}>
                    {option.label}
                  </span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="text-xs text-tertiary mt-0.5">
                  {isGrouped ? option.groupHint : option.serverHint}
                </div>
              </button>
            );
          })}

          {currentOption && (
            <div className="flex gap-2 p-2 border-t border-subtle">
              <button
                type="button"
                onClick={() => selectDirection('asc')}
                className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${
                  currentDirection === 'asc' ? 'button-accent' : 'button-secondary'
                }`}
              >
                {currentOption.directionLabels.asc}
              </button>
              <button
                type="button"
                onClick={() => selectDirection('desc')}
                className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${
                  currentDirection === 'desc' ? 'button-accent' : 'button-secondary'
                }`}
              >
                {currentOption.directionLabels.desc}
              </button>
            </div>
          )}

          <div className="text-xs text-tertiary px-3 py-2 border-t border-subtle">
            Online servers are always listed first.
            {isGrouped && ' Servers inside a network follow the same order.'}
          </div>
        </div>
      )}
    </div>
  );
};

export default SortDropdown;
