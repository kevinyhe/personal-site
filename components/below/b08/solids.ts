import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { LENS_PRESS } from "./layout";

/**
 * The shapes of the ten glass solids and of the small skill lens, all
 * made here from numbers. Each comes back centred and scaled so that the
 * ball that holds it has radius 1: the scene sizes it by that radius.
 */

function unit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.center();
  g.computeBoundingSphere();
  const r = g.boundingSphere?.radius || 1;
  g.scale(1 / r, 1 / r, 1 / r);
  g.computeBoundingSphere();
  return g;
}

/**
 * An extrusion comes with one flat normal per triangle, and glass shows
 * every flat as a step in the letters behind it. Joining the corners and
 * working the normals out again makes the surface bend smoothly.
 */
function smoothed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const joined = mergeVertices(g, 1e-4);
  joined.computeVertexNormals();
  g.dispose();
  return joined;
}

/** A cherry petal: a point at the foot, a notch at the head. */
function petal(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -1);
  s.bezierCurveTo(0.5, -0.7, 0.85, -0.1, 0.62, 0.55);
  s.bezierCurveTo(0.52, 0.85, 0.3, 1.02, 0.14, 0.9);
  s.quadraticCurveTo(0.04, 0.84, 0, 0.7);
  s.quadraticCurveTo(-0.04, 0.84, -0.14, 0.9);
  s.bezierCurveTo(-0.3, 1.02, -0.52, 0.85, -0.62, 0.55);
  s.bezierCurveTo(-0.85, -0.1, -0.5, -0.7, 0, -1);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.3,
    steps: 1,
    curveSegments: 40,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.12,
    bevelSegments: 8,
  });
  return smoothed(g);
}

/**
 * A three-sided bar with rounded edges and rounded ends, twisted along
 * its length. Built ring by ring: each ring is the same rounded
 * triangle, turned a little more than the one before and drawn in to
 * nothing at the two ends.
 */
function twistedPrism(): THREE.BufferGeometry {
  const around = 96;
  const along = 72;
  const length = 2.6;
  const turn = Math.PI * 0.85;
  const positions: number[] = [];
  for (let j = 0; j <= along; j += 1) {
    const v = j / along;
    const end = Math.abs(2 * v - 1);
    const draw = Math.pow(Math.max(0, 1 - Math.pow(end, 5)), 1 / 5);
    const twist = turn * (v - 0.5);
    for (let i = 0; i < around; i += 1) {
      const a = (i / around) * Math.PI * 2;
      // The superformula with three corners: a triangle with soft edges.
      const q = (3 * a) / 4;
      const r = 0.62 * Math.pow(Math.pow(Math.abs(Math.cos(q)), 10) + Math.pow(Math.abs(Math.sin(q)), 10), -1 / 4.5) * draw;
      positions.push(r * Math.cos(a + twist), (v - 0.5) * length, r * Math.sin(a + twist));
    }
  }
  const index: number[] = [];
  for (let j = 0; j < along; j += 1) {
    for (let i = 0; i < around; i += 1) {
      const a = j * around + i;
      const b = (j + 1) * around + i;
      const c = j * around + ((i + 1) % around);
      const d = (j + 1) * around + ((i + 1) % around);
      // This order turns the faces outward.
      index.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A ball pressed flat along z: thick in the middle, thin at the rim. */
function lens(press: number, around: number, down: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, around, down);
  // Poles to the front and back, so the rings of the mesh run round the rim.
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, press);
  return g;
}

/** The ten, in the order of SOLIDS in layout.ts. */
export function buildSolidGeometries(): THREE.BufferGeometry[] {
  return [
    new RoundedBoxGeometry(1.4, 1.4, 1.4, 8, 0.3),
    new RoundedBoxGeometry(1.8, 1.15, 0.62, 8, 0.24),
    new THREE.TorusGeometry(0.68, 0.32, 48, 128),
    petal(),
    lens(0.5, 96, 64),
    twistedPrism(),
    new THREE.CapsuleGeometry(0.5, 1.0, 24, 48),
    new THREE.SphereGeometry(1, 64, 48),
    // Twenty flat faces, left flat: each shows the type shifted its own way.
    new THREE.IcosahedronGeometry(1, 0),
    petal(),
  ].map(unit);
}

/** The small lens over each skill's mark. */
export const buildLensGeometry = (): THREE.BufferGeometry => lens(LENS_PRESS, 48, 32);
