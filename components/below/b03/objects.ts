import * as THREE from "three";
import { BLOSSOM } from "@/components/bandColours";
import { buildBandTexture } from "./textures";

/**
 * What stands inside each block: one small object per project, put
 * together from boxes, cylinders, spheres and tubes.
 *
 * Two limits shape all of them. They must stay inside a circle of radius
 * 1.25 as they turn, or a corner pokes out through the glass. And nothing
 * here may be see-through: three draws see-through things after the
 * glass, so behind a pane they would not show at all.
 */

export const GOLD = "#ffd08a";
export const LILAC = "#b9a4f5";
const WHITE = "#fff4fa";
const DEEP = "#1a0812";

export type Piece = {
  group: THREE.Group;
  /** t in seconds. Moves the parts that move; the block turns the whole. */
  update(t: number): void;
  /** true: swing a little each way instead of turning right round. */
  swing: boolean;
};

const solid = (colour: string, glow = 0, rough = 0.45): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: colour,
    roughness: rough,
    metalness: 0.08,
    emissive: glow > 0 ? new THREE.Color(colour) : new THREE.Color(0x000000),
    emissiveIntensity: glow,
  });

function add(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** The Actually Company: a level meter, with notes pinned to moments in it. */
function levelBars(): Piece {
  const group = new THREE.Group();
  const bar = new THREE.BoxGeometry(0.17, 1, 0.17);
  const pink = solid(BLOSSOM, 0.45);
  const pale = solid(WHITE, 0.2);
  const gold = solid(GOLD, 0.7);
  const bars: THREE.Mesh[] = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    bars.push(add(group, bar, i % 3 === 1 ? pale : pink, (i - (count - 1) / 2) * 0.27, 0, 0));
  }
  add(group, new THREE.BoxGeometry(2.5, 0.04, 0.34), pale, 0, -1.24, 0);
  // Three notes, each a marker on a thin stem over the bar it is about.
  const note = new THREE.OctahedronGeometry(0.09);
  const stem = new THREE.BoxGeometry(0.014, 0.3, 0.014);
  const notes = [1, 4, 7].map((i) => {
    const holder = new THREE.Group();
    holder.position.x = (i - (count - 1) / 2) * 0.27;
    add(holder, note, gold, 0, 0.3, 0);
    add(holder, stem, pale, 0, 0.08, 0);
    group.add(holder);
    return { holder, i };
  });
  const heights = new Float32Array(count);
  return {
    group,
    swing: false,
    update(t) {
      for (let i = 0; i < count; i += 1) {
        const h = 0.45 + 1.75 * (0.5 + 0.5 * Math.sin(t * 1.9 + i * 0.9)) * (0.55 + 0.45 * Math.sin(t * 0.7 + i * 2.1));
        heights[i] = h;
        bars[i].scale.y = h;
        bars[i].position.y = -1.2 + h / 2;
      }
      for (const n of notes) n.holder.position.y = -1.2 + heights[n.i] + 0.1;
    },
  };
}

/** S-KBD67: a toy blaster with a sensor board on its back, sending packets. */
function blaster(): Piece {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.x = -0.18;
  inner.rotation.z = 0.1;
  group.add(inner);
  const shell = solid(WHITE, 0.05, 0.35);
  const pink = solid(BLOSSOM, 0.15);
  const lilac = solid(LILAC, 0.1);
  const gold = solid(GOLD, 0.6);
  const board = solid("#43307e", 0.1, 0.6);
  const dark = solid(DEEP, 0, 0.6);

  add(inner, new THREE.BoxGeometry(1.2, 0.42, 0.3), shell, -0.1, 0.1, 0);
  add(inner, new THREE.BoxGeometry(0.34, 0.54, 0.3), lilac, -0.86, 0.04, 0);
  const barrel = add(inner, new THREE.CylinderGeometry(0.13, 0.13, 1, 24), pink, 0.92, 0.16, 0);
  barrel.rotation.z = Math.PI / 2;
  const muzzle = add(inner, new THREE.CylinderGeometry(0.175, 0.175, 0.14, 24), gold, 1.4, 0.16, 0);
  muzzle.rotation.z = Math.PI / 2;
  const grip = add(inner, new THREE.BoxGeometry(0.3, 0.82, 0.26), lilac, -0.46, -0.46, 0);
  grip.rotation.z = 0.3;
  const guard = add(inner, new THREE.TorusGeometry(0.17, 0.028, 10, 24, Math.PI), pink, -0.1, -0.12, 0);
  guard.rotation.z = Math.PI;

  // The board: what makes it a controller and not a toy.
  add(inner, new THREE.BoxGeometry(0.74, 0.04, 0.36), board, 0, 0.35, 0);
  add(inner, new THREE.BoxGeometry(0.2, 0.06, 0.2), dark, -0.18, 0.4, 0);
  add(inner, new THREE.BoxGeometry(0.12, 0.05, 0.12), shell, 0.1, 0.4, 0.06);
  add(inner, new THREE.BoxGeometry(0.08, 0.04, 0.16), gold, 0.28, 0.39, -0.06);
  const lamp = add(inner, new THREE.SphereGeometry(0.035, 12, 8), solid(GOLD, 2), 0.3, 0.41, 0.1);
  // A thumb stick at the back.
  add(inner, new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), dark, -0.86, 0.38, 0);
  add(inner, new THREE.SphereGeometry(0.075, 14, 10), pink, -0.86, 0.48, 0);

  // Packets leaving the board, one after another.
  const packet = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const packets = [0, 1, 2, 3].map(() => add(inner, packet, gold));
  return {
    group,
    swing: false,
    update(t) {
      packets.forEach((p, i) => {
        const f = (t * 0.45 + i / packets.length) % 1;
        p.position.set(0.05 + f * 0.5, 0.48 + f * 1.05, 0);
        p.scale.setScalar(Math.sin(f * Math.PI));
      });
      lamp.scale.setScalar(0.7 + 0.5 * (Math.sin(t * 6) > 0 ? 1 : 0));
    },
  };
}

/** King of the Ring: a ring with its ropes, and two gloves trading punches. */
function ring(): Piece {
  const group = new THREE.Group();
  const pale = solid(WHITE, 0.08);
  const pink = solid(BLOSSOM, 0.2);
  const lilac = solid(LILAC, 0.2);
  const gold = solid(GOLD, 0.35);

  add(group, new THREE.BoxGeometry(1.66, 0.12, 1.66), pale, 0, -1.0, 0);
  add(group, new THREE.BoxGeometry(1.7, 0.2, 1.7), pink, 0, -1.16, 0);
  const post = new THREE.CylinderGeometry(0.045, 0.045, 0.95, 12);
  const half = 0.76;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(group, post, gold, sx * half, -0.5, sz * half);
  const rope = new THREE.CylinderGeometry(0.017, 0.017, half * 2, 8);
  const ropeColours = [lilac, pink, pale];
  ropeColours.forEach((mat, level) => {
    const y = -0.78 + level * 0.28;
    for (const s of [-1, 1]) {
      const alongX = add(group, rope, mat, 0, y, s * half);
      alongX.rotation.z = Math.PI / 2;
      const alongZ = add(group, rope, mat, s * half, y, 0);
      alongZ.rotation.x = Math.PI / 2;
    }
  });

  const fist = new THREE.SphereGeometry(0.33, 24, 16);
  const thumb = new THREE.SphereGeometry(0.14, 16, 12);
  const cuff = new THREE.CylinderGeometry(0.2, 0.23, 0.26, 20);
  const gloves = [-1, 1].map((side) => {
    const g = new THREE.Group();
    const f = add(g, fist, side < 0 ? pink : lilac, 0, 0, 0);
    f.scale.set(1.15, 1, 0.9);
    add(g, thumb, side < 0 ? pink : lilac, 0.1, -0.08, 0.27);
    const c = add(g, cuff, pale, -0.42, 0, 0);
    c.rotation.z = Math.PI / 2;
    // The right-hand glove is the same one turned to face the other.
    g.rotation.y = side < 0 ? 0 : Math.PI;
    group.add(g);
    return { g, side };
  });
  return {
    group,
    swing: false,
    update(t) {
      for (const { g, side } of gloves) {
        // A punch is a quick reach and a slow return, each glove in turn.
        const beat = (t * 0.8 + (side < 0 ? 0 : 0.5)) % 1;
        const reach = beat < 0.18 ? beat / 0.18 : Math.max(0, 1 - (beat - 0.18) / 0.5);
        g.position.set(side * (0.62 - reach * 0.3), 0.32 + side * 0.06, side * 0.12);
      }
    },
  };
}

/** mclib: a field of tiles, a planned path across it, a robot following. */
function field(): Piece {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  // Leant toward the viewer, as a map held up to be read.
  tilt.rotation.x = 0.95;
  group.add(tilt);
  const pale = solid(WHITE, 0.1);
  const pink = solid(BLOSSOM, 0.9);
  const gold = solid(GOLD, 0.8);
  const dark = solid(DEEP, 0, 0.7);
  const size = 1.7;
  add(tilt, new THREE.BoxGeometry(size, 0.05, size), solid("#5a2a4d", 0.12, 0.8));
  const rim = new THREE.BoxGeometry(size + 0.08, 0.09, 0.04);
  for (const s of [-1, 1]) {
    add(tilt, rim, pale, 0, 0.02, s * (size / 2 + 0.02));
    const side = add(tilt, rim, pale, s * (size / 2 + 0.02), 0.02, 0);
    side.rotation.y = Math.PI / 2;
  }
  // Six tiles by six, as the real field is.
  const lineGeo = new THREE.BoxGeometry(size, 0.006, 0.008);
  const lineMat = solid(LILAC, 0.5);
  for (let i = 1; i < 6; i += 1) {
    const o = -size / 2 + (size / 6) * i;
    add(tilt, lineGeo, lineMat, 0, 0.03, o);
    const v = add(tilt, lineGeo, lineMat, o, 0.03, 0);
    v.rotation.y = Math.PI / 2;
  }
  const stops = [
    [-0.66, 0.64],
    [-0.5, 0.05],
    [-0.05, -0.2],
    [0.1, -0.62],
    [0.6, -0.5],
    [0.62, 0.1],
    [0.2, 0.5],
  ].map(([x, z]) => new THREE.Vector3(x, 0.06, z));
  const route = new THREE.CatmullRomCurve3(stops, false, "centripetal");
  add(tilt, new THREE.TubeGeometry(route, 120, 0.016, 8, false), pink);
  const pin = new THREE.SphereGeometry(0.04, 12, 8);
  for (const s of stops) add(tilt, pin, gold, s.x, s.y, s.z);

  const robot = new THREE.Group();
  add(robot, new THREE.BoxGeometry(0.2, 0.09, 0.25), pale, 0, 0.07, 0);
  const wheel = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = add(robot, wheel, dark, sx * 0.12, 0.045, sz * 0.08);
      w.rotation.z = Math.PI / 2;
    }
  }
  tilt.add(robot);
  const at = new THREE.Vector3();
  const dir = new THREE.Vector3();
  return {
    group,
    swing: true,
    update(t) {
      // There and back, so the robot never jumps from the end to the start.
      const f = 0.5 - 0.5 * Math.cos(t * 0.35);
      route.getPointAt(f, at);
      route.getTangentAt(f, dir);
      robot.position.set(at.x, 0.03, at.z);
      robot.rotation.y = Math.atan2(dir.x, dir.z);
    },
  };
}

/** Saturn: the planet the bot is named for. */
function planet(): Piece {
  const group = new THREE.Group();
  const lean = new THREE.Group();
  lean.rotation.set(0.42, 0, 0.3);
  group.add(lean);
  const bands = buildBandTexture([GOLD, "#f6c2a0", BLOSSOM, "#ffe6c4", "#e79fc4", GOLD, WHITE]);
  const globe = add(
    lean,
    new THREE.SphereGeometry(0.78, 48, 32),
    new THREE.MeshStandardMaterial({ map: bands, roughness: 0.6, emissive: new THREE.Color(GOLD), emissiveIntensity: 0.12 }),
  );
  const flat = (inner: number, outer: number, colour: string): THREE.Mesh => {
    const mat = solid(colour, 0.45, 0.7);
    mat.side = THREE.DoubleSide;
    const m = add(lean, new THREE.RingGeometry(inner, outer, 96), mat);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  flat(0.95, 1.06, LILAC);
  flat(1.09, 1.24, BLOSSOM);
  const moon = add(lean, new THREE.SphereGeometry(0.06, 12, 8), solid(WHITE, 0.5));
  return {
    group,
    swing: false,
    update(t) {
      globe.rotation.y = t * 0.5;
      moon.position.set(Math.cos(t * 0.6) * 0.92, 0.5, Math.sin(t * 0.6) * 0.72);
    },
  };
}

/** In the order of profile.ts's projects. */
export function buildPieces(): Piece[] {
  return [levelBars(), blaster(), ring(), field(), planet()];
}
