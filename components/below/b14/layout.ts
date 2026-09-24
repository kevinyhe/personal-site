/**
 * The numbers behind the paper: where the sheets lie, how a sheet bends
 * as it turns, where the camera stands, and which turn each scroll
 * position means. No DOM and no three.js here, so a Node script can run
 * the same maths the page does and print where everything lands.
 *
 * World units. The desk is the plane y = 0, y up. The spine is the line
 * x = 0. A page is PAGE_W across (x) and PAGE_H deep (z); its top edge is
 * at z = -PAGE_H / 2, away from the camera. Unturned sheets lie on the
 * right (x from 0 to PAGE_W); turned ones lie face down on the left.
 */

export const PAGE_W = 3;
export const PAGE_H = 4;
/** The canvas each face is printed on. Same 3:4 shape as the page. */
export const TEX_W = 1152;
export const TEX_H = 1536;

/** Five project sheets, the skills sheet, the back page. */
export const SHEETS = 7;
export const PROJECT_SHEETS = 5;
/** Height of one sheet above the one under it. */
export const STACK_GAP = 0.006;
/** Height of the lowest sheet above the desk. */
export const STACK_BASE = 0.004;
/** Grid of the sheet mesh: dense across, where it bends. */
export const SEG_S = 150;
export const SEG_Z = 18;

export const FOV = 30;
export const NEAR = 0.1;
export const FAR = 60;

// ------------------------------------------------------------ scroll plan

/**
 * Scroll position, in screens from the top of the pinned stretch, at
 * which each sheet count is reached and held. Stop k means k sheets have
 * been turned. #work spans 0 to 6, #skills 6 to 8, #contact 8 to 10, so a
 * link to #skills or #contact lands on its own stop.
 */
export const STOPS_U = [0, 1.2, 2.4, 3.6, 4.8, 6, 8] as const;
export const SECTION_SCREENS = { work: 6, skills: 2, contact: 2 } as const;
/** Each turn uses the middle of the gap between two stops; the ends hold still. */
const HOLD = 0.15;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** How many sheets have been turned at scroll position u, as a fraction. */
export function turnsAt(u: number): number {
  const last = STOPS_U.length - 1;
  if (u <= STOPS_U[0]) return 0;
  if (u >= STOPS_U[last]) return last;
  let k = 0;
  while (k < last - 1 && u >= STOPS_U[k + 1]) k += 1;
  const local = (u - STOPS_U[k]) / (STOPS_U[k + 1] - STOPS_U[k]);
  return k + clamp((local - HOLD) / (1 - 2 * HOLD), 0, 1);
}

/** The scroll position that shows a given fraction of turns. The inverse of turnsAt. */
export function scrollFor(turns: number): number {
  const last = STOPS_U.length - 1;
  const T = clamp(turns, 0, last);
  const k = Math.min(last - 1, Math.floor(T));
  const f = T - k;
  if (f <= 0) return STOPS_U[k];
  if (T >= last) return STOPS_U[last];
  return STOPS_U[k] + (HOLD + (1 - 2 * HOLD) * f) * (STOPS_U[k + 1] - STOPS_U[k]);
}

// ------------------------------------------------------------ the curl

/** The shape of a sheet partway through its turn. */
export type Curl = {
  /** Where the roll has got to, measured from the spine. */
  xc: number;
  /** Radius of the roll. */
  r: number;
  /** How far the bottom edge leads the top. */
  skew: number;
  /** Height of the sheet's flat part. */
  base: number;
};

/** Resting height of sheet j on the right pile and on the left. Sheet 0 is on top at the start. */
export const heightRight = (j: number): number => STACK_BASE + (SHEETS - 1 - j) * STACK_GAP;
export const heightLeft = (j: number): number => STACK_BASE + j * STACK_GAP;

/**
 * t = 0 is flat on the right, t = 1 is face down on the left. The roll
 * starts at the right edge with a tight radius, widens as it crosses the
 * page, and closes up as the sheet lands, so it lies flat again.
 */
export function curlAt(j: number, t: number, out: Curl): Curl {
  const roll = easeInOut(clamp(t / 0.84, 0, 1));
  out.xc = PAGE_W * (1 - roll);
  out.r = (0.2 + 0.28 * smooth(0, 0.45, t)) * (1 - smooth(0.72, 1, t)) + 0.0005;
  out.skew = 0.28 * Math.sin(Math.PI * clamp(t, 0, 1));
  out.base = mix(heightRight(j), heightLeft(j), smooth(0.85, 1, t));
  return out;
}

/**
 * Small per-sheet offsets, so the edges of the pile show. Seeded from the
 * sheet number, not random, so server and client agree. [dx, dz, turn].
 */
export function restOffset(j: number, left: boolean): [number, number, number] {
  const h = (n: number): number => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };
  const k = j * 3 + (left ? 101 : 0);
  return [h(k) * 0.035, h(k + 1) * 0.03, h(k + 2) * 0.006];
}

export type Vec3 = { x: number; y: number; z: number };

/**
 * One point of a sheet, in the world. s runs from the spine to the free
 * edge (0 to PAGE_W), zn from the top edge to the bottom (0 to 1). The
 * vertex shader does exactly this; keep the two the same.
 */
export function sheetPoint(s: number, zn: number, c: Curl, jit: [number, number, number], out: Vec3): Vec3 {
  const xc = c.xc * (1 - c.skew * zn);
  const d = s - xc;
  const arc = Math.PI * c.r;
  let x: number;
  let y: number;
  if (d <= 0) {
    x = s;
    y = 0;
  } else if (d < arc) {
    const a = d / c.r;
    x = xc + c.r * Math.sin(a);
    y = c.r * (1 - Math.cos(a));
  } else {
    x = xc - (d - arc);
    y = 2 * c.r;
  }
  const z = (zn - 0.5) * PAGE_H;
  const co = Math.cos(jit[2]);
  const si = Math.sin(jit[2]);
  out.x = co * x - si * z + jit[0];
  out.z = si * x + co * z + jit[1];
  out.y = y + c.base;
  return out;
}

/** The rest offset of a sheet partway through its turn: the right pile's, easing into the left's. */
export function offsetAt(j: number, t: number): [number, number, number] {
  const a = restOffset(j, false);
  const b = restOffset(j, true);
  const w = smooth(0, 1, t);
  return [mix(a[0], b[0], w), mix(a[1], b[1], w), mix(a[2], b[2], w)];
}

// ------------------------------------------------------------ the camera

export type Cam = { pos: Vec3; target: Vec3; fov: number };

/**
 * Where the camera looks from at each stop: above and in front of the
 * page, tipped a few degrees one way or the other so each new page is met
 * from a slightly different place. Degrees; distance in world units.
 */
type Shot = { tx: number; tz: number; dist: number; elev: number; azim: number };
export const SHOTS: Shot[] = [
  { tx: 1.25, tz: 0.1, dist: 8.2, elev: 65, azim: -4 },
  { tx: 1.2, tz: 0.1, dist: 8.2, elev: 66, azim: 3 },
  { tx: 1.25, tz: 0.1, dist: 8.2, elev: 64, azim: -3 },
  { tx: 1.2, tz: 0.1, dist: 8.2, elev: 66, azim: 4 },
  { tx: 1.25, tz: 0.1, dist: 8.2, elev: 65, azim: -2 },
  // The centre fold: both pages, from higher up.
  { tx: 0, tz: 0.1, dist: 8.5, elev: 74, azim: 0 },
  { tx: 1.2, tz: 0.1, dist: 8.1, elev: 65, azim: 2 },
];

/**
 * The camera at a fraction of turns. Between stops it eases from one shot
 * to the next, lifting back a little and looking toward the spine while
 * the sheet is in the air. Narrow screens stand further back.
 */
export function cameraAt(turns: number, aspect: number, out: Cam): Cam {
  const last = SHOTS.length - 1;
  const T = clamp(turns, 0, last);
  const k = Math.min(last - 1, Math.floor(T));
  const f = T - k;
  const e = easeInOut(f);
  const a = SHOTS[k];
  const b = SHOTS[k + 1];
  const air = Math.sin(Math.PI * f);
  const tx = mix(a.tx, b.tx, e) - 0.45 * air;
  // Looking a little further up the desk while the sheet is in the air
  // keeps its lifted top edge inside the frame.
  const tz = mix(a.tz, b.tz, e) - 0.3 * air;
  // A screen narrower than 1.7 wide would cut the pages off at the sides.
  const wide = aspect < 1.7 ? 1.7 / Math.max(aspect, 0.5) : 1;
  const dist = (mix(a.dist, b.dist, e) + 1.3 * air) * wide;
  const elev = ((mix(a.elev, b.elev, e) + 4 * air) * Math.PI) / 180;
  const azim = (mix(a.azim, b.azim, e) * Math.PI) / 180;
  out.target.x = tx;
  out.target.y = 0;
  out.target.z = tz;
  out.pos.x = tx + dist * Math.sin(azim) * Math.cos(elev);
  out.pos.y = dist * Math.sin(elev);
  out.pos.z = tz + dist * Math.cos(azim) * Math.cos(elev);
  out.fov = FOV;
  return out;
}

export const makeCam = (): Cam => ({ pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: FOV });

/** Screen position of a world point, as shares of the stage (0,0 top left), and its depth in front of the lens. */
export type Spot = { x: number; y: number; depth: number };

export function project(p: Vec3, cam: Cam, aspect: number, out: Spot): Spot {
  // The camera's own axes, as three.js's lookAt builds them with y up.
  let fx = cam.target.x - cam.pos.x;
  let fy = cam.target.y - cam.pos.y;
  let fz = cam.target.z - cam.pos.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0,1,0)
  let rx = -fz;
  const ry = 0;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  // up = right x forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const vx = p.x - cam.pos.x;
  const vy = p.y - cam.pos.y;
  const vz = p.z - cam.pos.z;
  const cx = vx * rx + vy * ry + vz * rz;
  const cy = vx * ux + vy * uy + vz * uz;
  const depth = vx * fx + vy * fy + vz * fz;
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  out.depth = depth;
  out.x = 0.5 + (0.5 * cx) / (Math.max(depth, 1e-6) * tan * aspect);
  out.y = 0.5 - (0.5 * cy) / (Math.max(depth, 1e-6) * tan);
  return out;
}

// ------------------------------------------------------------ the petals

export type Petal = { x: number; z: number; spin: number; size: number; tilt: number };

/** Petals resting on the desk round the pages, never under them. Seeded. */
export function makePetals(count: number): Petal[] {
  let a = 0x9e3779b9;
  const rnd = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Petal[] = [];
  let guard = 0;
  while (out.length < count && guard < 5000) {
    guard += 1;
    const x = mix(-4.8, 5.2, rnd());
    const z = mix(-2.6, 2.6, rnd());
    // Keep clear of the spread and a margin round it.
    if (x > -3.2 && x < 3.2 && z > -2.16 && z < 2.16) continue;
    out.push({ x, z, spin: rnd() * Math.PI * 2, size: mix(0.1, 0.17, rnd()), tilt: mix(-0.25, 0.25, rnd()) });
  }
  return out;
}

/**
 * Where a petal is after `turns` turns. Each turn blows it a little way
 * out from the page and lifts it while the sheet is in the air; the ones
 * nearest the page move most. It is a function of the scroll, so going
 * back up puts every petal back.
 */
export function petalAt(p: Petal, turns: number, out: { x: number; y: number; z: number; spin: number; lift: number }): void {
  // Away from the middle of the spread.
  const dx = p.x - 0.4;
  const dz = p.z * 1.4;
  const dl = Math.hypot(dx, dz) || 1;
  const edge = Math.max(0, Math.max(Math.abs(p.x) - PAGE_W, Math.abs(p.z) - PAGE_H / 2));
  const near = Math.exp(-edge / 1.4);
  const air = Math.sin(Math.PI * (turns - Math.floor(turns)));
  const push = near * (0.13 * turns + 0.32 * air);
  out.x = p.x + (dx / dl) * push;
  out.z = p.z + (dz / dl) * push;
  out.y = 0.012 + 0.28 * near * air;
  out.spin = p.spin + near * (0.9 * turns + 1.4 * air);
  out.lift = air * near;
}

// ------------------------------------------------------------ text fitting

/** Measures a line of text at font size 1 (the result scales with size). */
export type Measure = (text: string, face: "serif" | "sans" | "mono") => number;

/** Glyphs the display serif draws a watermark for instead. Such text is set in Inter. */
export const SERIF_UNSAFE = /[0-9'"$&@\-!()*+/=#%]/;

/**
 * The largest size a headline can be set at in `maxLines` lines or fewer
 * without passing `width`, capped at `maxSize`. Breaks go between words;
 * among the breaks for a given line count the one with the narrowest
 * widest line wins. On a tie in size, fewer lines wins.
 */
export function fitHeadline(
  text: string,
  face: "serif" | "sans" | "mono",
  measure: Measure,
  width: number,
  maxSize: number,
  maxLines: number,
  splitAt = " ",
): { lines: string[]; size: number; widest: number } {
  const parts = text.split(splitAt);
  const glue = splitAt === " " ? " " : "";
  const pieces = parts.map((p, i) => (splitAt !== " " && i > 0 ? splitAt + p : p));
  let best = { lines: [text], size: 0, widest: 0 };
  const tryLines = (lines: string[]): void => {
    const widest = Math.max(...lines.map((l) => measure(l, face)));
    const size = Math.min(maxSize, width / widest);
    if (size > best.size + 0.5) best = { lines, size, widest: widest * size };
  };
  tryLines([text]);
  if (maxLines >= 2) {
    for (let i = 1; i < pieces.length; i += 1) {
      tryLines([pieces.slice(0, i).join(glue), pieces.slice(i).join(glue)]);
    }
  }
  if (maxLines >= 3) {
    for (let i = 1; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        tryLines([pieces.slice(0, i).join(glue), pieces.slice(i, j).join(glue), pieces.slice(j).join(glue)]);
      }
    }
  }
  return best;
}

/** Breaks text into lines no wider than `width` at `size`. */
export function wrap(text: string, face: "serif" | "sans" | "mono", size: number, measure: Measure, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, face) * size > width) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
