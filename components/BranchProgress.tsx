"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDotPainter,
  dotRamp,
  fitCanvas,
  type DotGrid,
} from "@/components/halftone";

/**
 * The scroll indicator, as a cherry twig growing down the right margin.
 *
 * The hero is a sakura rendered through a halftone dither and the page
 * below it had no scroll indicator at all. This is both: a twig that draws
 * itself downward as the reader moves through the sections, in the same
 * dots the hero is made of, with a blossom opening at each landmark of the
 * page — the dated list, Selected work, Contact. Scrolling back up runs it
 * backwards: the flowers close and the twig retracts, because everything
 * here is a pure function of scroll position rather than a played animation.
 *
 * It is one narrow canvas, fixed, about 60% of the viewport tall. Nothing
 * in it is measured in DOM elements per blossom — the landmarks are read
 * from the layout each frame (three getBoundingClientRect calls) so it
 * self-corrects when the sections above it change height.
 */

/** Column width, CSS px. Wide enough for a spur plus an open flower. */
const WIDTH = 116;
/** Dot cell. Finer than HalftoneField's 15 — this draws a 3px-wide twig. */
const CELL = 5;
/** Open flower radius, CSS px. */
const BLOSSOM_RADIUS = 15;
/** The twig's centreline sits here across the column at the top. */
const BASE_X = WIDTH * 0.55;
/** Frame budget: the page already runs two WebGL scenes. 30fps is plenty
 *  for a sway this slow, and it halves what this costs. */
const FRAME_MS = 33;

/** How far into the page each landmark's flower takes to open, in units of
 *  overall scroll progress. Short, so the flower opens about as the twig's
 *  tip reaches it rather than trailing a screen behind. */
const OPEN_SPAN = 0.05;

type Landmark = {
  /** CSS selector for the element this blossom marks. */
  selector: string;
  /** Only used when `interactive`, as the jump button's accessible name. */
  label: string;
};

const DEFAULT_LANDMARKS: Landmark[] = [
  { label: "Selected dates", selector: "[data-landmark='dates']" },
  { label: "Selected work", selector: "#work" },
  { label: "Contact", selector: "#contact" },
];

const DEFAULT_LIGHT_PANELS = ["#contact"];

/** Bare spurs, for the twig to not be a straight line: position down the
 *  twig, which side it leaves on, and how long it is. */
const SPURS: { v: number; side: 1 | -1; length: number }[] = [
  { length: 12, side: -1, v: 0.11 },
  { length: 9, side: 1, v: 0.29 },
  { length: 14, side: -1, v: 0.46 },
  { length: 10, side: 1, v: 0.63 },
  { length: 8, side: -1, v: 0.79 },
];

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, options?: object) => void;
};

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Squared distance from a point to a segment, plus how far along the
 *  segment the nearest point fell (0..1) — the twig tapers along that. */
function segmentHit(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / len2) : 0;
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return { d2: cx * cx + cy * cy, t };
}

/** State of one blossom for the frame being drawn. */
type Bloom = {
  /** Where on the twig it hangs, 0..1 down the column. */
  v: number;
  x: number;
  y: number;
  radius: number;
  /** 0 closed, 1 fully open. */
  open: number;
  rotation: number;
  side: 1 | -1;
};

export type BranchProgressProps = {
  /**
   * The page's landmarks, top to bottom — one blossom each. A selector that
   * matches nothing still gets a flower, spaced evenly down the twig, so a
   * markup change degrades to a plain progress bar rather than a bug.
   */
  landmarks?: Landmark[];
  /**
   * The hero's root. Progress starts where the hero stops owning the
   * screen; until then the twig is not drawn at all.
   */
  heroSelector?: string;
  /**
   * Sections with a pale background. While one of these is behind the
   * column, the twig and its flowers are drawn in the dark end of the
   * palette instead of the pale end.
   */
  lightPanels?: string[];
  /**
   * Opt-in: put a real button on each blossom that scrolls to its section.
   * Off by default — this is decoration, and decoration should not be in
   * the tab order or take pointer events.
   */
  interactive?: boolean;
};

export default function BranchProgress({
  heroSelector = "#top",
  interactive = false,
  landmarks = DEFAULT_LANDMARKS,
  lightPanels = DEFAULT_LIGHT_PANELS,
}: BranchProgressProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Blossom positions down the column, in CSS px, for the optional jump
  // buttons. Only kept in React state when those buttons exist.
  const [marks, setMarks] = useState<number[]>([]);

  const jump = useCallback((selector: string) => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const holder = holderRef.current;
    const canvas = canvasRef.current;
    if (!holder || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const painter = createDotPainter();
    // Three ramps because a frame is three passes over the same grid: the
    // twig in the palette's plum (BareThreeCanvas's pedicel colours), the
    // petals in the sakura pink, and the flower's crimson centre. One
    // fillStyle per quantised step per pass — a dozen state changes each.
    const onDark = {
      bark: dotRamp({
        from: [93, 65, 80],
        maxAlpha: 0.9,
        minAlpha: 0.18,
        to: [141, 104, 116],
      }),
      centre: dotRamp({
        from: [161, 61, 93],
        maxAlpha: 1,
        minAlpha: 0.45,
        to: [194, 46, 99],
      }),
      petal: dotRamp({
        from: [231, 156, 200],
        maxAlpha: 0.95,
        minAlpha: 0.2,
        to: [253, 239, 248],
      }),
    };
    // The Contact panel is cream. #fdeff8 petals on #f4ece1 are invisible,
    // so over a pale panel the same flower is drawn in the dark end of the
    // palette instead: deep plum bark, rose petals, crimson centre.
    const onLight = {
      bark: dotRamp({
        from: [58, 40, 50],
        maxAlpha: 0.95,
        minAlpha: 0.2,
        to: [93, 65, 80],
      }),
      centre: dotRamp({
        from: [122, 38, 66],
        maxAlpha: 1,
        minAlpha: 0.5,
        to: [161, 61, 93],
      }),
      petal: dotRamp({
        from: [199, 72, 131],
        maxAlpha: 0.95,
        minAlpha: 0.25,
        to: [231, 140, 190],
      }),
    };
    let palette = onDark;

    let grid: DotGrid = { cell: CELL, cols: 0, rows: 0 };
    let height = 0;
    // The twig's centreline x per row, rebuilt each frame. Rows are ~150 at
    // most, and every cell in a row shares the value, so this turns the
    // curve+sway maths from per-cell into per-row.
    let lineX = new Float32Array(0);
    let lineWidth = new Float32Array(0);
    let lineFade = new Float32Array(0);

    const blooms: Bloom[] = landmarks.map((_, index) => ({
      open: 0,
      radius: 0,
      rotation: index * 1.7,
      side: index % 2 === 0 ? 1 : -1,
      v: (index + 1) / (landmarks.length + 1),
      x: 0,
      y: 0,
    }));

    const measure = () => {
      // 60% of the viewport, but never so short it reads as a tick or so
      // tall it runs into the header and footer of a big screen.
      height = Math.max(300, Math.min(720, Math.round(window.innerHeight * 0.6)));
      canvas.style.width = `${WIDTH}px`;
      canvas.style.height = `${height}px`;
      holder.style.height = `${height}px`;
      grid = fitCanvas(canvas, WIDTH, height, CELL);
      if (lineX.length !== grid.rows) {
        lineX = new Float32Array(grid.rows);
        lineWidth = new Float32Array(grid.rows);
        lineFade = new Float32Array(grid.rows);
      }
    };

    /**
     * How far through the page the reader is, 0..1.
     *
     * Zero until the hero has finished scrolling past — the hero owns the
     * whole screen and nothing should be drawn in its margin — then across
     * the rest of the document.
     */
    const readSpan = () => {
      const doc = document.documentElement;
      const hero = document.querySelector<HTMLElement>(heroSelector);
      const end = Math.max(1, doc.scrollHeight - window.innerHeight);
      let start = window.innerHeight * 1.5;
      if (hero) {
        const box = hero.getBoundingClientRect();
        // The scroll position at which the hero's last pixel leaves the
        // bottom of the screen.
        start = box.bottom + window.scrollY - window.innerHeight;
      }
      start = Math.max(0, Math.min(start, end - 1));
      return { end, start, travel: Math.max(1, end - start) };
    };

    /** Where a landmark sits on the twig, as overall scroll progress. */
    const landmarkAt = (
      selector: string,
      span: { start: number; travel: number },
      fallback: number,
    ) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return fallback;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // The flower is due when the section's top is two thirds of the way
      // up the screen, which is where the reader is actually reading it.
      const due = top - window.innerHeight * 0.66;
      // Held off both ends: a landmark at 0 would open before the twig
      // existed, and one at 1 could only open on the very last pixel of the
      // document, which most readers never reach.
      return Math.max(0.08, Math.min(0.92, (due - span.start) / span.travel));
    };

    // Twig shape. `v` is 0..1 down the column.
    const curveAt = (v: number) =>
      -7 * v + 6.5 * Math.sin(v * 2.6 + 0.5) - 3 * Math.sin(v * 5.3 + 1.2);

    // Wind, the same two tiers the hero's tree uses: a slow limb sway that
    // carries the whole twig and grows toward the tip, and a faster, much
    // smaller flutter on top of it. `gust` is two slow sines beating, so
    // the branch has quiet spells instead of a metronome.
    const swayAt = (v: number, t: number) => {
      const gust = 0.72 + 0.4 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1.1);
      return (
        4.6 * Math.pow(v, 1.4) * Math.sin(t * 0.55 + v * 0.9) * gust +
        1.7 * v * v * Math.sin(t * 1.9 + v * 4.2)
      );
    };

    const halfWidthAt = (v: number) => 0.85 + 2.3 * Math.pow(1 - v, 1.6);

    const paint = (progress: number, t: number) => {
      const { cols, rows } = grid;
      ctx.clearRect(0, 0, WIDTH, height);
      if (progress <= 0.002 || cols === 0) return;

      // The whole thing fades in over the first slice of the sections, so
      // it arrives as the hero hands over rather than snapping on.
      const appear = smoothstep(0.004, 0.05, progress);
      const drawnTo = progress * height;

      for (let row = 0; row < rows; row += 1) {
        const y = row * CELL + CELL * 0.5;
        const v = clamp01(y / height);
        lineX[row] = BASE_X + curveAt(v) + swayAt(v, t);
        lineWidth[row] = halfWidthAt(v);
        // The tip is soft rather than cut square: the last few pixels of
        // the drawn length fade out, which reads as growth.
        lineFade[row] = clamp01((drawnTo - y) / 7) * appear;
      }

      // Where each blossom hangs. Every one sits at the end of its own
      // spur, so the twig visibly reaches out to it.
      for (let i = 0; i < blooms.length; i += 1) {
        const bloom = blooms[i];
        const v = bloom.v;
        const row = Math.min(rows - 1, Math.max(0, Math.round((v * height) / CELL)));
        const spurLength = 17;
        // Held a hair behind the twig's own tip: a flower that opened the
        // instant its spur appeared would hang below the end of the branch
        // it is supposed to be growing on.
        bloom.open = smoothstep(v + 0.012, v + OPEN_SPAN, progress);
        // A touch of overshoot as it opens, then settles: petals unfurl
        // past their resting width before relaxing back.
        const eased = bloom.open * bloom.open * (3 - 2 * bloom.open);
        bloom.radius =
          BLOSSOM_RADIUS * eased * (1 + 0.13 * Math.sin(Math.PI * bloom.open));
        bloom.x = lineX[row] + bloom.side * spurLength * 0.82;
        bloom.y = v * height + spurLength * 0.62;
        bloom.rotation = i * 1.7 + (reducedMotion ? 0 : 0.16 * Math.sin(t * 0.4 + i));
      }

      // ------------------------------------------------------- the twig
      painter.paint(
        ctx,
        grid,
        (col, row) => {
          const fade = lineFade[row];
          if (fade <= 0.02) return 0;
          const x = col * CELL + CELL * 0.5;
          const y = row * CELL + CELL * 0.5;
          const halfWidth = lineWidth[row];
          let strength = 1 - Math.abs(x - lineX[row]) / (halfWidth + 1.2);
          strength = strength > 0 ? strength : 0;

          // Spurs, bare ones and the ones carrying flowers. Both are short
          // segments leaving the centreline; a spur only draws once the
          // twig has grown past its root.
          for (let i = 0; i < SPURS.length + blooms.length; i += 1) {
            const bare = i < SPURS.length;
            const v = bare ? SPURS[i].v : blooms[i - SPURS.length].v;
            const grown = clamp01((progress - v) / 0.03);
            if (grown <= 0) continue;
            const side = bare ? SPURS[i].side : blooms[i - SPURS.length].side;
            const length = bare ? SPURS[i].length : 17;
            const rootRow = Math.min(
              rows - 1,
              Math.max(0, Math.round((v * height) / CELL)),
            );
            const ax = lineX[rootRow];
            const ay = v * height;
            const bx = ax + side * length * 0.82 * grown;
            const by = ay + length * 0.62 * grown;
            if (y < ay - 4 || y > by + 4) continue;
            const hit = segmentHit(x, y, ax, ay, bx, by);
            const spurHalf = 1.5 - 0.8 * hit.t;
            const spur = 1 - Math.sqrt(hit.d2) / (spurHalf + 1.2);
            if (spur > strength) strength = spur;
          }

          return strength > 0 ? Math.min(1, strength * 0.95) * fade : 0;
        },
        palette.bark,
        { round: true },
      );

      // ------------------------------------------------------ the petals
      // Five obcordate lobes around the centre, the same flower the hero
      // builds in 3D reduced to what survives at six dots across: a
      // five-lobed outline and a bright rim.
      painter.paint(
        ctx,
        grid,
        (col, row) => {
          const x = col * CELL + CELL * 0.5;
          const y = row * CELL + CELL * 0.5;
          let best = 0;
          for (let i = 0; i < blooms.length; i += 1) {
            const bloom = blooms[i];
            if (bloom.radius <= 1) continue;
            const dx = x - bloom.x;
            const dy = y - bloom.y;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > bloom.radius * 1.05) continue;
            const lobe =
              0.5 + 0.5 * Math.cos(5 * (Math.atan2(dy, dx) - bloom.rotation));
            const edge = bloom.radius * (0.48 + 0.52 * lobe);
            let s = clamp01((edge - r) / (edge * 0.7));
            // The middle belongs to the crimson pass below, so the pink
            // one hollows out there instead of drawing over it.
            s *= clamp01(r / (bloom.radius * 0.24));
            if (s > best) best = s;
          }
          return best * appear;
        },
        palette.petal,
        { round: true },
      );

      // ------------------------------------------------------ the centre
      painter.paint(
        ctx,
        grid,
        (col, row) => {
          const x = col * CELL + CELL * 0.5;
          const y = row * CELL + CELL * 0.5;
          let best = 0;
          for (let i = 0; i < blooms.length; i += 1) {
            const bloom = blooms[i];
            if (bloom.radius <= 2) continue;
            const dx = x - bloom.x;
            const dy = y - bloom.y;
            const r = Math.sqrt(dx * dx + dy * dy);
            const reach = bloom.radius * 0.32;
            if (r > reach) continue;
            const s = clamp01(1 - r / reach) * bloom.open;
            if (s > best) best = s;
          }
          return best * appear;
        },
        palette.centre,
        { round: true },
      );
    };

    /** Reads the layout, updates each blossom's place on the twig, and
     *  returns overall progress. Three rects a frame, which is what buys
     *  the whole thing being correct after any layout change. */
    const sync = () => {
      const span = readSpan();
      for (let i = 0; i < blooms.length; i += 1) {
        blooms[i].v = landmarkAt(
          landmarks[i].selector,
          span,
          (i + 1) / (landmarks.length + 1),
        );
      }
      // Which palette this frame draws in. One rect: if a pale panel is
      // behind the column's middle, the flowers switch to the dark end of
      // the sakura palette so they do not disappear into the cream.
      palette = onDark;
      const midY = window.innerHeight * 0.5;
      for (const selector of lightPanels) {
        const panel = document.querySelector<HTMLElement>(selector);
        if (!panel) continue;
        const box = panel.getBoundingClientRect();
        if (box.top < midY && box.bottom > midY) {
          palette = onLight;
          break;
        }
      }
      return clamp01((window.scrollY - span.start) / span.travel);
    };

    // The jump buttons, when they exist, follow the flowers. Only pushed
    // into React state when they have actually moved, so a normal frame
    // does not re-render anything.
    let publishedMarks: number[] = [];
    const publishMarks = () => {
      if (!interactive) return;
      const next = blooms.map((bloom) => bloom.v * height + 10);
      const moved =
        next.length !== publishedMarks.length ||
        next.some((y, i) => Math.abs(y - publishedMarks[i]) > 2);
      if (!moved) return;
      publishedMarks = next;
      setMarks(next);
    };

    let frame = 0;
    let visible = false;
    let started = 0;
    let last = 0;

    const draw = (time: number) => {
      frame = visible ? requestAnimationFrame(draw) : 0;
      if (time - last < FRAME_MS) return;
      last = time;
      if (!started) started = time;
      const progress = sync();
      holder.style.opacity = progress > 0.002 ? "1" : "0";
      paint(progress, (time - started) / 1000);
      publishMarks();
    };

    const run = () => {
      if (frame || !visible) return;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    measure();

    // Reduced motion: the branch is simply there, fully grown, with every
    // flower open, and nothing runs. The only thing scroll still decides is
    // whether it is on screen at all, since it must not sit over the hero.
    if (reducedMotion) {
      const still = () => {
        const progress = sync();
        holder.style.opacity = progress > 0.002 ? "1" : "0";
        // Progress 1: every flower open, no sway, one frame.
        paint(1, 0);
        publishMarks();
      };
      let queued = 0;
      const onScroll = () => {
        if (queued) return;
        queued = requestAnimationFrame(() => {
          queued = 0;
          still();
        });
      };
      const onStillResize = () => {
        measure();
        still();
      };
      still();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onStillResize);
      return () => {
        if (queued) cancelAnimationFrame(queued);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onStillResize);
      };
    }

    const onResize = () => {
      measure();
      if (!visible) paint(sync(), 0);
    };
    window.addEventListener("resize", onResize);

    // The holder is `display: none` under 768px, and an element that is not
    // displayed never intersects — so the phone case needs no extra guard.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && !document.hidden;
        if (visible) run();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(holder);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [heroSelector, interactive, landmarks, lightPanels]);

  return (
    <div
      aria-hidden={interactive ? undefined : "true"}
      className={`fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-700 md:block lg:right-6 ${
        interactive ? "" : "pointer-events-none"
      }`}
      ref={holderRef}
      style={{ width: WIDTH }}
    >
      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0"
        ref={canvasRef}
      />
      {interactive
        ? marks.map((y, index) => (
            <button
              className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f7cfe6]"
              key={landmarks[index]?.selector ?? index}
              onClick={() => jump(landmarks[index].selector)}
              style={{ left: BASE_X, top: y }}
              type="button"
            >
              <span className="sr-only">
                {`Jump to ${landmarks[index]?.label ?? "section"}`}
              </span>
            </button>
          ))
        : null}
    </div>
  );
}
