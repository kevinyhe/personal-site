/**
 * The numbers the page and the scene share, with no DOM and no three.js,
 * so a Node script can check them: type sizes, the row grid, and where
 * each scene's camera sits and what its subject spans.
 *
 * Every size here is written twice on purpose: as a CSS string for the
 * page, and as vw/vh numbers for the check. Change one, change both.
 */

/** Page gutters, left and right, vw. */
export const GUTTER_VW = 4.5;
/** The gap between grid columns, vw. */
export const GAP_VW = 1.5;
/** The row number column, vw. */
export const INDEX_VW = 5;
/** The year and kind column in the work index, vw. */
export const META_VW = 16;
/** The skill names column in the skills index, vw. */
export const NAMES_VW = 24;
/** How far a hovered row's text slides right, vw. */
export const SLIDE_VW = 1.5;
/** Space above and below the words in a row, vh. */
export const ROW_PAD_VH = 1.4;
/** Space above the first row of each index (the section label sits in it), vh. */
export const HEAD_VH = 12;
/** Letter spacing on the large type, em. */
export const TRACK_EM = -0.02;

/** The large sizes, as min(vw, vh), and as CSS. */
export const TITLE = { vw: 6.4, vh: 10 };
export const GROUP = { vw: 5, vh: 8 };
export const EMAIL_SIZE = { vw: 7, vh: 13 };
export const css = (s: { vw: number; vh: number }): string => `min(${s.vw}vw, ${s.vh}vh)`;

/** A size in px at a viewport. */
export const sizePx = (s: { vw: number; vh: number }, w: number, h: number): number =>
  Math.min((s.vw / 100) * w, (s.vh / 100) * h);

/** The width left for the title column in the work grid, vw. */
export const TITLE_COL_VW = 100 - 2 * GUTTER_VW - INDEX_VW - META_VW - 2 * GAP_VW;
/** The width left for the group name column in the skills grid, vw. */
export const GROUP_COL_VW = 100 - 2 * GUTTER_VW - INDEX_VW - NAMES_VW - 2 * GAP_VW;
/** The email row spans the page inside the gutters, vw. */
export const EMAIL_COL_VW = 100 - 2 * GUTTER_VW;

/**
 * Which face a title is set in. The display serif is a DEMO cut and draws
 * a flower for digits and some marks, so any title with one is set in
 * Inter. Otherwise the rows alternate, serif first.
 */
const SERIF_UNSAFE = /[0-9'"$&@\-!()*+/=#%‑]/;
export function faceFor(text: string, row: number): "serif" | "sans" {
  if (row % 2 === 1) return "sans";
  // The ampersand is set apart in Inter inside a serif line (see index.tsx),
  // so it does not stop a line being serif.
  return SERIF_UNSAFE.test(text.replace(/&/g, "")) ? "sans" : "serif";
}

/** Split a serif line so each "&" can be set in Inter. */
export function splitAmp(text: string): { text: string; amp: boolean }[] {
  const out: { text: string; amp: boolean }[] = [];
  text.split("&").forEach((part, i) => {
    if (i > 0) out.push({ text: "&", amp: true });
    if (part) out.push({ text: part, amp: false });
  });
  return out;
}

// ---- the scenes ---------------------------------------------------------

export type Vec3 = [number, number, number];

/**
 * One scene: a subject centred near the world origin, the box it fills
 * (for the check), and where the camera looks from. `yaw` turns the camera
 * round the subject, `pitch` lifts it. The picture is slid right by
 * `shift` of the screen width so the subject sits beside the titles, not
 * under their first letters.
 */
export type SceneSpec = {
  name: string;
  box: { min: Vec3; max: Vec3 };
  target: Vec3;
  yaw: number;
  pitch: number;
  dist: number;
};

export const FOV = 32;
/** The subject's centre lands this far right of the middle, as a share of the width. */
export const SHIFT = 0.15;
/** Cursor drift: the camera swings this far round the subject, radians, at the screen's edges. */
export const DRIFT_YAW = 0.14;
export const DRIFT_PITCH = 0.06;

/** Scene ids: five projects, five skill groups, then the contact robot. */
export const SCENE_COUNT = 11;
export const CONTACT_SCENE = 10;

export const SCENES: SceneSpec[] = [
  // 0 The Actually Company: a microphone on a stand, rings of sound going out.
  { name: "microphone", box: { min: [-1.55, -1.35, -0.45], max: [1.55, 1.95, 0.45] }, target: [0, 0.2, 0], yaw: 0.25, pitch: 0.1, dist: 7.6 },
  // 1 S-KBD67: the blaster, with the sensor board floating under it.
  { name: "blaster", box: { min: [-1.35, -1.25, -0.5], max: [1.6, 0.75, 0.75] }, target: [0.1, -0.2, 0], yaw: 0.55, pitch: 0.22, dist: 7.0 },
  // 2 King of the Ring: a boxing ring with two gloves over it.
  { name: "ring", box: { min: [-1.5, -0.85, -1.5], max: [1.5, 1.35, 1.5] }, target: [0, 0.1, 0], yaw: 0.62, pitch: 0.36, dist: 8.4 },
  // 3 mclib: the robot driving a path across a tiled field.
  { name: "field", box: { min: [-1.85, -0.62, -1.85], max: [1.85, 0.15, 1.85] }, target: [0, -0.35, 0], yaw: 0.42, pitch: 0.62, dist: 8.9 },
  // 4 Saturn: a ringed planet among clouds.
  { name: "planet", box: { min: [-2.3, -1.35, -1.2], max: [2.3, 1.35, 1.2] }, target: [0, 0, 0], yaw: 0.0, pitch: 0.12, dist: 9.4 },
  // 5..9 the skill groups: marks floating in a loose block.
  { name: "skills", box: { min: [-2.4, -1.45, -0.9], max: [2.4, 1.45, 0.9] }, target: [0, 0, 0], yaw: 0.0, pitch: 0.05, dist: 9.2 },
  { name: "skills", box: { min: [-2.4, -1.45, -0.9], max: [2.4, 1.45, 0.9] }, target: [0, 0, 0], yaw: 0.0, pitch: 0.05, dist: 9.2 },
  { name: "skills", box: { min: [-2.4, -1.45, -0.9], max: [2.4, 1.45, 0.9] }, target: [0, 0, 0], yaw: 0.0, pitch: 0.05, dist: 9.2 },
  { name: "skills", box: { min: [-2.4, -1.45, -0.9], max: [2.4, 1.45, 0.9] }, target: [0, 0, 0], yaw: 0.0, pitch: 0.05, dist: 9.2 },
  { name: "skills", box: { min: [-2.4, -1.45, -0.9], max: [2.4, 1.45, 0.9] }, target: [0, 0, 0], yaw: 0.0, pitch: 0.05, dist: 9.2 },
  // 10 contact: the robot turning on a low plinth.
  { name: "robot", box: { min: [-1.05, -0.75, -1.05], max: [1.05, 0.75, 1.05] }, target: [0, 0, 0], yaw: 0.3, pitch: 0.2, dist: 6.6 },
];

/** How long a robot is made, world units, in the field and on the plinth. */
export const FIELD_ROBOT_LEN = 0.85;
export const PLINTH_ROBOT_LEN = 1.5;

/** The skill marks' spread for a group of n: a loose grid, jittered by a seed. */
export function markPositions(n: number, seed: number): Vec3[] {
  const cols = Math.ceil(Math.sqrt(n * 1.9));
  const rows = Math.ceil(n / cols);
  let s = seed * 9301 + 49297;
  const rand = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // The last row is centred when it is short.
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const cx = c - (inRow - 1) / 2;
    const x = cols > 1 ? (cx / Math.max(1, (cols - 1) / 2)) * 1.85 : 0;
    const y = rows > 1 ? (((rows - 1) / 2 - r) / Math.max(1, (rows - 1) / 2)) * 1.0 : 0;
    out.push([x + (rand() - 0.5) * 0.2, y + (rand() - 0.5) * 0.12, (rand() - 0.5) * 1.5]);
  }
  return out;
}
export const MARK_SIZE = 0.72;

/** Camera position for a scene and a drift (-1..1 each way). */
export function cameraPos(spec: SceneSpec, dx = 0, dy = 0): Vec3 {
  const yaw = spec.yaw + dx * DRIFT_YAW;
  const pitch = spec.pitch + dy * DRIFT_PITCH;
  const [tx, ty, tz] = spec.target;
  return [
    tx + spec.dist * Math.cos(pitch) * Math.sin(yaw),
    ty + spec.dist * Math.sin(pitch),
    tz + spec.dist * Math.cos(pitch) * Math.cos(yaw),
  ];
}

/**
 * Where a world point lands on screen, 0..1 each way from the top left,
 * for a camera at `eye` looking at `target` with FOV and the SHIFT slide.
 * Also its depth in front of the camera (negative is behind).
 */
export function project(p: Vec3, eye: Vec3, target: Vec3, aspect: number): { x: number; y: number; depth: number } {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const v = sub(p, eye);
  const depth = dot(v, fwd);
  const t = Math.tan(((FOV * Math.PI) / 180) / 2);
  const nx = dot(v, right) / (depth * t * aspect);
  const ny = dot(v, up) / (depth * t);
  return { x: (nx + 1) / 2 + SHIFT, y: (1 - ny) / 2, depth };
}

/** The eight corners of a box. */
export function corners(b: { min: Vec3; max: Vec3 }): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}
