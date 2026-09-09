"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
  type RefObject,
} from "react";
import gsap from "gsap";
import {
  SITE_EASE,
  gustEnvelope,
  hashSeed,
  petalGradient,
  petalPath,
  samplePetalTint,
  seededRandom,
  PETAL_VARIANT_COUNT,
} from "@/components/petalGlyphs";

/**
 * A block of text that arrives instead of appearing, and drops a petal or
 * two on the way in.
 *
 * useRevealOnScroll fades [data-reveal] elements up from below, which is
 * the same reveal every site has. Above the fold this page is a cherry tree
 * in a dither; the moment you scroll past the hero all of that stops. This
 * wrapper is the join: the text still rises, on the exact curve the rest of
 * the page eases with (cubic-bezier(0.22,1,0.36,1), the same one the Work
 * rows and their hairlines use), and one to three loose petals cross the
 * block behind the type as it lands and drift out of frame.
 *
 * The petals are drawn on a canvas the effect appends itself — it is
 * decoration, it is aria-hidden, and under prefers-reduced-motion it is
 * never created at all. It sits at z-index -1 inside a stacking context of
 * its own (`isolate`), so petals pass BEHIND the words: nothing decorative
 * ever lands on a glyph, and the type's contrast is whatever it was.
 *
 * Everything is seeded, so a re-render puts the same petals in the same
 * places rather than reshuffling them mid-flight. The default seed is the
 * block's own text, which is stable without the caller having to invent an
 * id.
 */

/** Room around the block for petals to enter and leave in, CSS px. */
const PAD = 56;
/** Highest device pixel ratio worth paying for on a garnish this small. */
const MAX_DPR = 2;
/** A petal is this many CSS px from claw to tip. Roughly the hero's, seen
 * at the hero's framing. */
const PETAL_MIN_SIZE = 13;
const PETAL_MAX_SIZE = 22;

type Petal = {
  x: number;
  y: number;
  /** Steady drift, px/s. Sway and gust ride on top of vx. */
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  /** How fast the petal turns edge-on and back — the flat-plate flutter,
   * faked in 2D by squashing the shape across its width. */
  bankFreq: number;
  bankPhase: number;
  gustPhase: number;
  variant: number;
  fill: CanvasGradient;
  /** Negative until the petal is due, so a group enters staggered. */
  age: number;
  life: number;
};

// useLayoutEffect on the client so the block is hidden before the browser
// paints; useEffect on the server so React does not warn. The markup itself
// ships visible — a page whose JS never runs is a page you can still read.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type PetalRevealProps = {
  /** Tag to render. Anything block-level; defaults to a div. */
  as?: keyof JSX.IntrinsicElements;
  children: ReactNode;
  className?: string;
  /** Stable seed for the petals. Defaults to the block's own text. */
  seed?: string;
  /** How far the block rises, CSS px. 90 matches `data-reveal="far"`. */
  travel?: number;
  /** Seconds before the rise starts once the block enters. */
  delay?: number;
  /** Seconds the rise takes. */
  duration?: number;
  /** Petals to send across. Clamped by viewport size; 0 for none. */
  petals?: number;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

export default function PetalReveal({
  as = "div",
  children,
  className = "",
  seed,
  travel = 32,
  delay = 0,
  duration = 0.9,
  petals,
  ...rest
}: PetalRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // Resting state: children visible, no offset, no canvas, no loop. The
    // block is already in that state in the markup, so there is nothing to
    // undo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    gsap.set(el, { autoAlpha: 0, y: travel });

    const rand = seededRandom(
      hashSeed(seed ?? (el.textContent ?? "petal").slice(0, 96)),
    );

    // ---- the petals -------------------------------------------------------
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    const flight: Petal[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let clock = 0;
    let onScreen = false;

    const measure = () => {
      if (!canvas) return;
      width = el.offsetWidth + PAD * 2;
      height = el.offsetHeight + PAD * 2;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      frame = 0;
      if (!ctx) return;
      // Frame delta, not wall clock: the loop is stopped while the block is
      // off screen or the tab is hidden, and resuming from wall clock would
      // teleport every petal to where it would have been.
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      clock += dt;

      ctx.clearRect(0, 0, width, height);
      let alive = 0;

      for (const p of flight) {
        p.age += dt;
        if (p.age < 0 || p.age > p.life) {
          if (p.age <= p.life) alive += 1;
          continue;
        }
        // One gust envelope for the whole page (mirrored from the hero's
        // shader), so a petal down here surges when the canopy up there
        // does.
        const gust = gustEnvelope(clock, p.gustPhase);
        const sway = Math.sin(clock * p.swayFreq + p.swayPhase) * p.swayAmp;
        p.x += (p.vx + sway) * gust * dt;
        p.y += p.vy * (0.7 + 0.3 * gust) * dt;
        p.angle += p.spin * dt;

        if (p.x < -PAD || p.x > width + PAD || p.y > height + PAD) {
          p.age = p.life + 1;
          continue;
        }
        alive += 1;

        // In over the first third of a second, out over the last second, so
        // a petal never pops on or off at the edge of the block.
        const alpha =
          0.92 *
          Math.min(1, p.age / 0.35) *
          Math.min(1, (p.life - p.age) / 1);
        // Banking: |cos| of the tumble, floored so the petal never goes
        // fully edge-on and disappears for a frame.
        const bank = 0.3 + 0.7 * Math.abs(Math.cos(clock * p.bankFreq + p.bankPhase));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(p.size * bank, p.size);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.fill;
        ctx.fill(petalPath(p.variant));
        ctx.restore();
      }

      if (!alive) {
        // Nothing left to draw. The canvas stays (a resize would otherwise
        // leave a stale bitmap), but the loop is done for good.
        flight.length = 0;
        return;
      }
      run();
    };

    const run = () => {
      if (frame || !onScreen || document.hidden || !flight.length) return;
      last = 0;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const spawn = () => {
      if (petals === 0) return;
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.position = "absolute";
      canvas.style.left = `${-PAD}px`;
      canvas.style.top = `${-PAD}px`;
      canvas.style.pointerEvents = "none";
      // Behind the words. See the note at the top of the file.
      canvas.style.zIndex = "-1";
      el.appendChild(canvas);
      ctx = canvas.getContext("2d");
      if (!ctx) return;
      measure();

      // Budget. The home page is already running two WebGL scenes and a dot
      // field; this is a garnish, and on a phone it is a garnish on a
      // quarter of the pixels.
      const vw = window.innerWidth;
      const cap = vw < 640 ? 1 : vw < 1100 ? 2 : 3;
      const count = Math.max(
        0,
        Math.min(petals ?? 1 + Math.floor(rand() * 3), cap),
      );
      // Small blocks get smaller petals, so a caption is not crossed by
      // something the size of its own line height.
      const scale = Math.min(1, Math.max(0.55, el.offsetWidth / 720));

      for (let i = 0; i < count; i += 1) {
        // Enter from the top, spread across the block, leaning the way the
        // hero's wind blows (left to right).
        const fromLeft = rand() < 0.72;
        const size =
          (PETAL_MIN_SIZE + rand() * (PETAL_MAX_SIZE - PETAL_MIN_SIZE)) * scale;
        const vy = 42 + rand() * 58;
        const startY = -PAD * 0.4 - rand() * PAD * 0.6;
        const gradient = petalGradient(ctx, samplePetalTint(rand));
        flight.push({
          x: PAD + rand() * Math.max(1, width - PAD * 2),
          y: startY,
          vx: (fromLeft ? 1 : -1) * (14 + rand() * 30),
          vy,
          size,
          angle: rand() * Math.PI * 2,
          spin: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 1.1),
          swayAmp: 16 + rand() * 26,
          swayFreq: 0.55 + rand() * 0.7,
          swayPhase: rand() * Math.PI * 2,
          bankFreq: 1.1 + rand() * 1.6,
          bankPhase: rand() * Math.PI * 2,
          gustPhase: rand() * 40,
          variant: Math.floor(rand() * PETAL_VARIANT_COUNT),
          fill: gradient,
          // Staggered entry, then just long enough to fall out of the
          // padded box. Capped so a very tall block cannot keep one on
          // screen for ten seconds.
          age: -(i * (0.35 + rand() * 0.5)),
          life: Math.min(9, (height + PAD - startY) / vy),
        });
      }
      run();
    };

    // ---- the reveal -------------------------------------------------------
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      revealObserver.disconnect();
      window.clearTimeout(failsafe);
      gsap.to(el, {
        autoAlpha: 1,
        y: 0,
        delay,
        duration,
        // The page's own curve, solved exactly rather than approximated
        // with one of GSAP's named eases.
        ease: SITE_EASE,
      });
      spawn();
    };

    const revealObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    revealObserver.observe(el);

    // Failsafe, same reasoning as useRevealOnScroll's sweep: the block is
    // hidden by script, so a block whose observer never fires is a block of
    // missing text. If it is on screen after a couple of seconds and still
    // waiting, show it.
    const failsafe = window.setTimeout(() => {
      const box = el.getBoundingClientRect();
      if (box.bottom > 0 && box.top < window.innerHeight) reveal();
    }, 2400);

    // The rAF gate. Separate from the reveal observer because that one has
    // a bottom margin and unhooks itself after firing; this one has to keep
    // watching for as long as petals are in the air.
    const loopObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) run();
        else stop();
      },
      { threshold: 0 },
    );
    loopObserver.observe(el);

    const onVisibility = () => {
      if (document.hidden) stop();
      else run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(el);

    return () => {
      stop();
      revealObserver.disconnect();
      loopObserver.disconnect();
      resizeObserver.disconnect();
      window.clearTimeout(failsafe);
      document.removeEventListener("visibilitychange", onVisibility);
      gsap.killTweensOf(el);
      canvas?.remove();
    };
  }, [delay, duration, petals, seed, travel]);

  // Cast so the JSX call keeps one concrete prop type. `as` is any HTML tag
  // at runtime; the props a caller may pass are the common HTML ones either
  // way.
  const Tag = as as "div";
  return (
    <Tag
      {...rest}
      className={`relative isolate ${className}`.trim()}
      ref={ref as RefObject<HTMLDivElement>}
    >
      {children}
    </Tag>
  );
}
