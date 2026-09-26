"use client";

/**
 * The loose sakura petal field, in 2D.
 *
 * The hero drops petals through a WebGL canvas; below the hero the page is
 * type on flat black and nothing falls. This is the same petal, rebuilt as
 * a plain canvas path so it can keep falling down the rest of the page for
 * a few thousandths of a frame instead of a second WebGL context.
 *
 * Everything here is pure: colours, one petal's state and the step that
 * advances it. The React side (PetalDrift.tsx) owns the canvas, the loop
 * and the observers.
 *
 * The petal's outline, the palette and the gust envelope are NOT ported
 * again here. They live in components/petalGlyphs.ts, which is the one port
 * of the hero's petal (BareThreeCanvas.tsx:1707-1795 and :2564-2640). This
 * file used to carry its own copy of all three — the same numbers written
 * twice, which stay the same numbers only until somebody retunes the tree.
 */

import {
  PETAL_EDGE_COLOR,
  PETAL_MID_COLOR,
  PETAL_VARIANT_COUNT,
  clamp01,
  gustEnvelope,
  petalPath,
  seededRandom,
  smoothstep,
  type Rgb,
} from "@/components/petalGlyphs";

export { PETAL_VARIANT_COUNT, clamp01, gustEnvelope, smoothstep };

/** Deterministic RNG so a reload lays the field out the same way. */
export const makeRng = seededRandom;

/**
 * The three variants as unit-length Path2D outlines, built once at mount —
 * a Path2D is rasterised by the browser on every fill, so the cost that
 * matters is the fill, not this. Quality 1.4 samples the outline at 22
 * steps down each edge, which is smooth at the 26 px the nearest petals
 * are drawn at.
 */
export function createPetalPaths(): Path2D[] {
  return Array.from({ length: PETAL_VARIANT_COUNT }, (_, i) => petalPath(i, 1.4));
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------
//
// The sakura palette, from BareThreeCanvas.tsx:1707-1735. Two ends instead
// of the hero's three-stop ramp: at this size a petal is one flat fill, and
// which end it gets is decided by which face is toward the light.
//
// One ground, not two. The field draws behind the page's type (see the note
// on the layer in PetalDrift.tsx), and the only other ground the page has —
// the cream Contact panel — is opaque and covers the canvas outright, so a
// petal is only ever seen against the near-black page. The deep half of the
// palette that used to be swapped in over cream is gone with it.

type RGB = [number, number, number];

/** petalGlyphs keeps colour channels at 0..1, as three.js does; a canvas
 *  fillStyle wants 0..255. */
const to255 = (color: Rgb): RGB => [color[0] * 255, color[1] * 255, color[2] * 255];

/** Lit face / back face. */
const PETAL_LIT = to255(PETAL_EDGE_COLOR); //  #fdeff8
const PETAL_BACK = to255(PETAL_MID_COLOR); // #f7cfe6

/** Quantisation of the lit-face shading. 8 is smooth; the tumble is fast. */
export const SHADE_STEPS = 8;
/**
 * Depth bands. Distance is carried by size and alpha, not by blur; three
 * bands is enough to give the field front-to-back separation and keeps the
 * colour table at 24 strings.
 */
export const DEPTH_BANDS = 3;
const DEPTH_ALPHA = [0.42, 0.68, 0.94];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Every colour the field can draw, as ready-made rgba strings, indexed by
 * petalColourIndex. Built once. This is the same trick halftone.ts uses for
 * its dots: quantise, bucket, and pay for one fillStyle per bucket instead
 * of one per petal.
 */
export function buildPetalColours(): string[] {
  const out: string[] = [];
  for (let depth = 0; depth < DEPTH_BANDS; depth += 1) {
    const alpha = DEPTH_ALPHA[depth];
    for (let shade = 0; shade < SHADE_STEPS; shade += 1) {
      const s = (shade + 0.5) / SHADE_STEPS;
      const c = mix(PETAL_BACK, PETAL_LIT, s);
      out.push(
        `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha.toFixed(2)})`,
      );
    }
  }
  return out;
}

export function petalColourIndex(depthBand: number, shadeStep: number) {
  return depthBand * SHADE_STEPS + shadeStep;
}

export const PETAL_COLOUR_COUNT = DEPTH_BANDS * SHADE_STEPS;

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * Viewport pixels per petal. 1440x900 is 1.30 M px, so ~81 petals.
 *
 * Thinned from one per 10,000 px at integration. The field is the only
 * ambient thing running below the hero and it reads better sparse: at 130
 * petals a screen of body copy had two or three crossing it at any moment,
 * which is snow. At 80 you notice one petal at a time, which is a tree.
 */
export const AREA_PER_PETAL = 16_000;
export const MIN_PETALS = 14;
export const MAX_PETALS = 110;
/** Phones get a little over half the density: smaller GPU, smaller stage. */
export const NARROW_VIEWPORT = 640;
export const NARROW_DENSITY = 0.55;

/** Petal length in CSS px at depth 0 and at depth 1. */
const SIZE_NEAR = 26;
const SIZE_FAR = 9;
/** Fall speed in CSS px/s, before depth and gust. */
const FALL_MIN = 26;
const FALL_MAX = 52;
/** Steady sideways breeze, px/s, and how much the gust adds on top. */
const WIND_BASE = 14;
const WIND_GUST = 46;
/** The flutter that rides the swell — fast, small, shared by the whole field. */
const WIND_FLUTTER = 11;
/** Per-petal sway around the shared wind, px/s. */
const SWAY_MIN = 5;
const SWAY_MAX = 22;
/** Tumble rate, rad/s. Slow enough to read as a sheet turning over. */
const SPIN_MIN = 0.5;
const SPIN_MAX = 2.1;
/**
 * How much faster an edge-on petal drops. A flat sheet broadside has most
 * of the drag; turn it edge-on and it knifes down, which is what gives a
 * real petal its stop-start descent.
 */
const EDGE_ON_DIVE = 0.55;
/**
 * How hard the page's scroll drags the field, as a fraction of scroll
 * velocity. Petals lag the page: scroll down fast and they stream upward
 * past you. 1 would pin them to the document; 0.22 reads as air.
 */
export const SCROLL_DRAG = 0.22;
/** Scroll velocity, px/s, at which the drag saturates. */
const SCROLL_CLAMP = 2600;
/** Extra tumble a fast scroll puts into a petal, rad/s per px/s. */
const SCROLL_SPIN = 0.0009;

// ---------------------------------------------------------------------------
// One petal
// ---------------------------------------------------------------------------

export type Petal = {
  x: number;
  y: number;
  /** 0 = far and small, 1 = near and large. */
  depth: number;
  depthBand: number;
  size: number;
  fall: number;
  /** Tumble angle about the petal's own long axis. cos of it is the squash. */
  spin: number;
  spinRate: number;
  /** Screen rotation of the long axis, and its idle drift. */
  rot: number;
  rotRate: number;
  swayPhase: number;
  swayFreq: number;
  swayAmp: number;
  variant: number;
};

/**
 * Places one petal. `fromTop` seeds it just above the viewport (a recycle);
 * false scatters it through the whole height (first fill, so the field is
 * already full at t=0 instead of raining in from nothing).
 */
export function spawnPetal(
  petal: Petal,
  rng: () => number,
  width: number,
  height: number,
  fromTop: boolean,
) {
  const depth = rng();
  petal.depth = depth;
  petal.depthBand = Math.min(DEPTH_BANDS - 1, Math.floor(depth * DEPTH_BANDS));
  petal.size = SIZE_FAR + (SIZE_NEAR - SIZE_FAR) * depth;
  // Overshoot the sides: the wind pushes one way, so petals have to be able
  // to enter from off the upwind edge rather than popping in at x = 0.
  petal.x = -width * 0.25 + rng() * width * 1.5;
  petal.y = fromTop ? -petal.size - rng() * height * 0.35 : rng() * height;
  petal.fall = FALL_MIN + rng() * (FALL_MAX - FALL_MIN);
  petal.spin = rng() * Math.PI * 2;
  petal.spinRate = (SPIN_MIN + rng() * (SPIN_MAX - SPIN_MIN)) * (rng() < 0.5 ? -1 : 1);
  petal.rot = rng() * Math.PI * 2;
  petal.rotRate = (rng() * 2 - 1) * 0.5;
  petal.swayPhase = rng() * Math.PI * 2;
  petal.swayFreq = 0.5 + rng() * 1.1;
  petal.swayAmp = SWAY_MIN + rng() * (SWAY_MAX - SWAY_MIN);
  petal.variant = Math.floor(rng() * PETAL_VARIANT_COUNT);
  return petal;
}

export function createPetals(count: number, rng: () => number, width: number, height: number) {
  return Array.from({ length: count }, () =>
    spawnPetal(
      {
        depth: 0,
        depthBand: 0,
        fall: 0,
        rot: 0,
        rotRate: 0,
        size: 0,
        spin: 0,
        spinRate: 0,
        swayAmp: 0,
        swayFreq: 0,
        swayPhase: 0,
        variant: 0,
        x: 0,
        y: 0,
      },
      rng,
      width,
      height,
      false,
    ),
  );
}

/** Everything the whole field shares for one frame. */
export type FieldWind = {
  /** Seconds since the loop started. */
  t: number;
  /** Sideways wind, px/s, already including gust and flutter. */
  wind: number;
  /** The gust envelope itself, ~0.2..1.22. Modulates fall speed and tumble. */
  gust: number;
  /** Scroll velocity in px/s, positive scrolling down, already clamped. */
  scroll: number;
};

/** One wind, allocated at mount and written over every frame. */
export function createWind(): FieldWind {
  return { gust: 0, scroll: 0, t: 0, wind: 0 };
}

/**
 * Reads the shared wind for this frame. One call per frame, not per petal.
 *
 * Writes into `out` instead of returning a fresh object: this runs 60 times
 * a second for as long as the page is on screen, and a per-frame object
 * literal is garbage the collector has to come back for.
 */
export function sampleWind(out: FieldWind, t: number, scrollVelocity: number): FieldWind {
  const gust = gustEnvelope(t, 0);
  out.t = t;
  out.gust = gust;
  out.wind =
    WIND_BASE + WIND_GUST * (gust - 0.2) + WIND_FLUTTER * Math.sin(t * 3.1 + gust * 2.4);
  out.scroll = Math.max(-SCROLL_CLAMP, Math.min(SCROLL_CLAMP, scrollVelocity));
  return out;
}

/**
 * Advances one petal. Returns true if it left the frame and needs respawning
 * (the caller does that, because it owns the RNG).
 */
export function stepPetal(
  petal: Petal,
  dt: number,
  wind: FieldWind,
  width: number,
  height: number,
) {
  const near = 0.4 + 0.85 * petal.depth;
  // How broadside the petal is, 0 edge-on .. 1 flat. Same number that
  // squashes it on screen, so what you see is what it feels.
  const broadside = Math.abs(Math.cos(petal.spin));

  const sway = Math.sin(wind.t * petal.swayFreq + petal.swayPhase) * petal.swayAmp;
  const vx = wind.wind * near + sway * (0.5 + petal.depth);
  const vy =
    petal.fall * near * (0.85 + 0.3 * wind.gust) * (1 + EDGE_ON_DIVE * (1 - broadside));

  petal.x += vx * dt;
  // Scroll drag is the only term that can move a petal upward: the page
  // slides under the field and the air it is in lags behind.
  petal.y += (vy - wind.scroll * SCROLL_DRAG * near) * dt;

  petal.spin +=
    (petal.spinRate * (0.7 + 0.6 * wind.gust) + Math.abs(wind.scroll) * SCROLL_SPIN * Math.sign(petal.spinRate)) *
    dt;
  // The long axis leans downwind, hard-limited so a petal never lies flat
  // across the type like a rule.
  const lean = Math.max(-0.6, Math.min(0.6, vx / 90));
  petal.rot += (petal.rotRate * 0.35 + lean * 0.6) * dt;

  const margin = petal.size * 1.6;
  if (petal.y > height + margin) return true;
  // A hard upward scroll can carry petals off the top; recycle from the
  // bottom rather than leaving a bald patch.
  if (petal.y < -height - margin) {
    petal.y = height + margin;
    return false;
  }
  // Wrap sideways instead of respawning: the wind is one-directional, so a
  // petal that leaves downwind should come back upwind at the same height.
  if (petal.x > width + margin) petal.x = -margin;
  else if (petal.x < -margin) petal.x = width + margin;
  return false;
}

/** The lit-face shading, 0..1, quantised into SHADE_STEPS. */
export function shadeStepFor(petal: Petal) {
  const facing = 0.5 + 0.5 * Math.cos(petal.spin);
  return Math.min(SHADE_STEPS - 1, Math.floor(facing * SHADE_STEPS));
}
