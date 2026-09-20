import * as THREE from "three";

/**
 * Where every stroke and petal is for any amount of scroll. Nothing here
 * touches the page or the GPU, so a Node script can import it and print
 * the numbers the scene will draw.
 *
 * The camera sits on +z and looks at the origin. The distance is picked so
 * that the plane z = 0 is exactly one screen: y runs from +1 at the top to
 * -1 at the bottom, and x from -aspect to +aspect. A share of the stage
 * (0 at the left or top, 1 at the right or bottom) turns into a place on
 * that plane with `toWorld`.
 */

export const FOV = 30;
export const DIST = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
export const NEAR = 0.1;
export const FAR = 20;

export const WORK = 5;
export const GROUPS = 5;

/** Screens of scroll while the stage is pinned: work 6, skills 2, contact 1, less the one on screen. */
export const SPAN = 8;

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** One hand-made gesture: points in its own box (x right, y down, 0 to 1), with a depth in world units. */
export type Gesture = { pts: readonly (readonly [number, number, number])[]; width: number; seed: number };

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------- gestures

/**
 * Five gestures, one per project. Each is a single movement of the hand,
 * not a letter: a sweep, an open circle, a wave with a hook, a spiral that
 * winds in, a long slash with a flick at the end. Drawn for a box a little
 * wider than tall.
 */
export const GESTURES: readonly Gesture[] = [
  {
    // A sweep that doubles back on itself, top left to bottom right.
    pts: [
      [0.06, 0.2, 0.0],
      [0.32, 0.07, 0.1],
      [0.68, 0.12, 0.2],
      [0.84, 0.34, 0.12],
      [0.58, 0.5, -0.04],
      [0.26, 0.6, -0.12],
      [0.18, 0.8, -0.04],
      [0.44, 0.92, 0.08],
      [0.92, 0.86, 0.2],
    ],
    width: 0.058,
    seed: 1.3,
  },
  {
    // An open circle, left open where it began.
    pts: [
      [0.17, 0.37, 0.0],
      [0.31, 0.13, 0.1],
      [0.56, 0.07, 0.18],
      [0.79, 0.22, 0.2],
      [0.88, 0.5, 0.1],
      [0.78, 0.78, 0.0],
      [0.55, 0.93, -0.1],
      [0.31, 0.87, -0.16],
      [0.18, 0.7, -0.1],
    ],
    width: 0.062,
    seed: 4.1,
  },
  {
    // A wave left to right that rises into a hook.
    pts: [
      [0.04, 0.62, 0.0],
      [0.18, 0.43, 0.1],
      [0.33, 0.36, 0.15],
      [0.46, 0.55, 0.05],
      [0.6, 0.72, -0.06],
      [0.74, 0.64, 0.0],
      [0.85, 0.42, 0.1],
      [0.9, 0.22, 0.16],
      [0.8, 0.1, 0.2],
      [0.68, 0.18, 0.2],
    ],
    width: 0.056,
    seed: 2.7,
  },
  {
    // A spiral that winds in from the top right.
    pts: [
      [0.92, 0.18, 0.0],
      [0.56, 0.06, 0.1],
      [0.2, 0.18, 0.15],
      [0.07, 0.54, 0.1],
      [0.24, 0.88, 0.0],
      [0.64, 0.92, -0.1],
      [0.87, 0.64, -0.1],
      [0.74, 0.36, 0.0],
      [0.46, 0.35, 0.1],
      [0.36, 0.56, 0.15],
      [0.52, 0.66, 0.2],
    ],
    width: 0.054,
    seed: 6.2,
  },
  {
    // A long slash, top left to bottom right, flicked up at the end.
    pts: [
      [0.08, 0.08, -0.1],
      [0.27, 0.25, 0.0],
      [0.45, 0.42, 0.1],
      [0.6, 0.58, 0.15],
      [0.74, 0.74, 0.1],
      [0.83, 0.87, 0.0],
      [0.9, 0.9, 0.05],
      [0.95, 0.76, 0.15],
    ],
    width: 0.066,
    seed: 3.4,
  },
];

/** The short stroke under each skills cluster: low left, rising to the upper right where the blossoms sit. */
export const SKILL_GESTURE: Gesture = {
  pts: [
    [0.05, 0.95, 0.0],
    [0.26, 0.82, 0.05],
    [0.5, 0.64, 0.1],
    [0.7, 0.42, 0.1],
    [0.84, 0.2, 0.05],
  ],
  width: 0.032,
  seed: 0.6,
};

/** The long stroke under the email: a slow wave with a lift at the end. */
export const CONTACT_GESTURE: Gesture = {
  pts: [
    [0.0, 0.55, 0.0],
    [0.14, 0.35, 0.05],
    [0.34, 0.5, 0.1],
    [0.55, 0.64, 0.1],
    [0.76, 0.46, 0.05],
    [0.92, 0.34, 0.0],
    [1.0, 0.05, 0.1],
  ],
  width: 0.042,
  seed: 5.5,
};

// --------------------------------------------------------------- layout

/** Which side of the stage the TEXT of each project stands on. The stroke takes the other side. */
export const SIDES: readonly ("left" | "right")[] = ["left", "right", "left", "right", "left"];

/** The text block, as shares of the stage. Its CSS is left or right 6vw, width 34vw, centred on the middle. */
export const TITLE_X = { left: [0.06, 0.4], right: [0.6, 0.94] } as const;
/** The text block's height is not known here; this is a generous guess the check measures against. */
export const TITLE_Y: readonly [number, number] = [0.2, 0.8];

export function workBox(k: number): Box {
  return SIDES[k] === "left" ? { x0: 0.47, y0: 0.14, x1: 0.93, y1: 0.86 } : { x0: 0.07, y0: 0.14, x1: 0.53, y1: 0.86 };
}

/** The skills columns: CSS left (5 + 19c)vw, width 17vw, from 54% down. */
export const SKILL_COL_X = (c: number): [number, number] => [0.05 + 0.19 * c, 0.05 + 0.19 * c + 0.17];
export const SKILL_COL_TOP = 0.54;
export function skillBox(c: number): Box {
  const x0 = 0.05 + 0.19 * c;
  return { x0, y0: 0.2, x1: x0 + 0.13, y1: 0.46 };
}

/** The email is centred at 40% down, 5.2vw Inter light; the links start at 66%. */
export const EMAIL_Y = 0.4;
export const LINKS_TOP = 0.66;
export const CONTACT_BOX: Box = { x0: 0.12, y0: 0.5, x1: 0.88, y1: 0.58 };

/** The still frame: the five gestures side by side, like a sheet of practice strokes. */
export function stillBox(k: number): Box {
  const x0 = 0.05 + 0.185 * k;
  return { x0, y0: 0.22, x1: x0 + 0.16, y1: 0.78 };
}

export const toWorld = (sx: number, sy: number, aspect: number): [number, number] => [(sx * 2 - 1) * aspect, 1 - sy * 2];

// --------------------------------------------------------------- ribbon

export type Ribbon = {
  positions: Float32Array;
  uvs: Float32Array;
  index: Uint16Array;
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** How far out the ribbon reaches beyond its centre line, most. */
  width: number;
};

/** The brush's pressure along the stroke: it lands light, bears down, lifts and runs dry. */
export function pressure(t: number, seed: number): number {
  const land = 0.35 + 0.65 * smooth(0, 0.07, t);
  const lift = 1 - 0.7 * smooth(0.7, 1, t);
  return land * lift * (1 + 0.12 * Math.sin(t * 9 + seed));
}

const SAMPLES = 240;

/**
 * The ribbon for one gesture laid in one box. "stretch" fills the box;
 * "contain" keeps the gesture's own shape and fits it inside.
 */
export function buildRibbon(g: Gesture, box: Box, aspect: number, fit: "stretch" | "contain" = "stretch"): Ribbon {
  const [ax, ay] = toWorld(box.x0, box.y0, aspect);
  const [bx, by] = toWorld(box.x1, box.y1, aspect);
  let w = bx - ax;
  let h = ay - by;
  let ox = ax;
  let oy = ay;
  let scale = 1;
  if (fit === "contain") {
    // The work gestures were drawn for a box 1.18 times wider than tall.
    const shape = 1.18;
    const nw = Math.min(w, h * shape);
    const nh = nw / shape;
    ox += (w - nw) / 2;
    oy -= (h - nh) / 2;
    scale = nh / 1.44;
    w = nw;
    h = nh;
  }
  const pts = g.pts.map(([x, y, z]) => new THREE.Vector3(ox + x * w, oy - y * h, z * scale));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const length = curve.getLength();
  const width = g.width * scale;

  const n = SAMPLES;
  const positions = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const index = new Uint16Array(n * 6);
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    // Across the stroke, in the picture's plane.
    side.set(-tan.y, tan.x, 0).normalize();
    nrm.crossVectors(tan, side).normalize();
    // The brush turns in the hand as it goes, so the ribbon twists a
    // little out of the plane and narrows where it does.
    const turn = 0.45 * Math.sin(t * 4.1 + g.seed);
    side.multiplyScalar(Math.cos(turn)).addScaledVector(nrm, Math.sin(turn));
    const hw = width * pressure(t, g.seed);
    positions.set([p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw, p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw], i * 6);
    uvs.set([t, 0, t, 1], i * 4);
    if (i < n) {
      const a = i * 2;
      index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
  }
  return { positions, uvs, index, curve, length, width };
}

// ---------------------------------------------------------------- camera

/** The camera at rest, or leaned toward the cursor (lean -1 to 1 each way). */
export function placeCamera(cam: THREE.PerspectiveCamera, aspect: number, leanX = 0, leanY = 0): void {
  cam.fov = FOV;
  cam.near = NEAR;
  cam.far = FAR;
  cam.aspect = aspect;
  cam.position.set(leanX * 0.12, -leanY * 0.08, DIST);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

/** Where a list of points lands on the stage, as shares; offset moves them first. */
export function projectBox(positions: Float32Array, cam: THREE.PerspectiveCamera, offset: [number, number, number] = [0, 0, 0], upTo = 1): Box {
  const v = new THREE.Vector3();
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const count = positions.length / 3;
  const last = Math.max(1, Math.floor(count * upTo));
  for (let i = 0; i < last; i += 1) {
    v.set(positions[i * 3] + offset[0], positions[i * 3 + 1] + offset[1], positions[i * 3 + 2] + offset[2]).project(cam);
    const x = (v.x + 1) / 2;
    const y = (1 - v.y) / 2;
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}

export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
export const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

// -------------------------------------------------------------- timeline

export type Timeline = {
  /** How much of each project's stroke is painted, 0 to 1. */
  draw: number[];
  /** Steps since each stroke was the newest, eased: 0 new, 1 a ghost, 2 gone. */
  ghost: number[];
  /** How far the text of each project shows, 0 to 1. */
  title: number[];
  /** Screens the work layer has scrolled up past its pin. */
  workShift: number;
  skillDraw: number[];
  bloom: number[];
  /** Screens the skills layer sits below (+) or above (-) its pin. */
  skillShift: number;
  contactDraw: number;
  /** Screens the contact section sits below its resting place. */
  contactShift: number;
};

/** Stop for each goTo(i): the five projects painted, the skills, the email. */
export const STOPS: readonly number[] = [0.55, 1.55, 2.55, 3.55, 4.55, 6.45, 8];

const stepEase = (x: number): number => {
  if (x <= 0) return 0;
  const f = Math.floor(x);
  return f + smooth(0, 0.45, x - f);
};

/**
 * u: screens scrolled since the stage reached the top of the window.
 *
 *   k - 0.25 .. k + 0.45   stroke k paints; its blossoms burst as it ends
 *   k + 0.8  .. k + 1.25   it lifts away and fades to a ghost
 *   5 .. 6                 the work layer scrolls up; the skills come in
 *   5.55 ..  6.4           the five short strokes paint, then bloom
 *   7 .. 8                 the skills scroll up; the email comes in
 *   7.55 .. 7.98           the long stroke underlines it
 */
export function timeline(u: number): Timeline {
  const draw: number[] = [];
  const ghost: number[] = [];
  const title: number[] = [];
  for (let k = 0; k < WORK; k += 1) {
    draw.push(smooth(k - 0.25, k + 0.45, u));
    ghost.push(k < WORK - 1 ? stepEase(u - k - 0.8) : 0);
    const inAt = k === 0 ? -2 : k - 0.3;
    const on = smooth(inAt, inAt + 0.25, u);
    const off = k < WORK - 1 ? smooth(k + 0.72, k + 0.92, u) : 0;
    title.push(on * (1 - off));
  }
  const skillDraw: number[] = [];
  const bloom: number[] = [];
  for (let c = 0; c < GROUPS; c += 1) {
    skillDraw.push(smooth(5.55 + 0.09 * c, 6.0 + 0.09 * c, u));
    bloom.push(smooth(5.95 + 0.09 * c, 6.3 + 0.09 * c, u));
  }
  return {
    draw,
    ghost,
    title,
    workShift: clamp(u - 5, 0, 1.2),
    skillDraw,
    bloom,
    skillShift: clamp(6 - u, 0, 1.2) - clamp(u - 7, 0, 1.2),
    contactDraw: smooth(7.55, 7.98, u),
    contactShift: clamp(8 - u, 0, 1.2),
  };
}

/** A ghost lifts up the page and back into it. */
export const ghostOffset = (g: number): [number, number, number] => [0, 1.3 * g, -0.8 * g];
export const GHOST_LEVEL = 0.16;
export function ghostLevel(g: number): number {
  if (g <= 0) return 1;
  if (g < 1) return 1 + (GHOST_LEVEL - 1) * g;
  return GHOST_LEVEL * (1 - clamp(g - 1, 0, 1));
}

/** The step a stop of scroll shows: 0-4 the projects, 5 the skills, 6 the email. */
export function stepAt(u: number): number {
  if (u < 5) return clamp(Math.floor(u + 0.2), 0, WORK - 1);
  return u < 7.4 ? 5 : 6;
}

// --------------------------------------------------------------- petals

/** One petal's flight, fixed when its stroke is built. Positions are world units. */
export type PetalSpec = {
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vy: number;
  vz: number;
  fall: number;
  sway: number;
  swayF: number;
  phase: number;
  spinX: number;
  spinZ: number;
  size: number;
  life: number;
  delay: number;
  variant: number;
};

/** Deterministic numbers (mulberry32), so the petals fly the same way on every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Petals for one stroke: most burst from its end, the rest lift off along it. */
export function petalSpecs(r: Ribbon, count: number, seed: number, scale = 1): PetalSpec[] {
  const rand = seeded(seed);
  const p = new THREE.Vector3();
  const out: PetalSpec[] = [];
  for (let j = 0; j < count; j += 1) {
    const atEnd = j < Math.round(count * 0.55);
    const t = atEnd ? 1 : 0.15 + rand() * 0.8;
    r.curve.getPointAt(t, p);
    const angle = rand() * Math.PI * 2;
    const speed = (atEnd ? 0.25 + rand() * 0.45 : 0.05 + rand() * 0.15) * scale;
    out.push({
      ox: p.x,
      oy: p.y,
      oz: p.z,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 0.12 * scale,
      vz: (rand() - 0.5) * 0.3 * scale,
      fall: (0.07 + rand() * 0.07) * scale,
      sway: (0.03 + rand() * 0.05) * scale,
      swayF: 0.6 + rand() * 0.7,
      phase: rand() * Math.PI * 2,
      spinX: 0.8 + rand() * 1.4,
      spinZ: (rand() - 0.5) * 2.4,
      size: (0.032 + rand() * 0.026) * scale,
      life: 7 + rand() * 4,
      delay: atEnd ? rand() * 0.15 : (1 - t) * 0.25 + rand() * 0.2,
      variant: Math.floor(rand() * 3),
    });
  }
  return out;
}

export type PetalPose = { x: number; y: number; z: number; rx: number; rz: number; size: number; level: number };

/** Where a petal is `age` seconds after its stroke finished. Closed form, so scrolling back and forth agrees with itself. */
export function petalAt(s: PetalSpec, age: number, out: PetalPose, still = false): PetalPose {
  const a = age - s.delay;
  if (a <= 0) {
    out.level = 0;
    out.size = 0;
    return out;
  }
  // The burst slows quickly; after it the petal drifts down, swaying.
  const k = 2.2;
  const burst = (1 - Math.exp(-a * k)) / k;
  out.x = s.ox + s.vx * burst + s.sway * Math.sin(a * s.swayF + s.phase);
  out.y = s.oy + s.vy * burst - s.fall * a;
  out.z = s.oz + s.vz * burst;
  out.rx = 0.9 * Math.sin(a * s.spinX + s.phase);
  out.rz = s.phase + a * s.spinZ;
  const grow = smooth(0, 0.25, a);
  out.size = s.size * grow;
  out.level = still ? 0.92 : 0.92 * grow * (1 - smooth(s.life - 2, s.life, a));
  return out;
}

/** The blossoms of one skills cluster, round the end of its stroke on a sunflower spiral. */
export const BLOSSOM_SIZE = 0.15;
export function clusterOffset(j: number): [number, number] {
  const r = 0.07 * Math.sqrt(j + 0.3);
  const a = j * 2.39996;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
