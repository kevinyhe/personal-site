import * as THREE from "three";

/**
 * Where everything is, for any size of stage and any amount of scroll.
 * Nothing here touches the page or the GPU, so a Node script can import it
 * and print the numbers the scene will draw.
 *
 * Units. The television is scaled so its picture is 1 tall, the way the
 * hero scales it. Its root sits at the middle of the machine's box, and the
 * camera looks at that point.
 */

// ------------------------------------------------------------ the model
// Measured from public/models/crt.glb after the loader's -90 degree yaw
// (the file faces +x; the yaw turns the screen to +z).
export const MODEL_YAW = -Math.PI / 2;
/** The whole machine. */
export const MODEL_MIN: readonly [number, number, number] = [-1, 1.175, -1.58];
export const MODEL_MAX: readonly [number, number, number] = [1, 3.366, 0.643];
/**
 * The glass: the front-facing faces that sit behind the bezel's front
 * (z between 0.3 and 0.59, above the deck). scene.ts measures this again
 * from the loaded mesh and uses these only if that fails.
 */
export const GLASS_MIN: readonly [number, number, number] = [-0.893, 1.725, 0.33];
export const GLASS_MAX: readonly [number, number, number] = [0.885, 3.241, 0.562];
/**
 * The picture is a little inside the glass rect, so it stops short of the
 * recess walls. These two shares give the hero's own 1.62 x 1.35 rect.
 */
export const PICTURE_W_SHARE = 0.91;
export const PICTURE_H_SHARE = 0.89;

export type Screen = { cx: number; cy: number; apex: number; w: number; h: number };

export function screenFromGlass(min: readonly number[], max: readonly number[]): Screen {
  return {
    cx: (min[0] + max[0]) / 2,
    cy: (min[1] + max[1]) / 2,
    apex: max[2],
    w: (max[0] - min[0]) * PICTURE_W_SHARE,
    h: (max[1] - min[1]) * PICTURE_H_SHARE,
  };
}

export const SCREEN: Screen = screenFromGlass(GLASS_MIN, GLASS_MAX);
/** Width over height of the picture, about 1.2. */
export const PICTURE_ASPECT = SCREEN.w / SCREEN.h;
/** How far the picture's corners fall back from its middle, in picture heights. The slight curve of the tube. */
export const CURVE_DROP = 0.06;

/**
 * Where the model goes inside the root, in root units, so the root's origin
 * is the middle of the machine. Scale first, then this offset.
 */
export function modelPlacement(screen: Screen): { scale: number; offset: [number, number, number]; screenAt: [number, number, number] } {
  const s = 1 / screen.h;
  const mid = [(MODEL_MIN[0] + MODEL_MAX[0]) / 2, (MODEL_MIN[1] + MODEL_MAX[1]) / 2, (MODEL_MIN[2] + MODEL_MAX[2]) / 2];
  return {
    scale: s,
    offset: [-mid[0] * s, -mid[1] * s, -mid[2] * s],
    // The picture's middle, at the apex of the glass, in root units.
    screenAt: [(screen.cx - mid[0]) * s, (screen.cy - mid[1]) * s, (screen.apex - mid[2]) * s + 0.004],
  };
}

/** The machine's box corners in root units. */
export function machineCorners(screen: Screen = SCREEN): THREE.Vector3[] {
  const s = 1 / screen.h;
  const hx = ((MODEL_MAX[0] - MODEL_MIN[0]) / 2) * s;
  const hy = ((MODEL_MAX[1] - MODEL_MIN[1]) / 2) * s;
  const hz = ((MODEL_MAX[2] - MODEL_MIN[2]) / 2) * s;
  const out: THREE.Vector3[] = [];
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/** The picture's four corners in root units: top left, top right, bottom right, bottom left. */
export function pictureCorners(screen: Screen = SCREEN): THREE.Vector3[] {
  const at = modelPlacement(screen).screenAt;
  const hw = PICTURE_ASPECT / 2;
  const z = at[2] - CURVE_DROP;
  return [
    new THREE.Vector3(at[0] - hw, at[1] + 0.5, z),
    new THREE.Vector3(at[0] + hw, at[1] + 0.5, z),
    new THREE.Vector3(at[0] + hw, at[1] - 0.5, z),
    new THREE.Vector3(at[0] - hw, at[1] - 0.5, z),
  ];
}

// ------------------------------------------------------------ the shot
export const FOV = 30;
export const NEAR = 0.5;
export const FAR = 40;
/** Turned so the screen faces the words on the right: a three-quarter view. */
export const TV_YAW = 0.5;
/** The camera a little above, looking down at the set. */
export const ELEV = 0.12;
/** How far the cursor turns it, radians, at the stage's edges. */
export const CURSOR_YAW = 0.12;
export const CURSOR_PITCH = 0.05;
/** The set takes at most this share of the stage's height, and this share of its width. */
const FILL_H = 0.7;
const FILL_W = 0.43;
/** Its left edge this far in from the stage's left. */
const LEFT_MARGIN = 0.055;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Sets up a camera for this stage: distance, and a view offset that puts
 * the machine's middle at (fx, 0.5) of the stage. The camera itself always
 * looks at the origin; the offset slides the frame.
 */
export function aimCamera(camera: THREE.PerspectiveCamera, width: number, height: number, dist: number, fx: number, fy = 0.5): void {
  camera.fov = FOV;
  camera.aspect = width / height;
  camera.near = NEAR;
  camera.far = FAR;
  camera.position.set(0, dist * Math.sin(ELEV), dist * Math.cos(ELEV));
  camera.lookAt(0, 0, 0);
  // The sub-window starts this far left of the full frame, so the origin
  // (the full frame's middle) lands at fx of the window; the same for fy.
  camera.setViewOffset(width, height, (0.5 - fx) * width, (0.5 - fy) * height, width, height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** At the end the set turns to face the lens, so the dot it leaves is in the middle. */
export const END_YAW = 0;

/** The root's turn for a cursor at (cx, cy), each -1..1 across the stage, and the move to the middle (shift 0..1). */
export function rootRotation(cx: number, cy: number, shift = 0): THREE.Euler {
  return new THREE.Euler(cy * CURSOR_PITCH, mix(TV_YAW, END_YAW, shift) + cx * CURSOR_YAW, 0, "YXZ");
}

/** Projects root-space points to stage shares (0..1 from the left and the top). */
export function projectRoot(points: THREE.Vector3[], camera: THREE.PerspectiveCamera, rot: THREE.Euler): { x: number; y: number; depth: number }[] {
  const m = new THREE.Matrix4().makeRotationFromEuler(rot);
  const v = new THREE.Vector3();
  return points.map((p) => {
    v.copy(p).applyMatrix4(m);
    const depth = -v.clone().applyMatrix4(camera.matrixWorldInverse).z;
    v.project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, depth };
  });
}

export function boxOf(points: { x: number; y: number }[]): Rect {
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of points) {
    r.x0 = Math.min(r.x0, p.x);
    r.y0 = Math.min(r.y0, p.y);
    r.x1 = Math.max(r.x1, p.x);
    r.y1 = Math.max(r.y1, p.y);
  }
  return r;
}

/** The set's box on the stage, over the cursor's whole reach. */
export function setBox(camera: THREE.PerspectiveCamera, shift = 0): Rect {
  const corners = machineCorners();
  const all: { x: number; y: number }[] = [];
  for (const cx of [-1, 0, 1]) for (const cy of [-1, 0, 1]) all.push(...projectRoot(corners, camera, rootRotation(cx, cy, shift)));
  return boxOf(all);
}

/** Pixels in one rem for this stage width, as globals.css sets the root size. */
export const remFor = (width: number): number => clamp(width * 0.0041667, 8, 48);

export type Layout = {
  width: number;
  height: number;
  dist: number;
  /** Where the machine's middle sits across the stage, work and skills. At the end it goes to 0.5. */
  fx: number;
  /** And down it, so the set's box is centred top to bottom. */
  fy: number;
  set: Rect;
  /** The channel dial: centre and radius (to the numbers' outer edge), stage shares. */
  dial: { x: number; y: number; r: number; rx: number };
  /** The words beside the set. */
  text: Rect;
};

/** Dial size in rem: the knob, and the ring the numbers sit on. */
export const DIAL_KNOB_REM = 7;
export const DIAL_RING_REM = 11.5;
/** The words' width, as a share of the stage. */
const TEXT_GAP = 0.035;
const TEXT_RIGHT = 0.955;

export function layoutFor(width: number, height: number): Layout {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const camera = new THREE.PerspectiveCamera(FOV, w / h, NEAR, FAR);
  // Distance by trial: the projected size goes as one over the distance,
  // so three rescales land within a fraction of a percent.
  let dist = 5;
  let fx = 0.3;
  let fy = 0.5;
  for (let i = 0; i < 4; i += 1) {
    aimCamera(camera, w, h, dist, fx, fy);
    const box = setBox(camera);
    const k = Math.max((box.y1 - box.y0) / FILL_H, (box.x1 - box.x0) / FILL_W);
    dist *= k;
    aimCamera(camera, w, h, dist, fx, fy);
    const b2 = setBox(camera);
    fx += LEFT_MARGIN - b2.x0;
    fy += 0.5 - (b2.y0 + b2.y1) / 2;
  }
  aimCamera(camera, w, h, dist, fx, fy);
  const set = setBox(camera);
  const rem = remFor(w);
  const rx = (DIAL_RING_REM * rem) / w;
  const r = (DIAL_RING_REM * rem) / h;
  const dialX = set.x1 + TEXT_GAP * 0.6 + rx;
  const textX0 = dialX + rx + TEXT_GAP;
  return {
    width: w,
    height: h,
    dist,
    fx,
    fy,
    set,
    dial: { x: dialX, y: 0.5, r, rx },
    text: { x0: textX0, y0: 0.5, x1: TEXT_RIGHT, y1: 0.5 },
  };
}

/** Where the picture's middle lands once the set has moved to the middle and faced the lens: where the dot is, and the email goes. */
export function dotAt(L: Layout): { x: number; y: number } {
  const camera = new THREE.PerspectiveCamera(FOV, L.width / L.height, NEAR, FAR);
  aimCamera(camera, L.width, L.height, L.dist, 0.5, L.fy);
  const c = pictureCorners();
  const mid = new THREE.Vector3().addVectors(c[0], c[2]).multiplyScalar(0.5);
  mid.z += CURVE_DROP;
  const [p] = projectRoot([mid], camera, rootRotation(0, 0, 1));
  return { x: p.x, y: p.y };
}

// ------------------------------------------------------------ the words
/** Estimated height of a project's block, in rem, for a block this many rem wide. */
export function workBlockRem(p: { title: string; tagline: string; stack: string[]; award?: string; href?: string }, widthRem: number): number {
  const lines = (text: string, sizeRem: number, perEm: number): number => Math.max(1, Math.ceil((text.length * sizeRem * perEm) / widthRem));
  let hRem = 1.5 * 1.4; // CH label
  hRem += 2.4 + lines(p.title, 6.4, 0.5) * 6.4 * 1.05; // title
  hRem += 2.4 + lines(p.tagline, 2.2, 0.5) * 2.2 * 1.5;
  hRem += 2.4 + lines(p.stack.join(", "), 1.5, 0.62) * 1.5 * 1.6;
  hRem += 0.8 + 1.5 * 1.6 * (p.award ? 2 : 1);
  if (p.href) hRem += 0.8 + 1.5 * 1.6;
  return hRem;
}

// ------------------------------------------------------------ the scroll
/**
 * s is the scroll in screens from the top of the pinned block.
 *   work     0 to 6: five channels, switched at k + 0.7 .. k + 1
 *   skills   6 to 8: the test card, switched in over 5.2 .. 5.8
 *   contact  8 to 10: the set moves to the middle (7.0 .. 7.6) and
 *            switches off (7.3 .. 8.0); the email comes up at 8.
 * The stage stays pinned from 0 to 9.
 */
export const CHANNELS = 6;
export const WORK_CHANNELS = 5;
export const SPAN = 9;
const SWITCHES: readonly (readonly [number, number])[] = [
  [0.7, 1.0],
  [1.7, 2.0],
  [2.7, 3.0],
  [3.7, 4.0],
  [5.2, 5.8],
];
const SHIFT: readonly [number, number] = [7.0, 7.6];
const POWER: readonly [number, number] = [7.3, 8.0];

/** Scroll values to look at each state: five channels, the card, the end. */
export const STOPS: readonly number[] = [0.35, 1.35, 2.35, 3.35, 4.4, 6.5, 8.5];

export type ScrollState = {
  /** The channel on the screen, 0..5. */
  shown: number;
  /** How far the dial is turned: 0 is off, 1..6 the channels. Continuous. */
  dial: number;
  /** Snow over the picture, 0..1. */
  snow: number;
  /** The picture's roll, a share of its height. */
  roll: number;
  /** 1 on, 0 off. Between, the picture shrinks to a line, then a dot. */
  power: number;
  /** 0 the set stands left, 1 it stands in the middle. */
  shift: number;
  /** Which project's words, and how much of them. */
  work: number;
  workShow: number;
  skillsShow: number;
  contactShow: number;
};

export function stateAt(s: number): ScrollState {
  let shown = 0;
  let dial = 1;
  let snow = 0;
  let roll = 0;
  for (let k = 0; k < SWITCHES.length; k += 1) {
    const [a, b] = SWITCHES[k];
    if (s >= b) {
      shown = k + 1;
      dial = k + 2;
      continue;
    }
    if (s > a) {
      const u = (s - a) / (b - a);
      shown = u < 0.5 ? k : k + 1;
      // The knob turns through the whole switch, eased at both ends.
      dial = k + 1 + smooth(0, 1, u);
      snow = smooth(0, 0.3, u) * (1 - smooth(0.62, 1, u));
      // The old picture starts to roll up, the new one rolls down into
      // place and stops.
      roll = u < 0.5 ? smooth(0.08, 0.5, u) * 0.55 : -(1 - smooth(0.5, 1, u)) * 0.7;
    }
    break;
  }
  const shift = smooth(SHIFT[0], SHIFT[1], s);
  const power = 1 - clamp((s - POWER[0]) / (POWER[1] - POWER[0]), 0, 1);
  // The dial goes to OFF with the power.
  dial = mix(dial, 0, smooth(POWER[0], POWER[0] + 0.3, s));
  const workIdx = Math.min(WORK_CHANNELS - 1, shown);
  const workShow = (1 - snow) * (1 - smooth(4.95, 5.2, s)) * (shown < WORK_CHANNELS ? 1 : 0);
  const skillsShow = smooth(5.7, 6.0, s) * (1 - smooth(6.95, 7.15, s));
  const contactShow = smooth(7.95, 8.25, s);
  return { shown, dial, snow, roll, power, shift, work: workIdx, workShow, skillsShow, contactShow };
}
