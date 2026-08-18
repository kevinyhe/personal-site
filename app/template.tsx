"use client";

import { type ReactNode, useEffect } from "react";
import gsap from "gsap";

/**
 * Remounts on every route change. If a TransitionLink left the wipe panel
 * covering the viewport, slide it off to reveal the incoming page, then
 * park it below the viewport for the next navigation.
 */
export default function Template({ children }: { children: ReactNode }) {
  useEffect(() => {
    const veil = document.getElementById("page-veil");
    if (!veil || veil.dataset.state !== "covering") return undefined;

    const tween = gsap.to(veil, {
      delay: 0.08,
      duration: 0.45,
      ease: "power3.inOut",
      onComplete: () => {
        gsap.set(veil, { yPercent: 101 });
        delete veil.dataset.state;
        const labelEl = document.getElementById("page-veil-label");
        if (labelEl) labelEl.textContent = "";
      },
      yPercent: -101,
    });

    return () => {
      tween.kill();
    };
  }, []);

  return children;
}
