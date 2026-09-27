/**
 * The folding screen's shape and the camera's path, as plain numbers.
 * No DOM, no three.js: a Node script imports this file to check where
 * everything lands on screen before anyone opens a browser.
 *
 * Units are metres. The floor is y = 0, the camera looks down -z, and
 * three.js's rotation.y convention is used throughout: a panel turned by
 * psi runs along (cos psi, -sin psi) in x and z, and its painted face
 * points along (sin psi, cos psi).
 *
 * How the screen folds. Six panels hinged in a chain, panel 0 on the
 * left. Open, they zig-zag: each hinge is either a ridge (it points at
 * the camera) or a valley (it points away). A ridge folds shut with the
 * next panel going behind; a valley folds shut with the next panel
 * lying on the face of the one before. That is how a real screen folds,
 * and it means the remaining stack must never sit on a face we are about
 * to show. So a valley hinge first opens only to 95 degrees, where the
 * next panel stands out towards the camera and leaves the face clear,
 * and finishes opening on the following stop.
 */

export const DEG = Math.PI / 180;

/** Panel width and height, and the frame's thickness and width. */
export const PANEL_W = 1;
export const PANEL_H = 2.3;
export const DEPTH = 0.05;
export const RAIL = 0.055;
export const PANELS = 6;

export const FOV = 32;
export const NEAR = 0.1;
export const FAR = 80;

/** Section heights in screens. The stage is pinned across all ten. */
export const SECTION_SCREENS = { work: 6, skills: 2, contact: 2 } as const;
export const SCROLL_SCREENS = SECTION_SCREENS.work + SECTION_SCREENS.skills + SECTION_SCREENS.contact - 1;

/**
 * The stops, in screens scrolled since the stage pinned. 0 to 4 are the
 * projects, 5 the skills, 6 the contact. Each is held still for HOLD
 * either side.
 */
export const STOP_U = [0.35, 1.35, 2.35, 3.35, 4.35, 6.5, 8.6];
export const HOLD = 0.25;
export const LAST = STOP_U.length - 1;
export const SKILLS_STOP = 5;
export const CONTACT_STOP = 6;

/** Right edge of the words beside the screen, as a fraction of the stage width. */
export const TEXT_RIGHT = [0.4, 0.4, 0.4, 0.4, 0.4, 0.5, 0];
/** Where the panel in focus is centred across the stage. */
const FOCUS_X = [0.67, 0.67, 0.67, 0.67, 0.67, 0.72];

/**
 * Hinge angles in degrees at each stop, hinge j joining panel j-1 to
 * panel j. 165 is folded shut, 95 stood out, 60 open, 0 flat.
 */
const HINGE_KEYS: number[][] = [
  [165, 60, 60, 60, 60, 60, 0],
  [165, 95, 60, 60, 60, 60, 0],
  [165, 165, 165, 60, 60, 60, 0],
  [165, 165, 165, 95, 60, 60, 0],
  [165, 165, 165, 165, 165, 60, 0],
];
/** +1: a ridge, folds behind. -1: a valley, folds onto the face before it. */
const HINGE_SIGN = [1, -1, 1, -1, 1];
/** Panel 0's own turn. It squares up to the camera for the contact stop. */
const BASE_KEYS = [-30, -30, -30, -30, -30, -30, 0];

export type Vec3 = { x: number; y: number; z: number };
export type Spot = { x: number; y: number; depth: number };
export type Pose = {
  /** Hinge points: start of each panel, and the end of the last. PANELS + 1 of them, on the floor. */
  points: { x: number; z: number }[];
  /** Each panel's turn, radians. */
  psi: number[];
  /** Hinge angles in degrees, for reading back. */
  hinges: number[];
};
export type Cam = { pos: Vec3; look: Vec3 };

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (x: number): number => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Screens scrolled to stage time: 0..6, whole numbers at the stops. */
export function stageAt(u: number): number {
  for (let k = 0; k < LAST; k += 1) {
    const a = STOP_U[k] + HOLD;
    const b = STOP_U[k + 1] - HOLD;
    if (u <= a) return k;
    if (u < b) return k + (u - a) / (b - a);
  }
  return LAST;
}

/** The inverse, for the dev handle: where to scroll to reach stage time t. */
export function scrollFor(t: number): number {
  const c = clamp(t, 0, LAST);
  const k = Math.min(LAST - 1, Math.floor(c));
  const f = c - k;
  if (f === 0) return STOP_U[k];
  const a = STOP_U[k] + HOLD;
  const b = STOP_U[k + 1] - HOLD;
  return a + f * (b - a);
}

/**
 * Which part of a move a hinge takes. When two hinges move on the same
 * stop, the ridge leads and the valley follows, so the panel swinging
 * out has cleared the one it was folded against.
 */
function windowFor(j: number, k: number): [number, number] {
  if (k === LAST - 1) return [0.04 * j, 0.8 + 0.04 * j];
  const keys = HINGE_KEYS[j];
  const pair = j > 0 && HINGE_KEYS[j - 1][k] !== HINGE_KEYS[j - 1][k + 1];
  if (pair) return [0.3, 1];
  const next = j < HINGE_KEYS.length - 1 && HINGE_KEYS[j + 1][k] !== HINGE_KEYS[j + 1][k + 1];
  if (next && keys[k] !== keys[k + 1]) return [0, 0.75];
  return [0.05, 0.95];
}

function keyAt(keys: number[], t: number, win: (k: number) => [number, number]): number {
  const c = clamp(t, 0, LAST);
  const k = Math.min(LAST - 1, Math.floor(c));
  const f = c - k;
  const [a, b] = win(k);
  return lerp(keys[k], keys[k + 1], ease((f - a) / (b - a)));
}

export function poseAt(t: number, out?: Pose): Pose {
  const pose: Pose = out ?? { points: Array.from({ length: PANELS + 1 }, () => ({ x: 0, z: 0 })), psi: new Array<number>(PANELS).fill(0), hinges: new Array<number>(PANELS - 1).fill(0) };
  let psi = keyAt(BASE_KEYS, t, () => [0.1, 0.9]) * DEG;
  pose.points[0].x = 0;
  pose.points[0].z = 0;
  for (let i = 0; i < PANELS; i += 1) {
    if (i > 0) {
      const deg = keyAt(HINGE_KEYS[i - 1], t, (k) => windowFor(i - 1, k));
      pose.hinges[i - 1] = deg;
      psi += HINGE_SIGN[i - 1] * deg * DEG;
    }
    pose.psi[i] = psi;
    pose.points[i + 1].x = pose.points[i].x + PANEL_W * Math.cos(psi);
    pose.points[i + 1].z = pose.points[i].z - PANEL_W * Math.sin(psi);
  }
  return pose;
}

/** A point on panel i: s across it (0..PANEL_W), y up it, n out of its face. */
export function panelPoint(pose: Pose, i: number, s: number, y: number, n = 0): Vec3 {
  const p = pose.points[i];
  const psi = pose.psi[i];
  return {
    x: p.x + s * Math.cos(psi) + n * Math.sin(psi),
    y,
    z: p.z - s * Math.sin(psi) + n * Math.cos(psi),
  };
}

/** The screen's whole reach on the floor, for framing the contact stop. */
function middle(pose: Pose): { x: number; z: number } {
  const a = pose.points[0];
  const b = pose.points[PANELS];
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

type Frame = { cx: number; cy: number; cz: number; yaw: number; dist: number; slide: number; lift: number; drop: number };

/** How the camera stands for stop k, given where the panels are right now. */
function frameFor(k: number, pose: Pose, aspect: number): Frame {
  const tan = Math.tan((FOV / 2) * DEG);
  if (k >= CONTACT_STOP) {
    const m = middle(pose);
    return { cx: m.x, cy: PANEL_H / 2, cz: m.z, yaw: 0, dist: 11.5, slide: 0, lift: 0.9, drop: 1.25 };
  }
  const c = panelPoint(pose, k, PANEL_W / 2, PANEL_H / 2);
  const dist = 5.3;
  // Moves the lens left so the panel sits right of centre, clear of the words.
  const slide = (FOCUS_X[k] - 0.5) * 2 * dist * tan * aspect;
  return { cx: c.x, cy: c.y, cz: c.z, yaw: pose.psi[k] * 0.5, dist, slide, lift: 0.45, drop: 0.12 };
}

/**
 * The camera at stage time t. `lean` is the cursor, -1..1 each way, and
 * nudges the lens a little so the room has depth under the hand.
 */
export function cameraAt(t: number, pose: Pose, aspect: number, lean: { x: number; y: number } = { x: 0, y: 0 }, out?: Cam): Cam {
  const c = clamp(t, 0, LAST);
  const k = Math.min(LAST - 1, Math.floor(c));
  const f = ease(c - k);
  const a = frameFor(k, pose, aspect);
  const b = frameFor(k + 1, pose, aspect);
  const m = (key: keyof Frame): number => lerp(a[key], b[key], f);
  const yaw = m("yaw");
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const dist = m("dist");
  const slide = m("slide");
  const cam = out ?? { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
  const sway = 0.12 * (dist / 5.3);
  cam.pos.x = m("cx") + nx * dist - rx * (slide - lean.x * sway);
  cam.pos.z = m("cz") + nz * dist - rz * (slide - lean.x * sway);
  cam.pos.y = m("cy") + m("lift") + lean.y * sway * 0.6;
  cam.look.x = m("cx") - rx * slide;
  cam.look.z = m("cz") - rz * slide;
  cam.look.y = m("cy") - m("drop");
  return cam;
}

/** A still view of the whole screen standing open, for reduced motion and narrow screens. */
export function overview(aspect: number): { pose: Pose; cam: Cam } {
  const pose = poseAt(SKILLS_STOP);
  const m = middle(pose);
  const tan = Math.tan((FOV / 2) * DEG);
  // Far enough that the whole run of panels fits the width with a margin.
  const reach = Math.hypot(pose.points[PANELS].x - pose.points[0].x, pose.points[PANELS].z - pose.points[0].z);
  const dist = Math.max(7.5, (reach * 0.62) / (tan * aspect) + 0.5);
  return {
    pose,
    cam: { pos: { x: m.x - 0.4, y: PANEL_H / 2 + 0.8, z: m.z + dist }, look: { x: m.x, y: PANEL_H / 2 - 0.2, z: m.z } },
  };
}

/** Where a world point lands on the stage: x and y as fractions from the top left, depth in front of the lens. */
export function project(p: Vec3, cam: Cam, aspect: number, out?: Spot): Spot {
  let fx = cam.look.x - cam.pos.x;
  let fy = cam.look.y - cam.pos.y;
  let fz = cam.look.z - cam.pos.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0,1,0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up = right x forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const vx = p.x - cam.pos.x;
  const vy = p.y - cam.pos.y;
  const vz = p.z - cam.pos.z;
  const depth = vx * fx + vy * fy + vz * fz;
  const sx = vx * rx + vz * rz;
  const sy = vx * ux + vy * uy + vz * uz;
  const tan = Math.tan((FOV / 2) * DEG);
  const d = Math.max(1e-4, depth);
  const o = out ?? { x: 0, y: 0, depth: 0 };
  o.x = 0.5 + sx / (d * tan * aspect) / 2;
  o.y = 0.5 - sy / (d * tan) / 2;
  o.depth = depth;
  return o;
}

/** The four corners of panel i's painted face, clockwise from top left. */
export function faceCorners(pose: Pose, i: number): Vec3[] {
  const n = DEPTH / 2;
  return [
    panelPoint(pose, i, 0, PANEL_H, n),
    panelPoint(pose, i, PANEL_W, PANEL_H, n),
    panelPoint(pose, i, PANEL_W, 0, n),
    panelPoint(pose, i, 0, 0, n),
  ];
}

/** How visible each stop's words are at stage time t, 0..1. */
export function wordsAt(t: number, k: number): number {
  const d = Math.abs(t - k);
  return 1 - ease((d - 0.12) / 0.3);
}
