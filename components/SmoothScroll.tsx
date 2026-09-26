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
      syncTouch: false,
      smoothWheel: true,
      // A wheel tick moves the page the same SHARE of it at every width:
      // the rem follows the viewport (globals.css, 16px at 3840), so a
      // narrower window is a shorter page in px and the same px a tick
      // would overshoot. Never below a third of a normal tick.
      wheelMultiplier: Math.max(
        0.34,
        (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16,
      ),
      // No loop of its own: gsap.ticker pumps it (below), so the page and
      // every scrubbed scene step on the same clock. With autoRaf on there
      // were two requestAnimationFrame loops a frame — Lenis' and gsap's —
      // and on a long frame they disagreed about how much time had passed
      // (see the lag-smoothing note below).
      autoRaf: false,
    });

    // The documented Lenis + GSAP wiring. gsap.ticker hands out seconds;
    // lenis.raf wants milliseconds. An earlier attempt at this was written
    // off because "the ticker was not running at mount" — it cannot be:
    // gsap.ticker.add() wakes the ticker itself (gsap-core, `add: ...
    // _wake()`). Checked in the headless harness after the change:
    // `__lenis.time` advances with the ticker at rest (3.5 s of clock over
    // a 1.9 s window, the difference being the half-second software-GL
    // frames it is sampled between) and a synthetic wheel event — which no
    // native scroll can follow, so only lenis.raf can move the page — took
    // the page 0 -> 592 -> 599 over successive frames, the lerp's
    // approach. (.scratch-s54100/smooth.mjs reads 0 movements before and
    // after: under software GL a frame lasts longer than the glide, and
    // Playwright's mouse.wheel lands as a native scroll there anyway.)
    //
    // NOT `lenis.on("scroll", ScrollTrigger.update)`, which the Lenis docs
    // add for setups that move a wrapper with a transform. Here Lenis
    // scrolls the WINDOW, so every step it takes fires a native scroll
    // event, and ScrollTrigger's own listener for that event runs the same
    // full pass over every trigger (`_onScroll` -> `_updateAll`, no
    // deferral). The manual call was a second identical pass on every
    // moving frame, and it did not even land earlier: the native event is
    // dispatched in the next frame's rendering steps, before the tick that
    // renders the scrub tween — the same frame the scrub would have picked
    // it up anyway.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    // Added once, removed once. A version of this detached the tick on
    // visibilitychange (nothing to ease while nobody is looking) and it
    // cost more than it saved: a glide in flight when the tab went hidden
    // stopped dead, and every lenis.scrollTo issued while hidden — which
    // is how the headless captures and perf-e2e's hidden-tab step move
    // the page — went nowhere until the tab came back. Browsers throttle
    // rAF in a hidden tab on their own; the one cost of leaving the tick
    // attached is that the first frame back sees the whole gap as its
    // delta and lands any glide in one step, which is the right result
    // for a scroll nobody watched.

    // Exposed for headless captures, which need to know the eased scroll
    // has settled before they photograph anything.
    (window as unknown as Record<string, unknown>).__lenis = lenis;

    // GSAP's lag smoothing: after a frame longer than 500 ms the ticker
    // pretends only 33 ms passed, so time-based tweens resume instead of
    // jumping. Kept OFF here, for the whole session, and this is why:
    //
    // The canvases do not run on gsap's clock. BareThreeCanvas times its
    // own work off performance.now / THREE.Clock, and the reveal is
    // choreographed across both clocks — the tree rising
    // (a gsap tween on sceneFx.treeDrop) lands on the same frame as the
    // canvas' own two-second orbit-and-bloom. A shader compile in the
    // middle of that is exactly the kind of long frame smoothing acts on;
    // smoothed, gsap's side would finish up to half a second after the
    // canvas', and the two would visibly come apart. Both on real time,
    // they stay together.
    //
    // With Lenis on gsap's ticker (above) the scroll and the scrubbed
    // scenes now share a clock, so a long frame moves them by the same
    // amount whichever setting this is — the old reason for turning it
    // off (the page jumping while the scenes crawled to catch up) is gone.
    // What is left is the reveal, so it stays off. The cost is that a tween
    // running when the tab is hidden completes on return rather than
    // resuming; nothing on this page runs a tween that long unattended.
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      delete (window as unknown as Record<string, unknown>).__lenis;
      lenis.destroy();
    };
  }, []);

  return null;
}
