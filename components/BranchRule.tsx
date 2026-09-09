"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BLOSSOM_CENTER_COLOR,
  BLOSSOM_TINT_PALE,
  PETAL_BASE_COLOR,
  PETAL_EDGE_COLOR,
  PETAL_MID_COLOR,
  PETAL_VARIANT_COUNT,
  clamp01,
  hashSeed,
  petalOutline,
  rgbToCss,
  seededRandom,
} from "@/components/petalGlyphs";

/**
 * The rule under a Selected-work row, grown instead of drawn.
 *
 * Every row used to end in a 1px hairline that scaled in from the left on
 * hover. The hero above is a cherry tree in a halftone dither, so a plain
 * white line was the moment the page stopped being that. This grows a twig
 * along the same edge instead: tapered, thick at the root and thinning to
 * nothing, a couple of side spurs, and two or three five-petal flowers that
 * open late and out of step with each other.
 *
 * The shape comes from the seed, so a row's branch is the same on every
 * visit and on the server, and no two rows get the same one. Nothing here
 * calls Math.random() while rendering.
 *
 * Resting, hovered-out, reduced-motion and touch all end in the same place:
 * the hairline and nothing else. The SVG is display:none until the growth
 * actually starts, so there is no stray dot sitting on the edge of a row
 * nobody is pointing at.
 */

/** The band the branch lives in, px above the row's bottom edge. Rows have
 *  28-40px of padding under the last line of copy, so this fits inside it
 *  and never reaches the text. */
const HEIGHT = 34;
const BASE_Y = HEIGHT - 1.5;
/** How far through the hover the last twig segment finishes. The rest of
 *  the timeline belongs to the flowers, which is why they read as late. */
const DRAW_END = 0.62;
/** How much of the timeline one flower takes to open. */
const BLOOM_SPAN = 0.24;
/** Seconds for the whole thing to grow, and to pull back. Retracting is
 *  faster on purpose: a branch that lingers after the pointer has moved to
 *  the next row reads as lag, not as motion. */
const GROW_SECONDS = 1.15;
const RETRACT_SECONDS = 0.45;

/** Palette, from petalGlyphs — which is the one port of the hero's blossom
 *  colours (BareThreeCanvas.tsx:1711-1732). These used to be four hex
 *  strings written out again here, which stay the hero's colours only until
 *  somebody retunes the tree.
 *
 *  The twig is the one thing with no hero colour to borrow. The hero's wood
 *  is a near-black bark texture, which on this page's dark background is an
 *  invisible line, and its pedicels (#5d4150) are barely better. So the twig
 *  takes the blossom's own mid pink at half alpha: it is the palest thing on
 *  the row that still belongs to the same four colours, and it keeps the
 *  rule inside the palette instead of alongside it. */
const TWIG_COLOR = rgbToCss(PETAL_MID_COLOR, 0.5);
const PETAL_TINTS = [
  PETAL_EDGE_COLOR,
  PETAL_MID_COLOR,
  PETAL_BASE_COLOR,
  BLOSSOM_TINT_PALE,
].map((color) => rgbToCss(color));
const BLOSSOM_CENTER = rgbToCss(BLOSSOM_CENTER_COLOR);

/**
 * The hero's petal outline, one SVG path per variant.
 *
 * petalGlyphs hands it back as a flat point loop centred on the origin with
 * the length running -0.5 (claw) to +0.5 (tip) down +y. A flower here is
 * five petals rotated about the claw with the tip pointing up, so the frame
 * is shifted and flipped: claw at the origin, tip at y = -1. Quality 1.1 is
 * ~18 points down each edge, which is smooth at the 5-7px these are drawn
 * at and small enough to keep the whole rule under a few hundred bytes of
 * markup. petalPath() is the canvas twin of this and cannot be used —
 * Path2D does not exist on the server, and these rows render there.
 */
const PETAL_PATHS = Array.from({ length: PETAL_VARIANT_COUNT }, (_, variant) => {
  const points = petalOutline(variant, 1.1);
  let d = "";
  for (let i = 0; i < points.length; i += 2) {
    d += `${i ? "L" : "M"} ${points[i].toFixed(3)} ${(-points[i + 1] - 0.5).toFixed(3)} `;
  }
  return `${d}Z`;
});
const PETAL_ANGLES = [0, 72, 144, 216, 288];

type Twig = {
  d: string;
  /** Stroke width, px. Taper is six stroked segments, not one path — SVG
   *  strokes cannot vary in width, and a filled outline could not be drawn
   *  on with stroke-dashoffset. */
  weight: number;
  /** The slice of the hover timeline this segment draws over. */
  from: number;
  to: number;
};

type Bloom = {
  x: number;
  y: number;
  r: number;
  /** Resting rotation, degrees. Each flower opens INTO it from -74deg. */
  spin: number;
  /** Where in the hover timeline this one starts opening. */
  at: number;
  tint: string;
  /** Which of the hero's three petal outlines this flower is built from. */
  variant: number;
};

type Branch = { twigs: Twig[]; blooms: Bloom[] };

function easeOut(t: number) {
  const u = 1 - t;
  return 1 - u * u * u;
}

/** Overshoots slightly then settles — a bud snapping open rather than a
 *  flower fading up. */
function easeOutBack(t: number) {
  const u = t - 1;
  return 1 + u * u * (2.3 * u + 1.3);
}

/**
 * Builds one row's branch in px, left root to right tip.
 *
 * The main line is a sampled curve — a steady climb toward the tip with two
 * sine wobbles beating over it — cut into six stroked segments whose widths
 * fall from about 2.3px to half a pixel. Each segment's timeline slice is
 * its share of the total length, so the twig grows at an even speed rather
 * than racing through the short pieces.
 */
function buildBranch(seed: number | string, width: number): Branch {
  const rand = seededRandom(
    hashSeed(typeof seed === "number" ? `#${seed}` : seed),
  );

  const climb = 4 + rand() * 7;
  const waveA = 1.6 + rand() * 2.6;
  const waveB = 0.8 + rand() * 1.6;
  const freqA = 1.1 + rand() * 1.4;
  const freqB = 2.6 + rand() * 2.2;
  const phaseA = rand() * Math.PI * 2;
  const phaseB = rand() * Math.PI * 2;

  const yAt = (t: number) => {
    const lift =
      climb * Math.pow(t, 0.8) +
      waveA * Math.sin(Math.PI * t * freqA * 2 + phaseA) * Math.min(1, t * 3) +
      waveB * Math.sin(Math.PI * t * freqB * 2 + phaseB) * t;
    return Math.min(BASE_Y, Math.max(3, BASE_Y - lift));
  };

  const clampY = (y: number) => Math.min(BASE_Y + 2.5, Math.max(3, y));

  const SAMPLES = 48;
  const points: [number, number][] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    points.push([t * width, yAt(t)]);
  }

  const PIECES = 6;
  const per = SAMPLES / PIECES;
  const raw: { d: string; length: number; weight: number }[] = [];
  for (let piece = 0; piece < PIECES; piece += 1) {
    const first = Math.round(piece * per);
    const last = Math.round((piece + 1) * per);
    let d = `M ${points[first][0].toFixed(2)} ${points[first][1].toFixed(2)}`;
    let length = 0;
    for (let i = first + 1; i <= last; i += 1) {
      d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
      length += Math.hypot(
        points[i][0] - points[i - 1][0],
        points[i][1] - points[i - 1][1],
      );
    }
    const along = piece / (PIECES - 1);
    raw.push({ d, length, weight: 2.3 - along * 1.8 + rand() * 0.15 });
  }

  const trunkLength = raw.reduce((sum, piece) => sum + piece.length, 0) || 1;
  const twigs: Twig[] = [];
  let cursor = 0;
  raw.forEach((piece) => {
    const from = (cursor / trunkLength) * DRAW_END;
    cursor += piece.length;
    twigs.push({
      d: piece.d,
      weight: piece.weight,
      from,
      to: Math.max(from + 0.01, (cursor / trunkLength) * DRAW_END),
    });
  });

  // Side spurs. Each leaves the trunk along its tangent, turned up (mostly)
  // by a wide angle, and bends again halfway out so it does not read as a
  // ruled tick. Two segments each, so they taper too.
  const spurCount = rand() < 0.45 ? 2 : 3;
  const tips: [number, number][] = [];
  for (let i = 0; i < spurCount; i += 1) {
    const t0 = 0.24 + (i / spurCount) * 0.52 + rand() * 0.1;
    const x0 = t0 * width;
    const y0 = yAt(t0);
    const ahead = Math.min(1, t0 + 0.02);
    const tangent = Math.atan2(yAt(ahead) - y0, (ahead - t0) * width);
    // Up is negative y. Mostly up: a spur hanging below the rule crosses
    // into the next row's copy.
    const up = rand() < 0.78 ? -1 : 1;
    const spread = 0.55 + rand() * 0.5;
    const length = (13 + rand() * 12) * (1 - t0 * 0.35);
    const a1 = tangent + up * spread;
    const a2 = a1 + up * (0.2 + rand() * 0.3);
    const x1 = x0 + Math.cos(a1) * length * 0.55;
    // Clamped to the band: 3px of headroom at the top, and no more than a
    // couple of px past the rule, so a downward spur crosses the hairline
    // instead of hanging into the next row's copy.
    const y1 = clampY(y0 + Math.sin(a1) * length * 0.55);
    const x2 = x1 + Math.cos(a2) * length * 0.5;
    const y2 = clampY(y1 + Math.sin(a2) * length * 0.5);
    tips.push([x2, y2]);

    const root = DRAW_END * t0;
    twigs.push({
      d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      weight: 1.15 - t0 * 0.4,
      from: root + 0.02,
      to: root + 0.11,
    });
    twigs.push({
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      weight: 0.75 - t0 * 0.25,
      from: root + 0.09,
      to: root + 0.19,
    });
  }

  // Flowers sit on the spur tips first, then out near the trunk's own tip.
  // They start opening after the twig has passed them, staggered, and the
  // last one is still opening when the trunk has finished.
  const bloomSpots: [number, number][] = [...tips];
  const tipT = 0.86 + rand() * 0.1;
  bloomSpots.push([tipT * width, yAt(tipT)]);

  const blooms: Bloom[] = bloomSpots.slice(0, spurCount === 2 ? 2 : 3).map(
    ([x, y], i) => {
      const r = 4.6 + rand() * 2.2;
      const at = Math.min(
        1 - BLOOM_SPAN,
        0.46 + i * (0.12 + rand() * 0.06) + rand() * 0.04,
      );
      return {
        at,
        r,
        spin: rand() * 360,
        tint: PETAL_TINTS[Math.floor(rand() * PETAL_TINTS.length)],
        // Cycled rather than drawn from the RNG: it costs nothing, it gives
        // a three-flower branch three different petal shapes, and it leaves
        // the random stream — and so every existing branch — untouched.
        variant: i % PETAL_VARIANT_COUNT,
        x,
        // A flower's whole face has to stay in the band, including the one
        // on a spur that dropped through the rule.
        y: Math.min(BASE_Y - 2, Math.max(r + 1, y)),
      };
    },
  );

  return { blooms, twigs };
}

export type BranchRuleProps = {
  /** Anything stable and per-row — the entry title is ideal. Same seed,
   *  same branch, on the server and on every visit. */
  seed: number | string;
  /**
   * Whether the branch is grown. Leave it out and the component watches its
   * own parent element for pointer and focus instead, which is what the
   * work rows do (they already track hover for the plate, and a second
   * piece of React state per row buys nothing).
   */
  active?: boolean;
  className?: string;
};

export default function BranchRule({ active, className, seed }: BranchRuleProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const hairRef = useRef<HTMLSpanElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const twigRefs = useRef<(SVGPathElement | null)[]>([]);
  const bloomRefs = useRef<(SVGGElement | null)[]>([]);
  // Kept out of state: a rebuild (resize) mid-hover must not snap the
  // growth back to nothing.
  const progressRef = useRef(0);
  // Hover is read through a ref, not through the effect's deps. Putting `on`
  // in the deps meant every hover-in and every hover-out tore the growth
  // effect down and rebuilt it: a fresh IntersectionObserver, a fresh
  // visibilitychange listener, and getTotalLength() over up to twelve paths,
  // which forces a synchronous path layout each time. Measured over one
  // hover of one row that cost 81 layouts / 6.3ms in and 35 / 2.6ms out,
  // against 4 / 1.1ms for the same window with nothing hovered.
  const onRef = useRef(false);
  // The growth effect hands its loop starter out here so the hover effect
  // below can kick it without owning any of the setup.
  const runRef = useRef<(() => void) | null>(null);

  // "pending" until the media queries have been read on the client. The
  // server cannot know either, and rendering the branch and then removing
  // it would be a hydration mismatch.
  const [mode, setMode] = useState<"pending" | "still" | "motion">("pending");
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState(false);

  const on = active ?? hovered;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // No hover means the branch can never be triggered, so the row would
    // have no separator at all. Those visitors get the plain rule.
    const hover = window.matchMedia("(hover: hover)");
    const decide = () => {
      setMode(motion.matches || !hover.matches ? "still" : "motion");
    };
    decide();
    motion.addEventListener("change", decide);
    hover.addEventListener("change", decide);
    return () => {
      motion.removeEventListener("change", decide);
      hover.removeEventListener("change", decide);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mode !== "motion") return undefined;
    const observer = new ResizeObserver(() => {
      // Rounded to 4px: the branch does not need to be rebuilt for every
      // pixel of a window drag.
      setWidth(Math.round(host.clientWidth / 4) * 4);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [mode]);

  // Hover taken off the parent row when no `active` prop is given.
  // Listeners live on the row element, not on this span, so the decoration
  // never takes a pointer event or a tab stop of its own.
  useEffect(() => {
    if (active !== undefined || mode !== "motion") return undefined;
    const host = hostRef.current;
    const row = host?.closest<HTMLElement>("[data-branch-host]") ?? host?.parentElement;
    if (!row) return undefined;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    row.addEventListener("pointerenter", enter);
    row.addEventListener("pointerleave", leave);
    row.addEventListener("focusin", enter);
    row.addEventListener("focusout", leave);
    return () => {
      row.removeEventListener("pointerenter", enter);
      row.removeEventListener("pointerleave", leave);
      row.removeEventListener("focusin", enter);
      row.removeEventListener("focusout", leave);
    };
  }, [active, mode]);

  const branch = useMemo(
    () => (mode === "motion" && width > 0 ? buildBranch(seed, width) : null),
    [mode, seed, width],
  );

  useEffect(() => {
    const hair = hairRef.current;
    if (!hair) return undefined;

    if (mode !== "motion" || !branch) {
      // Still: the plain hairline, full width, no transition, nothing else
      // on the row. "pending" keeps it hidden for the one frame before the
      // media queries are read.
      hair.style.transform = mode === "still" ? "scaleX(1)" : "scaleX(0)";
      return undefined;
    }

    const svg = svgRef.current;
    if (!svg) return undefined;
    // Trim the ref arrays: a rebuild at a new width can leave refs to paths
    // that are no longer in the document.
    twigRefs.current.length = branch.twigs.length;
    bloomRefs.current.length = branch.blooms.length;
    const twigs = twigRefs.current;
    const blooms = bloomRefs.current;
    const lengths = twigs.map((el) => (el ? el.getTotalLength() : 0));
    twigs.forEach((el, i) => {
      if (el) el.style.strokeDasharray = `${lengths[i]}`;
    });

    let p = progressRef.current;
    let frame = 0;
    let last = 0;
    // Read fresh every time rather than captured: this effect now outlives
    // any number of hovers.
    const targetNow = () => (onRef.current ? 1 : 0);

    const apply = () => {
      progressRef.current = p;
      // display:none, not opacity — at rest there must be nothing on the
      // edge of the row at all, not a hairline of a dot.
      svg.style.display = p > 0.002 ? "block" : "none";
      hair.style.transform = `scaleX(${easeOut(clamp01(p / DRAW_END))})`;
      if (p <= 0.002) return;
      branch.twigs.forEach((twig, i) => {
        const el = twigs[i];
        if (!el) return;
        const grown = clamp01((p - twig.from) / (twig.to - twig.from));
        el.style.strokeDashoffset = `${lengths[i] * (1 - easeOut(grown))}`;
      });
      branch.blooms.forEach((bloom, i) => {
        const el = blooms[i];
        if (!el) return;
        const open = clamp01((p - bloom.at) / BLOOM_SPAN);
        const scale = open <= 0 ? 0 : easeOutBack(open) * bloom.r;
        el.setAttribute(
          "transform",
          `rotate(${(bloom.spin - 74 * (1 - open)).toFixed(1)}) scale(${scale.toFixed(3)})`,
        );
        el.style.opacity = `${Math.min(1, open * 2.4)}`;
      });
    };

    const step = (time: number) => {
      const target = targetNow();
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
      last = time;
      const rate = 1 / (target > p ? GROW_SECONDS : RETRACT_SECONDS);
      if (target > p) p = Math.min(target, p + dt * rate);
      else p = Math.max(target, p - dt * rate);
      apply();
      frame = p === target ? 0 : requestAnimationFrame(step);
    };

    const settle = () => {
      p = targetNow();
      apply();
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    // Scrolled away or tab hidden: jump to wherever it was heading and stop
    // the loop. Nobody can see the difference, and a row left mid-growth
    // off screen would otherwise hold a rAF open. The check lives in run()
    // rather than only at the observer, because a hover can arrive while the
    // row is off screen and must not start a loop nobody is watching.
    let onScreen = true;
    const run = () => {
      const target = targetNow();
      if (!onScreen || document.hidden) {
        stop();
        if (p !== target) settle();
        return;
      }
      if (frame || p === target) return;
      last = 0;
      frame = requestAnimationFrame(step);
    };
    runRef.current = run;

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        run();
      },
      { threshold: 0 },
    );
    observer.observe(hostRef.current ?? svg);
    document.addEventListener("visibilitychange", run);

    apply();
    run();

    return () => {
      stop();
      if (runRef.current === run) runRef.current = null;
      observer.disconnect();
      document.removeEventListener("visibilitychange", run);
    };
  }, [branch, mode]);

  // Hover does one thing now: move the target and wake the loop. No
  // observer, no listener, no path measurement.
  useEffect(() => {
    onRef.current = on;
    runRef.current?.();
  }, [on]);

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 block h-0 ${className ?? ""}`}
      ref={hostRef}
    >
      <span
        className="absolute inset-x-0 bottom-0 block h-px origin-left bg-white/25"
        ref={hairRef}
        style={{ transform: "scaleX(0)" }}
      />
      {branch ? (
        <svg
          className="absolute bottom-0 left-0 overflow-visible"
          height={HEIGHT}
          ref={svgRef}
          style={{ display: "none" }}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
        >
          {branch.twigs.map((twig, i) => (
            <path
              d={twig.d}
              fill="none"
              key={`twig-${i}`}
              ref={(el) => {
                twigRefs.current[i] = el;
              }}
              stroke={TWIG_COLOR}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={Math.max(0.4, twig.weight)}
            />
          ))}
          {branch.blooms.map((bloom, i) => (
            <g
              key={`bloom-${i}`}
              transform={`translate(${bloom.x.toFixed(2)} ${bloom.y.toFixed(2)})`}
            >
              <g
                opacity={0}
                ref={(el) => {
                  bloomRefs.current[i] = el;
                }}
                transform="scale(0)"
              >
                {PETAL_ANGLES.map((angle) => (
                  <path
                    d={PETAL_PATHS[bloom.variant]}
                    fill={bloom.tint}
                    key={angle}
                    opacity={0.92}
                    transform={`rotate(${angle})`}
                  />
                ))}
                <circle fill={BLOSSOM_CENTER} r={0.22} />
              </g>
            </g>
          ))}
        </svg>
      ) : null}
    </span>
  );
}
