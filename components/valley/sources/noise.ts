// Seeded noise for the generated ASCII sources. Every function here is a pure
// function of its arguments, so a source can draw any frame from the time
// alone and two runs with the same seed draw the same picture.

// mulberry32: a small 32-bit generator. Good enough for scattering blossoms and
// petals, and it never touches Math.random, so layouts are reproducible.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lattice hash: one fixed 0..1 value per integer cell and seed.
function latticeHash(ix: number, iy: number, seed: number): number {
  let h =
    (Math.imul(ix | 0, 0x27d4eb2d) ^
      Math.imul(iy | 0, 0x165667b1) ^
      Math.imul(seed | 0, 0x9e3779b1)) |
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Quintic fade: no visible creases at cell borders.
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Smooth value noise in 0..1. One unit of x or y is one lattice cell.
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = latticeHash(x0, y0, seed);
  const b = latticeHash(x0 + 1, y0, seed);
  const c = latticeHash(x0, y0 + 1, seed);
  const d = latticeHash(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

// Fractal sum of value noise, normalised back to 0..1. Each octave doubles the
// frequency and halves the weight; the offsets keep octave lattices from lining
// up, which would otherwise show as a grid.
export function fbm2(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(fx, fy, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.02 + 17.3;
    fy = fy * 2.02 + 9.1;
  }
  return norm > 0 ? sum / norm : 0.5;
}

// 1D fbm for ridgelines and paths: a fixed slice through the 2D field.
export function fbm1(x: number, octaves: number, seed: number): number {
  return fbm2(x, 0.37, octaves, seed);
}
