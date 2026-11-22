import React from "react";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
  className?: string;
}

/** Joined toggle buttons for one choice (time windows, views, sort). */
export function Segmented<T extends string | number>({ options, value, onChange, className = "", ...rest }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={rest["aria-label"]} className={`seg ${className}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="seg-btn"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
