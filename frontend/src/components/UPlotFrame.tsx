import type { RefObject } from "react";
import { LoadingSpinner } from "./LoadingSpinner.tsx";

interface UPlotFrameProps {
  outerRef: RefObject<HTMLDivElement | null>;
  mountRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
}

/**
 * The sized box useUPlot measures plus the node it mounts into; the previous
 * chart stays up, dimmed, while a new range loads. Needs a positioned parent.
 */
export const UPlotFrame = ({ outerRef, mountRef, loading }: UPlotFrameProps) => (
  <>
    <div
      ref={outerRef}
      className={`absolute inset-0 block transition-opacity duration-300 ${
        loading ? "opacity-15 pointer-events-none" : "opacity-100"
      }`}
    >
      <div ref={mountRef} className="absolute inset-0 block overflow-hidden" />
    </div>
    {loading && <LoadingSpinner />}
  </>
);
