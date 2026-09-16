import * as THREE from "three";
import { roadDistance } from "./path";

/**
 * The plain: a big square of ground pushed up by layered noise, flat along
 * the road and rising to low hills away from it. The heights are worked
 * out here in JS, not in the shader, because the blocks and the skill
 * cubes need to know where the ground is to stand on it.
 */

const SIZE = 800;
const CELLS = 256;

function lattice(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = lattice(ix, iz);
  const b = lattice(ix + 1, iz);
  const c = lattice(ix, iz + 1);
  const d = lattice(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function layered(x: number, z: number, layers: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < layers; i += 1) {
    sum += valueNoise(fx, fz) * amp;
    total += amp;
    amp *= 0.5;
    // Turned a little each layer so the layers do not line up into a grid.
    const nx = fx * 1.6 - fz * 1.2;
    const nz = fx * 1.2 + fz * 1.6;
    fx = nx + 11.3;
    fz = nz - 7.1;
  }
  return sum / total;
}

export function groundHeight(x: number, z: number): number {
  const d = roadDistance(x, z);
  const t = Math.min(1, Math.max(0, (d - 24) / 110));
  const rise = t * t * (3 - 2 * t);
  const hills = layered(x * 0.011 + 3.7, z * 0.011 - 1.9, 5) * 15 + layered(x * 0.042, z * 0.042, 3) * 3.5 - 2;
  const ripple = (layered(x * 0.09 + 40, z * 0.09 + 40, 2) - 0.5) * 0.34;
  return Math.max(0, hills) * rise + ripple;
}

export function buildGroundGeometry(centre: THREE.Vector3): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, CELLS, CELLS);
  geo.rotateX(-Math.PI / 2);
  geo.translate(centre.x, 0, centre.z);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
