import * as THREE from "three";
import { skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { createSprig } from "@/components/valley/sources/sprig";
import { DOMAIN, LANTERN_R, rng } from "./layout";

/**
 * The things on and under the pond, each built from plain shapes and
 * canvas drawings. All in greys: the bar pass colours them.
 */

/** Everything that must be freed on unmount, freed together. */
export class Bag {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  dispose(): void {
    for (const item of this.items) item.dispose();
    this.items = [];
  }
}

const grey = (v: number): THREE.Color => new THREE.Color().setScalar(v);

/** A lit grey that never falls below `floor` on its shaded side. */
export function lambert(bag: Bag, tone: number, floor = 0.12, side: THREE.Side = THREE.FrontSide): THREE.MeshLambertMaterial {
  return bag.add(new THREE.MeshLambertMaterial({ color: grey(tone), emissive: grey(floor), side }));
}

function canvasTexture(bag: Bag, canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = bag.add(new THREE.CanvasTexture(canvas));
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 1;
  return t;
}

// ---------------------------------------------------------------------------
// Under the water

/** The pond floor: dark pebbles on darker silt, tiled. */
export function buildFloor(bag: Bag): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const x = c.getContext("2d");
  if (!x) throw new Error("b27: no 2d");
  x.fillStyle = "#0d0d0d";
  x.fillRect(0, 0, 512, 512);
  const r = rng(91);
  for (let i = 0; i < 220; i += 1) {
    const v = Math.round(22 + r() * 34);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.beginPath();
    const px = r() * 512;
    const py = r() * 512;
    const rad = 6 + r() * 18;
    x.ellipse(px, py, rad, rad * (0.55 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  const tex = canvasTexture(bag, c, true);
  tex.repeat.set(DOMAIN.w / 7, DOMAIN.d / 7);
  const geo = bag.add(new THREE.PlaneGeometry(DOMAIN.w + 20, DOMAIN.d + 20));
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, bag.add(new THREE.MeshBasicMaterial({ map: tex })));
  mesh.position.set(DOMAIN.x0 + DOMAIN.w / 2, -1.5, DOMAIN.z0 + DOMAIN.d / 2);
  return mesh;
}

/**
 * A koi body one unit long along +x, nose first. Every vertex carries aU,
 * its place along the spine (0 nose, 1 tail tip), which the koi shader
 * bends by; fins carry aFin = 1 so they draw a little darker.
 */
export function buildKoiGeometry(bag: Bag): THREE.BufferGeometry {
  const pos: number[] = [];
  const us: number[] = [];
  const fins: number[] = [];
  const idx: number[] = [];
  const xAt = (u: number): number => 0.5 - u;
  const push = (x: number, y: number, z: number, u: number, fin: number): number => {
    pos.push(x, y, z);
    us.push(u);
    fins.push(fin);
    return us.length - 1;
  };

  // The body: rings of an ellipse along the spine.
  const NS = 20;
  const NR = 12;
  const U_END = 0.86;
  for (let i = 0; i <= NS; i += 1) {
    const u = (i / NS) * U_END;
    const shape = Math.pow(Math.sin(Math.min(1, (u + 0.03) / 1.06) * Math.PI), 0.75) * (1 - 0.55 * u);
    const w = 0.13 * shape;
    const h = 0.75 * w;
    for (let j = 0; j < NR; j += 1) {
      const a = (j / NR) * Math.PI * 2;
      push(xAt(u), Math.sin(a) * h, Math.cos(a) * w, u, 0);
    }
  }
  for (let i = 0; i < NS; i += 1) {
    for (let j = 0; j < NR; j += 1) {
      const a = i * NR + j;
      const b = i * NR + ((j + 1) % NR);
      const c = (i + 1) * NR + j;
      const d = (i + 1) * NR + ((j + 1) % NR);
      idx.push(a, c, b, b, c, d);
    }
  }
  // A cap on the nose.
  const nose = push(xAt(0) + 0.015, 0, 0, 0, 0);
  for (let j = 0; j < NR; j += 1) idx.push(nose, j, (j + 1) % NR);

  // The tail: a flat fan with a notch.
  const r0 = push(xAt(0.82), 0, 0.025, 0.82, 1);
  const r1 = push(xAt(0.82), 0, -0.025, 0.82, 1);
  const t0 = push(xAt(1.08), 0, 0.14, 1.08, 1);
  const t1 = push(xAt(1.08), 0, -0.14, 1.08, 1);
  const n = push(xAt(0.99), 0, 0, 0.99, 1);
  idx.push(r0, t0, n, r1, n, t1, r0, n, r1);

  // Two pectoral fins behind the head.
  for (const side of [1, -1]) {
    const a = push(xAt(0.24), 0, side * 0.08, 0.24, 1);
    const b = push(xAt(0.36), 0, side * 0.085, 0.36, 1);
    const c = push(xAt(0.42), 0, side * 0.22, 0.42, 1);
    idx.push(a, b, c);
  }

  const geo = bag.add(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aU", new THREE.Float32BufferAttribute(us, 1));
  geo.setAttribute("aFin", new THREE.Float32BufferAttribute(fins, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// On the water

/** A lily pad's face: mid grey with darker veins and a lighter rim. */
export function padTexture(bag: Bag): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const x = c.getContext("2d");
  if (!x) throw new Error("b27: no 2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "#9a9a9a");
  g.addColorStop(0.85, "#848484");
  g.addColorStop(0.95, "#b4b4b4");
  g.addColorStop(1, "#b4b4b4");
  x.fillStyle = g;
  x.beginPath();
  x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "#626262";
  x.lineWidth = 3;
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    x.beginPath();
    x.moveTo(S / 2, S / 2);
    x.quadraticCurveTo(S / 2 + Math.cos(a + 0.12) * S * 0.25, S / 2 + Math.sin(a + 0.12) * S * 0.25, S / 2 + Math.cos(a) * S * 0.46, S / 2 + Math.sin(a) * S * 0.46);
    x.stroke();
  }
  return canvasTexture(bag, c);
}

/** A lily pad: a disc with the usual notch cut to its centre. */
export function buildPad(bag: Bag, r: number, material: THREE.Material): THREE.Mesh {
  const notch = 0.28;
  const geo = bag.add(new THREE.CircleGeometry(r, 48, notch, Math.PI * 2 - notch * 2));
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, material);
}

type Mats = { light: THREE.Material; mid: THREE.Material; dark: THREE.Material };

export function objectMaterials(bag: Bag): Mats {
  return { light: lambert(bag, 0.95, 0.2), mid: lambert(bag, 0.68, 0.14), dark: lambert(bag, 0.4, 0.08) };
}

function mesh(bag: Bag, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(bag.add(geo), mat);
}

/** The Actually Company: a microphone lying on the pad. */
export function buildMicrophone(bag: Bag, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const handle = mesh(bag, new THREE.CylinderGeometry(0.06, 0.075, 0.62, 18), m.mid);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.18, 0.08, 0);
  const collar = mesh(bag, new THREE.CylinderGeometry(0.1, 0.085, 0.1, 20), m.dark);
  collar.rotation.z = Math.PI / 2;
  collar.position.set(0.16, 0.1, 0);
  const head = mesh(bag, new THREE.SphereGeometry(0.17, 24, 16), m.light);
  head.position.set(0.32, 0.17, 0);
  const band = mesh(bag, new THREE.TorusGeometry(0.172, 0.018, 8, 32), m.dark);
  band.rotation.y = Math.PI / 2;
  band.position.copy(head.position);
  g.add(handle, collar, head, band);
  g.rotation.y = 0.5;
  return g;
}

/** S-KBD67: a toy blaster on its side, so its outline faces up. */
export function buildBlaster(bag: Bag, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(bag, new THREE.BoxGeometry(0.7, 0.12, 0.24), m.light);
  body.position.set(0, 0.07, 0);
  const barrel = mesh(bag, new THREE.CylinderGeometry(0.07, 0.07, 0.36, 16), m.mid);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.5, 0.08, -0.04);
  const muzzle = mesh(bag, new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), m.dark);
  muzzle.rotation.z = Math.PI / 2;
  muzzle.position.set(0.69, 0.08, -0.04);
  const grip = mesh(bag, new THREE.BoxGeometry(0.14, 0.1, 0.32), m.mid);
  grip.rotation.y = 0.35;
  grip.position.set(-0.16, 0.06, 0.24);
  const drum = mesh(bag, new THREE.CylinderGeometry(0.13, 0.13, 0.16, 20), m.mid);
  drum.position.set(0.12, 0.11, 0);
  const stock = mesh(bag, new THREE.BoxGeometry(0.26, 0.1, 0.18), m.dark);
  stock.position.set(-0.46, 0.06, -0.02);
  const sensor = mesh(bag, new THREE.BoxGeometry(0.1, 0.05, 0.08), m.dark);
  sensor.position.set(-0.08, 0.15, -0.05);
  g.add(body, barrel, muzzle, grip, drum, stock, sensor);
  g.rotation.y = -0.35;
  return g;
}

/** King of the Ring: a boxing glove. */
export function buildGlove(bag: Bag, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const fist = mesh(bag, new THREE.SphereGeometry(0.3, 28, 20), m.light);
  fist.scale.set(1.1, 0.7, 0.85);
  fist.position.set(0.12, 0.2, 0);
  const thumb = mesh(bag, new THREE.SphereGeometry(0.12, 18, 12), m.light);
  thumb.scale.set(1.5, 0.8, 0.9);
  thumb.position.set(0.02, 0.18, -0.25);
  const cuff = mesh(bag, new THREE.CylinderGeometry(0.2, 0.19, 0.3, 24), m.mid);
  cuff.rotation.z = Math.PI / 2;
  cuff.position.set(-0.3, 0.17, 0);
  const band = mesh(bag, new THREE.CylinderGeometry(0.205, 0.205, 0.06, 24), m.dark);
  band.rotation.z = Math.PI / 2;
  band.position.set(-0.2, 0.17, 0);
  g.add(fist, thumb, cuff, band);
  g.rotation.y = 0.7;
  return g;
}

/** mclib: a small drive-base robot, four wheels and a lift. */
export function buildRobot(bag: Bag, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const chassis = mesh(bag, new THREE.BoxGeometry(0.62, 0.08, 0.52), m.mid);
  chassis.position.y = 0.1;
  g.add(chassis);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = mesh(bag, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18), m.dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * 0.22, 0.1, sz * 0.31);
      g.add(wheel);
    }
  }
  for (const sz of [-1, 1]) {
    const post = mesh(bag, new THREE.BoxGeometry(0.06, 0.3, 0.06), m.light);
    post.position.set(-0.12, 0.29, sz * 0.18);
    const arm = mesh(bag, new THREE.BoxGeometry(0.46, 0.05, 0.05), m.light);
    arm.rotation.z = -0.3;
    arm.position.set(0.08, 0.38, sz * 0.18);
    g.add(post, arm);
  }
  const bar = mesh(bag, new THREE.BoxGeometry(0.06, 0.05, 0.42), m.light);
  bar.position.set(0.3, 0.31, 0);
  const brain = mesh(bag, new THREE.BoxGeometry(0.2, 0.06, 0.16), m.light);
  brain.position.set(-0.18, 0.17, 0);
  g.add(bar, brain);
  g.rotation.y = 0.4;
  return g;
}

/** Saturn: a round stone with a ring round it. */
export function buildRingedStone(bag: Bag, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const stone = mesh(bag, new THREE.SphereGeometry(0.27, 28, 20), m.mid);
  stone.scale.set(1, 0.85, 1);
  stone.position.y = 0.24;
  const ringMat = lambert(bag, 0.95, 0.25, THREE.DoubleSide);
  const ring = mesh(bag, new THREE.RingGeometry(0.38, 0.54, 48), ringMat);
  ring.rotation.x = -Math.PI / 2 + 0.45;
  ring.rotation.z = 0.3;
  ring.position.y = 0.26;
  g.add(stone, ring);
  return g;
}

/** The stone that drops at contact. */
export function buildStone(bag: Bag): THREE.Mesh {
  const s = mesh(bag, new THREE.SphereGeometry(0.26, 22, 16), lambert(bag, 0.72, 0.18));
  s.scale.set(1, 0.72, 0.9);
  return s;
}

// ---------------------------------------------------------------------------
// The lanterns

const ATLAS_COLS = 8;
const ATLAS_ROWS = 6;
const CELL = 128;

/** One cell per skill: the mark in dark ink on a pale round face. */
export function lanternAtlas(bag: Bag, monoFamily: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = ATLAS_COLS * CELL;
  c.height = ATLAS_ROWS * CELL;
  const x = c.getContext("2d");
  if (!x) throw new Error("b27: no 2d");
  x.fillStyle = "#f2f2f2";
  x.fillRect(0, 0, c.width, c.height);
  let i = 0;
  for (const group of skillGroups) {
    for (const skill of group.skills) {
      const cx = (i % ATLAS_COLS) * CELL;
      const cy = Math.floor(i / ATLAS_COLS) * CELL;
      x.save();
      x.translate(cx, cy);
      x.strokeStyle = "#a0a0a0";
      x.lineWidth = 5;
      x.beginPath();
      x.arc(CELL / 2, CELL / 2, CELL / 2 - 6, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = "#2a2a2a";
      const icon = skillIcon(skill.icon);
      if (icon) {
        const k = 64 / 24;
        x.translate(CELL / 2 - 32, CELL / 2 - 32);
        x.scale(k, k);
        x.fill(new Path2D(icon.path));
      } else {
        const t = skill.mark ?? skill.name.slice(0, 2);
        x.font = `700 ${t.length > 2 ? 36 : 46}px ${monoFamily}`;
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(t, CELL / 2, CELL / 2 + 2);
      }
      x.restore();
      i += 1;
    }
  }
  return canvasTexture(bag, c);
}

/** A floating lantern: a low wooden float, a paper body and a lit top with the mark. */
export function buildLantern(bag: Bag, index: number, parts: { base: THREE.BufferGeometry; body: THREE.BufferGeometry; baseMat: THREE.Material; bodyMat: THREE.Material; topMat: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(parts.base, parts.baseMat);
  base.position.y = 0.03;
  const body = new THREE.Mesh(parts.body, parts.bodyMat);
  body.position.y = 0.16;
  const topGeo = bag.add(new THREE.CircleGeometry(LANTERN_R * 0.82, 28));
  topGeo.rotateX(-Math.PI / 2);
  // Point the top's UVs at this skill's cell of the atlas.
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const uv = topGeo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (col + uv.getX(i)) / ATLAS_COLS, 1 - (row + 1) / ATLAS_ROWS + uv.getY(i) / ATLAS_ROWS);
  }
  uv.needsUpdate = true;
  const top = new THREE.Mesh(topGeo, parts.topMat);
  top.position.y = 0.295;
  g.add(base, body, top);
  return g;
}

export function lanternParts(bag: Bag, atlas: THREE.Texture) {
  return {
    base: bag.add(new THREE.BoxGeometry(LANTERN_R * 2.2, 0.06, LANTERN_R * 2.2)),
    body: bag.add(new THREE.CylinderGeometry(LANTERN_R * 0.9, LANTERN_R, 0.26, 20)),
    baseMat: lambert(bag, 0.42, 0.08),
    bodyMat: lambert(bag, 0.8, 0.3),
    topMat: bag.add(new THREE.MeshBasicMaterial({ map: atlas })),
  };
}

// ---------------------------------------------------------------------------
// The bough overhead, as the water sees it

/** The area of the reflection picture, in the shifted coordinates the water shader uses. */
export const REFL_RECT = { x0: -16, z0: -6, w: 66, d: 12 } as const;
const REFL_PX = 36;

/**
 * Sakura sprigs from the site's own drawing, set along both long edges
 * and reaching in, as a bough over the pond would look in the water.
 */
export function reflectionTexture(bag: Bag): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = Math.round(REFL_RECT.w * REFL_PX);
  c.height = Math.round(REFL_RECT.d * REFL_PX);
  const x = c.getContext("2d");
  if (!x) throw new Error("b27: no 2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = "lighten";
  const r = rng(4242);
  const size = Math.round(5.2 * REFL_PX);
  let seed = 11;
  for (let px = -size * 0.3; px < c.width; px += size * (0.55 + r() * 0.3)) {
    for (const edge of [0, 1]) {
      if (r() < 0.25) continue;
      const sprig = createSprig({ seed: seed++, width: size, height: size, side: r() < 0.5 ? "left" : "right", blossomScale: 1.2 });
      x.save();
      // The stem grows up from the bottom of its canvas: turned over for the top edge.
      if (edge === 0) {
        x.translate(px + size, size * (0.55 + r() * 0.25));
        x.rotate(Math.PI + (r() - 0.5) * 0.5);
      } else {
        x.translate(px, c.height - size * (0.55 + r() * 0.25));
        x.rotate((r() - 0.5) * 0.5);
      }
      x.drawImage(sprig.canvas, 0, 0);
      x.restore();
      sprig.dispose?.();
    }
  }
  return canvasTexture(bag, c);
}
