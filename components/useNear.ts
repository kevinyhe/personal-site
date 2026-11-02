"use client";

import { type RefObject, useEffect, useState } from "react";

/** How near, as an IntersectionObserver rootMargin: two screens either
 *  side of the one on show. */
export const NEAR = "200% 0px";

/**
 * True once `ref`'s element has come within NEAR of the screen, and from
 * then on. The sections far down the page (Skills' robot, Contact's
 * pictures, the end page) start their pictures, canvases and videos as
 * the reader gets near them, not with the page: at the first load they
 * were 1.5 MB and about a second of a phone's main thread, five screens
 * from anything on show.
 */
export function useNear(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return undefined;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        setNear(true);
      },
      { rootMargin: NEAR },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [ref, near]);
  return near;
}
