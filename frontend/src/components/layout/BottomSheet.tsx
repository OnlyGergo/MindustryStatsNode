import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
}

const CLOSE_DISTANCE = 80;
const CLOSE_VELOCITY = 0.6; // px per ms

/**
 * Mobile bottom sheet: dimmed backdrop, grab handle, drag-down to close,
 * Escape to close. Portalled to `document.body` because the top bar's
 * backdrop-blur would otherwise be the containing block for `fixed`. Renders
 * nothing while closed, so SSR never touches `document`.
 */
const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, label, children }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startT: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [entered, setEntered] = useState(false);

  // Slide-up: mount offscreen, then flip on the next frame.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      setOffset(0);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Focus into the sheet on open, back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startT: e.timeStamp, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(Math.max(0, e.clientY - drag.current.startY));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      setDragging(false);
      const dy = Math.max(0, e.clientY - d.startY);
      const velocity = dy / Math.max(1, e.timeStamp - d.startT);
      if (e.type !== "pointercancel" && (dy > CLOSE_DISTANCE || (dy > 20 && velocity > CLOSE_VELOCITY))) {
        onClose();
      } else {
        setOffset(0);
      }
    },
    [onClose],
  );

  if (!open) return null;

  const translate = entered ? offset : null;

  return createPortal(
    <div className="fixed inset-0 z-50 split:hidden">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ transform: translate === null ? "translateY(100%)" : `translateY(${translate}px)` }}
        className={`absolute inset-x-0 bottom-0 max-h-[85dvh] flex flex-col rounded-t-2xl bg-surface-secondary backdrop-blur-md border-t border-default shadow-2xl outline-none pb-[env(safe-area-inset-bottom)] ${
          dragging ? "" : "transition-transform duration-250 ease-out motion-reduce:transition-none"
        }`}
      >
        <div
          className="shrink-0 pt-2.5 pb-3 flex justify-center touch-none cursor-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="h-1 w-10 rounded-full bg-text-tertiary/60" />
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export default BottomSheet;
