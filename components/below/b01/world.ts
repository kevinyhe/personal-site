/**
 * Where everything stands on the floor. Plain numbers, no three.js, so the
 * scene, the autopilot and the collisions all read the same map.
 *
 * The floor is the x-z plane. A heading `th` is a turn about the up axis:
 * the robot's forward is (cos th, -sin th), the same way its model faces
 * +x at no turn. Lengths are floor units; the robot model is drawn four
 * times its real size, so one unit is a quarter of a metre.
 */

export type P2 = { x: number; z: number };

/** How much larger than life the robot is drawn. */
export const ROBOT_SCALE = 4;
/** The robot as a circle, for collisions. */
export const ROBOT_R = 0.98;
/** A skill puck. */
export const PUCK_R = 0.5;
export const PUCK_H = 0.3;
/** Nothing leaves this circle. */
export const WORLD_R = 45;

/** The five sites stand just outside the corners of a pentagon this big. */
const RING = 20;
const FIRST = (216 * Math.PI) / 180;
const STEP = (72 * Math.PI) / 180;

const corner = (i: number): P2 => ({
  x: RING * Math.cos(FIRST + i * STEP),
  z: RING * Math.sin(FIRST + i * STEP),
});
const unit = (a: P2, b: P2): P2 => {
  const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
};
export const headingOf = (d: P2): number => Math.atan2(-d.z, d.x);

export type Site = {
  /** The pentagon corner the loop rounds here. */
  corner: P2;
  /** The way the loop arrives, and the way it leaves. */
  dirIn: P2;
  dirOut: P2;
  /** Where the slab stands. It faces back down dirIn. */
  slab: P2;
  /** Where the second object stands, beside the slab on the outer side. */
  prop: P2;
  /** The card opens inside this circle. */
  zone: P2;
  zoneR: number;
  /** Where a robot sent here parks, and the way it ends up facing. */
  stop: P2;
  stopHeading: number;
};

export const SITE_COUNT = 5;

export const SITES: Site[] = Array.from({ length: SITE_COUNT }, (_, i) => {
  const c = corner(i);
  const dirIn = unit(corner(i - 1), c);
  const dirOut = unit(c, corner(i + 1));
  // The side the loop does NOT turn to: dirOut with its dirIn part removed,
  // reversed.
  const along = dirOut.x * dirIn.x + dirOut.z * dirIn.z;
  const side = unit({ x: 0, z: 0 }, { x: -(dirOut.x - along * dirIn.x), z: -(dirOut.z - along * dirIn.z) });
  const slab = { x: c.x + dirIn.x * 5.5, z: c.z + dirIn.z * 5.5 };
  return {
    corner: c,
    dirIn,
    dirOut,
    slab,
    prop: { x: slab.x + side.x * 6.9 - dirIn.x * 2.6, z: slab.z + side.z * 6.9 - dirIn.z * 2.6 },
    zone: { x: c.x - dirIn.x * 1.2, z: c.z - dirIn.z * 1.2 },
    zoneR: 6.2,
    // A little to the prop's side, so the slab and the prop share the view.
    stop: { x: c.x - dirIn.x * 1 + side.x * 1.7, z: c.z - dirIn.z * 1 + side.z * 1.7 },
    stopHeading: headingOf(dirIn),
  };
});

/**
 * The loop the robot drives when nobody else does: along each side of the
 * pentagon, straight at the slab, then round the corner inside it.
 */
export const LOOP_POINTS: P2[] = SITES.flatMap((s) => {
  const inward = unit(s.corner, { x: 0, z: 0 });
  return [
    { x: s.corner.x - s.dirIn.x * 7, z: s.corner.z - s.dirIn.z * 7 },
    { x: s.corner.x + inward.x * 2.4, z: s.corner.z + inward.z * 2.4 },
    { x: s.corner.x + s.dirOut.x * 7, z: s.corner.z + s.dirOut.z * 7 },
  ];
});

/** Where the robot is when the page opens: on the way to the first site. */
export const START: P2 & { th: number } = {
  x: SITES[0].corner.x - SITES[0].dirIn.x * 13,
  z: SITES[0].corner.z - SITES[0].dirIn.z * 13,
  th: headingOf(SITES[0].dirIn),
};

/** One cluster of pucks per skill group, inside the loop. */
export const CLUSTERS: { at: P2; out: P2 }[] = Array.from({ length: 5 }, (_, i) => {
  const a = FIRST + (i + 0.5) * STEP;
  const out = { x: Math.cos(a), z: Math.sin(a) };
  return { at: { x: out.x * 8.6, z: out.z * 8.6 }, out };
});

/** Centres of the first `n` cells of a hexagonal packing, nearest first:
 *  seven make a flower, more start a second ring. */
export function hexCells(n: number, pitch: number): P2[] {
  const cells: (P2 & { d: number })[] = [];
  for (let q = -3; q <= 3; q += 1) {
    for (let r = -3; r <= 3; r += 1) {
      const x = pitch * (q + r / 2);
      const z = pitch * r * (Math.sqrt(3) / 2);
      // The small bias makes the order the same on every machine when two
      // cells are equally far.
      cells.push({ x, z, d: Math.hypot(x, z) + Math.atan2(z, x) * 1e-3 });
    }
  }
  cells.sort((a, b) => a.d - b.d);
  return cells.slice(0, n).map(({ x, z }) => ({ x, z }));
}

/** The gate to the contact section, outside the loop, facing the middle. */
const GATE_ANGLE = FIRST + 1.5 * STEP;
export const GATE = {
  at: { x: 31 * Math.cos(GATE_ANGLE), z: 31 * Math.sin(GATE_ANGLE) },
  /** From the middle of the floor out through the gate. */
  out: { x: Math.cos(GATE_ANGLE), z: Math.sin(GATE_ANGLE) },
  /** Clear width between the posts. */
  width: 6.4,
};

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** An angle brought into -pi..pi. */
export const wrap = (a: number): number => {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
};
