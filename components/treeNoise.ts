/**
 * The tree's small maths: a seeded generator, the easing helpers and the
 * value noise its bark and branch flow are drawn from. On their own, with
 * no three.js, so the bark worker (bark.worker.ts) can use them too.
 */

export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function noiseHash2(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const n00 = noiseHash2(xi, zi);
  const n10 = noiseHash2(xi + 1, zi);
  const n01 = noiseHash2(xi, zi + 1);
  const n11 = noiseHash2(xi + 1, zi + 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

export function fbm2(x: number, z: number, octaves = 5) {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2(x, z) * amplitude;
    total += amplitude;
    x = x * 2.03 + 17.2;
    z = z * 2.03 - 11.1;
    amplitude *= 0.52;
  }
  return total > 0 ? value / total : 0;
}
