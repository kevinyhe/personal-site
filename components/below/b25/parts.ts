/**
 * How the robot comes apart. Plain numbers only: no three, no DOM, so the
 * page and the Node check split the same model the same way.
 *
 * The glb has twelve static meshes grouped by material, not by function:
 * static_0 alone runs from the base frame to the top of the lift. So each
 * mesh is cut into its connected pieces (triangles that share a corner,
 * with corners at the same place counted as shared), and each piece is
 * sorted into a part group by where its box sits on the robot.
 *
 * Robot frame, as the glb has it: x forward, y up, z to the robot's right.
 * Metres. The robot is about 0.4 long, 0.46 tall, 0.35 wide.
 */

export type Vec3 = { x: number; y: number; z: number };

/** The five groups that come off, then the frame that stays. */
export const WHEELS = 0;
export const DRIVE = 1;
export const LIFT = 2;
export const FRONT = 3;
export const BACK = 4;
export const CORE = 5;
export const GROUP_COUNT = 6;

export type GroupSpec = {
  name: string;
  /** Which way it leaves, in the robot's frame. Wheels go out to their own side. */
  dir: Vec3;
  /** How far, metres, fully exploded. */
  dist: number;
  /** How far its own pieces spread from its middle, as a share of their offset. */
  spread: number;
};

export const GROUPS: GroupSpec[] = [
  { name: "wheels", dir: { x: 0, y: 0, z: 1 }, dist: 0.2, spread: 0 },
  { name: "drivetrain", dir: { x: 0, y: -1, z: 0 }, dist: 0.19, spread: 0.3 },
  { name: "lift", dir: { x: 0, y: 1, z: 0 }, dist: 0.2, spread: 0.3 },
  { name: "front", dir: { x: 1, y: 0, z: 0 }, dist: 0.2, spread: 0.3 },
  { name: "rear", dir: { x: -1, y: 0, z: 0 }, dist: 0.2, spread: 0.45 },
  { name: "frame", dir: { x: 0, y: 0, z: 0 }, dist: 0, spread: 0.2 },
];

/** Which group a piece belongs to, from its box. Wheels are known by node name. */
export function classify(min: Vec3, max: Vec3, wheel: boolean): number {
  if (wheel) return WHEELS;
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  if (cy < 0.1) return DRIVE;
  if (cy > 0.3) return LIFT;
  if (cx > 0.1) return FRONT;
  if (cx < -0.06) return BACK;
  return CORE;
}

export type Piece = { min: Vec3; max: Vec3; tris: number; group: number };

export type Split = {
  /** Per vertex, which piece it is in. */
  pieceOf: Int32Array;
  pieces: Piece[];
};

/**
 * Cut one mesh into connected pieces. `pos` is xyz per vertex, already in
 * the robot's frame; `idx` is three vertex numbers per triangle.
 * Corners closer than 0.05 mm are one corner: the export splits a vertex
 * wherever the normal turns, and those copies must not cut a part in two.
 */
export function splitMesh(pos: ArrayLike<number>, idx: ArrayLike<number>, wheel: boolean): Split {
  const n = Math.floor(pos.length / 3);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) {
      parent[r] = parent[parent[r]];
      r = parent[r];
    }
    return r;
  };
  const join = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  // One number per quantised corner: 0.05 mm steps, offset so every
  // coordinate is positive and under K.
  const Q = 2e4;
  const K = 100003;
  const seen = new Map<number, number>();
  for (let i = 0; i < n; i += 1) {
    const qx = Math.round(pos[i * 3] * Q) + 50000;
    const qy = Math.round(pos[i * 3 + 1] * Q) + 50000;
    const qz = Math.round(pos[i * 3 + 2] * Q) + 50000;
    const key = qx + qy * K + qz * K * K;
    const j = seen.get(key);
    if (j === undefined) seen.set(key, i);
    else join(i, j);
  }
  for (let t = 0; t + 2 < idx.length; t += 3) {
    join(idx[t], idx[t + 1]);
    join(idx[t], idx[t + 2]);
  }
  const pieceOf = new Int32Array(n).fill(-1);
  const pieces: Piece[] = [];
  const rootPiece = new Map<number, number>();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    let p = rootPiece.get(r);
    if (p === undefined) {
      p = pieces.length;
      rootPiece.set(r, p);
      pieces.push({
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity },
        tris: 0,
        group: CORE,
      });
    }
    pieceOf[i] = p;
    const pc = pieces[p];
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    if (x < pc.min.x) pc.min.x = x;
    if (y < pc.min.y) pc.min.y = y;
    if (z < pc.min.z) pc.min.z = z;
    if (x > pc.max.x) pc.max.x = x;
    if (y > pc.max.y) pc.max.y = y;
    if (z > pc.max.z) pc.max.z = z;
  }
  for (let t = 0; t + 2 < idx.length; t += 3) pieces[pieceOf[idx[t]]].tris += 1;
  for (const p of pieces) p.group = classify(p.min, p.max, wheel);
  return { pieceOf, pieces };
}

export const centre = (min: Vec3, max: Vec3): Vec3 => ({
  x: (min.x + max.x) / 2,
  y: (min.y + max.y) / 2,
  z: (min.z + max.z) / 2,
});

/** The middle of each group, weighted by triangles, from all its pieces. */
export function groupCentres(pieces: Piece[]): Vec3[] {
  const acc = Array.from({ length: GROUP_COUNT }, () => ({ x: 0, y: 0, z: 0, w: 0 }));
  for (const p of pieces) {
    const c = centre(p.min, p.max);
    const a = acc[p.group];
    const w = Math.max(1, p.tris);
    a.x += c.x * w;
    a.y += c.y * w;
    a.z += c.z * w;
    a.w += w;
  }
  return acc.map((a) => (a.w ? { x: a.x / a.w, y: a.y / a.w, z: a.z / a.w } : { x: 0, y: 0.2, z: 0 }));
}

/**
 * Where a piece has moved to at explode `e` (0 assembled, 1 fully out):
 * its group's way out, plus a spread away from the group's middle. For a
 * wheel the way out is its own side.
 */
export function pieceShift(group: number, pieceCentre: Vec3, groupCentre: Vec3, e: number): Vec3 {
  const g = GROUPS[group];
  let d = g.dir;
  if (group === WHEELS) d = { x: 0, y: 0, z: pieceCentre.z >= 0 ? 1 : -1 };
  return {
    x: (d.x * g.dist + (pieceCentre.x - groupCentre.x) * g.spread) * e,
    y: (d.y * g.dist + (pieceCentre.y - groupCentre.y) * g.spread) * e,
    z: (d.z * g.dist + (pieceCentre.z - groupCentre.z) * g.spread) * e,
  };
}
