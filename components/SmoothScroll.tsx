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
 * How hard the page chases the scroll target each frame. Lenis turns this
 * into frame-rate independent damping (`lerp * 60` per second), so 0.055 is
 * a time constant of about a third of a second and roughly a second to
 * settle — the weighted glide this had before, and the same feel as the
 * reference site.
 *
 * This must NOT be a `duration` + `easing` pair, which is what it was.
 * Lenis runs those two modes differently: an eased tween has a start time,
 * and every wheel notch calls `fromTo` again and resets it to zero. A mouse
 * wheel delivers a notch every 40 ms or so and frames come every 8, so the
 * page replayed the steep first part of the ease five times a second and
 * never reached the rest of it. Measured under steady wheel input,
 * consecutive frames moved 5, 5, 6, 3, 4, 6, 2, 4, 4, 8, 9, 10, 4, 7 px —
 * each frame's rate off the average of its neighbours by 87% of the mean.
 * With `lerp` there is no start time; it damps toward wherever the target
 * currently is, so a new notch mid-glide just moves the target. Same
 * measurement afterwards: 5.5%.
 */
const SCROLL_LERP = 0.055;

export default function SmoothScroll() {
  useEffect(() => {
    // Anyone who has asked for less motion gets the plain browser scroll.
    // Easing the page is exactly the kind of motion that setting is for.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const lenis = new Lenis({
      lerp: SCROLL_LERP,
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
