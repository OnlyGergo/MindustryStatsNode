import { RefObject, useEffect } from "react";

/**
 * While `isOpen`, calls `onClose` on a mousedown outside `ref` or on Escape.
 */
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, isOpen, onClose]);
};
