import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CanvasSource } from "@/components/valley/barShader";
import { createBlossomCloud } from "@/components/valley/sources/blossomCloud";
import { createMountains } from "@/components/valley/sources/mountains";
import { SHOTS, lanternHeight, lanternPlaces } from "./layout";
import { disposeTree, ground, ink, picture, ringMaterial, sky } from "./materials";

/**
 * The seven small worlds, one per plate. Each is built of plain shapes
 * in code, except the robot, which is Kevin's own model. They are only
 * ever seen through the bar shader, so each is built for how it reads in
 * grey: a dark body against a pale sky, lit faces lighter, and nothing
 * thinner than a bar is wide.
 */

export type Plate = {
  scene: THREE.Scene;
  /** Move things for time t (seconds of drawing). Returns nothing. */
  tick(t: number, dt: number, camera: THREE.Camera): void;
  /** Points in the world the page labels, if any: the lantern groups. */
  marks: THREE.Vector3[];
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** A thin rod from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function base(): { scene: THREE.Scene; root: THREE.Group } {
  const scene = new THREE.Scene();
  scene.add(sky());
  const root = new THREE.Group();
  scene.add(root);
  return { scene, root };
}

// ------------------------------------------------------------ 0 the coach

function microphone(): Plate {
  const { scene, root } = base();
  scene.add(ground());
  const body = ink(0.12, 0.5);
  root.add(mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.07, 48), ink(0.14, 0.58), 0, 0.035, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 16), body, 0, 0.845, 0));
  const clip = mesh(new THREE.TorusGeometry(0.08, 0.025, 10, 24), body, 0, 1.66, 0);
  clip.rotation.y = Math.PI / 2;
  root.add(clip);
  // The microphone itself, tipped toward the lens.
  const mic = new THREE.Group();
  mic.position.set(0, 1.68, 0);
  mic.rotation.x = 0.32;
  mic.add(mesh(new THREE.CylinderGeometry(0.078, 0.058, 0.44, 24), body, 0, 0.14, 0));
  mic.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 10, 32), ink(0.2, 0.7), 0, 0.37, 0));
  mic.children[1].rotation.x = Math.PI / 2;
  // The grille: banded, so it reads as mesh rather than a ball.
  mic.add(mesh(new THREE.SphereGeometry(0.17, 32, 24), ink(0.16, 0.72, 90), 0, 0.5, 0));
  root.add(mic);
  // The sound: rings leaving the head, paling as they spread, one after another.
  const head = new THREE.Vector3(0, 2.15, 0.16);
  const rings = [0, 1, 2].map(() => {
    const mat = ink(0.2, 0.5);
    const r = mesh(new THREE.TorusGeometry(1, 0.02, 8, 96), mat, head.x, head.y, head.z);
    root.add(r);
    return { r, mat };
  });
  return {
    scene,
    marks: [],
    tick(t) {
      root.rotation.y = Math.sin(t * SHOTS[0].turn) * 0.9;
      rings.forEach(({ r, mat }, i) => {
        const s = (t * 0.3 + i / 3) % 1;
        const k = 0.24 + s * 0.6;
        r.scale.set(k, k, k);
        mat.uniforms.uDark.value = 0.18 + s * 0.62;
        mat.uniforms.uLit.value = 0.4 + s * 0.42;
      });
    },
  };
}

// ---------------------------------------------------------- 1 the blaster

function blaster(): Plate {
  const { scene, root } = base();
  scene.add(ground());
  root.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), ink(0.28, 0.64), 0, 0.25, 0));
  const shell = ink(0.12, 0.5);
  const trim = ink(0.2, 0.66);
  const g = new THREE.Group();
  g.position.set(-0.2, 1.12, 0);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0): void => {
    const m = mesh(geo, mat, x, y, z);
    m.rotation.z = rz;
    g.add(m);
  };
  add(new THREE.BoxGeometry(1.1, 0.34, 0.22), shell, 0, 0, 0);
  add(new THREE.BoxGeometry(0.5, 0.22, 0.2), trim, 0.72, 0.02, 0);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.8, 20), shell, 0.95, 0.05, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 24), trim, 1.36, 0.05, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(0.9, 0.05, 0.08), trim, 0.05, 0.2, 0);
  add(new THREE.BoxGeometry(0.2, 0.52, 0.18), shell, -0.3, -0.38, 0, -0.3);
  add(new THREE.BoxGeometry(0.46, 0.26, 0.16), shell, -0.74, -0.04, 0);
  add(new THREE.BoxGeometry(0.16, 0.36, 0.15), shell, 0.3, -0.3, 0);
  add(new THREE.BoxGeometry(0.03, 0.12, 0.04), trim, -0.06, -0.23, 0);
  const guard = mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 24, Math.PI), trim, -0.06, -0.18, 0);
  guard.rotation.z = Math.PI;
  g.add(guard);
  // The sensor board on the near side: a pale board with dark chips on it.
  add(new THREE.BoxGeometry(0.52, 0.26, 0.02), ink(0.4, 0.78), 0.02, 0.01, 0.125);
  for (const [x, y, w] of [[-0.14, 0.05, 0.12], [0.06, -0.05, 0.1], [0.18, 0.06, 0.07], [-0.02, 0.08, 0.05]] as const) {
    add(new THREE.BoxGeometry(w, w, 0.03), shell, x, y, 0.14);
  }
  // The joystick, on top, where a thumb finds it.
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), shell, -0.2, 0.28, 0);
  add(new THREE.SphereGeometry(0.06, 16, 12), trim, -0.2, 0.36, 0);
  // A lead from the board down to the grip.
  const lead = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, -0.08, 0.13),
    new THREE.Vector3(-0.3, -0.2, 0.14),
    new THREE.Vector3(-0.34, -0.36, 0.1),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 16, 0.014, 6, false), shell));
  root.add(g);
  return {
    scene,
    marks: [],
    tick(t) {
      root.rotation.y = -0.5 + t * SHOTS[1].turn;
      g.position.y = 1.12 + Math.sin(t * 0.8) * 0.04;
    },
  };
}

// ------------------------------------------------------------- 2 the ring

function glove(mat: THREE.Material, cuffMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const fist = mesh(new THREE.SphereGeometry(1, 28, 20), mat);
  fist.scale.set(0.3, 0.23, 0.25);
  g.add(fist);
  const thumb = mesh(new THREE.SphereGeometry(1, 16, 12), mat, 0.02, 0.06, 0.2);
  thumb.scale.set(0.16, 0.08, 0.08);
  g.add(thumb);
  const cuff = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.24, 24), cuffMat, -0.36, 0, 0);
  cuff.rotation.z = Math.PI / 2;
  g.add(cuff);
  return g;
}

function boxingRing(): Plate {
  const { scene, root } = base();
  scene.add(ground());
  root.add(mesh(new THREE.BoxGeometry(3, 0.45, 3), ink(0.2, 0.56), 0, 0.225, 0));
  root.add(mesh(new THREE.BoxGeometry(2.9, 0.03, 2.9), ink(0.5, 0.82), 0, 0.465, 0));
  const post = ink(0.12, 0.44);
  const rope = ink(0.14, 0.4);
  const top = 0.48;
  const c = 1.4;
  const corners = [
    [c, c],
    [c, -c],
    [-c, -c],
    [-c, c],
  ] as const;
  for (const [x, z] of corners) {
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12), post, x, top + 0.6, z));
    root.add(mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), ink(0.3, 0.7), x, top + 0.72, z));
  }
  for (let i = 0; i < 4; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    for (const h of [0.36, 0.66, 0.96]) {
      root.add(rod(new THREE.Vector3(ax, top + h, az), new THREE.Vector3(bx, top + h, bz), 0.022, rope));
    }
  }
  const red = ink(0.14, 0.6);
  const cuff = ink(0.4, 0.8);
  const left = glove(red, cuff);
  const right = glove(red, cuff);
  right.rotation.y = Math.PI;
  root.add(left, right);
  return {
    scene,
    marks: [],
    tick(t) {
      root.rotation.y = 0.35 + t * SHOTS[2].turn;
      // A jab and a slip: the left one strikes out, the right one sways back.
      const jab = Math.pow(Math.max(0, Math.sin(t * 2.1)), 6);
      left.position.set(-0.62 + jab * 0.32, 1.32 + Math.sin(t * 1.3) * 0.03, -0.05);
      right.position.set(0.62 + jab * 0.12, 1.26 + Math.sin(t * 1.3 + 2) * 0.04, 0.12);
      right.rotation.z = Math.sin(t * 1.1) * 0.08;
    },
  };
}

// ---------------------------------------------------- 3 and 6 the robot

type Robot = { node: THREE.Group; wheels: { node: THREE.Object3D; axis: THREE.Vector3; sign: number; radius: number }[]; scale: number };

/** The robot's length on screen, in world units: a bit under a tile. */
const ROBOT_LENGTH = 0.75;

/**
 * Loads Kevin's robot once, drawn in our grey, stood on y = 0, centred,
 * scaled so it is ROBOT_LENGTH long. Its wheel nodes carry their own axis
 * and radius (see heroRobot.ts), so they can roll as it drives.
 */
export async function loadRobot(url: string, signal: { dead: boolean }): Promise<THREE.Group | null> {
  const res = await fetch(url, { priority: "low" } as RequestInit);
  const bytes = await res.arrayBuffer();
  if (signal.dead) return null;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes, "");
  if (signal.dead) {
    disposeTree(gltf.scene);
    return null;
  }
  const mat = ink(0.12, 0.62);
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const old = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of old) {
      for (const v of Object.values(x)) if (v instanceof THREE.Texture) v.dispose();
      x.dispose();
    }
    m.material = mat;
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = ROBOT_LENGTH / Math.max(size.x, 1e-6);
  gltf.scene.position.set(-centre.x, -box.min.y, -centre.z);
  const holder = new THREE.Group();
  holder.add(gltf.scene);
  holder.scale.setScalar(k);
  holder.userData.scale = k;
  return holder;
}

function robotOf(holder: THREE.Group): Robot {
  const wheels: Robot["wheels"] = [];
  holder.traverse((o) => {
    const d = o.userData as { axis?: number[]; sign?: number; radius?: number };
    if (/^wheel_/.test(o.name) && d.axis && d.radius) {
      wheels.push({ node: o, axis: new THREE.Vector3().fromArray(d.axis).normalize(), sign: d.sign ?? 1, radius: d.radius });
    }
  });
  return { node: holder, wheels, scale: (holder.userData.scale as number) || 1 };
}

function field(): Plate & { setRobot(r: THREE.Group): void } {
  const { scene, root } = base();
  const tiles = 6;
  const tile = 1;
  root.add(ground(40, 0.56, 0.72, tile, tiles));
  const wall = ink(0.2, 0.62);
  const half = (tile * tiles) / 2;
  for (const [x, z, ry] of [[0, half, 0], [0, -half, 0], [half, 0, Math.PI / 2], [-half, 0, Math.PI / 2]] as const) {
    const w = mesh(new THREE.BoxGeometry(tile * tiles + 0.06, 0.14, 0.05), wall, x, 0.07, z);
    w.rotation.y = ry;
    root.add(w);
  }
  // The game's rings lying about the field.
  const ringMat = ink(0.14, 0.5);
  for (const [x, z] of [[-1.9, -1.2], [2.1, 0.9], [-0.6, 2.2], [1.5, -2.0], [-2.3, 1.6]] as const) {
    const r = mesh(new THREE.TorusGeometry(0.13, 0.045, 10, 24), ringMat, x, 0.045, z);
    r.rotation.x = Math.PI / 2;
    root.add(r);
  }
  let robot: Robot | null = null;
  let heading = 0;
  const R = 1.25;
  const W = 0.32;
  return {
    scene,
    marks: [],
    setRobot(r) {
      robot = robotOf(r);
      root.add(r);
    },
    tick(t, dt) {
      root.rotation.y = t * SHOTS[3].turn;
      if (!robot) return;
      const a = t * W;
      const x = R * Math.cos(a);
      const z = R * Math.sin(a);
      // Heading along the circle: the model's length runs along its x.
      const dx = -Math.sin(a);
      const dz = Math.cos(a);
      heading = Math.atan2(-dz, dx);
      robot.node.position.set(x, 0, z);
      robot.node.rotation.y = heading;
      const ds = (R * W * dt) / robot.scale;
      for (const w of robot.wheels) w.node.rotateOnAxis(w.axis, w.sign * ds / w.radius);
    },
  };
}

function portrait(): Plate & { setRobot(r: THREE.Group): void } {
  const { scene, root } = base();
  scene.add(ground(40, 0.58, 0.72, 1, 4));
  return {
    scene,
    marks: [],
    setRobot(r) {
      root.add(r);
    },
    tick(t) {
      root.rotation.y = 0.6 + t * SHOTS[6].turn;
    },
  };
}

// ----------------------------------------------------------- 4 the planet

function planet(): Plate & { sources: CanvasSource[] } {
  const { scene, root } = base();
  const tilt = new THREE.Group();
  tilt.position.set(0, 1.95, 0);
  tilt.rotation.z = 0.38;
  tilt.rotation.x = 0.28;
  root.add(tilt);
  tilt.add(mesh(new THREE.SphereGeometry(1, 48, 32), ink(0.14, 0.62, 16)));
  const ring = mesh(new THREE.RingGeometry(1.35, 2.25, 128, 1), ringMaterial(1.35, 2.25));
  ring.rotation.x = -Math.PI / 2;
  tilt.add(ring);
  const moon = mesh(new THREE.SphereGeometry(0.16, 20, 14), ink(0.16, 0.6));
  root.add(moon);
  // The valley's blossom clouds, painted by the valley's own painter,
  // standing round the planet at three depths, always facing the lens.
  const sources: CanvasSource[] = [];
  const clouds: { m: THREE.Mesh; tex: THREE.CanvasTexture; src: CanvasSource }[] = [];
  const spots: [number, number, number, number, number][] = [
    // x, y, z, width, seed
    [-2.9, 0.6, 1.0, 3.0, 3],
    [2.8, 0.9, 0.2, 2.6, 7],
    [0.6, -0.25, 2.4, 2.4, 13],
  ];
  for (const [x, y, z, w, seed] of spots) {
    const src = createBlossomCloud({ seed, width: 512, height: 360, count: 2 });
    sources.push(src);
    const tex = new THREE.CanvasTexture(src.canvas);
    const m = mesh(new THREE.PlaneGeometry(w, w * (360 / 512)), picture(tex, 1, 0), x, y, z);
    scene.add(m);
    clouds.push({ m, tex, src });
  }
  return {
    scene,
    marks: [],
    sources,
    tick(t, dt, camera) {
      root.rotation.y = t * SHOTS[4].turn;
      const a = t * 0.25;
      moon.position.set(Math.cos(a) * 3.0, 1.95 + Math.sin(a) * 0.5, Math.sin(a) * 3.0 * 0.6);
      for (const c of clouds) {
        c.m.quaternion.copy(camera.quaternion);
        const drew = c.src.update?.(t, dt);
        if (drew !== false) c.tex.needsUpdate = true;
      }
    },
  };
}

// ----------------------------------------------------------- 5 the valley

/** One stone lantern, a unit tall: foot, post, deck, firebox, roof, knob. */
function lanternGeometry(): { body: THREE.BufferGeometry; light: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, y: number, ry = 0): void => {
    g.rotateY(ry);
    g.translate(0, y, 0);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  put(new THREE.BoxGeometry(0.5, 0.08, 0.5), 0.04);
  put(new THREE.CylinderGeometry(0.09, 0.11, 0.36, 12), 0.26);
  put(new THREE.BoxGeometry(0.42, 0.07, 0.42), 0.475);
  // The firebox is four corner posts, so the light shows between them.
  for (const [x, z] of [[0.15, 0.15], [0.15, -0.15], [-0.15, 0.15], [-0.15, -0.15]] as const) {
    const p = new THREE.BoxGeometry(0.06, 0.22, 0.06);
    p.translate(x, 0, z);
    put(p, 0.62);
  }
  put(new THREE.ConeGeometry(0.4, 0.2, 4), 0.83, Math.PI / 4);
  put(new THREE.SphereGeometry(0.055, 10, 8), 0.95);
  const body = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const light = new THREE.BoxGeometry(0.26, 0.2, 0.26);
  light.translate(0, 0.62, 0);
  return { body: body ?? new THREE.BoxGeometry(0.3, 1, 0.3), light };
}

function valley(depths: number[][]): Plate & { sources: CanvasSource[] } {
  const { scene, root } = base();
  scene.add(ground(40, 0.55, 0.7));
  // The hills behind, painted by the valley's own mountain painter and
  // stood up as two backdrops, the far range above and behind the near.
  const sources: CanvasSource[] = [];
  const hill = (variant: "near" | "far", seed: number, w: number, h: number, top: number, z: number, gain: number, lift: number): void => {
    const src = createMountains({ seed, width: 1024, height: 512, variant, ridges: 4, xSquares: 160, ySquares: 80 });
    sources.push(src);
    const tex = new THREE.CanvasTexture(src.canvas);
    scene.add(mesh(new THREE.PlaneGeometry(w, h), picture(tex, gain, lift), 0, top - h / 2, z));
  };
  hill("far", 23, 30, 15, 6.6, -22, 0.55, 0.38);
  hill("near", 11, 26, 13, 6.4, -14, 0.6, 0.3);

  const sizes = depths.map((g) => g.length);
  const places = lanternPlaces(sizes);
  const { body, light } = lanternGeometry();
  const stone = new THREE.InstancedMesh(body, ink(0.12, 0.46), places.length);
  const glow = new THREE.InstancedMesh(light, ink(0.9, 0.95), places.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const tops: { x: number; z: number; y: number; n: number }[] = sizes.map(() => ({ x: 0, z: 0, y: 0, n: 0 }));
  places.forEach((p, j) => {
    const h = lanternHeight(depths[p.g][p.i]);
    // Each turned a little differently, as if set by hand.
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((p.g * 7 + p.i * 3) % 5) * 0.12);
    s.set(h, h, h);
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, s);
    stone.setMatrixAt(j, m);
    glow.setMatrixAt(j, m);
    const top = tops[p.g];
    top.x += p.x;
    top.z += p.z;
    top.y = Math.max(top.y, h);
    top.n += 1;
  });
  root.add(stone, glow);
  const marks = tops.map((t) => new THREE.Vector3(t.x / t.n, t.y + 0.22, t.z / t.n));
  return {
    scene,
    marks,
    sources,
    tick() {
      // The valley does not turn; the camera walks along it instead.
    },
  };
}

// -------------------------------------------------------------- all seven

export type World = {
  plates: Plate[];
  /** Resolves when the robot has arrived (or failed to). */
  robot: Promise<void>;
  dispose(): void;
};

export function buildWorld(depths: number[][], robotUrl: string): World {
  const planetPlate = planet();
  const valleyPlate = valley(depths);
  const fieldPlate = field();
  const portraitPlate = portrait();
  const plates: Plate[] = [microphone(), blaster(), boxingRing(), fieldPlate, planetPlate, valleyPlate, portraitPlate];
  const signal = { dead: false };
  const robot = loadRobot(robotUrl, signal)
    .then((r) => {
      if (!r || signal.dead) return;
      fieldPlate.setRobot(r);
      // The second copy shares the first one's geometry and material.
      portraitPlate.setRobot(r.clone(true));
    })
    .catch(() => {
      // No robot: the field and the last plate stand empty, which still reads.
    });
  return {
    plates,
    robot,
    dispose() {
      signal.dead = true;
      for (const src of [...planetPlate.sources, ...valleyPlate.sources]) src.dispose?.();
      for (const p of plates) disposeTree(p.scene);
    },
  };
}

