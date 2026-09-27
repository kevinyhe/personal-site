/**
 * The solid things: the paper dart that leads, and a small group of
 * objects for each project. All of it is boxes, balls, tubes and rings.
 */
import * as THREE from "three";
import { hexToRgb } from "./palette";

export type Ink = "white" | "blossom" | "rose" | "plum" | "cream";

const INKS: Record<Ink, string> = {
  white: "#ffffff",
  blossom: "#f9b9dc",
  rose: "#b04a84",
  plum: "#2a0d1e",
  cream: "#fff0e0",
};

export const inkRgb = (ink: Ink): THREE.Vector3 => new THREE.Vector3(...hexToRgb(INKS[ink]));

/**
 * A folded paper dart. Nose at -z. Each wing is two panels with a crease
 * between them, the keel hangs under the middle, and the tips fold up.
 * Drawn from above the wings are white; from below, blossom.
 */
export function makeDart(): THREE.BufferGeometry {
  const white = hexToRgb(INKS.white);
  const blossom = hexToRgb(INKS.blossom);
  const rose = hexToRgb("#e58fbe");
  const pos: number[] = [];
  const tint: number[] = [];
  const tri = (a: number[], b: number[], c: number[], col: number[]): void => {
    pos.push(...a, ...b, ...c);
    tint.push(...col, ...col, ...col);
  };
  const nose = [0, 0, -1.15];
  const keel = [0, -0.3, 0.72];
  for (const s of [-1, 1]) {
    const spine = [0.06 * s, 0.02, 0.9];
    const crease = [0.4 * s, 0.0, 0.9];
    const tip = [0.88 * s, 0.13, 0.9];
    const fore = [0.6 * s, 0.085, 0.26];
    const fin = [0.95 * s, 0.36, 1.0];
    // Wound so the upper face is the front on both sides.
    const up = (a: number[], b: number[], c: number[], col: number[]): void => (s < 0 ? tri(a, b, c, col) : tri(a, c, b, col));
    up(nose, crease, spine, white);
    up(nose, tip, crease, [0.985, 0.93, 0.96]);
    up(fore, fin, tip, blossom);
    up(nose, spine, keel, rose);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 3));
  geo.computeVertexNormals();
  return geo;
}

/** What one piece of a group is: a shape, a colour, where, and how it turns. */
type Piece = { geo: THREE.BufferGeometry; ink: Ink; at?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] };

export type Builder = {
  /** Adds a mesh to `parent` and keeps the geometry for disposal. */
  add: (parent: THREE.Object3D, piece: Piece) => THREE.Mesh;
  geometries: THREE.BufferGeometry[];
};

export function makeBuilder(material: (ink: Ink) => THREE.Material): Builder {
  const geometries: THREE.BufferGeometry[] = [];
  return {
    geometries,
    add(parent, { geo, ink, at, rot, scale }) {
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, material(ink));
      if (at) mesh.position.set(...at);
      if (rot) mesh.rotation.set(...rot);
      if (scale) mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    },
  };
}

const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
const ball = (r: number): THREE.BufferGeometry => new THREE.SphereGeometry(r, 28, 18);
const tube = (r: number, h: number, r2 = r): THREE.BufferGeometry => new THREE.CylinderGeometry(r2, r, h, 24);
const ring = (r: number, t: number, arc = Math.PI * 2): THREE.BufferGeometry => new THREE.TorusGeometry(r, t, 10, 48, arc);

/** One floating object: a group, where it hangs by the title, and how it moves. */
export type Floater = { group: THREE.Group; home: THREE.Vector3; spin: THREE.Vector3; bob: number; phase: number };

const floater = (home: [number, number, number], spin: [number, number, number], bob: number, phase: number): Floater => ({
  group: new THREE.Group(),
  home: new THREE.Vector3(...home),
  spin: new THREE.Vector3(...spin),
  bob,
  phase,
});

/**
 * The objects for project `i`. `dark` says the sky behind is dark, so
 * nothing is drawn in plum there. Positions are in the title's own
 * space: x along the line of type, y up, z toward the camera, with
 * `w` and `h` the title's size.
 */
export function makeObjects(i: number, b: Builder, w: number, h: number, inner: number): Floater[] {
  const hw = w / 2;
  const hh = h / 2;
  // `inner` is +1 when the path is to the title's right, -1 to its left.
  // Objects keep to that side and above, clear of the text under the title.
  const side = (x: number): number => x * inner;

  if (i === 0) {
    // The Actually Company: a microphone, the sound leaving it, and a
    // timeline with notes pinned along it.
    const mic = floater([side(hw + 1.5), hh + 0.2, 0.6], [0, 0.35, 0], 0.16, 0.2);
    b.add(mic.group, { geo: ball(0.34), ink: "white", at: [0, 0.5, 0], scale: [1, 1.15, 1] });
    b.add(mic.group, { geo: ring(0.345, 0.03), ink: "blossom", at: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0] });
    b.add(mic.group, { geo: tube(0.1, 0.8, 0.13), ink: "blossom", at: [0, -0.2, 0] });
    b.add(mic.group, { geo: ring(0.15, 0.035), ink: "white", at: [0, 0.14, 0], rot: [Math.PI / 2, 0, 0] });
    mic.group.rotation.z = -0.45 * inner;

    const sound = floater([side(hw + 0.55), hh + 1.15, 0.2], [0, 0, 0], 0.1, 1.4);
    for (let k = 0; k < 3; k += 1) {
      b.add(sound.group, { geo: ring(0.35 + k * 0.28, 0.022, Math.PI * 0.55), ink: k === 1 ? "blossom" : "white", rot: [0, 0, inner > 0 ? Math.PI * 0.72 : -Math.PI * 0.27] });
    }

    const line = floater([side(-hw + 1.6), hh + 0.95, -0.6], [0.12, 0, 0], 0.12, 2.6);
    b.add(line.group, { geo: box(3.0, 0.035, 0.035), ink: "white" });
    [0.5, 0.22, 0.7, 0.34, 0.16, 0.58, 0.3].forEach((t, k) => {
      b.add(line.group, { geo: box(0.07, t, 0.07), ink: k % 3 === 0 ? "blossom" : "white", at: [-1.3 + k * 0.43, t / 2 + 0.03, 0] });
    });
    b.add(line.group, { geo: ball(0.09), ink: "cream", at: [0.42, -0.02, 0] });
    return [mic, sound, line];
  }

  if (i === 1) {
    // S-KBD67: the blaster, the darts it fires, and what it aims with.
    const gun = floater([side(hw + 1.4), hh - 0.1, 0.7], [0, 0.4, 0], 0.14, 0.5);
    b.add(gun.group, { geo: box(1.5, 0.34, 0.22), ink: "white" });
    b.add(gun.group, { geo: tube(0.1, 0.7), ink: "blossom", at: [-1.0, 0.04, 0], rot: [0, 0, Math.PI / 2] });
    b.add(gun.group, { geo: tube(0.14, 0.12), ink: "cream", at: [-1.4, 0.04, 0], rot: [0, 0, Math.PI / 2] });
    b.add(gun.group, { geo: box(0.26, 0.62, 0.2), ink: "blossom", at: [0.36, -0.42, 0], rot: [0, 0, -0.3] });
    b.add(gun.group, { geo: box(0.5, 0.26, 0.2), ink: "blossom", at: [0.98, -0.06, 0] });
    b.add(gun.group, { geo: box(0.5, 0.09, 0.12), ink: "cream", at: [-0.2, 0.22, 0] });
    b.add(gun.group, { geo: ring(0.15, 0.03, Math.PI), ink: "white", at: [0.08, -0.22, 0], rot: [0, 0, Math.PI] });
    gun.group.rotation.z = 0.18 * inner;
    if (inner < 0) gun.group.scale.x = -1;

    const darts = floater([side(hw + 0.2), hh + 1.0, -0.2], [0, 0, 0], 0.1, 1.9);
    for (let k = 0; k < 3; k += 1) {
      const d = new THREE.Group();
      b.add(d, { geo: tube(0.055, 0.42), ink: "blossom", rot: [0, 0, Math.PI / 2] });
      b.add(d, { geo: ball(0.075), ink: "white", at: [-0.24, 0, 0] });
      d.position.set(k * 0.75 - 0.6, k * 0.22 - (k === 1 ? 0.3 : 0), k * 0.3);
      d.rotation.z = -0.12;
      if (inner < 0) d.scale.x = -1;
      darts.group.add(d);
    }

    const aim = floater([side(-hw + 1.0), hh + 1.0, -0.8], [0, 0, 0.25], 0.12, 3.1);
    b.add(aim.group, { geo: ring(0.42, 0.025), ink: "white" });
    b.add(aim.group, { geo: ball(0.05), ink: "blossom" });
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2;
      b.add(aim.group, { geo: box(0.26, 0.03, 0.03), ink: "white", at: [Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0], rot: [0, 0, a] });
    }
    return [gun, darts, aim];
  }

  if (i === 2) {
    // King of the Ring: two gloves, the phone being swung, and the ropes.
    const gloves = floater([side(hw + 1.35), hh + 0.1, 0.7], [0, 0.3, 0], 0.18, 0.3);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      b.add(g, { geo: ball(0.36), ink: s < 0 ? "blossom" : "white", scale: [1, 0.9, 1.12] });
      b.add(g, { geo: ball(0.16), ink: s < 0 ? "blossom" : "white", at: [0.3 * s, -0.04, 0.12] });
      b.add(g, { geo: tube(0.24, 0.26, 0.22), ink: "cream", at: [0, -0.42, 0] });
      g.position.set(s * 0.5, s * 0.22, s * 0.15);
      g.rotation.z = s * -0.5;
      gloves.group.add(g);
    }

    const phone = floater([side(hw + 0.1), hh + 1.15, 0], [0, 0, 0], 0.14, 1.6);
    b.add(phone.group, { geo: box(0.46, 0.92, 0.06), ink: "white" });
    b.add(phone.group, { geo: box(0.38, 0.76, 0.02), ink: "blossom", at: [0, 0.02, 0.035] });
    b.add(phone.group, { geo: ring(0.85, 0.02, Math.PI * 0.4), ink: "white", at: [0, -0.5, 0], rot: [0, 0, Math.PI * 0.3] });
    b.add(phone.group, { geo: ring(1.05, 0.016, Math.PI * 0.3), ink: "blossom", at: [0, -0.5, 0], rot: [0, 0, Math.PI * 0.35] });
    phone.group.rotation.z = 0.5 * inner;

    const ropes = floater([side(-hw + 1.2), hh + 0.9, -0.9], [0, 0.22, 0], 0.1, 2.8);
    for (let k = 0; k < 4; k += 1) {
      const x = k % 2 ? 0.7 : -0.7;
      const z = k < 2 ? 0.7 : -0.7;
      b.add(ropes.group, { geo: tube(0.045, 0.8), ink: "blossom", at: [x, 0, z] });
    }
    for (let k = 0; k < 3; k += 1) {
      const y = -0.2 + k * 0.24;
      b.add(ropes.group, { geo: box(1.4, 0.025, 0.025), ink: "white", at: [0, y, 0.7] });
      b.add(ropes.group, { geo: box(1.4, 0.025, 0.025), ink: "white", at: [0, y, -0.7] });
      b.add(ropes.group, { geo: box(0.025, 0.025, 1.4), ink: "white", at: [0.7, y, 0] });
      b.add(ropes.group, { geo: box(0.025, 0.025, 1.4), ink: "white", at: [-0.7, y, 0] });
    }
    b.add(ropes.group, { geo: box(1.4, 0.04, 1.4), ink: "cream", at: [0, -0.4, 0] });
    ropes.group.rotation.x = 0.35;
    return [gloves, phone, ropes];
  }

  if (i === 3) {
    // mclib: a robot base on four wheels, the route it has worked out
    // for itself, and a gear.
    const bot = floater([side(hw + 1.3), hh + 0.1, 0.7], [0, 0.4, 0], 0.12, 0.7);
    b.add(bot.group, { geo: box(1.1, 0.16, 1.0), ink: "white" });
    b.add(bot.group, { geo: box(1.1, 0.3, 0.08), ink: "plum", at: [0, 0.1, 0.5] });
    b.add(bot.group, { geo: box(1.1, 0.3, 0.08), ink: "plum", at: [0, 0.1, -0.5] });
    for (let k = 0; k < 4; k += 1) {
      b.add(bot.group, { geo: tube(0.22, 0.12), ink: "rose", at: [k % 2 ? 0.36 : -0.36, -0.02, k < 2 ? 0.6 : -0.6], rot: [Math.PI / 2, 0, 0] });
    }
    b.add(bot.group, { geo: box(0.12, 0.7, 0.12), ink: "plum", at: [0.3, 0.4, 0] });
    b.add(bot.group, { geo: box(0.6, 0.1, 0.5), ink: "white", at: [0.02, 0.72, 0] });
    b.add(bot.group, { geo: ball(0.1), ink: "rose", at: [-0.3, 0.2, 0] });
    bot.group.rotation.x = 0.4;

    const route = floater([side(-hw + 1.8), hh + 0.9, -0.5], [0, 0, 0], 0.1, 2.2);
    for (let k = 0; k < 12; k += 1) {
      const t = k / 11;
      b.add(route.group, { geo: ball(0.05 + (k === 11 ? 0.05 : 0)), ink: k % 3 === 0 ? "rose" : "plum", at: [(t - 0.5) * 3.2, Math.sin(t * Math.PI * 2) * 0.4, Math.cos(t * Math.PI * 1.5) * 0.3] });
    }
    b.add(route.group, { geo: new THREE.ConeGeometry(0.12, 0.3, 16), ink: "rose", at: [1.85, 0.12, 0], rot: [0, 0, -Math.PI / 2 + 0.6] });

    const gear = floater([side(hw + 0.1), hh + 1.2, -0.2], [0, 0, 0.5], 0.14, 3.4);
    b.add(gear.group, { geo: ring(0.36, 0.09), ink: "white" });
    b.add(gear.group, { geo: tube(0.1, 0.16), ink: "plum", rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      b.add(gear.group, { geo: box(0.17, 0.14, 0.17), ink: "white", at: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], rot: [0, 0, a] });
    }
    gear.group.rotation.y = -0.5 * inner;
    return [bot, route, gear];
  }

  // Saturn: the planet it is named for, two moons, and messages.
  const planet = floater([side(hw + 1.3), hh + 0.2, 0.5], [0, 0.3, 0], 0.15, 0.4);
  b.add(planet.group, { geo: ball(0.5), ink: "rose" });
  b.add(planet.group, { geo: ring(0.86, 0.045), ink: "white", rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3] });
  b.add(planet.group, { geo: ring(1.04, 0.025), ink: "plum", rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3] });
  b.add(planet.group, { geo: ball(0.1), ink: "white", at: [1.3, 0.2, 0.2] });
  b.add(planet.group, { geo: ball(0.07), ink: "plum", at: [-1.2, -0.3, -0.4] });
  planet.group.rotation.set(0.42, 0, 0.3 * inner);

  const talk = floater([side(-hw + 1.5), hh + 1.0, -0.4], [0, 0, 0], 0.12, 2.0);
  [
    { x: -0.4, y: 0.45, w: 1.5, ink: "white" as Ink },
    { x: 0.35, y: 0, w: 1.1, ink: "plum" as Ink },
    { x: -0.2, y: -0.45, w: 1.8, ink: "white" as Ink },
  ].forEach((m) => {
    b.add(talk.group, { geo: tube(0.15, m.w - 0.3), ink: m.ink, at: [m.x, m.y, 0], rot: [0, 0, Math.PI / 2] });
    b.add(talk.group, { geo: ball(0.15), ink: m.ink, at: [m.x - (m.w - 0.3) / 2, m.y, 0] });
    b.add(talk.group, { geo: ball(0.15), ink: m.ink, at: [m.x + (m.w - 0.3) / 2, m.y, 0] });
  });
  talk.group.rotation.y = 0.3 * inner;

  const shield = floater([side(hw + 0.1), hh + 1.2, -0.3], [0, 0.5, 0], 0.13, 3.0);
  b.add(shield.group, { geo: new THREE.OctahedronGeometry(0.34), ink: "white", scale: [1, 1.25, 0.5] });
  b.add(shield.group, { geo: ring(0.55, 0.02), ink: "rose" });
  return [planet, talk, shield];
}
