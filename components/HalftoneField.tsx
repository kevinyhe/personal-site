"use client";

import { useEffect, useRef } from "react";
import {
  createDotPainter,
  dotRamp,
  fitCanvas,
  type DotGrid,
} from "@/components/halftone";

/**
 * The dot matrix, running behind the page's sections.
 *
 * The hero is a halftone render and the sections were flat black, so the
 * page changed medium half way down. This puts the same grain under the
 * type: a field of dots that is almost invisible at rest, drifts down and to
 * the right on the same wind that carries the hero's loose petals, surges
 * and lulls on the same gust envelope, is swept by a scan bar every few
 * seconds (the television, still in the room), and opens a five-lobed bloom
 * of light under the cursor. Its colour travels down the page through the
 * tree's own palette, pale petal edge to the crimson at a flower's centre.
 *
 * It is one canvas, sticky at the top of the sections block, so it costs a
 * single viewport of fill however tall the page gets. The loop runs only
 * while the block is on screen and the tab is visible; scrolling past it or
 * switching tabs stops it dead.
 */

/** Cell size, CSS px. The hero's dither is finer; this has to sit UNDER body copy. */
const CELL = 15;
/** How far the cursor's light reaches, CSS px. It was 300 with a square
 * falloff, which put a bright pink pool the width of a paragraph over the
 * body copy — the effect read as a spotlight ON the text rather than a
 * grain under it. Smaller, and cubed below, so it stays a pool. */
const REACH = 215;
/** How hard the light chases the pointer per frame. Trailing, not glued. */
const CHASE = 0.12;
/** Seconds for the scan bar to cross the screen, and the gap between passes. */
const SCAN_PERIOD = 11;
const SCAN_WIDTH = 0.16;

/**
 * The cursor's pool is a flower, not a circle.
 *
 * Five lobes, because the hero's blossoms are five-petalled, and the notch
 * between two lobes pulls the reach in by BLOOM_NOTCH — the lobe tips still
 * stop at REACH, so the pool never grows past the radius that was already
 * judged small enough to sit under a paragraph. The whole shape turns at
 * BLOOM_SPIN rad/s, about one turn in ninety seconds: you notice the pool is
 * not round long before you notice it is moving.
 */
const BLOOM_NOTCH = 0.34;
const BLOOM_SPIN = 0.07;

/**
 * How fast the grain travels, in cells per second, before the gust scales it.
 *
 * The hero's loose petals ride a wind of (0.22, 0, 0.07) and fall under it,
 * which on screen is down and to the right. The field goes the same way at
 * about the same ratio, so the dots and the petals agree on the weather. A
 * cell is 15px, so at an average gust this is roughly 8px/s across and 12px/s
 * down — something you read out of the corner of your eye.
 */
const GRAIN_DRIFT_X = 0.55;
const GRAIN_DRIFT_Y = 0.82;

/**
 * The gust envelope from the hero's wind, copied by shape.
 *
 * The same three sines and the same smoothstep as arborGustEnvelope in
 * BareThreeCanvas, so the field lulls and surges on the tree's rhythm instead
 * of sliding at a fixed rate. Each clock starts when its own component
 * mounts, so this is the same weather rather than the same moment — which is
 * all a background needs. Returns about 0.2 (near calm) to 1.2 (crest).
 */
function gustAt(t: number) {
  const n =
    Math.sin(t * 0.36) +
    0.6 * Math.sin(t * 0.83 + 1.7) +
    0.35 * Math.sin(t * 0.11 + 4.2);
  const s = Math.min(Math.max((n + 1.9) / 3.65, 0), 1);
  return 0.2 + 1.02 * s * s * (3 - 2 * s);
}

/**
 * The colour the field lights up in, down the length of the sections.
 *
 * These are the hero's own sakura palette (BareThreeCanvas: PETAL_MID_COLOR,
 * BLOSSOM_TINT_ROSE, BLOSSOM_CENTER_COLOR), read from the outside of a petal
 * in to the middle of a flower. The page used to travel hot pink -> violet ->
 * ember, three colours the tree never uses. Now four screens of white-on-
 * black travel from the pale edge of a petal at Work, through rose at Info,
 * to the crimson at the blossom's centre by Contact. Slow enough that nobody
 * catches it changing, and by Contact it is plainly not the colour Work was.
 */
const TONES: [number, number, number][] = [
  [247, 207, 230],
  [230, 147, 196],
  [194, 46, 99],
];

function toneAt(progress: number): [number, number, number] {
  const span = (TONES.length - 1) * Math.min(Math.max(progress, 0), 1);
  const index = Math.min(TONES.length - 2, Math.floor(span));
  const t = span - index;
  const from = TONES[index];
  const to = TONES[index + 1];
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

export default function HalftoneField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const holder = holderRef.current;
    if (!canvas || !holder) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // A pointer that can hover. A touch screen has no cursor to light the
    // field with, and reporting the last tap as a permanent hot spot is
    // worse than leaving it dark.
    const canHover = window.matchMedia("(hover: hover)").matches;

    const painter = createDotPainter();
    // Rebuilt only when the interpolated tone has actually moved a whole
    // level of one channel — otherwise this would mint twelve strings a
    // frame for a colour nobody could tell apart from the last one.
    let colours = dotRamp({ minAlpha: 0.045, maxAlpha: 0.85 });
    let builtTone: [number, number, number] = [-1, -1, -1];
    const retone = (tone: [number, number, number]) => {
      if (
        Math.abs(tone[0] - builtTone[0]) < 1 &&
        Math.abs(tone[1] - builtTone[1]) < 1 &&
        Math.abs(tone[2] - builtTone[2]) < 1
      ) {
        return;
      }
      builtTone = tone;
      colours = dotRamp({
        maxAlpha: 0.85,
        minAlpha: 0.045,
        to: [Math.round(tone[0]), Math.round(tone[1]), Math.round(tone[2])],
      });
    };

    let grid: DotGrid = { cell: CELL, cols: 0, rows: 0 };
    let width = 0;
    let height = 0;
    // Where the light is, and where it is heading.
    const light = { x: -9999, y: -9999, tx: -9999, ty: -9999, level: 0 };
    let visible = false;
    let frame = 0;
    let start = 0;
    let last = 0;
    // How far the grain has travelled, in cells, and where the bloom has
    // turned to. Both are integrated per frame rather than read off the
    // clock, because the gust speeds them up and slows them down; and both
    // survive a stop, so scrolling away and back does not snap the field
    // back to where it was when the loop last started.
    let grainX = 0;
    let grainY = 0;
    let bloomAngle = 0;

    const measure = () => {
      width = holder.clientWidth || window.innerWidth;
      height = window.innerHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      grid = fitCanvas(canvas, width, height, CELL);
    };

    const draw = (time: number) => {
      if (!start) start = time;
      const t = (time - start) / 1000;
      // Clamped: after a pause (tab hidden, field scrolled past) the first
      // frame back would otherwise carry minutes of drift in one step.
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
      last = time;

      light.x += (light.tx - light.x) * CHASE;
      light.y += (light.ty - light.y) * CHASE;

      // Where the scan bar is, 0..1 down the screen, with a flat gap after.
      const scanPhase = (t % SCAN_PERIOD) / SCAN_PERIOD;
      const scanY = scanPhase * (1 + SCAN_WIDTH * 3) - SCAN_WIDTH;

      ctx.clearRect(0, 0, width, height);

      // How far the reader is through the sections block, 0..1. One box
      // measurement a frame, on the element this canvas is already pinned
      // inside, which is cheaper than asking each section where it is.
      const block = holder.parentElement;
      if (block) {
        const box = block.getBoundingClientRect();
        const travel = Math.max(1, box.height - window.innerHeight);
        retone(toneAt(-box.top / travel));
      }

      const reach2 = REACH * REACH;
      // At rest the field is a still, correct frame: no drift, no spin, and
      // the gust held at a plain mid-strength rather than wherever the sines
      // happened to be on the first frame.
      const gust = reducedMotion ? 0.75 : gustAt(t);
      if (!reducedMotion) {
        grainX += GRAIN_DRIFT_X * gust * dt;
        grainY += GRAIN_DRIFT_Y * gust * dt;
        bloomAngle += BLOOM_SPIN * dt;
      }
      // The lobes are wanted at 5(angle - bloomAngle); these are the two
      // halves of that sum that do not depend on the cell.
      const spinCos = Math.cos(5 * bloomAngle);
      const spinSin = Math.sin(5 * bloomAngle);
      // Held at 0 for a reader who asked for no motion: the beat between the
      // two sines is what makes the field breathe.
      const breathe = reducedMotion ? 0 : t;
      // The field drifts with the scroll as well as with the wind, so it
      // reads as something the page is moving over rather than a screensaver.
      // Held at 0 for a reader who asked for no motion: this is the one
      // remaining term that would still change the picture after the loop
      // stops, and a field that slides as you scroll is exactly what that
      // reader asked not to have.
      const scroll = reducedMotion ? 0 : window.scrollY * 0.0016;
      // A gust brightens the grain a little as well as hurrying it along.
      // The ceiling is the 0.15 the ambient term always had.
      const ambientGain = 0.075 + 0.045 * Math.min(1, gust);

      painter.paint(
        ctx,
        grid,
        (col, row) => {
          const x = col * CELL;
          const y = row * CELL;
          // Ambient: two sine products beating against each other. Cheap,
          // and irregular enough over a screen that no repeat is visible.
          // The grid coordinates are shifted by the accumulated drift, so
          // the whole pattern travels down and to the right — the way the
          // hero's loose petals go — instead of shimmering in place.
          const gc = col - grainX;
          const gr = row - grainY;
          const ambient =
            0.5 +
            0.5 *
              Math.sin(gc * 0.19 + breathe * 0.05 + scroll) *
              Math.cos(gr * 0.16 - breathe * 0.03 + scroll * 0.6);
          let strength = 0.05 + ambient * ambientGain;

          if (!reducedMotion) {
            const bar = 1 - Math.abs(row / grid.rows - scanY) / SCAN_WIDTH;
            // Squared and kept low. At 0.18 the bar read as a dotted rule
            // laid across whatever line of text it was passing.
            if (bar > 0) strength += bar * bar * 0.12;
          }

          if (light.level > 0) {
            const dx = x - light.x;
            const dy = y - light.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < reach2) {
              const d = Math.sqrt(d2);
              // Five-lobed reach. cos(5a) and sin(5a) come straight off the
              // unit vector (dx/d, dy/d) by the fifth-angle polynomials,
              // which costs a handful of multiplies where an atan2 and a
              // cosine per cell would cost real time. The five is baked into
              // those polynomials — the lobe count is not a free parameter.
              let lobe = 1;
              if (d > 1e-4) {
                const c = dx / d;
                const sn = dy / d;
                const c2 = c * c;
                const s2 = sn * sn;
                const c5 = c * (16 * c2 * c2 - 20 * c2 + 5);
                const s5 = sn * (16 * s2 * s2 - 20 * s2 + 5);
                // cos(5a - 5spin), 1 along a lobe's midline and -1 in a notch.
                const wave = c5 * spinCos + s5 * spinSin;
                lobe = 1 - BLOOM_NOTCH * (0.5 - 0.5 * wave);
              }
              const falloff = 1 - d / (REACH * lobe);
              if (falloff > 0) {
                strength += falloff * falloff * falloff * light.level * 0.66;
              }
            }
          }

          return strength > 1 ? 1 : strength;
        },
        colours,
      );

      // Under reduced motion every time-varying term above is pinned, so a
      // second frame would repaint the same picture. One frame is the whole
      // animation; measured, the loop was still burning 240 callbacks per
      // two seconds redrawing an identical canvas.
      frame = visible && !reducedMotion ? requestAnimationFrame(draw) : 0;
    };

    const run = () => {
      if (frame || !visible || reducedMotion) return;
      start = 0;
      last = 0;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = canvas.getBoundingClientRect();
      light.tx = event.clientX - box.left;
      light.ty = event.clientY - box.top;
      // First sighting: put the light where it is rather than flying it in
      // from the corner the page loaded with.
      if (light.level === 0) {
        light.x = light.tx;
        light.y = light.ty;
      }
      light.level = 1;
    };
    const onPointerLeave = () => {
      light.level = 0;
    };

    measure();
    const onResize = () => {
      measure();
      // fitCanvas resized the backing store, which cleared it. The running
      // loop repaints on its own; a stopped one (scrolled past, or reduced
      // motion, where the single frame IS the animation) would otherwise be
      // left blank at the new size.
      if (!visible || reducedMotion) draw(performance.now());
    };
    // The cursor's bloom is motion that follows the pointer, and there is no
    // loop left to draw it with. Both listeners stay off entirely rather
    // than sitting there setting a light nothing reads.
    const trackPointer = canHover && !reducedMotion;
    window.addEventListener("resize", onResize);
    if (trackPointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
    }

    // Still built under reduced motion: run() no-ops there, so the observer
    // costs one callback per crossing and keeps the two paths identical.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && !document.hidden;
        if (visible) run();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(holder.parentElement ?? holder);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // One frame straight away, so the field is there before the first
    // scroll rather than appearing when the loop starts.
    draw(performance.now());

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      if (trackPointer) {
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerleave", onPointerLeave);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    // Height 0 so it takes no room in the flow: the canvas inside overflows
    // it. Sticky rather than fixed because a fixed layer inside the sections
    // would cover the hero as well, and the sections start half a page down.
    <div
      aria-hidden="true"
      className="pointer-events-none sticky top-0 z-0 h-0"
      ref={holderRef}
    >
      <canvas className="absolute left-0 top-0" ref={canvasRef} />
    </div>
  );
}
