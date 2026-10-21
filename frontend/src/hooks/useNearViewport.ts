import { useEffect, useRef, useState } from "react";

/** The nearest ancestor that scrolls vertically, or null for the viewport. */
function scrollParent(el: Element): Element | null {
    for (let p = el.parentElement; p; p = p.parentElement) {
        const { overflowY } = getComputedStyle(p);
        if (overflowY === "auto" || overflowY === "scroll") return p;
    }
    return null;
}

/**
 * True once the element comes within `margin` of being scrolled into view, and
 * stays true. Below-the-fold sections gate their fetch on it, so a cold page
 * view only asks the backend for what is on screen. The observer's root is the
 * nearest scrolling ancestor (detail pages scroll inside their own panel, not
 * the window), since a viewport root's margin would be clipped away by it.
 */
export function useNearViewport<T extends Element>(margin = "400px") {
    const ref = useRef<T>(null);
    const [near, setNear] = useState(false);

    useEffect(() => {
        if (near) return;
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") {
            setNear(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) setNear(true);
            },
            { root: scrollParent(el), rootMargin: margin },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [near, margin]);

    return [ref, near] as const;
}
