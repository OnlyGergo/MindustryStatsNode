import React from 'react';

interface ToggleButtonProps {
  isActive: boolean;
  onClick: () => void;
  activeText: string;
  inactiveText: string;
  activeColor?: string;
  inactiveColor?: string;
  className?: string;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  isActive,
  onClick,
  activeText,
  inactiveText,
  activeColor = 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30',
  inactiveColor = 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border-cyan-500/30',
  className = ''
}) => {
  return (
    <button
      onClick={onClick}
      className={`${
        isActive ? activeColor : inactiveColor
      } border px-3 py-1 rounded-lg text-xs transition-colors backdrop-blur-sm ${className}`}
    >
      {isActive ? activeText : inactiveText}
    </button>
  );
};

export default ToggleButton;
