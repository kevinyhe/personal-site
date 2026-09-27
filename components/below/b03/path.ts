import * as THREE from "three";

/**
 * Where everything stands, and the road the camera takes.
 *
 * The road is an arc of one big circle, always turning the same way, so
 * the camera never swings left then right. The five blocks stand on the
 * inside of the bend, a little ahead of each stopping point.
 */

export const STOPS = 7;
export const PROJECT_STOPS = 5;

const RADIUS = 170;
const CENTRE_X = RADIUS;
const BLOCK_GAP = 28;
const EYE = 2.4;

export const BLOCK = { w: 4, h: 5.2, d: 2, r: 0.34, lift: 0.12 };

const angleAt = (distance: number): number => distance / RADIUS;

export function onRoad(a: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(CENTRE_X - RADIUS * Math.cos(a), 0, -RADIUS * Math.sin(a));
}
export function ahead(a: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(a), 0, -Math.cos(a));
}
export function toRight(a: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.cos(a), 0, Math.sin(a));
}

const ROAD_START = angleAt(-40);
export const FIELD_ANGLE = angleAt(BLOCK_GAP * 4 + 46);
/** The flat ground runs on well past the field: open plain under the glow. */
const ROAD_END = FIELD_ANGLE + angleAt(166);

/** How far a point on the ground is from the road. The hills keep clear of it. */
export function roadDistance(x: number, z: number): number {
  const dx = x - CENTRE_X;
  const a = Math.atan2(-z, -dx);
  if (a >= ROAD_START && a <= ROAD_END) return Math.abs(Math.hypot(dx, z) - RADIUS);
  const end = a < ROAD_START ? ROAD_START : ROAD_END;
  const ex = CENTRE_X - RADIUS * Math.cos(end);
  const ez = -RADIUS * Math.sin(end);
  return Math.hypot(x - ex, z - ez);
}

export type Layout = {
  /** Block centres, on the ground (y is the ground, not the middle). */
  blocks: THREE.Vector3[];
  /** Which way each block faces, as a turn about the vertical. */
  blockYaw: number[];
  /** Middle of the skills field, and the two directions its rows run in. */
  field: THREE.Vector3;
  fieldRight: THREE.Vector3;
  fieldAhead: THREE.Vector3;
  fieldYaw: number;
  /** The way the camera faces at the end. The glow sits there. */
  glowDir: THREE.Vector3;
  eyes: THREE.Vector3[];
  looks: THREE.Vector3[];
};

export function buildLayout(ground: (x: number, z: number) => number): Layout {
  const p = new THREE.Vector3();
  const f = new THREE.Vector3();
  const r = new THREE.Vector3();

  const blocks: THREE.Vector3[] = [];
  const blockYaw: number[] = [];
  const eyes: THREE.Vector3[] = [];
  const looks: THREE.Vector3[] = [];

  // The way in: further back and higher, coming down to the first block.
  const a0 = angleAt(-26);
  onRoad(a0, p);
  eyes.push(new THREE.Vector3(p.x, 5.2, p.z));

  for (let i = 0; i < PROJECT_STOPS; i += 1) {
    const a = angleAt(i * BLOCK_GAP);
    onRoad(a, p);
    ahead(a, f);
    toRight(a, r);
    const eye = new THREE.Vector3(p.x, EYE, p.z);
    const b = new THREE.Vector3().copy(p).addScaledVector(f, 10.5).addScaledVector(r, 4.5);
    b.y = ground(b.x, b.z);
    blocks.push(b);
    // Face the stopping point, then turn a little so a side shows and it
    // reads as a slab and not a flat card.
    blockYaw.push(Math.atan2(eye.x - b.x, eye.z - b.z) + 0.24);
    eyes.push(eye);
    looks.push(new THREE.Vector3(b.x, b.y + BLOCK.lift + BLOCK.h * 0.5, b.z));
  }
  // The look point for the way in is as far behind the first block as the
  // camera is behind its first stop. So the camera comes in without
  // turning: the first block starts left of centre and slides to it.
  looks.unshift(new THREE.Vector3().copy(looks[0]).add(eyes[0]).sub(eyes[1]));

  // The camera has been turning right all the way along. The last two
  // views face a little further right again, so it never turns back.
  const lastStop = angleAt((PROJECT_STOPS - 1) * BLOCK_GAP);
  const facing = Math.atan2(looks[PROJECT_STOPS].x - eyes[PROJECT_STOPS].x, -(looks[PROJECT_STOPS].z - eyes[PROJECT_STOPS].z));
  const fieldFacing = Math.max(facing, lastStop) + 0.04;
  const lastFacing = fieldFacing + 0.06;

  // Skills: up, and looking down at the field.
  onRoad(FIELD_ANGLE, p);
  toRight(FIELD_ANGLE, r);
  const field = new THREE.Vector3().copy(p).addScaledVector(r, 1.5);
  field.y = ground(field.x, field.z);
  ahead(fieldFacing, f);
  toRight(fieldFacing, r);
  const fieldAhead = f.clone();
  const fieldRight = r.clone();
  eyes.push(new THREE.Vector3().copy(field).addScaledVector(f, -7.5).setY(16.5));
  looks.push(new THREE.Vector3().copy(field).setY(field.y + 0.4));

  // Contact: on past the field, lower, looking at the horizon.
  ahead(lastFacing, f);
  const last = new THREE.Vector3().copy(field).addScaledVector(f, 17).setY(5);
  eyes.push(last);
  looks.push(new THREE.Vector3().copy(last).addScaledVector(f, 40).setY(last.y + 4.2));

  return {
    blocks,
    blockYaw,
    field,
    fieldRight,
    fieldAhead,
    fieldYaw: Math.atan2(-fieldAhead.x, -fieldAhead.z),
    glowDir: f.clone().normalize(),
    eyes,
    looks,
  };
}

const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Slows into each stop and out of it, but never quite stands still. */
const eased = (t: number): number => {
  const c = clamp01(t);
  return c * 0.18 + smoother(c) * 0.82;
};

/**
 * Scroll, counted in screens from the top of the journey, to a place on
 * the road. 0 is the way in, 1..5 the blocks, 6 skills, 7 contact.
 *
 *   -1 .. 0.5   the way in
 *   0.5 + i     block i (one screen of scroll between blocks)
 *   4.5 .. 6    the rise to the skills field
 *   6 .. 6.8    held over the field. #skills is at 6, so a link to it
 *               lands on the settled view.
 *   6.8 .. 8    the tilt up to the horizon
 */
export function placeOnRoad(u: number): number {
  if (u <= 0.5) return eased((u + 1) / 1.5);
  if (u <= 4.5) {
    const i = Math.min(3, Math.floor(u - 0.5));
    return 1 + i + eased(u - 0.5 - i);
  }
  if (u <= 6) return 5 + eased((u - 4.5) / 1.5);
  if (u <= 6.8) return 6;
  return 6 + eased((u - 6.8) / 1.2);
}

/** Which of the seven stops the readout names. */
export function stopNumber(u: number): number {
  if (u < 5) return Math.max(1, Math.floor(u) + 1);
  if (u < 7.4) return 6;
  return 7;
}

/**
 * A smooth curve through the points for the ground plan, with the height
 * worked out apart from it. A spline through 2.4, 2.4, 2.4, 16 dips under
 * 2.4 before it climbs; the camera would duck before rising. Blending the
 * two heights directly cannot do that.
 */
export class Road {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly heights: number[];
  private readonly last: number;

  constructor(points: THREE.Vector3[]) {
    this.curve = new THREE.CatmullRomCurve3(points.map((v) => v.clone()), false, "centripetal");
    this.heights = points.map((v) => v.y);
    this.last = points.length - 1;
  }

  at(place: number, out: THREE.Vector3): THREE.Vector3 {
    const q = Math.min(this.last, Math.max(0, place));
    this.curve.getPoint(q / this.last, out);
    const k = Math.min(this.last - 1, Math.floor(q));
    const t = q - k;
    const s = t * t * (3 - 2 * t);
    out.y = this.heights[k] + (this.heights[k + 1] - this.heights[k]) * s;
    return out;
  }
}
