import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Glue seams on the marble.
 *
 * The figure was shattered, then glued back together, and the pieces of
 * the effect are the pieces of that break. So the intact figure should
 * show where it was glued: a hairline along every cut, on the outer stone,
 * a little darker and a little duller than the polished surface around it
 * (a glue line collects dirt and never takes the same polish).
 *
 * Nothing is drawn for this. Each chunk already carries its own cuts: the
 * boundary of a cap (a cut face) is made of the same points as the outer
 * surface it meets. So for every vertex of a chunk's outer surface we store
 * how close it is to that chunk's caps, and the surface shader darkens the
 * stone where that is small. The seam is a property of the piece, not of
 * the assembled figure, so it stays put when the piece flies: it is the
 * piece's own edge.
 */

export const SEAM = {
  /**
   * How far (in figure units, height 3.1) the seam reaches from the cut
   * before it has faded out entirely. 0.02 is 0.65% of the figure: in the
   * close shot on the hand (the figure filling the frame's height) that is
   * about 5 px; in the wide shot about 1 px, a line that is barely there.
   */
  width: 0.02,
  /**
   * The albedo multiplier at the very edge of the cut. 0.62 on #f1f1eb
   * reads as a pencil line on the marble under the key light, not as a
   * black crack; the falloff below means most of the band is far lighter.
   */
  core: 0.62,
  /**
   * How much rougher the seam is than the stone. +0.08 on 0.88 takes the
   * specular sheen off the glue line without making it read as a texture.
   */
  roughnessLift: 0.08,
  /**
   * The falloff's shape: the darkening is (1 - t)^power for t = distance /
   * width. 2 keeps the dark core to the inner third and eases the rest out,
   * so the line has a soft edge rather than a hard band.
   */
  falloffPower: 2,
  /**
   * Distances are stored exactly out to here and clamped beyond. Must be
   * several triangles wide: a vertex's value is interpolated across each
   * triangle to the cut, and a clamped value on the far vertex would
   * stretch the seam across the whole triangle. 0.12 is six seam widths
   * and eight typical triangle edges (0.015).
   */
  range: 0.12,
  /**
   * The grid cell of the search over the cap points. Two seam widths: a
   * surface vertex that matters finds its nearest cap point within the
   * first rings of cells, and one farther off gives up at `range`, three
   * rings out, after 343 cell reads rather than the 729 of a finer grid.
   */
  cell: 0.04,
} as const;

/**
 * The distinct positions in an unindexed position array, compared bit for
 * bit (the cut points are shared by object upstream, so equal positions
 * really are the same stored number). `unique` holds the array offset of
 * each distinct point; `firstCopy[vertex]` is the slot of vertex's point.
 */
function distinctPoints(positions: Float32Array) {
  const count = positions.length / 3;
  const bits = new Int32Array(positions.buffer, positions.byteOffset, positions.length);
  const firstCopy = new Int32Array(count);
  const unique: number[] = [];
  // Chained hashing on the bit patterns; a chain is walked to confirm an
  // exact match, so a hash collision costs a comparison, never an error.
  const head = new Map<number, number>();
  const next = new Int32Array(count).fill(-1);

  for (let vertex = 0; vertex < count; vertex++) {
    const offset = vertex * 3;
    const hash =
      Math.imul(bits[offset], 73856093) ^
      Math.imul(bits[offset + 1], 19349663) ^
      Math.imul(bits[offset + 2], 83492791);
    let probe = head.get(hash) ?? -1;
    while (probe !== -1) {
      const other = probe * 3;
      if (
        bits[other] === bits[offset] &&
        bits[other + 1] === bits[offset + 1] &&
        bits[other + 2] === bits[offset + 2]
      ) {
        break;
      }
      probe = next[probe];
    }

    if (probe === -1) {
      firstCopy[vertex] = unique.length;
      unique.push(offset);
      next[vertex] = head.get(hash) ?? -1;
      head.set(hash, vertex);
    } else {
      firstCopy[vertex] = firstCopy[probe];
    }
  }

  return { firstCopy, unique };
}

/** The distinct points of an unindexed position array, packed. */
function compact(positions: Float32Array) {
  const { unique } = distinctPoints(positions);
  const out = new Float32Array(unique.length * 3);
  unique.forEach((offset, slot) => {
    out[slot * 3] = positions[offset];
    out[slot * 3 + 1] = positions[offset + 1];
    out[slot * 3 + 2] = positions[offset + 2];
  });
  return out;
}

/**
 * The caps' points sorted into a flat grid of cells, so a nearest-point
 * search is array reads. Chunks are small (a few hundred cells a side at
 * most) and this runs once per chunk on the main thread, so it is built
 * with a counting sort rather than a hash map. Measured on the figure's
 * 123 chunks (200k surface entries, 41k distinct points; 93k cap entries):
 * 109 ms all told, against 2.08 s with string-keyed maps and no
 * de-duplication.
 */
function gridOf(points: Float32Array) {
  const count = points.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < points.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = points[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  const dims = [0, 1, 2].map((axis) => Math.floor((max[axis] - min[axis]) / SEAM.cell) + 1);
  const cellCount = dims[0] * dims[1] * dims[2];
  const cellOf = new Int32Array(count);
  for (let point = 0; point < count; point++) {
    const ix = Math.floor((points[point * 3] - min[0]) / SEAM.cell);
    const iy = Math.floor((points[point * 3 + 1] - min[1]) / SEAM.cell);
    const iz = Math.floor((points[point * 3 + 2] - min[2]) / SEAM.cell);
    cellOf[point] = (ix * dims[1] + iy) * dims[2] + iz;
  }

  // Counting sort: `start[c]..start[c + 1]` are the points in cell c.
  const start = new Int32Array(cellCount + 1);
  for (let point = 0; point < count; point++) start[cellOf[point] + 1]++;
  for (let cell = 0; cell < cellCount; cell++) start[cell + 1] += start[cell];
  const sorted = new Int32Array(count);
  const fill = start.slice(0, cellCount);
  for (let point = 0; point < count; point++) {
    sorted[fill[cellOf[point]]++] = point * 3;
  }

  return { dims, min, sorted, start };
}

/**
 * Write the `seam` attribute on `surfaceGeometry`: per vertex, how close it
 * is to the nearest vertex of `interiorGeometry` (the same chunk's caps),
 * as `SEAM.range - distance`, floored at 0. Stored that way round so that
 * a geometry with no attribute at all (WebGL then feeds the shader 0)
 * renders as clean marble rather than as one big seam. Linear in the
 * distance, so the value interpolates exactly across a triangle. Both
 * geometries must be relative to the same centre, which
 * `makeChunkGeometries` guarantees.
 *
 * Idempotent: a geometry that already has the attribute is left alone.
 */
export function addSeamAttribute(
  surfaceGeometry: THREE.BufferGeometry,
  interiorGeometry: THREE.BufferGeometry,
) {
  if (surfaceGeometry.getAttribute("seam")) return;

  const surface = surfaceGeometry.getAttribute("position").array as Float32Array;
  const caps = interiorGeometry.getAttribute("position").array as Float32Array;
  const count = surface.length / 3;
  // 0 = no seam: the value for a chunk without caps and the far default.
  const seam = new Float32Array(count);

  if (caps.length > 0 && count > 0) {
    // The caps are unindexed too, each point stored about three times.
    const capPoints = compact(caps);
    const { dims, min, sorted, start } = gridOf(capPoints);
    const maxRing = Math.ceil(SEAM.range / SEAM.cell);
    const rangeSq = SEAM.range * SEAM.range;

    // The surface is unindexed, so each point is stored once per triangle
    // it belongs to (about six times): measure each distinct point once.
    const { firstCopy, unique } = distinctPoints(surface);
    const closeness = new Float32Array(unique.length);

    for (let slot = 0; slot < unique.length; slot++) {
      const x = surface[unique[slot]];
      const y = surface[unique[slot] + 1];
      const z = surface[unique[slot] + 2];
      const cx = Math.floor((x - min[0]) / SEAM.cell);
      const cy = Math.floor((y - min[1]) / SEAM.cell);
      const cz = Math.floor((z - min[2]) / SEAM.cell);
      let bestSq = rangeSq;

      for (let ring = 0; ring <= maxRing; ring++) {
        // A point in this ring's cells is at least (ring - 1) cells away
        // (the query can sit at the edge of its own cell). Once the best
        // found is within that, nothing in this ring or beyond can beat it.
        if (ring > 0) {
          const reach = (ring - 1) * SEAM.cell;
          if (bestSq <= reach * reach) break;
        }

        // Only the shell of this ring, clipped to the grid; the inside
        // was done on the earlier rings.
        const x0 = Math.max(cx - ring, 0);
        const x1 = Math.min(cx + ring, dims[0] - 1);
        const y0 = Math.max(cy - ring, 0);
        const y1 = Math.min(cy + ring, dims[1] - 1);
        const z0 = Math.max(cz - ring, 0);
        const z1 = Math.min(cz + ring, dims[2] - 1);
        for (let ix = x0; ix <= x1; ix++) {
          const xShell = Math.abs(ix - cx) === ring;
          for (let iy = y0; iy <= y1; iy++) {
            const yShell = Math.abs(iy - cy) === ring;
            for (let iz = z0; iz <= z1; iz++) {
              if (!xShell && !yShell && Math.abs(iz - cz) !== ring) continue;
              const cell = (ix * dims[1] + iy) * dims[2] + iz;
              for (let entry = start[cell]; entry < start[cell + 1]; entry++) {
                const index = sorted[entry];
                const ex = capPoints[index] - x;
                const ey = capPoints[index + 1] - y;
                const ez = capPoints[index + 2] - z;
                const sq = ex * ex + ey * ey + ez * ez;
                if (sq < bestSq) bestSq = sq;
              }
            }
          }
        }
      }

      closeness[slot] = SEAM.range - Math.sqrt(bestSq);
    }

    for (let vertex = 0; vertex < count; vertex++) {
      seam[vertex] = closeness[firstCopy[vertex]];
    }
  }

  surfaceGeometry.setAttribute("seam", new THREE.BufferAttribute(seam, 1));
}

const glslFloat = (value: number) => value.toFixed(4);

/**
 * The outer stone, exactly as the stage's inline material had it, plus the
 * seams: the shader reads the `seam` attribute and darkens and roughens
 * the marble near a cut. Spliced in at three's own include points so the
 * rest of the standard shader (lights, shadows, tone mapping) is untouched.
 */
function makeSurfaceMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#f1f1eb",
    emissive: "#ffffff",
    emissiveIntensity: 0.02,
    metalness: 0,
    roughness: 0.88,
    side: THREE.FrontSide,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float seam;
varying float vSeam;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vSeam = seam;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vSeam;
// 1 at the cut, easing to 0 at the seam's full width. vSeam is
// range - distance, so 0 (and any geometry without the attribute) is
// clean stone.
float seamWeight() {
  float distance = ${glslFloat(SEAM.range)} - vSeam;
  float t = clamp(distance / ${glslFloat(SEAM.width)}, 0.0, 1.0);
  return pow(1.0 - t, ${glslFloat(SEAM.falloffPower)});
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= mix(1.0, ${glslFloat(SEAM.core)}, seamWeight());`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = min(roughnessFactor + ${glslFloat(SEAM.roughnessLift)} * seamWeight(), 1.0);`,
      );
  };
  // Every surface material compiles to the same program: share it.
  material.customProgramCacheKey = () => "marble-seams";

  return material;
}

/** The cut faces: the plain stone, as the stage's inline material had it. */
function makeInteriorMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#d8d8d0",
    emissive: "#ffffff",
    emissiveIntensity: 0.018,
    metalness: 0,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
}

/**
 * One surface and one cut-face material for a figure, shared by all its
 * chunks (one program and one set of uniforms across the draw calls), made
 * once and disposed when the figure leaves. A whole-figure fade is then
 * two writes, one per material.
 */
export function useMarbleMaterials() {
  const materials = useMemo(
    () => ({ interior: makeInteriorMaterial(), surface: makeSurfaceMaterial() }),
    [],
  );
  // Disposed on the real unmount only, not whenever a dependency changes.
  // (React's development double-mount still runs this once against live
  // materials; three then rebuilds their program on the next draw, the
  // same as it does for the geometries disposed the same way.)
  const liveRef = useRef(materials);
  liveRef.current = materials;
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      live.interior.dispose();
      live.surface.dispose();
    };
  }, []);

  return materials;
}
