/**
 * Where everything is: the path, how far along it each scroll position
 * puts the camera, and where the stops and the skill groups stand.
 *
 * Plain numbers and one sampled table. The scene and the DOM both read
 * this, so a label and the thing it names cannot drift apart.
 */
import * as THREE from "three";

/**
 * Heights of the three sections, in vh. The canvas is pinned for all of
 * it. Each section's own text layer is pinned too, but only while that
 * section fills the screen: for the last 100vh of #work its layer is
 * sliding off and #skills' is sliding on. Nothing is shown then, so
 * every mark below keeps clear of those stretches.
 */
export const WORK_VH = 760;
export const SKILLS_VH = 420;
export const CONTACT_VH = 100;
export const TOTAL_VH = WORK_VH + SKILLS_VH + CONTACT_VH;
/** The pinned stage is one screen tall, so that much of the height is not scroll. */
const SCROLL_VH = TOTAL_VH - 100;

/** Scroll progress (0..1 over the whole design) at each project's stop. */
export const STOP_P = [84, 218, 352, 486, 620].map((vh) => vh / SCROLL_VH);
/** And at each skill group. */
export const GROUP_P = [800, 862, 924, 986, 1048].map((vh) => vh / SCROLL_VH);
/** Distance along the path, in world units, for the camera at each of those. */
const STOP_S = [50, 120, 190, 260, 330];
const GROUP_S = [400, 434, 468, 502, 536];

/** How far ahead of the camera the craft flies, and a title hangs. */
export const LEAD = 7;
export const TITLE_AHEAD = 15;
export const GROUP_AHEAD = 14;

/** Clouds the camera flies straight through, as distance along the path. */
export const PASS_S = [86, 226, 296, 366];

const CONTROL: [number, number, number][] = [
  [0, 0, 0],
  [0, 0.5, -44],
  [10, 3, -88],
  [24, 8, -130],
  [16, 13, -174],
  [-8, 18, -214],
  [-24, 24, -256],
  [-12, 30, -300],
  [12, 35, -340],
  [26, 40, -382],
  [14, 44, -426],
  [-6, 47, -468],
  [-12, 48, -512],
  [-2, 44, -556],
  [2, 32, -598],
  [0, 20, -640],
  [0, 14, -684],
];

const SAMPLES = 2400;

export type Track = {
  length: number;
  /** x,y,z per sample, evenly spaced by distance. */
  pos: Float32Array;
  tan: Float32Array;
  /** Bank angle per sample, radians, positive into a right turn. Unscaled. */
  turn: Float32Array;
};

export function buildTrack(): Track {
  const curve = new THREE.CatmullRomCurve3(
    CONTROL.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 4000;
  const length = curve.getLength();
  const pos = new Float32Array((SAMPLES + 1) * 3);
  const tan = new Float32Array((SAMPLES + 1) * 3);
  const heading = new Float32Array(SAMPLES + 1);
  const v = new THREE.Vector3();
  for (let i = 0; i <= SAMPLES; i += 1) {
    const u = i / SAMPLES;
    curve.getPointAt(u, v);
    pos.set([v.x, v.y, v.z], i * 3);
    curve.getTangentAt(u, v);
    tan.set([v.x, v.y, v.z], i * 3);
    heading[i] = Math.atan2(v.x, -v.z);
  }
  // Rate of turn, taken over a wide window so the bank swells and
  // settles instead of twitching at every control point.
  const turn = new Float32Array(SAMPLES + 1);
  const span = Math.round((14 / length) * SAMPLES);
  for (let i = 0; i <= SAMPLES; i += 1) {
    const a = Math.max(0, i - span);
    const b = Math.min(SAMPLES, i + span);
    turn[i] = (heading[b] - heading[a]) / (((b - a) / SAMPLES) * length);
  }
  return { length, pos, tan, turn };
}

/** Position and tangent at distance `s`. Returns the rate of turn there. */
export function sampleTrack(track: Track, s: number, outPos: THREE.Vector3, outTan?: THREE.Vector3): number {
  const f = Math.min(Math.max(s / track.length, 0), 1) * SAMPLES;
  const i = Math.min(Math.floor(f), SAMPLES - 1);
  const t = f - i;
  const a = i * 3;
  const b = a + 3;
  const { pos, tan, turn } = track;
  outPos.set(pos[a] + (pos[b] - pos[a]) * t, pos[a + 1] + (pos[b + 1] - pos[a + 1]) * t, pos[a + 2] + (pos[b + 2] - pos[a + 2]) * t);
  if (outTan) {
    outTan.set(tan[a] + (tan[b] - tan[a]) * t, tan[a + 1] + (tan[b + 1] - tan[a + 1]) * t, tan[a + 2] + (tan[b + 2] - tan[a + 2]) * t).normalize();
  }
  return turn[i] + (turn[i + 1] - turn[i]) * t;
}

/**
 * Scroll progress to distance along the path. Between two marks the
 * camera goes slowly near each and quickly in the middle, so a stop is
 * somewhere the scroll lingers without ever holding the page still.
 */
export function distanceAt(p: number, length: number): number {
  const ps = [0, ...STOP_P, ...GROUP_P, 1];
  const ss = [0, ...STOP_S, ...GROUP_S, length - 16];
  const q = Math.min(Math.max(p, 0), 1);
  let i = 0;
  while (i < ps.length - 2 && q > ps[i + 1]) i += 1;
  const f = (q - ps[i]) / (ps[i + 1] - ps[i]);
  const smooth = f * f * f * (f * (f * 6 - 15) + 10);
  // The skill groups sit close together: less linger there, or the
  // flight between them is a lurch.
  const linger = i >= 1 && i <= 5 ? 0.8 : 0.45;
  const e = f + (smooth - f) * (i === 0 ? 0.4 : linger);
  return ss[i] + (ss[i + 1] - ss[i]) * e;
}

export const stopDistance = (i: number): number => STOP_S[i];
export const groupDistance = (i: number): number => GROUP_S[i];
