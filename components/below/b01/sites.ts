import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import helvetiker from "three/examples/fonts/helvetiker_bold.typeface.json";
import { projects } from "@/components/profile";
import type { Fixed } from "./drive";
import { loopPath } from "./pilot";
import {
  APRICOT, PINK, ROSE, WHITE,
  fieldTexture, laneTexture, planetTexture, ringFloorTexture, ringsTexture, targetTexture, wordTexture, zoneTexture,
  type Fonts,
} from "./textures";
import { GATE, SITES, type P2, type Site } from "./world";

/**
 * The things that stand on the floor: five project sites and the gate.
 * Each site is a slab carrying the project's title in raised letters, and
 * one object beside it that says what the project is. All of it is boxes,
 * cylinders, balls and canvas pictures.
 */

/** The letters' outlines come with three.js (its MgOpen "helvetiker"). */
const FONT = new Font(helvetiker as unknown as FontData);

export type Built = {
  /** Everything to add to the scene. */
  root: THREE.Group;
  /** What the robot and the pucks cannot pass through. */
  fixed: Fixed[];
  /** Called each frame with the time in seconds, for the parts that move. */
  tick: (t: number) => void;
};

const SLAB_W = 7.2;
const SLAB_H = 5.6;
const SLAB_D = 0.7;

type Kit = {
  mat: (colour: string, rough?: number, lit?: number) => THREE.MeshStandardMaterial;
  box: (w: number, h: number, d: number, m: THREE.Material) => THREE.Mesh;
  fixed: Fixed[];
  ticks: ((t: number) => void)[];
};

function makeKit(): Kit {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (colour: string, rough = 0.7, lit = 0) => {
    const key = `${colour}/${rough}/${lit}`;
    let m = mats.get(key);
    if (!m) {
      // `lit` gives the colour a light of its own, so letters on a face
      // the key light does not reach can still be read.
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colour),
        roughness: rough,
        metalness: 0.02,
        emissive: new THREE.Color(colour),
        emissiveIntensity: lit,
      });
      mats.set(key, m);
    }
    return m;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material) => shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
  return { mat, box, fixed: [], ticks: [] };
}

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Lines of raised letters, centred on x, standing on y = 0, their backs
 *  on z = 0. All lines the same size: the largest that fits `width`, up to
 *  `most`. Returns the geometry and the height of the whole block. */
function letters(lines: string[], width: number, most: number, depth: number): { geo: THREE.BufferGeometry; height: number; size: number } {
  const unitWidths = lines.map((line) => {
    const g = new TextGeometry(line, { font: FONT, size: 1, depth: 0.01, curveSegments: 2 });
    g.computeBoundingBox();
    const w = g.boundingBox ? g.boundingBox.max.x - g.boundingBox.min.x : 1;
    g.dispose();
    return w;
  });
  const size = Math.min(most, width / Math.max(...unitWidths));
  const gap = size * 1.42;
  const parts = lines.map((line, i) => {
    const g = new TextGeometry(line, {
      font: FONT,
      size,
      depth,
      curveSegments: 6,
      bevelEnabled: true,
      bevelThickness: size * 0.03,
      bevelSize: size * 0.018,
      bevelSegments: 2,
    });
    g.computeBoundingBox();
    const b = g.boundingBox;
    const cx = b ? (b.max.x + b.min.x) / 2 : 0;
    g.translate(-cx, (lines.length - 1 - i) * gap, 0);
    return g;
  });
  const geo = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  if (parts.length > 1) for (const p of parts) p.dispose();
  return { geo, height: (lines.length - 1) * gap + size, size };
}

/** The title broken where a person would break it. */
const TITLE_LINES: Record<string, string[]> = {
  "The Actually Company": ["The", "Actually", "Company"],
  "King of the Ring": ["King of", "the Ring"],
};
/** The raised letters have no non-breaking hyphen or en dash of their own. */
const plain = (s: string) => s.replace(/‑/g, "-").replace(/–/g, "-");

/** A group standing at a point on the floor, its front (+z) facing `to`. */
function standing(at: P2, to: P2): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at.x, 0, at.z);
  g.rotation.y = Math.atan2(to.x, to.z);
  return g;
}

/** A point given in a group's own x and z, on the floor. */
function onFloor(g: THREE.Group, lx: number, lz: number): P2 {
  const c = Math.cos(g.rotation.y);
  const s = Math.sin(g.rotation.y);
  return { x: g.position.x + lx * c + lz * s, z: g.position.z - lx * s + lz * c };
}

/** A row of circles along a group's x axis, standing in for a wall. */
function wallOf(kit: Kit, g: THREE.Group, fromX: number, toX: number, lz: number, r: number): void {
  const n = Math.max(2, Math.ceil(Math.abs(toX - fromX) / (r * 1.5)) + 1);
  for (let i = 0; i < n; i += 1) {
    const p = onFloor(g, fromX + ((toX - fromX) * i) / (n - 1), lz);
    kit.fixed.push({ x: p.x, z: p.z, r });
  }
}

/** A picture lying on the floor, its top toward `up`. */
function painted(map: THREE.Texture, w: number, h: number, at: P2, up: P2, lift = 0.02): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  m.position.set(at.x, lift, at.z);
  m.rotation.y = Math.atan2(-up.x, -up.z);
  m.renderOrder = 1;
  return m;
}

function slab(kit: Kit, site: Site, index: number, fonts: Fonts): THREE.Group {
  const project = projects[index];
  const back = { x: -site.dirIn.x, z: -site.dirIn.z };
  const g = standing(site.slab, back);

  const body = kit.box(SLAB_W, SLAB_H, SLAB_D, kit.mat("#3f162d", 0.85));
  body.position.y = SLAB_H / 2;
  g.add(body);
  const cap = kit.box(SLAB_W + 0.16, 0.16, SLAB_D + 0.16, kit.mat(PINK, 0.5));
  cap.position.y = SLAB_H + 0.08;
  g.add(cap);
  const foot = kit.box(SLAB_W + 0.5, 0.18, SLAB_D + 0.9, kit.mat("#2a0d1e", 0.9));
  foot.position.y = 0.09;
  g.add(foot);

  const lines = (TITLE_LINES[project.title] ?? [project.title]).map(plain);
  const title = letters(lines, SLAB_W - 1, 1.55, 0.3);
  const small = letters([`0${index + 1}`], 2, 0.42, 0.1);
  const year = letters([plain(project.year)], 3, 0.42, 0.1);
  // The title sits in the room under the small line, centred in it.
  const room = SLAB_H - 1.35;
  const base = 0.35 + (room - title.height) / 2;

  for (const turn of [0, Math.PI]) {
    const face = new THREE.Group();
    face.rotation.y = turn;
    const t = shadowed(new THREE.Mesh(title.geo, kit.mat(PINK, 0.45, 0.3)));
    t.position.set(0, base, SLAB_D / 2);
    face.add(t);
    const n = shadowed(new THREE.Mesh(small.geo, kit.mat(APRICOT, 0.5, 0.3)));
    n.position.set(-SLAB_W / 2 + 0.85, SLAB_H - 0.95, SLAB_D / 2);
    face.add(n);
    const y = shadowed(new THREE.Mesh(year.geo, kit.mat(WHITE, 0.6, 0.25)));
    year.geo.computeBoundingBox();
    const yw = year.geo.boundingBox ? year.geo.boundingBox.max.x : 0.6;
    y.position.set(SLAB_W / 2 - 0.5 - yw, SLAB_H - 0.95, SLAB_D / 2);
    face.add(y);
    g.add(face);
  }
  wallOf(kit, g, -SLAB_W / 2 + 0.4, SLAB_W / 2 - 0.4, 0, 0.62);

  // On the floor: the circle the card opens in, numbered.
  const zone = painted(zoneTexture(`0${index + 1}`, fonts), site.zoneR * 2, site.zoneR * 2, site.zone, site.dirIn);
  g.userData.floor = zone;
  return g;
}

/** Sound-level bars, moving, with three notes flagged above them: a
 *  recording being marked up. */
function meter(kit: Kit, site: Site): THREE.Group {
  const g = standing(site.prop, { x: site.zone.x - site.prop.x, z: site.zone.z - site.prop.z });
  const plinth = kit.box(7.4, 0.2, 1.5, kit.mat("#2a0d1e", 0.9));
  plinth.position.y = 0.1;
  g.add(plinth);
  const geo = new THREE.BoxGeometry(0.5, 1, 0.5);
  geo.translate(0, 0.5, 0);
  const bars: THREE.Mesh[] = [];
  const N = 9;
  for (let i = 0; i < N; i += 1) {
    const bar = shadowed(new THREE.Mesh(geo, kit.mat(i % 4 === 1 ? WHITE : PINK, 0.5)));
    bar.position.set((i - (N - 1) / 2) * 0.76, 0.2, 0);
    bars.push(bar);
    g.add(bar);
  }
  const flags: THREE.Mesh[] = [];
  const ball = new THREE.SphereGeometry(0.17, 20, 14);
  for (const i of [1, 4, 7]) {
    const f = shadowed(new THREE.Mesh(ball, kit.mat(APRICOT, 0.4)));
    f.position.x = bars[i].position.x;
    f.userData.bar = i;
    flags.push(f);
    g.add(f);
  }
  kit.ticks.push((t) => {
    for (let i = 0; i < N; i += 1) {
      // A voice: a slow swell with quicker ripples on it, tallest in the
      // middle of the row.
      const shape = 0.55 + 0.45 * Math.sin((i / (N - 1)) * Math.PI);
      const level = 0.5 + 0.28 * Math.sin(t * 2.1 + i * 0.9) + 0.22 * Math.sin(t * 5.3 + i * 2.3);
      bars[i].scale.y = 0.35 + 3.1 * shape * Math.max(0.05, level);
    }
    for (const f of flags) f.position.y = 0.2 + bars[f.userData.bar as number].scale.y + 0.42;
  });
  wallOf(kit, g, -3.4, 3.4, 0, 0.7);
  return g;
}

/** A wall of three targets with darts in them. */
function targets(kit: Kit, site: Site): THREE.Group {
  const g = standing(site.prop, { x: site.zone.x - site.prop.x, z: site.zone.z - site.prop.z });
  const wall = kit.box(6.8, 3.6, 0.45, kit.mat("#3f162d", 0.85));
  wall.position.y = 1.8;
  g.add(wall);
  const cap = kit.box(6.96, 0.14, 0.6, kit.mat(PINK, 0.5));
  cap.position.y = 3.67;
  g.add(cap);
  const face = new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.6 });
  const rim = kit.mat(WHITE, 0.6);
  const disc = new THREE.CylinderGeometry(0.95, 0.95, 0.14, 48);
  disc.rotateX(Math.PI / 2);
  const shaft = new THREE.CylinderGeometry(0.06, 0.06, 0.8, 10);
  shaft.rotateX(Math.PI / 2);
  const tip = new THREE.SphereGeometry(0.11, 14, 10);
  const spots: [number, number][] = [[-2.15, 2.3], [0, 1.45], [2.15, 2.3]];
  const darts: [number, number, number, number][] = [
    [-2.4, 2.55, 0.25, -0.2], [-1.85, 2.0, -0.3, 0.15], [0.12, 1.5, 0.1, 0.1], [2.5, 2.1, -0.2, -0.25], [1.2, 3.1, 0.3, 0.2],
  ];
  for (const [x, y] of spots) {
    const d = shadowed(new THREE.Mesh(disc, [rim, face, rim]));
    d.position.set(x, y, 0.3);
    g.add(d);
  }
  for (const [x, y, yaw, pitch] of darts) {
    const dart = new THREE.Group();
    const s = shadowed(new THREE.Mesh(shaft, kit.mat(APRICOT, 0.5)));
    s.position.z = 0.4;
    const e = shadowed(new THREE.Mesh(tip, kit.mat(WHITE, 0.5)));
    e.position.z = 0.82;
    dart.add(s, e);
    dart.position.set(x, y, 0.36);
    dart.rotation.set(pitch, yaw, 0);
    g.add(dart);
  }
  wallOf(kit, g, -3.1, 3.1, 0, 0.55);
  return g;
}

/** A boxing ring: a raised floor, four posts, three ropes a side. */
function ring(kit: Kit, site: Site): THREE.Group {
  const g = standing(site.prop, { x: site.zone.x - site.prop.x, z: site.zone.z - site.prop.z });
  const HALF = 2.6;
  const apron = kit.box(HALF * 2, 0.6, HALF * 2, kit.mat("#3f162d", 0.85));
  apron.position.y = 0.3;
  g.add(apron);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 - 0.1, HALF * 2 - 0.1), new THREE.MeshStandardMaterial({ map: ringFloorTexture(), roughness: 0.9 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.605;
  top.receiveShadow = true;
  g.add(top);
  const post = new THREE.CylinderGeometry(0.15, 0.15, 2.3, 16);
  const pad = new THREE.BoxGeometry(0.42, 1.5, 0.42);
  const P = HALF - 0.25;
  [[-P, -P], [P, -P], [P, P], [-P, P]].forEach(([x, z], i) => {
    const p = shadowed(new THREE.Mesh(post, kit.mat(WHITE, 0.5)));
    p.position.set(x, 0.6 + 1.15, z);
    g.add(p);
    // Two corners one colour, two the other, as a ring has.
    const c = shadowed(new THREE.Mesh(pad, kit.mat(i % 2 ? APRICOT : ROSE, 0.6)));
    c.position.set(x * 0.97, 0.6 + 1.35, z * 0.97);
    c.rotation.y = Math.PI / 4;
    g.add(c);
  });
  const rope = new THREE.CylinderGeometry(0.045, 0.045, P * 2, 8);
  rope.rotateZ(Math.PI / 2);
  for (const y of [1.25, 1.75, 2.25]) {
    for (let side = 0; side < 4; side += 1) {
      const r = shadowed(new THREE.Mesh(rope, kit.mat(PINK, 0.5)));
      const holder = new THREE.Group();
      holder.rotation.y = (side * Math.PI) / 2;
      r.position.set(0, y + 0.0, P);
      holder.add(r);
      g.add(holder);
    }
  }
  // A square as five circles: one for the middle, one at each corner.
  const mid = onFloor(g, 0, 0);
  kit.fixed.push({ x: mid.x, z: mid.z, r: HALF + 0.1 });
  for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) {
    const p = onFloor(g, x, z);
    kit.fixed.push({ x: p.x, z: p.z, r: 0.85 });
  }
  return g;
}

/** A field with a route drawn on it, walled on three sides and open at
 *  the front, so the robot can drive on. A marker runs the route. */
function field(kit: Kit, site: Site): THREE.Group {
  const g = standing(site.prop, { x: site.zone.x - site.prop.x, z: site.zone.z - site.prop.z });
  const SIDE = 6.8;
  const stops: P2[] = [
    { x: -0.34, z: 0.34 }, { x: -0.3, z: -0.1 }, { x: -0.05, z: -0.34 }, { x: 0.3, z: -0.28 },
    { x: 0.34, z: 0.08 }, { x: 0.08, z: 0.1 }, { x: 0.12, z: 0.36 },
  ];
  const route = loopPath(stops, 20);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, SIDE), new THREE.MeshStandardMaterial({ map: fieldTexture(route.pts, stops), roughness: 0.95 }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.03;
  mat.receiveShadow = true;
  g.add(mat);
  const H = SIDE / 2;
  const wallMat = kit.mat(PINK, 0.6);
  const backWall = kit.box(SIDE + 0.24, 0.42, 0.12, wallMat);
  backWall.position.set(0, 0.21, -H - 0.06);
  g.add(backWall);
  for (const x of [-1, 1]) {
    const w = kit.box(0.12, 0.42, SIDE, wallMat);
    w.position.set(x * (H + 0.06), 0.21, 0);
    g.add(w);
  }
  wallOf(kit, g, -H, H, -H - 0.06, 0.22);
  for (const x of [-1, 1]) {
    const n = 24;
    for (let i = 0; i < n; i += 1) {
      const p = onFloor(g, x * (H + 0.06), -H + (SIDE * i) / (n - 1));
      kit.fixed.push({ x: p.x, z: p.z, r: 0.22 });
    }
  }
  // The marker: a small block with a nose, following the drawn route.
  const runner = new THREE.Group();
  const hull = kit.box(0.62, 0.24, 0.5, kit.mat(APRICOT, 0.5));
  hull.position.y = 0.17;
  const nose = kit.box(0.16, 0.12, 0.3, kit.mat(WHITE, 0.5));
  nose.position.set(0.36, 0.17, 0);
  runner.add(hull, nose);
  g.add(runner);
  kit.ticks.push((t) => {
    const s = ((t * 0.055) % 1) * route.n;
    const i = Math.floor(s) % route.n;
    const j = (i + 1) % route.n;
    const f = s - Math.floor(s);
    const x = route.pts[i * 2] + (route.pts[j * 2] - route.pts[i * 2]) * f;
    const z = route.pts[i * 2 + 1] + (route.pts[j * 2 + 1] - route.pts[i * 2 + 1]) * f;
    runner.position.set(x * SIDE, 0.03, z * SIDE);
    runner.rotation.y = Math.atan2(-(route.pts[j * 2 + 1] - route.pts[i * 2 + 1]), route.pts[j * 2] - route.pts[i * 2]);
  });
  return g;
}

/** A ringed planet on a stand, turning, with two small moons. */
function planet(kit: Kit, site: Site): THREE.Group {
  const g = standing(site.prop, { x: site.zone.x - site.prop.x, z: site.zone.z - site.prop.z });
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.3, 40), kit.mat("#2a0d1e", 0.9)));
  base.position.y = 0.15;
  g.add(base);
  const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 12), kit.mat(WHITE, 0.5)));
  pole.position.y = 1.5;
  g.add(pole);
  const tilt = new THREE.Group();
  tilt.position.y = 3.9;
  tilt.rotation.set(0.42, 0, 0.2);
  g.add(tilt);
  const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.45, 48, 32), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.8 })));
  tilt.add(ball);
  const rings = new THREE.Mesh(
    new THREE.RingGeometry(1.95, 3.1, 96, 1),
    new THREE.MeshStandardMaterial({ map: ringsTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.08 }),
  );
  rings.rotation.x = -Math.PI / 2;
  rings.castShadow = true;
  rings.receiveShadow = true;
  tilt.add(rings);
  const moonGeo = new THREE.SphereGeometry(0.2, 20, 14);
  const moons = [kit.mat(WHITE, 0.6), kit.mat(APRICOT, 0.6)].map((m) => shadowed(new THREE.Mesh(moonGeo, m)));
  for (const m of moons) tilt.add(m);
  kit.ticks.push((t) => {
    ball.rotation.y = t * 0.22;
    moons[0].position.set(Math.cos(t * 0.5) * 3.7, 0.15, Math.sin(t * 0.5) * 3.7);
    moons[1].position.set(Math.cos(-t * 0.33 + 2) * 4.3, -0.2, Math.sin(-t * 0.33 + 2) * 4.3);
  });
  const p = onFloor(g, 0, 0);
  kit.fixed.push({ x: p.x, z: p.z, r: 1.15 });
  return g;
}

/** Two posts and a beam with "Write to me" on it, and arrows on the floor
 *  leading out to it. */
function gate(kit: Kit): THREE.Object3D[] {
  const inward = { x: -GATE.out.x, z: -GATE.out.z };
  const g = standing(GATE.at, inward);
  const half = GATE.width / 2 + 0.3;
  // Low enough that the words on the beam are in view from the lane.
  const TALL = 3.3;
  for (const x of [-half, half]) {
    const post = kit.box(0.6, TALL, 0.6, kit.mat("#3f162d", 0.85));
    post.position.set(x, TALL / 2, 0);
    g.add(post);
    const foot = kit.box(1.0, 0.2, 1.0, kit.mat("#2a0d1e", 0.9));
    foot.position.set(x, 0.1, 0);
    g.add(foot);
    const p = onFloor(g, x, 0);
    kit.fixed.push({ x: p.x, z: p.z, r: 0.55 });
  }
  const beam = kit.box(half * 2 + 0.6, 1.25, 0.6, kit.mat("#3f162d", 0.85));
  beam.position.y = TALL + 0.62;
  g.add(beam);
  const cap = kit.box(half * 2 + 0.76, 0.14, 0.76, kit.mat(PINK, 0.5));
  cap.position.y = TALL + 1.32;
  g.add(cap);
  const words = letters(["Write to me"], half * 2 - 0.4, 0.72, 0.16);
  for (const turn of [0, Math.PI]) {
    const face = new THREE.Group();
    face.rotation.y = turn;
    const w = shadowed(new THREE.Mesh(words.geo, kit.mat(PINK, 0.45, 0.55)));
    w.position.set(0, TALL + 0.62 - words.size / 2, 0.3);
    face.add(w);
    g.add(face);
  }
  const map = laneTexture();
  const LONG = 12;
  map.repeat.set(1, LONG / 2);
  const lane = painted(map, 2, LONG, { x: GATE.at.x + inward.x * (LONG / 2 + 1), z: GATE.at.z + inward.z * (LONG / 2 + 1) }, GATE.out);
  return [g, lane];
}

/** A skill group's name on the floor beside its pucks, to be read from
 *  the loop. */
export function groupWord(word: string, fonts: Fonts, at: P2, up: P2): THREE.Mesh {
  const { map, aspect } = wordTexture(word, fonts);
  const h = 0.62;
  return painted(map, h * aspect, h, at, up);
}

export function buildSites(fonts: Fonts): Built {
  const kit = makeKit();
  const root = new THREE.Group();
  const props = [meter, targets, ring, field, planet];
  SITES.forEach((site, i) => {
    const s = slab(kit, site, i, fonts);
    root.add(s, s.userData.floor as THREE.Mesh, props[i](kit, site));
  });
  for (const part of gate(kit)) root.add(part);
  const ticks = kit.ticks;
  return {
    root,
    fixed: kit.fixed,
    tick: (t) => {
      for (const f of ticks) f(t);
    },
  };
}
