import * as THREE from "three";
import type { SkillGroup } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { FIELD_ROBOT_LEN, MARK_SIZE, markPositions, PLINTH_ROBOT_LEN } from "./layout";

/**
 * The eleven little scenes behind the index, all built here from plain
 * three.js shapes: one per project, one per skill group, and the robot
 * for the email. Each is drawn in greys only. The bar pass downstream
 * reads brightness, so what matters is that lit faces are near white,
 * faces in shade stay well above black, and the sky is pure black (the
 * bar pass leaves black empty).
 */

export type Built = {
  group: THREE.Group;
  /** Advance the scene's own motion. t is seconds on the stage clock. */
  update: (t: number, dt: number) => void;
};

/** Everything made here, so one call frees it all. */
export class Bag {
  private items = new Set<{ dispose: () => void }>();
  add<T extends { dispose: () => void }>(x: T): T {
    this.items.add(x);
    return x;
  }
  dispose(): void {
    for (const x of this.items) x.dispose();
    this.items.clear();
  }
}

/** Three greys every solid shares. Pale on purpose: the page errs bright. */
export type Greys = { light: THREE.Material; mid: THREE.Material; dark: THREE.Material };
export function makeGreys(bag: Bag): Greys {
  return {
    light: bag.add(new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })),
    mid: bag.add(new THREE.MeshLambertMaterial({ color: 0xb4b4b4 })),
    dark: bag.add(new THREE.MeshLambertMaterial({ color: 0x7a7a7a })),
  };
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};

// ---- 0: microphone ------------------------------------------------------

export function buildMicrophone(bag: Bag, g: Greys): Built {
  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = 0.55;
  group.add(head);
  // The capsule, with rings round it for the grille.
  head.add(mesh(bag.add(new THREE.CapsuleGeometry(0.34, 0.5, 8, 24)), g.light));
  const band = bag.add(new THREE.TorusGeometry(0.345, 0.03, 8, 40));
  for (const y of [-0.12, 0.05, 0.22]) {
    const r = mesh(band, g.mid, 0, y, 0);
    r.rotation.x = Math.PI / 2;
    head.add(r);
  }
  const collar = mesh(bag.add(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 32)), g.mid, 0, -0.36, 0);
  head.add(collar);
  // The yoke: a half ring under the capsule, and the stand below it.
  const yoke = mesh(bag.add(new THREE.TorusGeometry(0.5, 0.045, 8, 40, Math.PI)), g.mid, 0, 0.55, 0);
  yoke.rotation.z = Math.PI;
  group.add(yoke);
  group.add(mesh(bag.add(new THREE.CylinderGeometry(0.05, 0.05, 1.55, 12)), g.mid, 0, -0.5, 0));
  group.add(mesh(bag.add(new THREE.CylinderGeometry(0.55, 0.62, 0.1, 40)), g.light, 0, -1.3, 0));

  // Rings of sound going out from the capsule in the plane that faces the
  // camera. Each has its own unlit material so it can fade as it grows.
  const ringGeo = bag.add(new THREE.TorusGeometry(1, 0.08, 6, 72));
  const rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = bag.add(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const m = mesh(ringGeo, mat, 0, 0.55, 0);
    group.add(m);
    rings.push({ m, mat, phase: i / 4 });
  }
  const update = (t: number): void => {
    for (const r of rings) {
      const k = (t * 0.28 + r.phase) % 1;
      const s = 0.62 + k * 0.95;
      r.m.scale.setScalar(s);
      // Bright when it leaves the capsule, gone at the edge.
      const v = Math.max(0.0, 1.0 - k) * 0.95;
      r.mat.color.setScalar(v);
    }
    head.rotation.y = Math.sin(t * 0.5) * 0.25;
  };
  update(0);
  return { group, update };
}

// ---- 1: blaster and sensor board ----------------------------------------

export function buildBlaster(bag: Bag, g: Greys): Built {
  const group = new THREE.Group();
  const gun = new THREE.Group();
  gun.position.y = 0.25;
  group.add(gun);
  const box = (w: number, h: number, d: number): THREE.BoxGeometry => bag.add(new THREE.BoxGeometry(w, h, d));
  gun.add(mesh(box(1.5, 0.42, 0.34), g.light, 0, 0, 0));
  // Barrel along +x with a ring at the muzzle.
  const barrel = mesh(bag.add(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 20)), g.mid, 1.15, 0.04, 0);
  barrel.rotation.z = Math.PI / 2;
  gun.add(barrel);
  const muzzle = mesh(bag.add(new THREE.TorusGeometry(0.13, 0.04, 8, 24)), g.light, 1.6, 0.04, 0);
  muzzle.rotation.y = Math.PI / 2;
  gun.add(muzzle);
  // The flywheel drum on top, its axis across the gun.
  const drum = mesh(bag.add(new THREE.CylinderGeometry(0.24, 0.24, 0.38, 24)), g.mid, 0.25, 0.3, 0);
  drum.rotation.x = Math.PI / 2;
  gun.add(drum);
  gun.add(mesh(box(0.9, 0.06, 0.12), g.dark, -0.2, 0.24, 0));
  // Grip, trigger guard, stock.
  const grip = mesh(box(0.26, 0.62, 0.28), g.mid, -0.35, -0.42, 0);
  grip.rotation.z = -0.32;
  gun.add(grip);
  const guard = mesh(bag.add(new THREE.TorusGeometry(0.16, 0.035, 8, 24, Math.PI)), g.mid, -0.02, -0.21, 0);
  guard.rotation.z = Math.PI;
  gun.add(guard);
  gun.add(mesh(box(0.55, 0.34, 0.26), g.light, -1.0, -0.06, 0));

  // The sensor board, floating under the gun: the PCB, the radio module,
  // the IMU, a joystick and a row of header pins.
  const board = new THREE.Group();
  board.position.set(0.15, -0.95, 0.35);
  board.rotation.x = 0.5;
  group.add(board);
  board.add(mesh(box(1.1, 0.05, 0.7), g.mid, 0, 0, 0));
  board.add(mesh(box(0.36, 0.06, 0.26), g.light, -0.28, 0.05, -0.1));
  board.add(mesh(box(0.14, 0.05, 0.14), g.light, 0.15, 0.05, -0.15));
  board.add(mesh(bag.add(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 16)), g.dark, 0.3, 0.07, 0.15));
  board.add(mesh(bag.add(new THREE.SphereGeometry(0.075, 16, 12)), g.light, 0.3, 0.17, 0.15));
  const pin = box(0.035, 0.12, 0.035);
  for (let i = 0; i < 10; i++) board.add(mesh(pin, g.light, -0.45 + i * 0.1, 0.07, 0.3));

  // Packets: small cubes leaving the board toward the right, fading out.
  const packetGeo = box(0.1, 0.1, 0.1);
  const packets: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = bag.add(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const m = mesh(packetGeo, mat);
    group.add(m);
    packets.push({ m, mat, phase: i / 6 });
  }
  const update = (t: number): void => {
    gun.rotation.y = Math.sin(t * 0.4) * 0.18;
    gun.rotation.z = Math.sin(t * 0.33) * 0.05;
    board.position.y = -0.95 + Math.sin(t * 0.7) * 0.05;
    for (const p of packets) {
      const k = (t * 0.35 + p.phase) % 1;
      p.m.position.set(0.7 + k * 0.85, -0.85 + k * 0.25, 0.35);
      p.m.rotation.set(k * 3, k * 2, 0);
      p.mat.color.setScalar(0.9 * (1 - k));
    }
  };
  update(0);
  return { group, update };
}

// ---- 2: boxing ring with gloves -----------------------------------------

function glove(bag: Bag, g: Greys): THREE.Group {
  const o = new THREE.Group();
  const fist = mesh(bag.add(new THREE.SphereGeometry(0.26, 24, 16)), g.light);
  fist.scale.set(1.15, 0.9, 1.0);
  o.add(fist);
  o.add(mesh(bag.add(new THREE.SphereGeometry(0.1, 16, 12)), g.light, -0.02, -0.05, 0.22));
  const cuff = mesh(bag.add(new THREE.CylinderGeometry(0.17, 0.19, 0.26, 20)), g.mid, -0.3, -0.02, 0);
  cuff.rotation.z = Math.PI / 2;
  o.add(cuff);
  return o;
}

export function buildRing(bag: Bag, g: Greys): Built {
  const group = new THREE.Group();
  group.add(mesh(bag.add(new THREE.BoxGeometry(3.0, 0.3, 3.0)), g.light, 0, -0.7, 0));
  group.add(mesh(bag.add(new THREE.BoxGeometry(2.8, 0.02, 2.8)), g.mid, 0, -0.54, 0));
  const post = bag.add(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12));
  const c = 1.4;
  for (const [x, z] of [[-c, -c], [c, -c], [c, c], [-c, c]]) group.add(mesh(post, g.mid, x, 0.05, z));
  // Three ropes a side.
  const rope = bag.add(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8));
  for (const y of [-0.15, 0.15, 0.45]) {
    for (const side of [-1, 1]) {
      const a = mesh(rope, g.light, 0, y, side * c);
      a.rotation.z = Math.PI / 2;
      group.add(a);
      const b = mesh(rope, g.light, side * c, y, 0);
      b.rotation.x = Math.PI / 2;
      group.add(b);
    }
  }
  // Two gloves facing each other over the canvas, trading punches.
  const left = glove(bag, g);
  const right = glove(bag, g);
  right.rotation.y = Math.PI;
  group.add(left, right);
  const update = (t: number): void => {
    const a = Math.max(0, Math.sin(t * 2.2)) ** 3;
    const b = Math.max(0, Math.sin(t * 2.2 + Math.PI)) ** 3;
    left.position.set(-0.75 + a * 0.4, 0.95 + Math.sin(t * 1.3) * 0.06, 0.1);
    right.position.set(0.75 - b * 0.4, 0.95 + Math.sin(t * 1.3 + 1) * 0.06, -0.1);
    left.rotation.z = Math.sin(t * 1.1) * 0.12;
    right.rotation.z = -Math.sin(t * 1.1 + 0.5) * 0.12;
  };
  update(0);
  return { group, update };
}

// ---- the robot, shared by the field and the plinth -----------------------

type Wheel = { node: THREE.Object3D; axis: THREE.Vector3; sign: number; radius: number };

/** A robot copy scaled to `length`, standing on y = 0 and facing +x. */
export type RobotCopy = { holder: THREE.Group; wheels: Wheel[]; scale: number; height: number };

/**
 * Wraps a copy of the loaded robot. The copy shares geometry with the
 * original (clone does not duplicate buffers), so two copies cost one.
 */
export function robotCopy(source: THREE.Object3D, length: number): RobotCopy {
  const copy = source.clone(true);
  const box = new THREE.Box3().setFromObject(copy);
  const size = box.getSize(new THREE.Vector3());
  const scale = length / Math.max(size.x, size.z, 1e-3);
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  // Centre it on its footprint, feet on the floor.
  const centre = box.getCenter(new THREE.Vector3());
  copy.position.set(-centre.x, -box.min.y, -centre.z);
  inner.add(copy);
  holder.add(inner);
  const wheels: Wheel[] = [];
  copy.traverse((o) => {
    const data = o.userData as { axis?: number[]; sign?: number; radius?: number };
    if (/^wheel_/.test(o.name) && data.axis && data.radius) {
      wheels.push({ node: o, axis: new THREE.Vector3().fromArray(data.axis).normalize(), sign: data.sign ?? 1, radius: data.radius });
    }
  });
  return { holder, wheels, scale, height: size.y * scale };
}

/** Turn every wheel by a distance travelled in world units. */
function roll(r: RobotCopy, ds: number): void {
  for (const w of r.wheels) w.node.rotateOnAxis(w.axis, (w.sign * ds) / (w.radius * r.scale));
}

// ---- 3: the robot on a tiled field --------------------------------------

export type RobotScene = Built & { attach: (source: THREE.Object3D) => void };

export function buildField(bag: Bag, g: Greys): RobotScene {
  const group = new THREE.Group();
  const floorY = -0.6;
  // Six by six foam tiles, in two greys like a checker so the grid reads.
  const tile = bag.add(new THREE.BoxGeometry(0.585, 0.04, 0.585));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      group.add(mesh(tile, (i + j) % 2 ? g.mid : g.light, -1.5 + i * 0.6, floorY - 0.02, -1.5 + j * 0.6));
    }
  }
  // Low walls round the edge.
  const wall = bag.add(new THREE.BoxGeometry(3.7, 0.14, 0.05));
  for (const s of [-1, 1]) {
    group.add(mesh(wall, g.light, 0, floorY + 0.05, s * 1.83));
    const w2 = mesh(wall, g.light, s * 1.83, floorY + 0.05, 0);
    w2.rotation.y = Math.PI / 2;
    group.add(w2);
  }
  // The path it drives, a figure of eight, marked with dots behind it.
  const path = (u: number): [number, number] => [Math.sin(u) * 1.15, Math.sin(2 * u) * 0.75];
  const dotGeo = bag.add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10));
  for (let i = 0; i < 48; i++) {
    const [x, z] = path((i / 48) * Math.PI * 2);
    group.add(mesh(dotGeo, g.light, x, floorY + 0.006, z));
  }
  let robot: RobotCopy | null = null;
  let u = 0;
  const attach = (source: THREE.Object3D): void => {
    robot = robotCopy(source, FIELD_ROBOT_LEN);
    robot.holder.position.y = floorY;
    group.add(robot.holder);
    place(0);
  };
  const place = (du: number): void => {
    if (!robot) return;
    const [x0, z0] = path(u);
    u += du;
    const [x, z] = path(u);
    const [xn, zn] = path(u + 0.01);
    robot.holder.position.x = x;
    robot.holder.position.z = z;
    // Facing along the path. A turn of a about y sends +x to (cos a, 0, -sin a).
    robot.holder.rotation.y = Math.atan2(-(zn - z), xn - x);
    roll(robot, Math.hypot(x - x0, z - z0));
  };
  const update = (_t: number, dt: number): void => place(dt * 0.32);
  return { group, update, attach };
}

// ---- 4: ringed planet among clouds --------------------------------------

function bandTexture(bag: Bag, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  draw(ctx);
  const tex = bag.add(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPlanet(bag: Bag, g: Greys): Built {
  const group = new THREE.Group();
  // Bands of grey round the planet, a few wide and a few narrow.
  const bands = [0.95, 0.8, 0.9, 0.68, 0.92, 0.78, 0.96, 0.72, 0.88];
  const planetTex = bandTexture(bag, 8, 256, (ctx) => {
    let y = 0;
    bands.forEach((v, i) => {
      const hgt = i % 2 ? 20 : 36;
      ctx.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
      ctx.fillRect(0, y, 8, hgt + 1);
      y += hgt;
    });
    ctx.fillStyle = "rgb(235,235,235)";
    ctx.fillRect(0, y, 8, 256 - y);
  });
  const planetMat = bag.add(new THREE.MeshLambertMaterial({ color: 0xffffff, map: planetTex }));
  const tilt = new THREE.Group();
  tilt.rotation.set(0.35, 0, 0.3);
  group.add(tilt);
  const planet = mesh(bag.add(new THREE.SphereGeometry(0.9, 48, 32)), planetMat);
  tilt.add(planet);
  // The ring: a flat disc with a gap, lighter toward its outer edge.
  const ringTex = bandTexture(bag, 256, 4, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "#8a8a8a");
    grad.addColorStop(0.45, "#e6e6e6");
    grad.addColorStop(0.5, "#202020");
    grad.addColorStop(0.55, "#f0f0f0");
    grad.addColorStop(1, "#bdbdbd");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 4);
  });
  const ringGeo = bag.add(new THREE.RingGeometry(1.15, 1.8, 96, 1));
  // RingGeometry's uv runs across the square, not along the radius; set u to the radius.
  const pos = ringGeo.attributes.position;
  const uv = ringGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - 1.15) / (1.8 - 1.15), 0.5);
  }
  uv.needsUpdate = true;
  const ringMat = bag.add(new THREE.MeshBasicMaterial({ color: 0xffffff, map: ringTex, side: THREE.DoubleSide }));
  const ring = mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  tilt.add(ring);
  // Clouds: clusters of balls at different depths, drifting sideways.
  const ball = bag.add(new THREE.IcosahedronGeometry(1, 2));
  const clouds: { o: THREE.Group; x0: number; speed: number }[] = [];
  const spots: [number, number, number, number][] = [
    [-1.9, -0.9, 0.7, 0.9],
    [1.8, -1.0, 0.4, 1.0],
    [-1.6, 0.95, -0.8, 0.8],
    [1.7, 0.85, -0.6, 0.7],
    [0.2, -1.15, 1.0, 0.75],
  ];
  spots.forEach(([x, y, z, s], i) => {
    const o = new THREE.Group();
    const parts: [number, number, number, number][] = [
      [0, 0, 0, 0.32],
      [0.3, -0.05, 0.05, 0.25],
      [-0.3, -0.06, -0.02, 0.24],
      [0.12, 0.16, 0, 0.22],
      [-0.1, 0.12, 0.08, 0.2],
    ];
    for (const [px, py, pz, r] of parts) {
      const b = mesh(ball, g.light, px, py, pz);
      b.scale.set(r * 1.2, r, r);
      o.add(b);
    }
    o.scale.setScalar(s);
    o.position.set(x, y, z);
    group.add(o);
    clouds.push({ o, x0: x, speed: 0.5 + i * 0.13 });
  });
  const update = (t: number): void => {
    planet.rotation.y = t * 0.15;
    ring.rotation.z = t * 0.05;
    for (const c of clouds) c.o.position.x = c.x0 + Math.sin(t * 0.12 * c.speed) * 0.25;
  };
  update(0);
  return { group, update };
}

// ---- 5..9: a group's skill marks, floating ------------------------------

/** One mark drawn white on black: the icon's path, or its short type. */
function markTexture(bag: Bag, name: string, icon: string | undefined, mark: string | undefined, monoFamily: string): THREE.Texture | null {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  // A dim tile behind the mark. The bar pass drops any cell that touches
  // black, which would eat an icon's thin strokes; on a grey tile only the
  // tile's edge is dropped and the strokes show as wider bars.
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.roundRect(4, 4, size - 8, size - 8, 22);
  ctx.fill();
  ctx.fillStyle = "#fff";
  const found = skillIcon(icon);
  if (found) {
    const pad = 14;
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale((size - 2 * pad) / 24, (size - 2 * pad) / 24);
    ctx.fill(new Path2D(found.path));
    ctx.restore();
  } else {
    // A ring with the short name inside, so type marks sit with the icons.
    const text = mark ?? name.slice(0, 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
    ctx.stroke();
    const px = text.length > 2 ? 34 : 46;
    ctx.font = `700 ${px}px ${monoFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2 + 2);
  }
  const tex = bag.add(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSkills(bag: Bag, group0: SkillGroup, seed: number, monoFamily: string): Built {
  const group = new THREE.Group();
  const plane = bag.add(new THREE.PlaneGeometry(MARK_SIZE, MARK_SIZE));
  const marks: { o: THREE.Mesh; base: [number, number, number]; phase: number }[] = [];
  const positions = markPositions(group0.skills.length, seed);
  group0.skills.forEach((s, i) => {
    const tex = markTexture(bag, s.name, s.icon, s.mark, monoFamily);
    const mat = bag.add(new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, side: THREE.DoubleSide }));
    const o = mesh(plane, mat);
    const base = positions[i];
    o.position.set(base[0], base[1], base[2]);
    group.add(o);
    marks.push({ o, base, phase: i * 1.7 + seed });
  });
  const update = (t: number): void => {
    for (const m of marks) {
      m.o.position.y = m.base[1] + Math.sin(t * 0.6 + m.phase) * 0.07;
      m.o.rotation.y = Math.sin(t * 0.35 + m.phase) * 0.45;
      m.o.rotation.x = Math.sin(t * 0.27 + m.phase * 0.5) * 0.12;
    }
    group.rotation.y = Math.sin(t * 0.1) * 0.08;
  };
  update(0);
  return { group, update };
}

// ---- 10: the robot turning on a plinth ----------------------------------

export function buildPlinth(bag: Bag, g: Greys): RobotScene {
  const group = new THREE.Group();
  const floorY = -0.55;
  const turntable = new THREE.Group();
  turntable.position.y = floorY;
  group.add(turntable);
  turntable.add(mesh(bag.add(new THREE.CylinderGeometry(1.0, 1.04, 0.12, 64)), g.light, 0, -0.06, 0));
  group.add(mesh(bag.add(new THREE.CylinderGeometry(1.05, 1.08, 0.08, 64)), g.dark, 0, floorY - 0.16, 0));
  let robot: RobotCopy | null = null;
  const attach = (source: THREE.Object3D): void => {
    robot = robotCopy(source, PLINTH_ROBOT_LEN);
    turntable.add(robot.holder);
  };
  const update = (t: number): void => {
    turntable.rotation.y = t * 0.45;
  };
  return { group, update, attach };
}
