"use client";

import { useEffect, useState } from "react";

/**
 * "The hero is up": the television has loaded and the tree behind it is
 * built. The heavy sections further down the page (their WebGL and bar
 * canvases, images and videos) wait for it, so they do not take the main
 * thread while the TV is loading. Measured: with them all starting at once
 * the TV model sat parsed-but-waiting for about 1.5 s.
 *
 * Pages without the hero, and a hero that never reports, carry on at once
 * or after 8 s.
 */
let up = false;
const waiting = new Set<() => void>();

export function markTvUp(): void {
  if (up) return;
  up = true;
  for (const f of waiting) f();
  waiting.clear();
}

export function useTvUp(): boolean {
  const [ok, setOk] = useState(up);
  useEffect(() => {
    if (up || !document.querySelector("[data-hero-stage]")) {
      markTvUp();
      setOk(true);
      return undefined;
    }
    const f = () => setOk(true);
    waiting.add(f);
    const failsafe = window.setTimeout(markTvUp, 8000);
    return () => {
      waiting.delete(f);
      window.clearTimeout(failsafe);
    };
  }, []);
  return ok;
}
