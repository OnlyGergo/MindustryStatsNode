import React, { useState, useRef, useEffect } from 'react';
import { SortCriteria, SortDirection, SortOption } from '../hooks/useServerList';

interface SortDropdownProps {
  sortOptions: SortOption[];
  currentCriteria: SortCriteria;
  currentDirection: SortDirection;
  onSortChange: (criteria: SortCriteria, direction?: SortDirection) => void;
}

const SortDropdown: React.FC<SortDropdownProps> = ({
  sortOptions,
  currentCriteria,
  currentDirection,
  onSortChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = sortOptions.find(option => option.key === currentCriteria);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 border border-slate-600/50 px-3 py-1 rounded-lg text-xs transition-colors backdrop-blur-sm flex items-center space-x-2 min-w-0"
      >
        <span className="truncate">
          Sort: {currentOption?.label}
        </span>
        <div className="flex items-center space-x-1">
          <svg
            className={`w-3 h-3 transition-colors ${
              currentDirection === 'asc' ? 'text-cyan-400' : 'text-gray-500'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
          <svg
            className={`w-3 h-3 transition-colors ${
              currentDirection === 'desc' ? 'text-cyan-400' : 'text-gray-500'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-lg shadow-xl z-50">
          {sortOptions.map((option) => (
            <div key={option.key} className="border-b border-slate-700/50 last:border-b-0">
              <div
                className="px-3 py-2 hover:bg-slate-700/50 cursor-pointer transition-colors"
                onClick={() => {
                  onSortChange(option.key);
                  setIsOpen(true);
                }}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${
                    option.key === currentCriteria ? 'text-cyan-400 font-medium' : 'text-gray-300'
                  }`}>
                    {option.label}
                  </span>
                  {option.key === currentCriteria && (
                    <svg
                      className={`w-4 h-4 text-cyan-400 transform ${
                        currentDirection === 'desc' ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  )}
                </div>
              </div>
              {option.key === currentCriteria && (
                <div className="px-3 pb-2">
                  <div className="flex space-x-2">
                    <button
                      className={`text-xs px-2 py-1 rounded ${
                        currentDirection === 'asc'
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-slate-700/50 text-gray-400 hover:bg-slate-600/50'
                      } transition-colors`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSortChange(option.key, 'asc');
                        setIsOpen(false);
                      }}
                    >
                      Ascending
                    </button>
                    <button
                      className={`text-xs px-2 py-1 rounded ${
                        currentDirection === 'desc'
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-slate-700/50 text-gray-400 hover:bg-slate-600/50'
                      } transition-colors`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSortChange(option.key, 'desc');
                        setIsOpen(false);
                      }}
                    >
                      Descending
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SortDropdown;
