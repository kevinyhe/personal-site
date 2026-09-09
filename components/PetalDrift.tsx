"use client";

import { useEffect, useRef } from "react";
import { sampleBoughSpawn } from "@/components/boughSpawn";
import {
  buildPetalColours,
  clamp01,
  createPetalPaths,
  createPetals,
  createWind,
  makeRng,
  petalColourIndex,
  sampleWind,
  shadeStepFor,
  spawnPetal,
  stepPetal,
  AREA_PER_PETAL,
  MAX_PETALS,
  MIN_PETALS,
  NARROW_DENSITY,
  NARROW_VIEWPORT,
  PETAL_COLOUR_COUNT,
  type Petal,
} from "@/components/petalDrift";

/**
 * Loose sakura petals falling down the whole page below the hero.
 *
 * Above the fold the site is a cherry tree in a dither; below it the tree is
 * gone and only its dot grain is left. This puts the tree's other half back:
 * the petals keep falling past the narration and past Selected work.
 *
 * One fixed, full-viewport canvas. Because it is fixed it costs a single
 * screen of drawing however tall the page gets, and the petals are in the
 * air the page moves through rather than glued to a point in the document.
 *
 * Where it sits in the stack: BEHIND the type, not in front of it. That is
 * a contrast decision and it is not negotiable by tuning the alpha. Body
 * copy on this page runs down to 45-55% white on #0a0a0a, which is 4.5:1
 * against its own ground before anything is laid over it — so *any* opaque
 * pixel in front of a glyph puts it under the floor. Measured with the
 * field in front: 1.14:1 on the dimmest paragraphs, 3.1:1 on full-strength
 * headlines. The largest alpha that would have held 4.5:1 on the dimmest
 * text is 0.16, which is a field you cannot see. Behind the type there is
 * no ceiling at all: a petal passes under the words, the words stay exactly
 * as legible as they were, and the petals can be full size and full
 * strength.
 *
 * What that costs: the Contact panel is opaque cream and covers this canvas
 * outright, so petals stop at the top of Contact instead of crossing it.
 * The dark half of the sakura palette that used to swing in over cream is
 * gone with it (see petalDrift.ts) — it could only ever have been seen from
 * in front, where the cream panel's own 50%-ink italics are already at
 * 3.6:1 with nothing over them.
 *
 * Petals are 9-26 px, drawn at 0.42-0.94 alpha, and a few dozen are on
 * screen at once. They never take pointer events.
 *
 * WHERE A PETAL COMES FROM. It used to be the top edge of the viewport,
 * always, which is why the field read as confetti: nothing was shedding
 * them. The 3D bough (components/sakuraBough.ts, on SakuraStage) publishes
 * its lowest twig tips in viewport pixels every frame, and a petal being
 * recycled takes one of those instead whenever the bough is overhead — so
 * for the two screens the branch is on the page the petals fall out of the
 * branch. When it is not there (before the stage boots, after the bough has
 * drifted off, no WebGL, reduced motion) the top edge stands and nothing
 * about this file changes.
 */

export type PetalDriftProps = {
  /**
   * The element whose visibility runs the loop, and which the field fades
   * in over. Meant to be the sections block: the hero drops its own petals
   * and does not want a second set over it. Without one the field runs
   * everywhere at full strength.
   */
  gateSelector?: string;
};

/**
 * Overall strength of the field. Under 1 because these are petals in the
 * air over a page, not a texture on it — the far band lands at 0.42 x this
 * and reads as depth rather than as dirt.
 *
 * This is a look number, not a contrast number. Nothing here can take type
 * below its own contrast: the canvas paints behind every glyph on the page.
 */
const FIELD_OPACITY = 0.58;
/** Longest frame the physics will integrate. A backgrounded tab returns a
 * multi-second dt, which would teleport the whole field off the bottom. */
const MAX_DT = 0.05;
/** Device pixel ratio cap. Petals are soft shapes; 3x buys nothing. */
const MAX_DPR = 2;
/**
 * Low-pass on scroll velocity, per frame. Raw frame-to-frame velocity is
 * noisy enough to make the field jitter; this is about a 60 ms constant.
 */
const SCROLL_SMOOTH = 0.25;

export default function PetalDrift({ gateSelector }: PetalDriftProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const paths = createPetalPaths();
    const colours = buildPetalColours();
    // One reusable index list per colour. Allocated once and emptied by
    // setting length to 0, which keeps the backing store, so a steady frame
    // allocates nothing.
    const buckets: number[][] = Array.from({ length: PETAL_COLOUR_COUNT }, () => []);
    // Likewise the wind: written over each frame rather than rebuilt.
    const wind = createWind();
    // One point, written over per respawn: this runs a few times a second
    // for as long as the page is open.
    const spawnPoint = { x: 0, y: 0 };

    const rng = makeRng(0x5a4b3c);
    let width = 0;
    let height = 0;
    let dpr = 1;
    let petals: Petal[] = [];

    /** How many petals this viewport gets. Area-based, capped, thinned on phones. */
    const countFor = (w: number, h: number) => {
      const density = w < NARROW_VIEWPORT ? NARROW_DENSITY : 1;
      const n = Math.round(((w * h) / AREA_PER_PETAL) * density);
      return Math.max(MIN_PETALS, Math.min(MAX_PETALS, n));
    };

    const measure = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const want = countFor(width, height);
      if (!petals.length) {
        petals = createPetals(want, rng, width, height);
      } else if (want > petals.length) {
        // Grew: new petals come in from above rather than appearing mid-air.
        const extra = createPetals(want - petals.length, rng, width, height);
        for (const p of extra) spawnPetal(p, rng, width, height, true);
        petals = petals.concat(extra);
      } else if (want < petals.length) {
        petals.length = want;
      }
    };

    // The gate element and its position on screen.
    //
    // Both are cached. getBoundingClientRect forces layout, and reading it
    // inside the frame loop made the browser lay the page out 60 times a
    // second for a rectangle that only two things can move: a scroll and a
    // reflow. So: query the element once, and mark the rectangle stale from
    // scroll, resize and a ResizeObserver on the block itself, which is
    // what catches a font swap or a section revealing. Recomputed at most
    // once per frame, and not at all while the page sits still.
    const gate = gateSelector
      ? document.querySelector<HTMLElement>(gateSelector)
      : null;
    let gateTop = 0;
    let gateBottom = 0;
    let boxStale = true;
    const readBox = () => {
      boxStale = false;
      if (!gate) return;
      const box = gate.getBoundingClientRect();
      gateTop = box.top;
      gateBottom = box.bottom;
    };
    /**
     * How far the sections block has come up the screen, 0..1. The field
     * fades in over it so nothing falls across the hero, which already has
     * its own petals in WebGL.
     */
    const fadeNow = () => {
      if (!gate) return 1;
      if (gateBottom < 0) return 0;
      return clamp01((height - gateTop) / (height * 0.55));
    };

    // Scroll velocity in CSS px/s, positive scrolling down.
    //
    // `window.__lenis` is a Lenis instance (see SmoothScroll.tsx) and has a
    // `velocity` field, but its units are per-animation-frame and have moved
    // between Lenis versions. Lenis eases the real scroll position, so
    // differentiating window.scrollY gives the same signal in units this
    // file can be sure of.
    let lastScroll = typeof window !== "undefined" ? window.scrollY : 0;
    let scrollVel = 0;

    let frame = 0;
    let last = 0;
    let elapsed = 0;
    // Two separate facts, deliberately not folded into one flag: whether
    // the block is on screen, and whether the tab is showing. An observer
    // callback can be delivered while the tab is hidden, and a single flag
    // would record "not visible" for a block that is in fact on screen —
    // after which returning to the tab has nothing to restore.
    let onScreen = false;
    // Last opacity written to the canvas, as its string. The style write is
    // a string allocation plus a style invalidation, and the value is the
    // same on almost every frame, so it is only written when it moves.
    let opacityText = "";

    const draw = (dt: number) => {
      // Reduced motion paints nothing, ever — not a still frame either.
      // See the note by the mount-time call below for why the resting state
      // is an empty canvas rather than a frozen field, and this guard is
      // here rather than at each call site so no future path can get round
      // it.
      if (reducedMotion) return;

      if (boxStale) readBox();
      const fade = fadeNow();
      const next = `${(fade * FIELD_OPACITY).toFixed(3)}`;
      if (next !== opacityText) {
        opacityText = next;
        canvas.style.opacity = next;
      }
      if (fade <= 0.001) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      sampleWind(wind, elapsed, scrollVel);

      for (const bucket of buckets) bucket.length = 0;
      for (let i = 0; i < petals.length; i += 1) {
        const petal = petals[i];
        if (dt > 0 && stepPetal(petal, dt, wind, width, height)) {
          spawnPetal(petal, rng, width, height, true);
          // Kevin's complaint about this field was that the petals fell from
          // nowhere. When the bough is overhead the petal is handed one of
          // its twig tips instead of a point along the top edge, so it comes
          // off the branch you can see. sampleBoughSpawn returns false
          // whenever the bough is not there — before the stage boots, once
          // the bough has drifted past, off screen, hidden tab, reduced
          // motion, no WebGL — and the top-edge spawn stands.
          if (sampleBoughSpawn(rng, spawnPoint)) {
            petal.x = spawnPoint.x;
            petal.y = spawnPoint.y;
          }
        }
        buckets[petalColourIndex(petal.depthBand, shadeStepFor(petal))].push(i);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let c = 0; c < buckets.length; c += 1) {
        const bucket = buckets[c];
        if (!bucket.length) continue;
        ctx.fillStyle = colours[c];
        for (let k = 0; k < bucket.length; k += 1) {
          const petal = petals[bucket[k]];
          // The tumble. A petal is a flat sheet, so what the screen sees is
          // its width foreshortened by the angle it is turned through:
          // squash by |cos(spin)| and it goes edge-on to a line and flashes
          // back. Length is untouched, because the axis it spins about runs
          // down the petal. A minimum keeps it from disappearing to nothing
          // for a frame, which reads as a dropout rather than a turn.
          const squash = Math.max(0.07, Math.abs(Math.cos(petal.spin)));
          const cos = Math.cos(petal.rot);
          const sin = Math.sin(petal.rot);
          const sx = petal.size * squash * dpr;
          const sy = petal.size * dpr;
          ctx.setTransform(
            cos * sx,
            sin * sx,
            -sin * sy,
            cos * sy,
            petal.x * dpr,
            petal.y * dpr,
          );
          ctx.fill(paths[petal.variant]);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const tick = (time: number) => {
      const raw = last ? (time - last) / 1000 : 0;
      last = time;
      const dt = Math.min(MAX_DT, Math.max(0, raw));
      elapsed += dt;

      const now = window.scrollY;
      if (dt > 0) {
        const instant = (now - lastScroll) / dt;
        scrollVel += (instant - scrollVel) * SCROLL_SMOOTH;
      }
      lastScroll = now;

      draw(dt);
      frame = onScreen && !document.hidden ? requestAnimationFrame(tick) : 0;
    };

    const run = () => {
      if (frame || !onScreen || document.hidden || reducedMotion) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    measure();
    const onResize = () => {
      measure();
      boxStale = true;
      // Redraw the one still frame the loop is not running. draw() is inert
      // under reduced motion, so this cannot paint the field back in.
      if (!frame) draw(0);
    };
    window.addEventListener("resize", onResize);

    // Passive: this must never be able to hold up a scroll. It does no work
    // beyond setting a flag the next frame reads.
    const onScroll = () => {
      boxStale = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      boxStale = true;
    });
    if (gate) resizeObserver.observe(gate);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        boxStale = true;
        if (onScreen) run();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(gate ?? canvas);

    const onVisibility = () => {
      if (document.hidden) stop();
      else run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // The resting state: one frame, drawn now, so the field is full before
    // the first frame of the loop instead of raining in from a bare page.
    //
    // Under prefers-reduced-motion there is no frame at all, not even this
    // one. A fixed canvas of petals holding still while the page scrolls
    // under them reads as dirt on the screen, not as a tree, so reduced
    // motion gets no petals below the hero — and it has to be nothing on
    // every path, not just on a top-of-page load. Browsers restore scroll
    // position before effects run, so a reload halfway down the page would
    // otherwise land here with the gate already past and paint the frozen
    // field immediately.
    draw(0);

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gateSelector]);

  return (
    // z-0, inside the sections block's z-10 stacking context: above the
    // halftone dots (also z-0, earlier in the DOM) and below every section,
    // which are z-[1]. Fixed, so it covers the viewport rather than the
    // document, and the parent's own #0a0a0a background paints under it.
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <canvas className="absolute left-0 top-0" ref={canvasRef} />
    </div>
  );
}
