import { Matrix4, PerspectiveCamera, Vector3 } from "three";

/**
 * Every number the room is built from, and the camera's road through it.
 *
 * This file has no page and no WebGL in it, only arithmetic, so a Node
 * script can import it and print where things land on the screen. The
 * scene and the page both read their sizes from here, so what the script
 * checks is what is drawn.
 *
 * Lengths are metres. y is up, the desk's front faces +z.
 */

// ------------------------------------------------------------ the page

/** The pinned track is this many screens tall. */
export const TRACK_SCREENS = 4;
/** Screens of scroll the move in takes. After it the camera is seated. */
export const MOVE_SCREENS = 2.1;
/** Where, in screens of scroll, each window opens by itself. */
export const ARRIVE = { work: MOVE_SCREENS, skills: 2.4, contact: 2.7 } as const;

// ------------------------------------------------------- the television

/**
 * Measured from public/models/crt.glb by a script, not by eye. The model
 * is turned a quarter turn so its face looks down +z; these are in the
 * model's own units after that turn.
 *
 * The glass is a part of its own, 162 triangles, domed. The frame round
 * it ends in a lip. Looking straight at the face, glass shows between
 * x -0.8852 and 0.8852 and between y 1.8052 and 3.1897. The lip's inner
 * edge is at z 0.4631; the dome's top is at z 0.5351.
 */
export const MODEL = {
  yaw: -Math.PI / 2,
  min: [-1, 1.1749, -1.5799],
  max: [1, 3.3663, 0.643],
  opening: { x0: -0.8852, x1: 0.8852, y0: 1.8052, y1: 3.1897 },
  lipZ: 0.4631,
  apex: [0, 2.4975, 0.5351],
} as const;

export const DESK_TOP = 0.75;
/** Model units to metres. The set comes out 0.52 wide and 0.57 tall. */
export const TV_SCALE = 0.26;
/** Where the model's origin goes so its feet stand on the desk. */
export const TV_AT = { x: 0, y: DESK_TOP - MODEL.min[1] * TV_SCALE, z: 0 } as const;

const openW = MODEL.opening.x1 - MODEL.opening.x0;
const openH = MODEL.opening.y1 - MODEL.opening.y0;

/** The opening in the frame, in the room. */
export const SCREEN = {
  cx: TV_AT.x + ((MODEL.opening.x0 + MODEL.opening.x1) / 2) * TV_SCALE,
  cy: TV_AT.y + ((MODEL.opening.y0 + MODEL.opening.y1) / 2) * TV_SCALE,
  /** The lip's inner edge: what frames the picture. */
  lipZ: TV_AT.z + MODEL.lipZ * TV_SCALE,
  halfW: (openW / 2) * TV_SCALE,
  halfH: (openH / 2) * TV_SCALE,
  aspect: openW / openH,
} as const;

/** The page on the screen sits this far behind the lip. */
export const PANEL_BACK = 0.002;
/** And reaches this far past the opening on every side, under the lip,
 *  so no gap shows when the set is seen from the side. */
export const PANEL_TUCK = 0.006;
export const PANEL = {
  z: SCREEN.lipZ - PANEL_BACK,
  halfW: SCREEN.halfW + PANEL_TUCK,
  halfH: SCREEN.halfH + PANEL_TUCK,
} as const;

// ------------------------------------------------------------- the room

export type Box = { name: string; min: [number, number, number]; max: [number, number, number] };

export const ROOM = {
  backZ: -0.62,
  leftX: -3.0,
  rightX: 3.4,
  frontZ: 5.0,
  height: 3.4,
} as const;

export const DESK = {
  halfW: 0.85,
  backZ: -0.47,
  frontZ: 0.47,
  thick: 0.04,
  leg: 0.05,
  legInset: 0.04,
} as const;

export const KEYBOARD = { cx: 0, cz: 0.31, w: 0.43, d: 0.15, h: 0.022, keyH: 0.012 } as const;
export const MOUSE = { cx: 0.33, cz: 0.31, w: 0.06, d: 0.1, h: 0.034 } as const;
export const MUG = { cx: -0.5, cz: 0.26, r: 0.042, h: 0.095 } as const;
export const BOARDS = { cx: 0.52, cz: -0.1, w: 0.18, d: 0.13, count: 4, step: 0.012 } as const;
export const ROBOT = { cx: 0.62, cz: 0.24, h: 0.2, reach: 0.15 } as const;
export const SHELF = { x0: -0.5, x1: 0.75, y: 1.72, thick: 0.03, depth: 0.22, bookH: 0.26 } as const;
export const POSTER = { cx: -1.25, cy: 1.62, w: 0.7, h: 0.95 } as const;
export const RUG = { x0: -1.3, x1: 1.3, z0: -0.35, z1: 1.55 } as const;
export const DRAWERS = { x0: -0.74, x1: -0.36, y0: 0.31, z0: -0.37, z1: 0.37 } as const;

/** The lamp: a round foot, two arms, a shade. The bulb is in the shade. */
export const LAMP = {
  foot: [-0.68, DESK_TOP, -0.24],
  elbow: [-0.76, 1.14, -0.06],
  head: [-0.44, 1.23, 0.26],
  aim: [0.02, DESK_TOP, 0.28],
  footR: 0.085,
  shadeR: 0.075,
  shadeL: 0.13,
} as const;

/** What the lights are, so the check can work out how bright things get. */
export const LIGHTS = {
  lamp: { colour: "#ffc994", candela: 5, angle: 1.02, penumbra: 0.75 },
  glow: { colour: "#f9b9dc", candela: 0.34, at: [0, SCREEN.cy, SCREEN.lipZ + 0.2] },
  sky: { above: "#e8c4da", below: "#4a1c3c", level: 2.1 },
} as const;

/** Things the camera must stay out of. Boxes, a little generous. */
export const SOLIDS: Box[] = [
  {
    name: "television",
    min: [TV_AT.x + MODEL.min[0] * TV_SCALE, DESK_TOP, TV_AT.z + MODEL.min[2] * TV_SCALE],
    max: [TV_AT.x + MODEL.max[0] * TV_SCALE, TV_AT.y + MODEL.max[1] * TV_SCALE, TV_AT.z + MODEL.max[2] * TV_SCALE],
  },
  { name: "desk", min: [-DESK.halfW, 0, DESK.backZ], max: [DESK.halfW, DESK_TOP, DESK.frontZ] },
  {
    name: "keyboard",
    min: [KEYBOARD.cx - KEYBOARD.w / 2, DESK_TOP, KEYBOARD.cz - KEYBOARD.d / 2],
    max: [KEYBOARD.cx + KEYBOARD.w / 2, DESK_TOP + KEYBOARD.h + KEYBOARD.keyH, KEYBOARD.cz + KEYBOARD.d / 2],
  },
  {
    name: "mouse",
    min: [MOUSE.cx - MOUSE.w / 2, DESK_TOP, MOUSE.cz - MOUSE.d / 2],
    max: [MOUSE.cx + MOUSE.w / 2, DESK_TOP + MOUSE.h, MOUSE.cz + MOUSE.d / 2],
  },
  {
    name: "mug",
    min: [MUG.cx - MUG.r - 0.035, DESK_TOP, MUG.cz - MUG.r],
    max: [MUG.cx + MUG.r, DESK_TOP + MUG.h, MUG.cz + MUG.r],
  },
  {
    name: "boards",
    min: [BOARDS.cx - BOARDS.w / 2 - 0.02, DESK_TOP, BOARDS.cz - BOARDS.d / 2 - 0.02],
    max: [BOARDS.cx + BOARDS.w / 2 + 0.02, DESK_TOP + BOARDS.count * BOARDS.step + 0.01, BOARDS.cz + BOARDS.d / 2 + 0.02],
  },
  {
    name: "robot",
    min: [ROBOT.cx - ROBOT.reach, DESK_TOP, ROBOT.cz - ROBOT.reach],
    max: [ROBOT.cx + ROBOT.reach, DESK_TOP + ROBOT.h, ROBOT.cz + ROBOT.reach],
  },
  {
    name: "lamp",
    min: [-0.8, DESK_TOP, -0.33],
    max: [-0.34, 1.34, 0.36],
  },
  {
    name: "shelf",
    min: [SHELF.x0, SHELF.y, ROOM.backZ],
    max: [SHELF.x1, SHELF.y + SHELF.thick + SHELF.bookH, ROOM.backZ + SHELF.depth],
  },
];

// ----------------------------------------------------------- the camera

export const FOV = 40;
export const NEAR = 0.02;
export const FAR = 40;
const TAN = Math.tan((FOV * Math.PI) / 360);

/** At the end the opening is this much larger than the view, so a small
 *  lean of the camera never brings the frame into the picture. */
export const COVER = 1.035;

export const MOVE = {
  /** Round the desk, from the front. Degrees. */
  az0: 36,
  /** Above level. Degrees. */
  el0: 21,
  /** The slow circling at the top: this far each way, at this rate. */
  sway: 11,
  swayRate: 0.22,
  /** What the camera looks at to begin with: the middle of the desk. */
  look0: [0, 0.62, 0.1],
  /** How far the cursor moves the camera, at the start and seated. */
  lean0: 0.13,
  lean1: 0.0016,
} as const;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Slow to start and slow to arrive, but never still: a quarter of it
 *  is a straight line, so the first and last of the scroll still move
 *  the camera. */
export const ease = (v: number): number => {
  const c = clamp(v, 0, 1);
  return 0.25 * c + 0.75 * c * c * (3 - 2 * c);
};

/** How far back the camera starts. A narrow window needs more room to
 *  get the desk in, up to what the room has. */
export function startDistance(aspect: number): number {
  return clamp(1.2 / (TAN * aspect), 3.2, 4.4);
}

/** How far from the lip the camera ends, so the opening covers the view. */
export function endDistance(aspect: number): number {
  const byWidth = SCREEN.halfW / (COVER * aspect * TAN);
  const byHeight = SCREEN.halfH / (COVER * TAN);
  return Math.min(byWidth, byHeight);
}

export type Pose = { eye: Vector3; look: Vector3 };

const forward = new Vector3();
const right = new Vector3();
const up = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Where the camera is and what it looks at.
 * t       0 at the top of the track, 1 seated. Eased here.
 * time    seconds, for the slow circling at the top.
 * leanX/Y the cursor, each -1 to 1.
 */
export function poseAt(t: number, aspect: number, time: number, leanX: number, leanY: number, out?: Pose): Pose {
  const pose = out ?? { eye: new Vector3(), look: new Vector3() };
  const e = ease(t);
  const rest = (1 - e) * (1 - e);
  const az = ((mix(MOVE.az0, 0, e) + MOVE.sway * Math.sin(time * MOVE.swayRate) * rest) * Math.PI) / 180;
  const el = (mix(MOVE.el0, 0, e) * Math.PI) / 180;
  const d0 = startDistance(aspect);
  const d1 = endDistance(aspect);
  // Distances are mixed as ratios, so the set grows at a steady rate on
  // screen and the last metre does not rush.
  const d = d0 * Math.pow(d1 / d0, e);
  pose.look.set(mix(MOVE.look0[0], SCREEN.cx, e), mix(MOVE.look0[1], SCREEN.cy, e), mix(MOVE.look0[2], SCREEN.lipZ, e));
  pose.eye.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(d).add(pose.look);
  // The lean slides the camera sideways and up and keeps it looking at
  // the same point.
  forward.copy(pose.look).sub(pose.eye).normalize();
  right.crossVectors(forward, WORLD_UP).normalize();
  up.crossVectors(right, forward);
  const amount = mix(MOVE.lean0, MOVE.lean1, e);
  pose.eye.addScaledVector(right, leanX * amount).addScaledVector(up, -leanY * amount * 0.6);
  return pose;
}

/** The one frame drawn for a visitor who asked for less motion: the desk
 *  from straight in front, a little above level. */
export function stillPose(aspect: number, out?: Pose): Pose {
  const pose = out ?? { eye: new Vector3(), look: new Vector3() };
  const d = clamp(1.05 / (TAN * aspect), 1.9, 3.6);
  const el = (9 * Math.PI) / 180;
  pose.look.set(0, 0.92, 0.1);
  pose.eye.set(0, Math.sin(el) * d, Math.cos(el) * d).add(pose.look);
  return pose;
}

export function makeCamera(aspect: number): PerspectiveCamera {
  return new PerspectiveCamera(FOV, aspect, NEAR, FAR);
}

export function aim(camera: PerspectiveCamera, pose: Pose): void {
  camera.position.copy(pose.eye);
  camera.up.copy(WORLD_UP);
  camera.lookAt(pose.look);
  camera.updateMatrixWorld(true);
}

export type Spot = { x: number; y: number; behind: boolean };

const probe = new Vector3();
/** A point in the room as a share of the view, in percent. 0,0 is the
 *  top left. `behind` means it is behind the camera and x,y mean nothing. */
export function toView(camera: PerspectiveCamera, x: number, y: number, z: number): Spot {
  probe.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  const behind = probe.z > -NEAR;
  probe.applyMatrix4(camera.projectionMatrix);
  return { x: (probe.x * 0.5 + 0.5) * 100, y: (0.5 - probe.y * 0.5) * 100, behind };
}

/** The opening's corners in the view: top left, top right, bottom right,
 *  bottom left. Taken at the lip, which is what cuts the picture off. */
export function screenCorners(camera: PerspectiveCamera): [Spot, Spot, Spot, Spot] {
  const { cx, cy, halfW, halfH, lipZ } = SCREEN;
  return [
    toView(camera, cx - halfW, cy + halfH, lipZ),
    toView(camera, cx + halfW, cy + halfH, lipZ),
    toView(camera, cx + halfW, cy - halfH, lipZ),
    toView(camera, cx - halfW, cy - halfH, lipZ),
  ];
}

/** Is the whole view inside the four corners? */
export function coversView(corners: readonly Spot[]): boolean {
  if (corners.some((c) => c.behind)) return false;
  const view = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  for (const [px, py] of view) {
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      // The corners run clockwise on screen, where y grows downward, so
      // inside is where this is not negative.
      if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false;
    }
  }
  return true;
}

/**
 * The size of the page on the screen, in CSS pixels, chosen so that with
 * the camera seated one of its pixels is one pixel of the window. Text
 * drawn at its own size is sharp.
 */
export function panelSize(width: number, height: number): { w: number; h: number; perMetre: number } {
  const distance = endDistance(width / height) + PANEL_BACK;
  const perMetre = height / 2 / (distance * TAN);
  return { w: PANEL.halfW * 2 * perMetre, h: PANEL.halfH * 2 * perMetre, perMetre };
}

/** How far a point is from a box. 0 means inside it. */
export function distanceToBox(p: Vector3, box: Box): number {
  const dx = Math.max(box.min[0] - p.x, 0, p.x - box.max[0]);
  const dy = Math.max(box.min[1] - p.y, 0, p.y - box.max[1]);
  const dz = Math.max(box.min[2] - p.z, 0, p.z - box.max[2]);
  return Math.hypot(dx, dy, dz);
}

/** Is the camera between the walls, over the floor, under the ceiling line? */
export function insideRoom(p: Vector3): boolean {
  return p.x > ROOM.leftX && p.x < ROOM.rightX && p.z > ROOM.backZ && p.z < ROOM.frontZ && p.y > 0 && p.y < ROOM.height;
}

// ------------------------------------------------------------ the glass

/**
 * Which triangles of the television are its glass.
 *
 * The model is one mesh. Its parts do not share corners, so triangles
 * that do share corners are one part. The glass is the part with a corner
 * nearest the top of the dome. Returns one flag for each triangle.
 *
 * position  the mesh's corners, three numbers each.
 * index     three corners for each triangle.
 * toModel   takes a corner to the turned model's own units.
 */
export function glassTriangles(position: ArrayLike<number>, index: ArrayLike<number>, toModel: Matrix4): Uint8Array {
  const count = position.length / 3;
  const triangles = index.length / 3;
  // Corners in the same place are the same corner, whatever their number.
  const seen = new Map<string, number>();
  const same = new Int32Array(count);
  for (let i = 0; i < count; i += 1) {
    const k = `${position[i * 3].toFixed(4)},${position[i * 3 + 1].toFixed(4)},${position[i * 3 + 2].toFixed(4)}`;
    let n = seen.get(k);
    if (n === undefined) {
      n = seen.size;
      seen.set(k, n);
    }
    same[i] = n;
  }
  const head = new Int32Array(seen.size);
  for (let i = 0; i < head.length; i += 1) head[i] = i;
  const find = (a: number): number => {
    let r = a;
    while (head[r] !== r) {
      head[r] = head[head[r]];
      r = head[r];
    }
    return r;
  };
  for (let t = 0; t < triangles; t += 1) {
    const a = find(same[index[t * 3]]);
    head[find(same[index[t * 3 + 1]])] = a;
    head[find(same[index[t * 3 + 2]])] = a;
  }
  let nearest = Infinity;
  let glass = -1;
  const p = new Vector3();
  for (let i = 0; i < count; i += 1) {
    p.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]).applyMatrix4(toModel);
    const d = Math.hypot(p.x - MODEL.apex[0], p.y - MODEL.apex[1], p.z - MODEL.apex[2]);
    if (d < nearest) {
      nearest = d;
      glass = find(same[i]);
    }
  }
  const flags = new Uint8Array(triangles);
  for (let t = 0; t < triangles; t += 1) flags[t] = find(same[index[t * 3]]) === glass ? 1 : 0;
  return flags;
}
