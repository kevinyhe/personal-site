/**
 * Where everything stands on the little planet, and how the planet is
 * turned at each point of the scroll. Plain numbers only: no three, no
 * DOM. The scene, the page and the Node check all read this file, so what
 * the check measures is what the page draws.
 *
 * The planet is a unit sphere at the world origin, pushed out into hills.
 * The camera never moves: it sits on +z looking at the origin. The planet
 * is turned instead, by two angles:
 *   yaw   about the planet's own axis (a spin),
 *   tilt  about the screen's x axis. Positive tips the north pole toward
 *         the camera.
 * The planet is shifted on screen with a lens shift (sx, sy in NDC), so
 * the point facing the camera is always the one nearest it.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6     work. Five stops, one per pin.
 *   6 .. 8.5   skills. The pole with its lantern rings.
 *   8.5 .. 9   contact. The planet has shrunk to a moon.
 */

import { fbm2 } from "../../valley/sources/noise";

export const FOV = 30; // vertical, degrees
export const DIST = 5.4; // camera on +z
export const NEAR = 0.5;
export const FAR = 60;
export const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

/** How many screens the stage stays pinned. */
export const S_END = 9;
/** Section heights, in screens. */
export const WORK_H = 6;
export const SKILLS_H = 2.5;
export const CONTACT_H = 1.5;

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ pins
/** Latitude of each pin, radians north. */
export const PIN_LAT = [24, 32, 20, 30, 26].map((d) => d * DEG);
/** Longitude of each pin. Each is a fifth of a turn behind the one before, so the planet always turns the same way. */
export const PIN_LON = [0, 1, 2, 3, 4].map((i) => 0.3 - (i * 2 * Math.PI) / 5);
/** Pole length above the ground, and where the object's middle stands on it. */
export const PIN_LEN = 0.3;
export const PIN_OBJ_Y = PIN_LEN + 0.09;
/** How high the pin's foot stands above the planet's middle on screen at its stop, as an angle from the line to the camera. */
export const PIN_ELEV = 40 * DEG;

// ---------------------------------------------------------------- stops
export const STOPS = [0.7, 1.8, 2.9, 4.0, 5.1] as const;
export const HOLD = 0.22;
export const SKILLS_ARRIVE = 6.0;
export const SKILLS_LEAVE = 7.8;
export const CONTACT_ARRIVE = 8.5;

// ------------------------------------------------------------- lanterns
/** The five rings round the north pole, one per skill group: angle from the pole. */
export const RING_COLAT = [8, 14, 20, 26, 32].map((d) => d * DEG);
export const RING_COUNTS = [7, 11, 10, 7, 7] as const;

// --------------------------------------------------------------- robot
/** The robot stays this far round from the front, on the equator, and the ground turns under it. */
export const ROBOT_AHEAD = 0.34;
export const ROBOT_LEN = 0.17;

export type Vec3 = { x: number; y: number; z: number };
export type Pose = { yaw: number; tilt: number; scale: number; sx: number; sy: number };

/** The unit vector at a latitude and longitude. Longitude 0 faces +z; east is +x there. */
export const dirAt = (lat: number, lon: number): Vec3 => ({
  x: Math.sin(lon) * Math.cos(lat),
  y: Math.sin(lat),
  z: Math.cos(lon) * Math.cos(lat),
});

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const smoothstep = (a: number, b: number, x: number): number => smooth((x - a) / (b - a));

// --------------------------------------------------------------- ground
/** Where the river runs: its latitude at each longitude. */
export const riverLat = (lon: number): number => -0.42 + 0.1 * Math.sin(2 * lon + 0.5) + 0.05 * Math.sin(5 * lon);

/** 0 away from the river, 1 in its bed. */
export function riverAt(n: Vec3): number {
  const lat = Math.asin(Math.max(-1, Math.min(1, n.y)));
  const lon = Math.atan2(n.x, n.z);
  const d = Math.abs(lat - riverLat(lon));
  return 1 - smoothstep(0.018, 0.045, d);
}

/** 0 off the road, 1 on it. The road runs round the equator; the robot drives it. */
export const roadAt = (n: Vec3): number => 1 - smoothstep(0.045, 0.065, Math.abs(n.y));

/** Noise with no seam: three slices of the 2D field, one per pair of axes. */
const noise3 = (x: number, y: number, z: number): number =>
  (fbm2(x, y, 4, 23) + fbm2(y + 3.1, z, 4, 71) + fbm2(z + 7.7, x, 4, 139)) / 3;

/** Raw hilliness, 0..1, before the flat places are pressed out. */
export const hillAt = (n: Vec3): number => Math.max(0, Math.min(1, (noise3(n.x * 2.4 + 5, n.y * 2.4 + 5, n.z * 2.4 + 5) - 0.36) * 3));

/** Height of the ground above the unit sphere. Flat along the road and on the pole plaza, sunk along the river. */
export function groundAt(n: Vec3): number {
  const flat = smoothstep(0.08, 0.24, Math.abs(n.y)) * (1 - smoothstep(0.76, 0.84, n.y));
  return 0.055 * hillAt(n) * flat - 0.012 * riverAt(n);
}

// ------------------------------------------------------------ transforms
/** A planet point (in its own frame) to the world, as the scene's group of groups does it: yaw, then tilt, then scale. */
export function toWorld(p: Vec3, pose: Pose): Vec3 {
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const ct = Math.cos(pose.tilt);
  const st = Math.sin(pose.tilt);
  const y2 = p.y * ct - z1 * st;
  const z2 = p.y * st + z1 * ct;
  return { x: x1 * pose.scale, y: y2 * pose.scale, z: z2 * pose.scale };
}

/** Where a world point lands, as shares of the stage from the top left, and its distance in front of the camera. */
export function project(w: Vec3, pose: Pose, aspect: number): { x: number; y: number; depth: number } {
  const depth = DIST - w.z;
  const nx = w.x / (depth * TAN * aspect) + pose.sx;
  const ny = w.y / (depth * TAN) + pose.sy;
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth };
}

/** Is the world point hidden by the planet (a ball of radius r round the origin)? */
export function hiddenByPlanet(w: Vec3, r: number): boolean {
  // Ray from the camera (0, 0, DIST) to w; hidden if it meets the ball before w.
  const dx = w.x;
  const dy = w.y;
  const dz = w.z - DIST;
  const len = Math.hypot(dx, dy, dz);
  // Only the ray's z matters: the camera sits on the z axis.
  const uz = dz / len;
  const b = uz * DIST; // dot(camera, u)
  const c = DIST * DIST - r * r;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t0 = -b - Math.sqrt(disc);
  return t0 > 0 && t0 < len - 1e-4;
}

// ---------------------------------------------------------------- poses
/** Makes the planet fit a narrower screen: full size from 1.75 wide, smaller under it. */
export const fitScale = (aspect: number): number => Math.min(1, aspect / 1.75);

export const pinYaw = (k: number): number => -PIN_LON[k];
export const pinTilt = (k: number): number => PIN_LAT[k] - PIN_ELEV;

const WORK_SX = -0.42;
const WORK_SY = -0.08;

export const stopPose = (k: number): Pose => ({ yaw: pinYaw(k), tilt: pinTilt(k), scale: 1, sx: WORK_SX, sy: WORK_SY });
const START: Pose = { yaw: pinYaw(0) - 0.9, tilt: pinTilt(0) - 0.12, scale: 0.94, sx: WORK_SX, sy: WORK_SY - 0.04 };
const SKILLS_A: Pose = { yaw: pinYaw(4) + 1.1, tilt: 1.2, scale: 1.02, sx: -0.36, sy: -0.2 };
const SKILLS_B: Pose = { ...SKILLS_A, yaw: pinYaw(4) + 1.7 };
const CONTACT_A: Pose = { yaw: pinYaw(4) + 3.6, tilt: 0.3, scale: 0.3, sx: 0.5, sy: 0.44 };
const CONTACT_B: Pose = { ...CONTACT_A, yaw: CONTACT_A.yaw + 0.3 };

type Key = { s: number; pose: Pose };
const KEYS: Key[] = (() => {
  const out: Key[] = [{ s: 0, pose: START }];
  STOPS.forEach((s, k) => {
    out.push({ s: s - HOLD, pose: stopPose(k) });
    out.push({ s: s + HOLD, pose: stopPose(k) });
  });
  out.push({ s: SKILLS_ARRIVE, pose: SKILLS_A });
  out.push({ s: SKILLS_LEAVE, pose: SKILLS_B });
  out.push({ s: CONTACT_ARRIVE, pose: CONTACT_A });
  out.push({ s: S_END, pose: CONTACT_B });
  return out;
})();

const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  yaw: a.yaw + (b.yaw - a.yaw) * t,
  tilt: a.tilt + (b.tilt - a.tilt) * t,
  scale: a.scale + (b.scale - a.scale) * t,
  sx: a.sx + (b.sx - a.sx) * t,
  sy: a.sy + (b.sy - a.sy) * t,
});

/** The planet's pose at scroll s, before the drag is added. Eased between keys, still at them. */
export function poseAt(s: number, aspect: number): Pose {
  let p: Pose = KEYS[KEYS.length - 1].pose;
  if (s <= KEYS[0].s) p = KEYS[0].pose;
  else {
    for (let i = 1; i < KEYS.length; i += 1) {
      const b = KEYS[i];
      if (s > b.s) continue;
      const a = KEYS[i - 1];
      // The long skills key turns at an even rate; the rest ease in and out.
      const raw = (s - a.s) / Math.max(1e-6, b.s - a.s);
      p = mixPose(a.pose, b.pose, a.s === SKILLS_ARRIVE ? raw : smooth(raw));
      break;
    }
  }
  // Only the big planet is shrunk for a narrow screen; the moon is small already.
  const fit = 1 + (fitScale(aspect) - 1) * (1 - smooth((s - (CONTACT_ARRIVE - 0.6)) / 0.6));
  return { ...p, scale: p.scale * fit };
}

/** The still frame, for reduced motion and narrow screens: the first pin, the planet in the middle. */
export const stillPose = (aspect: number): Pose => ({
  ...stopPose(0),
  sx: 0,
  sy: -0.06,
  // On an upright phone the planet, pins and all, keeps inside the width.
  scale: Math.min(0.9, 0.85 * aspect),
});

// ------------------------------------------------------ what shows when
/** How much pin k stands out at s: it grows and brightens at its stop. */
export const pinLit = (k: number, s: number): number => 1 - smooth((Math.abs(s - STOPS[k]) - 0.3) / 0.2);
/** How much of project k's words show at s. */
export const cardAt = (k: number, s: number): number => 1 - smooth((Math.abs(s - STOPS[k]) - 0.28) / 0.14);
/** Lantern ring r lights as the scroll passes it, and stays lit. */
export const ringLit = (r: number, s: number): number => smooth((s - (SKILLS_ARRIVE + 0.3 * r)) / 0.25);
/** Which ring is being lit now, for the list beside it. -1 before the first. */
export const activeRing = (s: number): number => {
  let a = -1;
  for (let r = 0; r < 5; r += 1) if (s >= SKILLS_ARRIVE + 0.3 * r - 0.05) a = r;
  return a;
};
export const skillsAt = (s: number): number =>
  smooth((s - (SKILLS_ARRIVE - 0.25)) / 0.25) * (1 - smooth((s - (SKILLS_LEAVE + 0.1)) / 0.15));
export const contactAt = (s: number): number => smooth((s - (CONTACT_ARRIVE - 0.4)) / 0.3);
/** Stars come out as the planet becomes a moon. */
export const starsAt = (s: number): number => 0.35 + 0.65 * smooth((s - (CONTACT_ARRIVE - 0.8)) / 0.6);
/** The glow on the pole plaza as its lanterns light. */
export const poleGlowAt = (s: number): number => [0, 1, 2, 3, 4].reduce((a, r) => a + ringLit(r, s), 0) / 5;

/** Scroll positions (screens) goTo(i) goes to: five pins, skills, contact. */
export const GO_TO: readonly number[] = [...STOPS, (SKILLS_ARRIVE + SKILLS_LEAVE) / 2 - 0.2, S_END];

// ---------------------------------------------------------- the words
/** The project words' column, as shares of the stage. */
export const TEXT_BOX = { x0: 0.58, x1: 0.93, y0: 0.24, y1: 0.76 };
/** The skills list's column. */
export const SKILLS_BOX = { x0: 0.56, x1: 0.95, y0: 0.14, y1: 0.9 };

// ------------------------------------------------------------ placement
export type Placed = { lat: number; lon: number; turn: number };

/** Angle between two directions on the sphere. */
export const angleBetween = (a: Vec3, b: Vec3): number =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));

/** Midway between two pins, where nothing else stands. */
const between = (k: number): number => PIN_LON[k] - Math.PI / 5;

export const SHRINES: Placed[] = [
  { lat: -13 * DEG, lon: between(0), turn: 0.4 },
  { lat: 40 * DEG, lon: between(1) + 0.1, turn: -0.3 },
  { lat: -12 * DEG, lon: between(3), turn: 0.9 },
];
/** Torii over the road, so the robot drives through them, and one before each shrine. */
export const ROAD_TORII: Placed[] = [0, 2, 4].map((k) => ({ lat: 0, lon: between(k), turn: 0 }));
export const SHRINE_TORII: Placed[] = SHRINES.map((sh) => ({
  lat: sh.lat + (sh.lat > 0 ? -1 : 1) * 0.11,
  lon: sh.lon,
  turn: Math.PI / 2,
}));

/** A seeded generator, so the trees stand in the same places on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TreeSpot = Placed & { h: number; seed: number };

/** Sakura, scattered where there is room: off the road, the river, the pole plaza, and clear of pins and shrines. */
export const TREES: TreeSpot[] = (() => {
  const r = rng(2323);
  const out: TreeSpot[] = [];
  const pins = PIN_LAT.map((lat, k) => dirAt(lat, PIN_LON[k]));
  const shrines = [...SHRINES, ...SHRINE_TORII].map((s) => dirAt(s.lat, s.lon));
  for (let tries = 0; tries < 4000 && out.length < 54; tries += 1) {
    const lat = Math.asin(-0.82 + r() * 1.55);
    const lon = r() * Math.PI * 2 - Math.PI;
    const n = dirAt(lat, lon);
    if (Math.abs(lat) < 9 * DEG || lat > 46 * DEG) continue;
    if (riverAt(n) > 0.01 || Math.abs(lat - riverLat(lon)) < 0.07) continue;
    if (pins.some((p) => angleBetween(p, n) < 0.2)) continue;
    if (shrines.some((p) => angleBetween(p, n) < 0.14)) continue;
    if (out.some((t) => angleBetween(dirAt(t.lat, t.lon), n) < 0.13)) continue;
    out.push({ lat, lon, turn: r() * Math.PI * 2, h: 0.085 + r() * 0.05, seed: Math.floor(r() * 1e6) });
  }
  return out;
})();

/** Every lantern at the pole: its ring and where it stands. */
export const LANTERNS: (Placed & { ring: number })[] = (() => {
  const out: (Placed & { ring: number })[] = [];
  RING_COUNTS.forEach((count, ring) => {
    for (let i = 0; i < count; i += 1) {
      out.push({ ring, lat: Math.PI / 2 - RING_COLAT[ring], lon: ((i + ring * 0.37) / count) * Math.PI * 2, turn: 0 });
    }
  });
  return out;
})();

/** The robot's longitude on the planet for a given yaw: it keeps its place on screen and the ground turns under it. */
export const robotLon = (yaw: number): number => -yaw + ROBOT_AHEAD;

/** Half the size of a pin's object, before it grows at its stop. */
export const PIN_OBJ_R = 0.11;

/**
 * Where pin k is on screen for a pose: its foot, its object and the
 * object's half width and height (shares of the stage), whether its
 * object is behind the planet, and how squarely its foot faces the
 * camera (1 straight on, 0 edge on, below 0 round the back).
 */
export function pinScreen(k: number, pose: Pose, aspect: number, grow = 1) {
  const n = dirAt(PIN_LAT[k], PIN_LON[k]);
  const r = 1 + groundAt(n);
  const base = { x: n.x * r, y: n.y * r, z: n.z * r };
  const obj = { x: n.x * (r + PIN_OBJ_Y), y: n.y * (r + PIN_OBJ_Y), z: n.z * (r + PIN_OBJ_Y) };
  const nw = toWorld(n, pose);
  const bw = toWorld(base, pose);
  const ow = toWorld(obj, pose);
  const cx = -bw.x;
  const cy = -bw.y;
  const cz = DIST - bw.z;
  const facing = (nw.x * cx + nw.y * cy + nw.z * cz) / Math.hypot(cx, cy, cz);
  const foot = project(bw, pose, aspect);
  const at = project(ow, pose, aspect);
  const halfH = (PIN_OBJ_R * grow * pose.scale) / (at.depth * TAN) / 2;
  return { foot, obj: at, halfW: halfH / aspect, halfH, hidden: hiddenByPlanet(ow, pose.scale), facing };
}
