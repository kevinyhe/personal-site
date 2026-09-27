/**
 * The clouds' sheet: eight clouds, computed once, no image file.
 *
 * Each is a heap of round puffs on a flat base: a few big ones for the
 * body, smaller ones crowding its top and sides. Stored per pixel: which
 * way the surface leans (red, green), how thick it is (blue), and how
 * much of it there is (alpha). The shader lights it from those.
 */
import * as THREE from "three";
import { seeded } from "./textures";

const CELL = 384;
export const CLOUD_COLS = 4;
export const CLOUD_ROWS = 2;

/** Smooth noise on a grid of random values, summed over four scales. */
function makeNoise(rand: () => number): (x: number, y: number) => number {
  const N = 64;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  const at = (x: number, y: number): number => grid[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const one = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  return (x, y) => one(x, y) * 0.5 + one(x * 2.1, y * 2.1) * 0.27 + one(x * 4.3, y * 4.3) * 0.15 + one(x * 8.7, y * 8.7) * 0.08;
}

/** A box blur along rows then columns, in place, using `tmp` as scratch. */
function soften(field: Float32Array, tmp: Float32Array, C: number, R: number): void {
  const at = (v: number): number => Math.min(Math.max(v, 0), C - 1);
  for (let j = 0; j < C; j += 1) {
    let sum = 0;
    for (let i = -R; i <= R; i += 1) sum += field[j * C + at(i)];
    for (let i = 0; i < C; i += 1) {
      tmp[j * C + i] = sum / (R * 2 + 1);
      sum += field[j * C + at(i + R + 1)] - field[j * C + at(i - R)];
    }
  }
  for (let i = 0; i < C; i += 1) {
    let sum = 0;
    for (let j = -R; j <= R; j += 1) sum += tmp[at(j) * C + i];
    for (let j = 0; j < C; j += 1) {
      field[j * C + i] = sum / (R * 2 + 1);
      sum += tmp[at(j + R + 1) * C + i] - tmp[at(j - R) * C + i];
    }
  }
}

export function makeCloudAtlas(): THREE.DataTexture {
  const C = CELL;
  const W = C * CLOUD_COLS;
  const H = C * CLOUD_ROWS;
  const data = new Uint8Array(W * H * 4);
  const height = new Float32Array(C * C);
  const tmp = new Float32Array(C * C);
  for (let v = 0; v < CLOUD_COLS * CLOUD_ROWS; v += 1) {
    const rand = seeded(9127 + v * 331);
    const noise = makeNoise(rand);
    const floor = -0.34;
    const puffs: [number, number, number][] = [];
    // Odd ones are long and low, even ones heaped up.
    const long = v % 2 === 1;
    const reach = long ? 0.62 : 0.46;
    const rise = long ? 0.3 : 0.46;
    // The body: a few big puffs along the middle.
    const big = long ? 4 : 3;
    for (let i = 0; i < big; i += 1) {
      const f = i / (big - 1) - 0.5;
      const r = rise * (0.62 - Math.abs(f) * 0.3) + rand() * 0.05;
      puffs.push([f * 2 * (reach - 0.2) + (rand() - 0.5) * 0.08, floor + r * 0.9, r]);
    }
    // Its outline: smaller puffs round the top, from one end to the
    // other, so the edge is lumpy and no two lumps match.
    const round = 13 + Math.floor(rand() * 4);
    for (let i = 0; i < round; i += 1) {
      const a = ((i + rand() * 0.8) / round) * Math.PI;
      const r = 0.09 + rand() * 0.11;
      const out = 0.8 + rand() * 0.22;
      puffs.push([Math.cos(a) * reach * out, floor + 0.04 + Math.sin(a) * rise * out * 1.25, r]);
    }
    height.fill(0);
    const cell = (u: number): number => (u * 0.5 + 0.5) * (C - 1);
    for (const [px, py, pr] of puffs) {
      const i0 = Math.max(Math.floor(cell(px - pr)), 0);
      const i1 = Math.min(Math.ceil(cell(px + pr)), C - 1);
      const j0 = Math.max(Math.floor(cell(py - pr)), 0);
      const j1 = Math.min(Math.ceil(cell(py + pr)), C - 1);
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          const dx = (i / (C - 1)) * 2 - 1 - px;
          const dy = (j / (C - 1)) * 2 - 1 - py;
          const q = pr * pr - dx * dx - dy * dy;
          if (q > 0) {
            const m = Math.sqrt(q);
            if (m > height[j * C + i]) height[j * C + i] = m;
          }
        }
      }
    }
    // The underside thins away over a long stretch: a cloud has no hard
    // bottom edge. Noise eats at what is left.
    for (let j = 0; j < C; j += 1) {
      const y = (j / (C - 1)) * 2 - 1;
      const base = Math.min(Math.max((y - floor + 0.14) / 0.34, 0), 1);
      const under = base * base * (3 - 2 * base);
      for (let i = 0; i < C; i += 1) {
        const n = noise(i * 0.04 + v * 19, j * 0.04);
        height[j * C + i] = Math.max(height[j * C + i] * under - n * 0.07, 0);
      }
    }
    // Blurred twice, so the creases between puffs are folds, not cuts.
    soften(height, tmp, C, 4);
    soften(height, tmp, C, 4);
    let peak = 0.0001;
    for (let k = 0; k < height.length; k += 1) if (height[k] > peak) peak = height[k];
    const ox = (v % CLOUD_COLS) * C;
    const oy = Math.floor(v / CLOUD_COLS) * C;
    for (let j = 0; j < C; j += 1) {
      for (let i = 0; i < C; i += 1) {
        const h = height[j * C + i];
        const l = height[j * C + Math.max(i - 2, 0)];
        const r = height[j * C + Math.min(i + 2, C - 1)];
        const d = height[Math.max(j - 2, 0) * C + i];
        const u = height[Math.min(j + 2, C - 1) * C + i];
        // Slope to a lean, in -1..1.
        const k = C * 0.1;
        let nx = (l - r) * k;
        let ny = (d - u) * k;
        const len = Math.hypot(nx, ny);
        if (len > 0.97) {
          nx *= 0.97 / len;
          ny *= 0.97 / len;
        }
        // A wide, soft edge.
        const a = Math.min(Math.max(h / 0.2, 0), 1);
        const o = ((oy + j) * W + ox + i) * 4;
        data[o] = Math.round((nx * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round(Math.min(h / peak, 1) * 255);
        data[o + 3] = Math.round(a * a * (3 - 2 * a) * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
