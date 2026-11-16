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
  activeColor = 'text-good border-bd hover:border-good',
  inactiveColor = 'text-acc border-bd hover:border-acc',
  sizeClassName = 'px-3 py-1 text-xs',
  className = ''
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${
        isActive ? activeColor : inactiveColor
      } ${sizeClassName} border rounded-ui font-semibold transition-colors cursor-pointer ${className}`}
    >
      {isActive ? activeText : inactiveText}
    </button>
  );
};

export default ToggleButton;
