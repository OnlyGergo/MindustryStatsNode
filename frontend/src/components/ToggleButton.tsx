import React from 'react';

interface ToggleButtonProps {
  isActive: boolean;
  onClick: () => void;
  activeText: string;
  inactiveText: string;
  activeColor?: string;
  inactiveColor?: string;
  /** Padding/typography, replaced rather than merged so it can't lose a
   * specificity tie against the defaults below. */
  sizeClassName?: string;
  className?: string;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  isActive,
  onClick,
  activeText,
  inactiveText,
  activeColor = 'bg-good/20 hover:bg-good/30 text-good border-good/30',
  inactiveColor = 'bg-acc/20 hover:bg-acc/30 text-acc border-acc/30',
  sizeClassName = 'px-3 py-1 text-xs',
  className = ''
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${
        isActive ? activeColor : inactiveColor
      } ${sizeClassName} border rounded transition-colors ${className}`}
    >
      {isActive ? activeText : inactiveText}
    </button>
  );
};

export default ToggleButton;
