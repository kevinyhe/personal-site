"use client";

/**
 * The hero's sakura petal, as a flat 2D shape.
 *
 * components/BareThreeCanvas.tsx builds the loose falling petal as an
 * instanced three.js mesh: an outline (BareThreeCanvas.tsx:2578-2640), a
 * base->edge colour gradient baked into vertex colours
 * (BareThreeCanvas.tsx:1776-1790) and a per-instance tint drawn from the
 * blossom band (BareThreeCanvas.tsx:1734-1753). Anything below the hero
 * that wants the same petal cannot pull three.js in for it — the page is
 * already running two WebGL contexts and a dot field.
 *
 * So the maths is ported here, once, with no imports at all: the same
 * outline, the same gradient, the same tint ramp, returning a Path2D and
 * plain colours a 2D canvas can use. Numbers that appear in both files are
 * the same numbers; if the hero's petal is retuned, retune this to match.
 *
 * Colour channels are 0..1 here, as in the three.js source, not 0..255.
 * `rgbToCss` is the way out to a fillStyle.
 */

export type Rgb = [number, number, number];

export const clamp01 = (value: number) =>
  value < 0 ? 0 : value > 1 ? 1 : value;

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function fromHex(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------------
// Palette (BareThreeCanvas.tsx:1707-1735)
// ---------------------------------------------------------------------------

export const PETAL_EDGE_COLOR = fromHex("#fdeff8");
export const PETAL_MID_COLOR = fromHex("#f7cfe6");
export const PETAL_BASE_COLOR = fromHex("#e79cc8");
export const BLOSSOM_CENTER_COLOR = fromHex("#c22e63");
export const BLOSSOM_CALYX_COLOR = fromHex("#a13d5d");

export const BLOSSOM_TINT_PALE = fromHex("#f7c4e0");
export const BLOSSOM_TINT_SOFT = fromHex("#f1aed6");
export const BLOSSOM_TINT_ROSE = fromHex("#e693c4");
export const BLOSSOM_TINT_BRIGHT = fromHex("#fbdff0");

export function rgbToCss(color: Rgb, alpha = 1) {
  const r = Math.round(clamp01(color[0]) * 255);
  const g = Math.round(clamp01(color[1]) * 255);
  const b = Math.round(clamp01(color[2]) * 255);
  return alpha >= 1
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/**
 * The petal's own gradient: saturated pink at the claw, near-white at the
 * rim. `xu` is -1..1 across the petal, `vv` is 0..1 base->tip. Port of
 * getPetalVertexColor.
 */
export function petalColorAt(xu: number, vv: number): Rgb {
  const body =
    vv < 0.5
      ? mix(PETAL_BASE_COLOR, PETAL_MID_COLOR, vv / 0.5)
      : mix(PETAL_MID_COLOR, PETAL_EDGE_COLOR, (vv - 0.5) / 0.5);
  const edgePush = clamp01(
    Math.pow(Math.abs(xu), 2.2) * 0.55 + smoothstep(0.8, 1, vv) * 0.35,
  );
  return mix(body, PETAL_EDGE_COLOR, edgePush);
}

// HSL round trip, only needed by the tint jitter below. THREE.Color.offsetHSL
// does exactly this: to HSL, add, back to RGB.
function rgbToHsl(color: Rgb): [number, number, number] {
  const [r, g, b] = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hueToChannel(p: number, q: number, tRaw: number) {
  let t = tRaw;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToChannel(p, q, h + 1 / 3),
    hueToChannel(p, q, h),
    hueToChannel(p, q, h - 1 / 3),
  ];
}

export function offsetHsl(color: Rgb, dh: number, ds: number, dl: number): Rgb {
  const [h, s, l] = rgbToHsl(color);
  return hslToRgb((h + dh + 1) % 1, clamp01(s + ds), clamp01(l + dl));
}

/**
 * One draw from the canopy's tint band. Port of sampleBlossomTint: a mild
 * lean toward the light end of the pink, a small pale-white share for
 * sparkle, and a little hue/sat/light jitter on top. Multiply it into
 * `petalColorAt` (that is what instanceColor does on the GPU) with
 * `tintPetalColor`.
 */
export function samplePetalTint(rand: () => number): Rgb {
  const t = Math.pow(rand(), 1.25);
  let tint =
    t < 0.5
      ? mix(BLOSSOM_TINT_PALE, BLOSSOM_TINT_SOFT, t * 2)
      : mix(BLOSSOM_TINT_SOFT, BLOSSOM_TINT_ROSE, (t - 0.5) * 2);
  if (rand() < 0.08) tint = mix(tint, BLOSSOM_TINT_BRIGHT, 0.55);
  return offsetHsl(
    tint,
    (rand() * 2 - 1) * 0.008,
    -0.05 + rand() * 0.13,
    -0.035 + rand() * 0.06,
  );
}

export function tintPetalColor(base: Rgb, tint: Rgb): Rgb {
  return [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]];
}

// ---------------------------------------------------------------------------
// Outline (BareThreeCanvas.tsx:2564-2640)
// ---------------------------------------------------------------------------

/**
 * The three loose-petal shapes. NOT the attached-flower outline: the deep
 * obcordate notch reads as a heart at this size, so a loose petal is a
 * rounded teardrop with at most a shallow cleft, one lobe a touch wider and
 * the midline bowed.
 *
 * `curl` and `twist` are the 3D terms in the hero mesh. Flat here — a 2D
 * caller gets the same read by squashing the petal across its width as it
 * turns, which is what `PETAL_ASPECT` and the drawing code are for.
 */
export const PETAL_VARIANTS = [
  { cleft: 0.0, peak: 0.5, skew: 0.09, sideBias: 0.1 },
  { cleft: 0.055, peak: 0.44, skew: -0.07, sideBias: -0.12 },
  { cleft: 0.03, peak: 0.56, skew: 0.12, sideBias: 0.08 },
] as const;

export const PETAL_VARIANT_COUNT = PETAL_VARIANTS.length;

/**
 * Width over length, from the hero's 0.093 half-width against its 0.245
 * length. The paths below are normalised to length 1, so a caller scales by
 * the petal length it wants in pixels and gets the real proportions.
 */
export const PETAL_ASPECT = (0.093 * 2) / 0.245;

const HALF_WIDTH = PETAL_ASPECT / 2;

/**
 * One point on the petal surface, in the normalised frame: length 1 along
 * +y, centred on the origin, so y runs -0.5 at the claw to +0.5 at the tip
 * and x is roughly -0.19..+0.19.
 *
 * Canvas y points down, so a petal drawn with this reads tip-up only if the
 * caller flips it. PetalReveal does not bother — a falling petal has no
 * "up".
 */
export function petalPoint(
  variant: number,
  xu: number,
  vv: number,
): [number, number] {
  const shape = PETAL_VARIANTS[((variant % PETAL_VARIANT_COUNT) + PETAL_VARIANT_COUNT) % PETAL_VARIANT_COUNT];
  // Rounded-oval width profile, remapped so the widest point lands at
  // shape.peak along the length instead of always at the middle.
  const vvW =
    vv < shape.peak
      ? (vv / shape.peak) * 0.5
      : 0.5 + ((vv - shape.peak) / (1 - shape.peak)) * 0.5;
  const widthProfile = Math.pow(Math.sin(Math.PI * (0.055 + 0.89 * vvW)), 0.72);
  const cleft =
    shape.cleft *
    Math.pow(Math.max(0, 1 - Math.abs(xu) * 2.3), 2) *
    smoothstep(0.76, 1, vv);
  const cornerRound =
    0.085 * Math.pow(Math.abs(xu), 2.4) * smoothstep(0.5, 1, vv);
  const radial = vv - cleft - cornerRound;
  const lateral =
    xu * (1 + shape.sideBias * xu) * widthProfile +
    shape.skew * Math.sin(Math.PI * vv);
  return [lateral * HALF_WIDTH, radial - 0.5];
}

/**
 * The closed boundary as a flat [x0,y0,x1,y1,...] loop.
 *
 * Traced as four runs — up the right edge, across the tip, down the left
 * edge, across the claw — because the tip cleft only exists near the
 * midline: an outline taken at |xu| = 1 alone would miss the dimple that
 * makes the shape a petal rather than a seed.
 */
export function petalOutline(variant: number, quality = 1): number[] {
  const lengthSteps = Math.max(6, Math.round(16 * quality));
  const tipSteps = Math.max(4, Math.round(10 * quality));
  const baseSteps = Math.max(2, Math.round(6 * quality));
  const points: number[] = [];
  const push = (p: [number, number]) => points.push(p[0], p[1]);

  for (let i = 0; i <= lengthSteps; i += 1) {
    push(petalPoint(variant, 1, i / lengthSteps));
  }
  for (let i = 1; i < tipSteps; i += 1) {
    push(petalPoint(variant, 1 - (2 * i) / tipSteps, 1));
  }
  for (let i = lengthSteps; i >= 0; i -= 1) {
    push(petalPoint(variant, -1, i / lengthSteps));
  }
  for (let i = 1; i < baseSteps; i += 1) {
    push(petalPoint(variant, -1 + (2 * i) / baseSteps, 0));
  }
  return points;
}

/**
 * The outline as a Path2D, unit length, centred on the origin. Browser only
 * (Path2D does not exist on the server), so build it inside an effect.
 * Cached per variant/quality — the shape never changes, and a caller
 * animating petals should not be minting paths per frame.
 */
const pathCache = new Map<string, Path2D>();

export function petalPath(variant: number, quality = 1): Path2D {
  const key = `${variant}:${quality}`;
  const cached = pathCache.get(key);
  if (cached) return cached;
  const points = petalOutline(variant, quality);
  const path = new Path2D();
  path.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    path.lineTo(points[i], points[i + 1]);
  }
  path.closePath();
  pathCache.set(key, path);
  return path;
}

/**
 * The base->tip gradient as a canvas fill, in the same normalised frame as
 * the path: y -0.5 to +0.5. Gradient coordinates are read in user space at
 * paint time, so one of these built once can be filled under any transform
 * the caller has applied — which is how a petal keeps its gradient while it
 * spins without allocating anything per frame.
 */
export function petalGradient(
  ctx: CanvasRenderingContext2D,
  tint: Rgb,
  alpha = 1,
  stops = 5,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, -0.5, 0, 0.5);
  for (let i = 0; i < stops; i += 1) {
    const vv = i / (stops - 1);
    gradient.addColorStop(
      vv,
      rgbToCss(tintPetalColor(petalColorAt(0, vv), tint), alpha),
    );
  }
  return gradient;
}

/**
 * A colour ramp down the petal, for callers that want flat fills or dots
 * rather than a gradient (the halftone painter in components/halftone.ts
 * takes exactly this shape: one CSS colour per step).
 */
export function petalRamp(
  steps: number,
  tint: Rgb,
  { minAlpha = 1, maxAlpha = 1 } = {},
): string[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 1 : i / (steps - 1);
    return rgbToCss(
      tintPetalColor(petalColorAt(0, t), tint),
      minAlpha + (maxAlpha - minAlpha) * t,
    );
  });
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic 32-bit RNG (mulberry32) plus a string hash to seed it.
 * Petals have to land in the same places on every render, or a React
 * re-render would reshuffle them mid-flight.
 */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * CPU mirror of the hero's gust envelope (arborGustEnvelope in
 * BareThreeCanvas.tsx:689). Everything on the page that moves in the wind
 * should surge together, so a petal down in Selected work gusts on the same
 * schedule as the canopy above it. Returns roughly 0.2..1.2.
 */
export function gustEnvelope(t: number, phase: number) {
  const n =
    Math.sin(t * 0.36 + phase * 0.1) +
    0.6 * Math.sin(t * 0.83 + 1.7 + phase * 0.05) +
    0.35 * Math.sin(t * 0.11 + 4.2);
  return 0.2 + 1.02 * smoothstep(-1.9, 1.75, n);
}

/**
 * The page's easing, cubic-bezier(0.22,1,0.36,1), as a number in / number
 * out so GSAP can use the exact curve the CSS transitions in HomeSections
 * use rather than an approximation of it. Newton with a bisection fallback,
 * which is what browsers do.
 */
export function cubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const curve = (a: number, b: number, t: number) => {
    const c = 3 * a;
    const bq = 3 * (b - a) - c;
    const aq = 1 - c - bq;
    return ((aq * t + bq) * t + c) * t;
  };
  const slope = (a: number, b: number, t: number) => {
    const c = 3 * a;
    const bq = 3 * (b - a) - c;
    const aq = 1 - c - bq;
    return (3 * aq * t + 2 * bq) * t + c;
  };
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const err = curve(x1, x2, t) - x;
      if (Math.abs(err) < 1e-6) return curve(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i += 1) {
      const value = curve(x1, x2, t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value > x) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return curve(y1, y2, t);
  };
}

/** The site's easing, ready to hand to GSAP as `ease`. */
export const SITE_EASE = cubicBezierEase(0.22, 1, 0.36, 1);
