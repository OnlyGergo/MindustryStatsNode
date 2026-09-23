import React, { useState } from "react";

const STAR_PATH =
  "M12 2l2.9 6.26L22 9.27l-5.5 4.86L18.2 21 12 17.27 5.8 21l1.7-6.87L2 9.27l7.1-1.01z";

const StarIcon: React.FC<{ filled: boolean; size: number }> = ({ filled, size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={filled ? "text-accent" : "text-tertiary"}
  >
    <path d={STAR_PATH} />
  </svg>
);

interface StarRatingDisplayProps {
  /** May be fractional (e.g. 4.3) -- rendered as a clipped partial star. */
  value: number;
  size?: number;
  className?: string;
}

/** Read-only stars for an average rating. Partial stars are a filled row clipped to `value/5`, laid over an empty row. */
export const StarRatingDisplay: React.FC<StarRatingDisplayProps> = ({ value, size = 16, className = "" }) => {
  const clamped = Math.max(0, Math.min(5, value));
  const percent = (clamped / 5) * 100;

  return (
    <span
      role="img"
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
      className={`relative inline-block leading-none shrink-0 ${className}`}
      style={{ width: size * 5, height: size }}
    >
      <span className="absolute inset-0 flex" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} filled={false} size={size} />)}
      </span>
      <span
        className="absolute inset-0 flex overflow-hidden"
        style={{ width: `${percent}%` }}
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} filled size={size} />)}
      </span>
    </span>
  );
};

interface StarRatingInputProps {
  /** 0 = nothing selected yet. */
  value: number;
  onChange: (value: number) => void;
  size?: number;
  disabled?: boolean;
}

/** 5-button radiogroup: click/Enter to pick, arrow keys to move, hover previews the value without committing it. */
export const StarRatingInput: React.FC<StarRatingInputProps> = ({ value, onChange, size = 28, disabled = false }) => {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, (value || 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, (value || 1) - 1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className="flex gap-1 w-fit"
      onKeyDown={handleKeyDown}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          disabled={disabled}
          // Roving tabindex: only the current (or first) star is tab-stoppable,
          // arrow keys move selection the rest of the way -- standard radiogroup behaviour.
          tabIndex={star === (value || 1) ? 0 : -1}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(star)}
          onBlur={() => setHover(null)}
          className="p-0.5 rounded disabled:cursor-not-allowed disabled:opacity-60"
        >
          <StarIcon filled={star <= shown} size={size} />
        </button>
      ))}
    </div>
  );
};
