import React, {useEffect, useRef, useState} from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 500,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const showWithDelay = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      // Small delay to ensure visibility state is set before showing
      setTimeout(() => setShowTooltip(true), 10);
    }, delay);
  };

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
    setTimeout(() => setIsVisible(false), 150); // Match transition duration
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getPositionClasses = () => {
    const baseClasses = 'absolute z-50 px-2 py-1 text-xs rounded-lg pointer-events-none w-max max-w-full';
    const backgroundClasses = 'bg-neutral-900/95 backdrop-blur-md border border-neutral-600/50 text-gray-200 shadow-xl';
    const transitionClasses = `transition-all duration-150 ${showTooltip ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`;

    switch (position) {
      case 'top':
        return `${baseClasses} ${backgroundClasses} ${transitionClasses} bottom-full left-1/2 transform -translate-x-1/2 mb-2`;
      case 'bottom':
        return `${baseClasses} ${backgroundClasses} ${transitionClasses} top-full left-1/2 transform -translate-x-1/2 mt-2`;
      case 'left':
        return `${baseClasses} ${backgroundClasses} ${transitionClasses} right-full top-1/2 transform -translate-y-1/2 mr-2`;
      case 'right':
        return `${baseClasses} ${backgroundClasses} ${transitionClasses} left-full top-1/2 transform -translate-y-1/2 ml-2`;
      default:
        return `${baseClasses} ${backgroundClasses} ${transitionClasses} bottom-full left-1/2 transform -translate-x-1/2 mb-2`;
    }
  };

  const getArrowClasses = () => {
    const baseArrow = 'absolute w-2 h-2 bg-neutral-900/95 border border-neutral-600/50 transform rotate-45';

    switch (position) {
      case 'top':
        return `${baseArrow} top-full left-1/2 -translate-x-1/2 -translate-y-1/2 border-t-0 border-l-0`;
      case 'bottom':
        return `${baseArrow} bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 border-b-0 border-r-0`;
      case 'left':
        return `${baseArrow} left-full top-1/2 -translate-y-1/2 -translate-x-1/2 border-l-0 border-b-0`;
      case 'right':
        return `${baseArrow} right-full top-1/2 -translate-y-1/2 translate-x-1/2 border-r-0 border-t-0`;
      default:
        return `${baseArrow} top-full left-1/2 -translate-x-1/2 -translate-y-1/2 border-t-0 border-l-0`;
    }
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={showWithDelay}
      onMouseLeave={hide}
      onFocus={showWithDelay}
      onBlur={hide}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={getPositionClasses()}
          role="tooltip"
        >
          {content}
          <div className={getArrowClasses()}></div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;
