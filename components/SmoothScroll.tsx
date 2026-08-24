"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scrolling, after lukebaffait.fr.
 *
 * What that site does — and what this now does — is ease the PAGE's own
 * scroll position. A wheel notch does not jump the document; it adds to a
 * target that the real scroll position then glides toward over about a
 * second. Everything that reads `window.scrollY` (which here is every
 * ScrollTrigger on the page) inherits the glide for free.
 *
 * Before this, `lenis` was in package.json but wired to nothing: the only
 * smoothing on the page came from GSAP's `scrub`, which eases the SCENES
 * toward the scroll position while the scroll itself still steps. That
 * reads as the content lagging behind a jumpy page rather than as a heavy
 * page. Both together would double-smooth, so the scrub values came down
 * when this went in.
 *
 * Native scrolling is kept (Lenis scrolls the window rather than
 * transforming a wrapper), so `position: fixed` layers — the hero, the
 * canvas — keep working untouched.
 */

/**
 * Seconds the page takes to glide to a new target. Long enough to feel
 * weighted, short enough that a flick still lands where you meant.
 */
const GLIDE_SECONDS = 1.05;

/**
 * Exponential ease-out, the shape a heavy thing settling has: quickest at
 * the start, asymptotic at the end. `1 - 2^(-10t)` is the standard curve
 * for this and is what the reference site's motion matches.
 */
function easeOut(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export default function SmoothScroll() {
  useEffect(() => {
    // Anyone who has asked for less motion gets the plain browser scroll.
    // Easing the page is exactly the kind of motion that setting is for.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const lenis = new Lenis({
      duration: GLIDE_SECONDS,
      easing: easeOut,
      // Touch devices already have inertial scrolling of their own; adding
      // a second layer of it fights the platform.
      // Lenis drives its own frame loop. The documented GSAP integration
      // pumps it from gsap.ticker instead, to keep both on one clock, but
      // that ticker is not guaranteed to be running at mount here — checked
      // it, and lenis.raf never got called, so the page never eased at all.
      // ScrollTrigger.update on every scroll (below) keeps the scenes in
      // step regardless of which loop moved the page.
      autoRaf: true,
      smoothWheel: true,
      syncTouch: false,
    });

    // ScrollTrigger has to be told the position changed, because Lenis
    // moves the page between native scroll events.
    const update = () => ScrollTrigger.update();
    lenis.on("scroll", update);

    // Exposed for headless captures, which need to know the eased scroll
    // has settled before they photograph anything.
    (window as unknown as Record<string, unknown>).__lenis = lenis;

    // GSAP's lag smoothing pauses tweens after a long frame to "catch up",
    // which with a scrubbed page means the scroll and the scene disagree
    // about where they are. The Thinker's fracture and the robot's GLB both
    // produce frames long enough to trigger it.
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.off("scroll", update);
      gsap.ticker.lagSmoothing(500, 33);
      delete (window as unknown as Record<string, unknown>).__lenis;
      lenis.destroy();
    };
  }, []);

  return null;
}
