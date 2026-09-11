"use client";

import { type ReactNode, useEffect } from "react";
import gsap from "gsap";
import { parkVeil } from "@/components/TransitionLink";

/**
 * Remounts on every route change. If a TransitionLink left the wipe panel
 * over the viewport, slide it off to reveal the incoming page, then park
 * it below the viewport for the next navigation.
 *
 * Handles "clearing" as well as "covering": when two navigations land
 * close together, the first template's cleanup kills its slide half way,
 * and the second mount has to finish the job or the panel stays over half
 * the page with nothing left to move it.
 */
export default function Template({ children }: { children: ReactNode }) {
  useEffect(() => {
    const veil = document.getElementById("page-veil");
    if (!veil) return undefined;
    const { state } = veil.dataset;
    if (state !== "covering" && state !== "clearing") return undefined;

    // TransitionLink never wipes for a reduced-motion visitor, so this only
    // fires if the preference flipped mid-flight. Clear it without motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.killTweensOf(veil);
      parkVeil(veil);
      return undefined;
    }

    veil.dataset.state = "clearing";
    gsap.killTweensOf(veil);
    const tween = gsap.to(veil, {
      // The pause lets the incoming page paint under the panel before it
      // moves, so the first thing the slide shows is the page and not a
      // frame of the old one. Not needed when resuming a half-done slide.
      delay: state === "covering" ? 0.08 : 0,
      duration: 0.45,
      ease: "power3.inOut",
      onComplete: () => parkVeil(veil),
      yPercent: -101,
    });

    return () => {
      tween.kill();
    };
  }, []);

  return children;
}
