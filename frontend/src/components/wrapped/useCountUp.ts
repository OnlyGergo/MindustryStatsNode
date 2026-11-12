import { useEffect, useState } from "react";

/** Counts 0 -> target over `ms` (ease-out). Starts at 0 on server and first client render so hydration matches. */
export function useCountUp(target: number, ms = 1600, instant = false): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (instant || ms <= 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, instant]);
  return value;
}
