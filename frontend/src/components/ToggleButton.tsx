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
  activeColor = 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30',
  inactiveColor = 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30',
  sizeClassName = 'px-3 py-1 text-xs',
  className = ''
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${
        isActive ? activeColor : inactiveColor
      } ${sizeClassName} border rounded transition-colors backdrop-blur-sm ${className}`}
    >
      {isActive ? activeText : inactiveText}
    </button>
  );
};

export default ToggleButton;
