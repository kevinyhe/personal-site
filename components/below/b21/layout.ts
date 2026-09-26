/**
 * The island's map and the camera's path, as plain numbers. No three, no
 * DOM, no imports: the page and the Node check both read this file, so the
 * check measures what the page draws.
 *
 * World units are metres. The island is about 20 across. y is up. On the
 * island's own map, x is right and z is toward the camera when the island
 * has not turned. An angle round the island ("az") is atan2(x, z): 0 faces
 * the camera, a quarter turn is +x.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6     work. Five stops, one per place on the island.
 *   6 .. 8.5   skills. The camera pulls back to the whole island.
 *   8.5 .. 9   contact. The island drifts down and away.
 */

export type V3 = { x: number; y: number; z: number };
/** A noise function in 0..1, passed in so this file needs no imports. */
export type Noise = (x: number, y: number) => number;

export const FOV = 35; // vertical, degrees
export const NEAR = 0.1;
export const FAR = 400;
export const S_END = 9;

// ------------------------------------------------------------ the island

/** The top's rim, a little uneven all the way round. */
export const RIM = 10;
export const rimAt = (az: number): number => RIM * (1 + 0.07 * Math.sin(3 * az + 0.6) + 0.05 * Math.sin(5 * az + 2.1));
/** How far below the top the rough underside hangs at its tip. */
export const UNDER_DEPTH = 8.5;
/** The height the top falls to at its rim, where the underside begins. */
export const EDGE_Y = -0.2;

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
export const smoothstep = (a: number, b: number, x: number): number => smooth((x - a) / (b - a));

export type Hill = { x: number; z: number; h: number; r: number };
/** The big hill carries the shrine on its top; the small one feeds the stream. */
export const HILLS: Hill[] = [
  { x: -3.0, z: -2.6, h: 2.3, r: 2.7 },
  { x: 3.0, z: -3.0, h: 1.1, r: 1.5 },
];

/** The stream: from a spring on the small hill's flank, over the rim, and down. */
export const STREAM: { x: number; z: number }[] = [
  { x: 2.1, z: -1.9 },
  { x: 1.4, z: 0.0 },
  { x: 1.9, z: 2.0 },
  { x: 2.4, z: 4.0 },
  { x: 2.9, z: 6.0 },
  { x: 3.3, z: 8.0 },
  { x: 3.6, z: 9.9 },
];
export const STREAM_HALF_W = 0.34;

/** Distance from (x, z) to the stream's line, and how far along it (0..1). */
export function streamDist(x: number, z: number): { d: number; t: number } {
  let best = Infinity;
  let bestT = 0;
  let run = 0;
  let total = 0;
  for (let i = 1; i < STREAM.length; i += 1) total += Math.hypot(STREAM[i].x - STREAM[i - 1].x, STREAM[i].z - STREAM[i - 1].z);
  for (let i = 1; i < STREAM.length; i += 1) {
    const a = STREAM[i - 1];
    const b = STREAM[i];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / len2));
    const d = Math.hypot(x - (a.x + vx * u), z - (a.z + vz * u));
    const len = Math.sqrt(len2);
    if (d < best) {
      best = d;
      bestT = (run + u * len) / total;
    }
    run += len;
  }
  return { d: best, t: bestT };
}

/** Where the stream crosses the rim: the top of the waterfall. */
export const FALL_AT = (() => {
  for (let i = 1; i < STREAM.length; i += 1) {
    const a = STREAM[i - 1];
    const b = STREAM[i];
    for (let k = 0; k <= 40; k += 1) {
      const u = k / 40;
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      if (Math.hypot(x, z) >= rimAt(Math.atan2(x, z)) * 0.985) return { x, z, az: Math.atan2(x, z) };
    }
  }
  const last = STREAM[STREAM.length - 1];
  return { x: last.x, z: last.z, az: Math.atan2(last.x, last.z) };
})();

/** A flat pad the terrain is levelled to: under each place, village and building. */
export type Pad = { x: number; z: number; r: number; h: number };

export type PlaceKind = "mic" | "blaster" | "ring" | "field" | "planet";
export type Place = {
  kind: PlaceKind;
  az: number;
  x: number;
  z: number;
  /** Height of the pad it stands on. */
  pad: number;
  /** Where on screen the place sits at its stop: -1 left, +1 right. The words go on the other side. */
  side: -1 | 1;
  /** Height above the pad of the object's middle, which is the point the camera aims at. */
  mid: number;
  /** Half the object's width, for the Node check's overlap test. */
  half: number;
  /** Its height, for the same. */
  tall: number;
};

const PLACE_R = 6.4;
const place = (kind: PlaceKind, deg: number, side: -1 | 1, mid: number, half: number, tall: number): Place => {
  const az = (deg * Math.PI) / 180;
  return { kind, az, x: PLACE_R * Math.sin(az), z: PLACE_R * Math.cos(az), pad: 0.45, side, mid, half, tall };
};

/** One place per project, in the order of profile.projects. */
export const PLACES: Place[] = [
  place("mic", 60, -1, 0.95, 0.5, 1.9),
  place("blaster", 132, 1, 0.95, 1.0, 1.35),
  place("ring", 204, -1, 0.5, 1.25, 1.05),
  place("field", 276, 1, 0.2, 1.2, 0.35),
  place("planet", 348, -1, 1.25, 1.05, 1.9),
];
export const PLACE_PAD_R = 1.35;

/** The shrine precinct on the big hill, the torii at its foot, lanterns on the approach, and the robot. */
export const SHRINE = { x: -3.0, z: -2.9, h: 2.5 };
export const TORII = { x: -2.2, z: -0.3, h: 1.45 };
export const LANTERN_PAIR = { x: -1.7, z: 1.0, h: 0.8 };
export const ROBOT = { x: -0.5, z: 1.1, h: 1.05 };

/** The five villages of skill lanterns, in the order of profile.skillGroups. */
export const VILLAGES: { x: number; z: number; n: number }[] = [
  { x: -3.4, z: 3.5, n: 7 },
  { x: 0.7, z: -3.6, n: 11 },
  { x: 4.8, z: 0.6, n: 10 },
  { x: -0.2, z: 3.9, n: 7 },
  { x: 2.2, z: -5.6, n: 7 },
];
export const VILLAGE_PAD = 0.3;
export const villageRadius = (n: number): number => 0.35 + n * 0.055;
export const LANTERN_H = 0.7;

/** Every lantern's spot, village after village, in skill order. */
export const LANTERNS: { v: number; x: number; z: number }[] = (() => {
  const out: { v: number; x: number; z: number }[] = [];
  VILLAGES.forEach((vg, v) => {
    const r = villageRadius(vg.n);
    for (let i = 0; i < vg.n; i += 1) {
      const a = (i / vg.n) * Math.PI * 2 + v * 0.7;
      out.push({ v, x: vg.x + r * Math.sin(a), z: vg.z + r * Math.cos(a) });
    }
  });
  return out;
})();

export const PADS: Pad[] = [
  ...PLACES.map((p) => ({ x: p.x, z: p.z, r: PLACE_PAD_R, h: p.pad })),
  ...VILLAGES.map((v) => ({ x: v.x, z: v.z, r: villageRadius(v.n) + 0.45, h: VILLAGE_PAD })),
  { x: SHRINE.x, z: SHRINE.z, r: 1.5, h: 2.05 },
  { x: TORII.x, z: TORII.z, r: 0.8, h: 0.62 },
  { x: LANTERN_PAIR.x, z: LANTERN_PAIR.z, r: 0.7, h: 0.42 },
  { x: ROBOT.x, z: ROBOT.z, r: 0.75, h: 0.4 },
];

/**
 * The top's height at (x, z). Gentle ground, two hills, the stream cut
 * into it, pads levelled, and the edge rolled down to the rim.
 */
export function heightAt(x: number, z: number, noise: Noise): number {
  let h = 0.3 + (noise(x * 0.28 + 3.1, z * 0.28 + 7.7) - 0.5) * 0.8;
  for (const hl of HILLS) {
    const d2 = ((x - hl.x) ** 2 + (z - hl.z) ** 2) / (hl.r * hl.r);
    h += hl.h * Math.exp(-d2 * 1.6);
  }
  const s = streamDist(x, z);
  h -= 0.42 * (1 - smoothstep(STREAM_HALF_W, STREAM_HALF_W + 0.6, s.d));
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    const m = 1 - smoothstep(p.r, p.r + 0.8, d);
    h += (p.h - h) * m;
  }
  const u = Math.hypot(x, z) / rimAt(Math.atan2(x, z));
  const e = smoothstep(0.84, 1.0, u);
  return h + (EDGE_Y - h) * e;
}

// ------------------------------------------------------------- the trees

export type Tree = { x: number; z: number; h: number; r: number; seed: number };

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

const angleGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/**
 * Sakura scattered over the top, clear of everything built and of the
 * stream, and never on the rim between a place and its camera.
 */
export const TREES: Tree[] = (() => {
  const r = rng(2121);
  const out: Tree[] = [];
  const keep: { x: number; z: number; r: number }[] = [
    ...PLACES.map((p) => ({ x: p.x, z: p.z, r: 1.9 })),
    ...VILLAGES.map((v) => ({ x: v.x, z: v.z, r: villageRadius(v.n) + 0.7 })),
    { x: SHRINE.x, z: SHRINE.z, r: 1.9 },
    { x: TORII.x, z: TORII.z, r: 0.9 },
    { x: LANTERN_PAIR.x, z: LANTERN_PAIR.z, r: 0.8 },
    { x: ROBOT.x, z: ROBOT.z, r: 1.0 },
  ];
  for (let tries = 0; tries < 4000 && out.length < 24; tries += 1) {
    const az = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * rimAt(az) * 0.83;
    const x = rad * Math.sin(az);
    const z = rad * Math.cos(az);
    const crown = 0.7 + r() * 0.4;
    if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + crown * 0.5)) continue;
    if (streamDist(x, z).d < 0.6 + crown * 0.5) continue;
    if (out.some((t) => Math.hypot(x - t.x, z - t.z) < 0.75 + (crown + t.r) * 0.35)) continue;
    // Out toward the rim in front of a place is where its camera looks from.
    if (rad > 4.6 && PLACES.some((p) => angleGap(az, p.az) < 0.5)) continue;
    out.push({ x, z, h: 0.9 + r() * 0.5, r: crown, seed: Math.floor(r() * 1e6) });
  }
  return out;
})();

// -------------------------------------------------------------- the path

/** The five project stops, in screens. */
export const STOPS = [0.75, 1.85, 2.95, 4.05, 5.15] as const;
export const HOLD = 0.2;
export const SKILLS_ARRIVE = 6.3;
export const SKILLS_LEAVE = 7.35;
export const CONTACT_ARRIVE = 8.45;
/** The seven stops for the dev handle: five places, skills, contact. */
export const GO_TO: readonly number[] = [...STOPS, (SKILLS_ARRIVE + SKILLS_LEAVE) / 2, S_END];

/**
 * A view: how far the island has turned (yaw, about its own axis), how
 * far it has dropped, and the camera, which always looks from the +z side,
 * `dist` from `target`, raised by `elev` radians.
 */
export type View = { yaw: number; drop: number; target: V3; dist: number; elev: number };

/** Where the place's screen x is at its stop. */
export const PLACE_SCREEN_X = { left: 0.3, right: 0.7 } as const;
export const STOP_DIST = 7.6;
export const STOP_ELEV = 0.32;
const TWIST = 0.3;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

/** The island's turn at project stop k: the place brought round to face the camera, a little to its side. */
export const stopYaw = (k: number): number => -PLACES[k].az + PLACES[k].side * TWIST;
export const INTRO_YAW = stopYaw(0) + 0.8;
export const SKILLS_YAW = stopYaw(4) - 0.55;
export const CONTACT_YAW = SKILLS_YAW - 1.0;

/** An island point, turned by yaw and dropped: where it is in the world (no tilt). */
export function toWorld(p: V3, yaw: number, drop: number): V3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: p.x * c + p.z * s, y: p.y + drop, z: -p.x * s + p.z * c };
}

/** A place's aim point on the island's own map. */
export const placeMid = (k: number): V3 => ({ x: PLACES[k].x, y: PLACES[k].pad + PLACES[k].mid, z: PLACES[k].z });

export function stopView(k: number, aspect: number): View {
  const yaw = stopYaw(k);
  const w = toWorld(placeMid(k), yaw, 0);
  const sx = PLACES[k].side < 0 ? PLACE_SCREEN_X.left : PLACE_SCREEN_X.right;
  // Slide the aim sideways so the place lands at sx: at distance d a
  // point r to the left of the aim shows (r / (d tan aspect)) / 2 left of centre.
  const r = (0.5 - sx) * 2 * STOP_DIST * TAN * aspect;
  return { yaw, drop: 0, target: { x: w.x + r, y: w.y - 0.1, z: w.z }, dist: STOP_DIST, elev: STOP_ELEV };
}

export const INTRO_VIEW: View = { yaw: INTRO_YAW, drop: 0, target: { x: 0, y: -1.6, z: 0 }, dist: 38, elev: 0.36 };
export const SKILLS_VIEW: View = { yaw: SKILLS_YAW, drop: 0, target: { x: 0, y: -1.2, z: 0.4 }, dist: 37, elev: 0.74 };
export const CONTACT_VIEW: View = { yaw: CONTACT_YAW, drop: -3.2, target: { x: 0, y: 2.6, z: 0 }, dist: 58, elev: 0.3 };

type Key = { s: number; view: View };
function keys(aspect: number): Key[] {
  const out: Key[] = [{ s: 0, view: INTRO_VIEW }];
  STOPS.forEach((s, k) => {
    const v = stopView(k, aspect);
    out.push({ s: s - HOLD, view: v });
    out.push({ s: s + HOLD, view: v });
  });
  out.push({ s: SKILLS_ARRIVE, view: SKILLS_VIEW });
  out.push({ s: SKILLS_LEAVE, view: SKILLS_VIEW });
  out.push({ s: CONTACT_ARRIVE, view: CONTACT_VIEW });
  out.push({ s: S_END, view: CONTACT_VIEW });
  return out;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The view at scroll s (screens). Eased between keys, still at them. */
export function viewAt(s: number, aspect: number): View {
  const ks = keys(aspect);
  if (s <= ks[0].s) return ks[0].view;
  for (let i = 1; i < ks.length; i += 1) {
    const b = ks[i];
    if (s > b.s) continue;
    const a = ks[i - 1];
    const t = smooth((s - a.s) / Math.max(1e-6, b.s - a.s));
    // The distance eases on a log scale, so pulling back from 7 m to 37 m
    // does not rush through the near part.
    return {
      yaw: lerp(a.view.yaw, b.view.yaw, t),
      drop: lerp(a.view.drop, b.view.drop, t),
      target: {
        x: lerp(a.view.target.x, b.view.target.x, t),
        y: lerp(a.view.target.y, b.view.target.y, t),
        z: lerp(a.view.target.z, b.view.target.z, t),
      },
      dist: Math.exp(lerp(Math.log(a.view.dist), Math.log(b.view.dist), t)),
      elev: lerp(a.view.elev, b.view.elev, t),
    };
  }
  return ks[ks.length - 1].view;
}

/** The camera's position for a view. */
export const camPos = (v: View): V3 => ({
  x: v.target.x,
  y: v.target.y + v.dist * Math.sin(v.elev),
  z: v.target.z + v.dist * Math.cos(v.elev),
});

/**
 * Where a world point lands on screen for a camera at `camPos(v)` looking
 * at `v.target` with y up, the way three's lookAt sets it: x and y as
 * shares of the width and height from the top left, and how far in front
 * of the camera it is (negative is behind).
 */
export function project(v: View, p: V3, aspect: number): { x: number; y: number; depth: number } {
  const c = camPos(v);
  let fx = v.target.x - c.x;
  let fy = v.target.y - c.y;
  let fz = v.target.z - c.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0,1,0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up' = right x forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  const depth = dx * fx + dy * fy + dz * fz;
  const x = dx * rx + dz * rz;
  const y = dx * ux + dy * uy + dz * uz;
  const nx = x / (depth * TAN * aspect);
  const ny = y / (depth * TAN);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth };
}

// ------------------------------------------------------------ the words

/** How much of project k's words show at s. */
export const cardAt = (k: number, s: number): number => 1 - smooth((Math.abs(s - STOPS[k]) - 0.3) / 0.14);
export const skillsAt = (s: number): number =>
  smooth((s - (SKILLS_ARRIVE - 0.2)) / 0.2) * (1 - smooth((s - (SKILLS_LEAVE - 0.05)) / 0.15));
export const contactAt = (s: number): number => smooth((s - (CONTACT_ARRIVE - 0.35)) / 0.3);
/** The intro's heading and hint, fading as the first stop comes. */
export const introAt = (s: number): number => 1 - smooth((s - 0.12) / 0.25);
/** How lit village v's lanterns are: one after another as the camera pulls back, then they stay lit. */
export const villageLitAt = (v: number, s: number): number => smooth((s - (SKILLS_ARRIVE - 0.45 + v * 0.1)) / 0.25);
/**
 * 1 where the island should hold still for the words (a project stop or
 * the skills), 0 where it may turn by itself.
 */
export const holdAt = (s: number): number => {
  let h = 0;
  for (const st of STOPS) h = Math.max(h, 1 - smooth((Math.abs(s - st) - HOLD) / 0.25));
  const mid = (SKILLS_ARRIVE + SKILLS_LEAVE) / 2;
  h = Math.max(h, 1 - smooth((Math.abs(s - mid) - (SKILLS_LEAVE - SKILLS_ARRIVE) / 2) / 0.3));
  return h;
};

/** The words' box at a project stop, as shares of the stage: on the side away from the place. */
export const textBox = (k: number): { x0: number; x1: number; y0: number; y1: number } =>
  PLACES[k].side < 0 ? { x0: 0.55, x1: 0.92, y0: 0.26, y1: 0.74 } : { x0: 0.08, x1: 0.45, y0: 0.26, y1: 0.74 };

/** The middle of village v's lanterns, where its leader line ends. */
export const villageMid = (v: number): V3 => ({ x: VILLAGES[v].x, y: VILLAGE_PAD + LANTERN_H * 0.6, z: VILLAGES[v].z });

/**
 * The skills' label blocks, in two columns either side of the island.
 * A village goes to the column on its side of the screen at the skills
 * view, and the blocks in a column keep the villages' top-to-bottom order
 * so no two leader lines cross.
 */
export const BLOCK_X = { left: 0.045, right: 0.785, w: 0.17 } as const;
export const BLOCK_H = 0.17;
export function villageBlocks(aspect: number): { v: number; side: -1 | 1; top: number }[] {
  const at = VILLAGES.map((_, v) => ({ v, p: project(SKILLS_VIEW, toWorld(villageMid(v), SKILLS_VIEW.yaw, SKILLS_VIEW.drop), aspect) }));
  const out: { v: number; side: -1 | 1; top: number }[] = [];
  for (const side of [-1, 1] as const) {
    const col = at.filter((a) => (side < 0 ? a.p.x < 0.5 : a.p.x >= 0.5)).sort((a, b) => a.p.y - b.p.y);
    // Stack from each village's own height, pushed down just enough not to overlap.
    let next = 0.2;
    for (const a of col) {
      const top = Math.max(next, Math.min(0.8 - BLOCK_H, a.p.y - 0.04));
      out.push({ v: a.v, side, top });
      next = top + BLOCK_H + 0.02;
    }
  }
  return out.sort((a, b) => a.v - b.v);
}
