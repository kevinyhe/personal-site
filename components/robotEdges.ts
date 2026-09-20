import type { BufferGeometry } from "three";

/**
 * The edges of a mesh that a drawing would show: where two faces meet at
 * more than a given angle, and where a face has no neighbour.
 *
 * three's EdgesGeometry does the same job but names every corner with a
 * string. On this robot, 294,000 triangles, that is two seconds with the
 * page frozen. Here a corner is named with a number, which takes about a
 * tenth of the time. The rule for which edges to keep is the same.
 *
 * Returns the two ends of each edge, six numbers an edge, in the mesh's
 * own axes. Returns null if the mesh has no index, so the caller can fall
 * back to EdgesGeometry.
 */
export function buildEdges(geometry: BufferGeometry, thresholdDeg: number): Float32Array | null {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!pos || !index) return null;

  const count = pos.count;
  const p = new Float32Array(count * 3);
  // Corners that sit at the same place get the same id, whatever their
  // index. 65,535 steps across the mesh's own box is the grid the file
  // itself was stored on, so nothing that was apart is joined.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    lo = Math.min(lo, x, y, z);
    hi = Math.max(hi, x, y, z);
  }
  const grid = 65535 / Math.max(hi - lo, 1e-9);
  const ids = new Int32Array(count);
  const seen = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const kx = Math.round((p[i * 3] - lo) * grid);
    const ky = Math.round((p[i * 3 + 1] - lo) * grid);
    const kz = Math.round((p[i * 3 + 2] - lo) * grid);
    // Three 16-bit numbers in one: under 2^48, which a double holds exactly.
    const key = kx + ky * 65536 + kz * 4294967296;
    let id = seen.get(key);
    if (id === undefined) {
      id = seen.size;
      seen.set(key, id);
    }
    ids[i] = id;
  }
  const unique = seen.size;
  seen.clear();

  const triangles = index.count / 3;
  const limit = Math.cos((thresholdDeg * Math.PI) / 180);
  // One record for each edge met so far: its two corners, the normal of
  // the first face that had it, and whether a second face has been found.
  const ends = new Int32Array(triangles * 6);
  const normals = new Float32Array(triangles * 9);
  const state = new Uint8Array(triangles * 3);
  const OPEN = 1;
  const KEEP = 2;
  const records = new Map<number, number>();
  let made = 0;
  let kept = 0;
  const corner = [0, 0, 0];

  for (let t = 0; t < triangles; t += 1) {
    corner[0] = index.getX(t * 3);
    corner[1] = index.getX(t * 3 + 1);
    corner[2] = index.getX(t * 3 + 2);
    const a = corner[0] * 3;
    const b = corner[1] * 3;
    const c = corner[2] * 3;
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    // A triangle with no area has no face to make an edge of.
    if (length === 0) continue;
    nx /= length;
    ny /= length;
    nz /= length;

    for (let e = 0; e < 3; e += 1) {
      const i0 = corner[e];
      const i1 = corner[(e + 1) % 3];
      const id0 = ids[i0];
      const id1 = ids[i1];
      if (id0 === id1) continue;
      const key = id0 < id1 ? id0 * unique + id1 : id1 * unique + id0;
      const r = records.get(key);
      if (r === undefined) {
        records.set(key, made);
        ends[made * 2] = i0;
        ends[made * 2 + 1] = i1;
        normals[made * 3] = nx;
        normals[made * 3 + 1] = ny;
        normals[made * 3 + 2] = nz;
        state[made] = OPEN;
        made += 1;
        kept += 1;
      } else if (state[r] === OPEN) {
        const dot = nx * normals[r * 3] + ny * normals[r * 3 + 1] + nz * normals[r * 3 + 2];
        if (dot <= limit) {
          state[r] = KEEP;
        } else {
          state[r] = 0;
          kept -= 1;
        }
      }
    }
  }

  const out = new Float32Array(kept * 6);
  let w = 0;
  for (let r = 0; r < made; r += 1) {
    if (state[r] === 0) continue;
    const a = ends[r * 2] * 3;
    const b = ends[r * 2 + 1] * 3;
    out[w] = p[a];
    out[w + 1] = p[a + 1];
    out[w + 2] = p[a + 2];
    out[w + 3] = p[b];
    out[w + 4] = p[b + 1];
    out[w + 5] = p[b + 2];
    w += 6;
  }
  return out;
}
