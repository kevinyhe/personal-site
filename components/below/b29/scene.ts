import * as THREE from "three";
import { type BranchWindUniforms, createSakuraBlossomGeometry, WeepingCherryGenerator } from "@/components/BareThreeCanvas";
import { gustEnvelope, seededRandom } from "@/components/petalGlyphs";
import * as L from "./layout";
import { buildHill, buildLantern, buildPlaques, flakeGeometry, type Kit, LANTERN_FIRE_Y, leafGeometry, lcg, petalGeometry } from "./objects";
import { BLOSSOMS, TREE_SEED } from "./tuning";

/**
 * The tree on its hill, drawn by three.js into a canvas that is never
 * shown. The bar dither (createBarCanvas) reads that canvas each frame and
 * redraws it as the valley's vertical bars. This file knows nothing about
 * the page: it is handed the scroll, the season, the camera and the
 * cursor, and draws.
 *
 * The tree is the site's own generator, the hero's whole cherry. The
 * seasons are what it carries: bare wood and snow, its own blossoms
 * opening (the generator's growth value), leaves set where the blossoms
 * were, leaves turning pale and falling, and bare wood again.
 */

export type SceneFrame = {
  u: number;
  time: number;
  dt: number;
  pose: L.Pose;
  look: L.Look;
  night: number;
  /** Cursor, -1..1 across the stage, smoothed by the caller. */
  pointerX: number;
  pointerY: number;
  /** How fast the cursor is moving, 0..1. It stirs the branches. */
  stir: number;
  /** Nothing moving: one frame. */
  still: boolean;
  /** The skill blossom under the cursor, or -1. */
  hover: number;
  /** How open the skill blossoms are. */
  skills: number;
};

export type Scene = {
  canvas: HTMLCanvasElement;
  setSize(cssW: number, cssH: number): void;
  render(f: SceneFrame): void;
  /** A world point to shares of the stage (x from the left, y from the top). Writes into out. */
  toScreen(p: L.V3 | THREE.Vector3, out: { x: number; y: number; z: number }): void;
  skillCount: number;
  /** Skill blossom k where it is now, with the tree's sway. */
  skillWorld(k: number, out: THREE.Vector3): THREE.Vector3;
  plaqueWorld(i: number, out: THREE.Vector3): THREE.Vector3;
  built(): boolean;
  dispose(): void;
};

/** Longest side of the hidden canvas. The bars are about 240 across, so a few texels a bar is plenty. */
const SOURCE_MAX_W = 1280;
const SOURCE_SHARE = 0.5;
const PETALS = 260;
const LEAVES_FALLING = 240;
const FLAKES = 900;
const LEAF_SIZE = 0.3;
const PETAL_SIZE = 0.26;

const pause = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/** Frees every geometry, material and texture under a node. Shared ones are freed once. */
function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const m = mesh.material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const maps = mat as unknown as Record<string, unknown>;
      for (const key of ["map", "bumpMap", "roughnessMap", "emissiveMap"]) {
        const t = maps[key];
        if (t instanceof THREE.Texture && !seen.has(t)) {
          seen.add(t);
          t.dispose();
        }
      }
      mat.dispose();
    }
  });
}

/** Loose things in the air: born at a point, falling and turning, gone after a while. */
class Fallers {
  mesh: THREE.InstancedMesh;
  private pos: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private life: Float32Array;
  private phase: Float32Array;
  private fall: Float32Array;
  private next = 0;
  private carry = 0;
  private live = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private count: number,
    private size: number,
    private rand: () => number,
    private speed: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    this.spin = new Float32Array(count * 3);
    this.life = new Float32Array(count).fill(-1);
    this.phase = new Float32Array(count);
    this.fall = new Float32Array(count);
    for (let k = 0; k < count; k += 1) this.mesh.setMatrixAt(k, this.zero);
  }

  spawn(x: number, y: number, z: number, age = 0): void {
    const k = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[k * 3] = x;
    this.pos[k * 3 + 1] = y;
    this.pos[k * 3 + 2] = z;
    for (let n = 0; n < 3; n += 1) {
      this.rot[k * 3 + n] = this.rand() * Math.PI * 2;
      this.spin[k * 3 + n] = (this.rand() - 0.5) * 3;
    }
    this.life[k] = age;
    this.phase[k] = this.rand() * 20;
    this.fall[k] = this.speed * (0.7 + this.rand() * 0.6);
  }

  /** Spawn `rate` a second from `from`, then move everything. */
  step(dt: number, time: number, rate: number, gust: number, from: () => L.V3 | null): void {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const p = from();
      if (p) this.spawn(p[0], p[1], p[2]);
    }
    if (rate <= 0) this.carry = 0;
    let live = 0;
    const windX = 0.3 + 2.4 * gust;
    for (let k = 0; k < this.count; k += 1) {
      if (this.life[k] < 0) continue;
      live += 1;
      this.life[k] += dt;
      const ph = this.phase[k];
      this.pos[k * 3] += (windX + 0.35 * Math.sin(time * 1.3 + ph)) * dt;
      this.pos[k * 3 + 1] -= (this.fall[k] + 0.2 * Math.sin(time * 2.1 + ph * 1.7)) * dt;
      this.pos[k * 3 + 2] += 0.3 * Math.sin(time * 0.9 + ph) * dt;
      for (let n = 0; n < 3; n += 1) this.rot[k * 3 + n] += this.spin[k * 3 + n] * dt * (1 + gust);
      const r = Math.hypot(this.pos[k * 3], this.pos[k * 3 + 2]);
      // Gone once it reaches the ground, or after a while.
      if (this.life[k] > 16 || this.pos[k * 3 + 1] < L.hillY(r)) {
        this.life[k] = -1;
        this.mesh.setMatrixAt(k, this.zero);
        continue;
      }
      this.write(k, Math.min(1, this.life[k] * 2.5));
    }
    // Nothing alive and nothing was: the matrices are all zero already.
    if (live > 0 || this.live > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.live = live;
  }

  private write(k: number, grow: number): void {
    this.e.set(this.rot[k * 3], this.rot[k * 3 + 1], this.rot[k * 3 + 2]);
    this.q.setFromEuler(this.e);
    this.v.set(this.pos[k * 3], this.pos[k * 3 + 1], this.pos[k * 3 + 2]);
    this.s.setScalar(grow * this.size);
    this.m.compose(this.v, this.q, this.s);
    this.mesh.setMatrixAt(k, this.m);
  }

  /** For the still frame: a few fixed in the air. */
  freeze(): void {
    for (let k = 0; k < this.count; k += 1) {
      if (this.life[k] >= 0) this.write(k, 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function buildScene(): Scene {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  // Asked for here, not by three, so a browser without it fails before
  // anything is built. The caller then keeps the plain page.
  const attributes: WebGLContextAttributes = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  };
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) throw new Error("b29: no WebGL2");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setPixelRatio(1);
  // Near black but not black. The dither throws away any cell next to a
  // pure black texel, which would eat every twig; this grey is dark enough
  // to draw no bar at all, and keeps the thin wood.
  renderer.setClearColor(0x0e0e0e, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, L.ASPECT, L.NEAR, L.FAR);

  // Lit to be bright. A blossom turned to the lens comes out near white,
  // which the grade turns into a full bar; bark in the key at about half.
  const hemi = new THREE.HemisphereLight("#fff4f9", "#7a5468", 1.7);
  const key = new THREE.DirectionalLight("#fff1ea", 2.4);
  key.position.set(-8, 16, 14);
  const fill = new THREE.DirectionalLight("#f9b9dc", 0.9);
  fill.position.set(10, 5, -10);
  const lamp = new THREE.PointLight("#fff0f6", 0, 0, 2);
  lamp.position.set(L.LANTERN_POS[0], L.LANTERN_POS[1] + LANTERN_FIRE_Y, L.LANTERN_POS[2]);
  scene.add(hemi, key, fill, lamp);

  const kits: Kit[] = [];
  let disposed = false;

  const hill = buildHill();
  kits.push(hill.kit);
  scene.add(hill.mesh);
  const lantern = buildLantern();
  kits.push(lantern.kit);
  scene.add(lantern.group);

  // Everything the cursor sways moves in this group, which turns about the trunk's foot.
  const sway = new THREE.Group();
  sway.name = "Tree and what hangs on it";
  scene.add(sway);

  const hanging = buildPlaques();
  kits.push(hanging.kit);
  for (const p of hanging.plaques) sway.add(p.group);

  // ------------------------------------------------------------ the tree
  let growth: { value: number } | null = null;
  let wind: BranchWindUniforms | null = null;
  let bark: THREE.MeshStandardMaterial | null = null;
  let treeGroup: THREE.Group | null = null;
  let leafMesh: THREE.InstancedMesh | null = null;
  let leafMaterial: THREE.MeshStandardMaterial | null = null;
  let leafGeo: THREE.BufferGeometry | null = null;
  let leafBase: THREE.Matrix4[] = [];
  let leafThreshold = new Float32Array(0);
  /** Where petals and leaves let go from, in the sway group's frame. */
  let blossomPoints: L.V3[] = [];
  let leafShown = -1;
  let treeBuilt = false;
  const leafMat4 = new THREE.Matrix4();
  const leafScale = new THREE.Matrix4();

  const buildTree = async (): Promise<void> => {
    const gen = new WeepingCherryGenerator({ seed: TREE_SEED, quality: "medium", blossomCount: BLOSSOMS, petalCount: 0 });
    const tree = await gen.generate(pause);
    if (disposed) {
      disposeTree(gen.group);
      return;
    }
    // generate() bakes in the hero's placement. Here the tree stands on
    // the hill's crest at its own size, as the Node check grew it.
    tree.group.position.set(0, 0, 0);
    tree.group.rotation.set(0, 0, 0);
    tree.group.scale.set(1, 1, 1);
    // The hero fades its trunk's foot into the dark with vertex colours.
    // Here the foot stands on a hill, so the fade goes.
    const colour = tree.branchMesh?.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (colour) {
      (colour.array as Float32Array).fill(1);
      colour.needsUpdate = true;
    }
    bark = (tree.branchMesh?.material as THREE.MeshStandardMaterial | undefined) ?? null;
    if (bark) {
      bark.color.setHex(0xb4a2ac);
      bark.emissive.setHex(0x4a3842);
      bark.emissiveIntensity = 0.6;
    }
    tree.blossomGrowth.value = 0;
    growth = tree.blossomGrowth;
    wind = tree.branchWindUniforms;
    treeGroup = tree.group;

    // Leaves go where the blossoms were: the same twigs, so summer's
    // crown has the spring crown's shape. One leaf a blossom.
    const rand = lcg(4242);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const base: THREE.Matrix4[] = [];
    const points: L.V3[] = [];
    for (const mesh of [tree.blossomMesh, tree.lowBlossomMesh, tree.halfBlossomMesh, tree.budMesh]) {
      if (!mesh) continue;
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        points.push([p.x, p.y, p.z]);
        // Hanging a little, turned any way round.
        e.set(Math.PI * (0.55 + rand() * 0.5), rand() * Math.PI * 2, (rand() - 0.5) * 1.2);
        q.setFromEuler(e);
        s.setScalar(LEAF_SIZE * (0.75 + rand() * 0.5));
        base.push(new THREE.Matrix4().compose(p.clone(), q.clone(), s.clone()));
      }
    }
    leafGeo = leafGeometry();
    leafMaterial = new THREE.MeshStandardMaterial({ color: "#5e5058", roughness: 0.8, metalness: 0, side: THREE.DoubleSide, emissive: new THREE.Color("#2a1c24") });
    leafMesh = new THREE.InstancedMesh(leafGeo, leafMaterial, Math.max(1, base.length));
    leafMesh.frustumCulled = false;
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    leafBase = base;
    leafThreshold = new Float32Array(base.length);
    for (let i = 0; i < base.length; i += 1) leafThreshold[i] = rand() * 0.85;
    blossomPoints = points;
    tree.group.add(leafMesh);
    sway.add(tree.group);
    treeBuilt = true;
  };
  void (async () => {
    try {
      await buildTree();
    } catch {
      // A tree that cannot be grown leaves the hill, the plaques and the words.
    }
  })();

  const setLeaves = (amount: number): void => {
    if (!leafMesh || Math.abs(amount - leafShown) < 0.004) return;
    leafShown = amount;
    for (let i = 0; i < leafBase.length; i += 1) {
      // Each leaf comes and goes at its own moment, and grows to size over a short span.
      const k = L.clamp((amount - leafThreshold[i]) / 0.15, 0, 1);
      leafScale.makeScale(k, k, k);
      leafMat4.multiplyMatrices(leafBase[i], leafScale);
      leafMesh.setMatrixAt(i, leafMat4);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    leafMesh.visible = amount > 0.001;
  };

  // ---------------------------------------------------- skill blossoms
  const skillPositions: THREE.Vector3[] = [];
  for (let g = 0; g < L.GROUP_SIZES.length; g += 1) {
    for (let k = 0; k < L.GROUP_SIZES[g]; k += 1) skillPositions.push(new THREE.Vector3(...L.skillBlossomPos(g, k)));
  }
  const skillGeometry = createSakuraBlossomGeometry(1);
  skillGeometry.computeBoundingBox();
  const sb = skillGeometry.boundingBox;
  const flowerSpan = sb ? Math.max(sb.max.x - sb.min.x, sb.max.y - sb.min.y) : 1.1;
  // Centre on the corolla, so the mark on the page sits on the flower.
  if (sb) skillGeometry.translate(0, 0, -(sb.min.z + sb.max.z) / 2);
  const skillMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffc4e2,
    emissiveIntensity: 0.5,
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const skillMesh = new THREE.InstancedMesh(skillGeometry, skillMaterial, skillPositions.length);
  skillMesh.frustumCulled = false;
  skillMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sway.add(skillMesh);
  // Each flower faces out toward the skills camera, turned a little.
  const faceOut = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(L.SKILLS_AZ), 0.1, Math.sin(L.SKILLS_AZ)).normalize());
  const skillTurn = skillPositions.map((_, k) =>
    faceOut.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12 * Math.sin(k * 1.7), 0.18 * Math.cos(k * 2.3), k * 0.9))),
  );
  const skillBase = L.SKILL_BLOSSOM_SIZE / flowerSpan;

  // ------------------------------------------------ things in the air
  const rand = seededRandom(0xb29);
  const petalGeo = petalGeometry();
  const petalMat = new THREE.MeshBasicMaterial({ color: "#fff0f7", side: THREE.DoubleSide });
  const petals = new Fallers(petalGeo, petalMat, PETALS, PETAL_SIZE, rand, 0.55);
  scene.add(petals.mesh);
  const fallGeo = leafGeometry();
  const fallMat = new THREE.MeshStandardMaterial({ color: "#f1d9e4", side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color("#5a4450") });
  const falling = new Fallers(fallGeo, fallMat, LEAVES_FALLING, LEAF_SIZE * 1.1, rand, 0.9);
  scene.add(falling.mesh);

  // Snow falls on fixed paths through a box round the tree, worked out
  // from the time, so it needs no state and never runs out.
  const flakeGeo = flakeGeometry();
  const flakeMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const flakes = new THREE.InstancedMesh(flakeGeo, flakeMat, FLAKES);
  flakes.frustumCulled = false;
  flakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(flakes);
  const flakeRand = lcg(1212);
  const flakeData = new Float32Array(FLAKES * 5);
  for (let k = 0; k < FLAKES; k += 1) {
    flakeData[k * 5] = (flakeRand() - 0.5) * 40;
    flakeData[k * 5 + 1] = (flakeRand() - 0.5) * 40;
    flakeData[k * 5 + 2] = flakeRand() * 20;
    flakeData[k * 5 + 3] = 0.55 + flakeRand() * 0.6;
    flakeData[k * 5 + 4] = 0.05 + flakeRand() * 0.05;
  }
  // A new instanced mesh starts with every copy at full size on the origin. Hide them all first.
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < FLAKES; k += 1) flakes.setMatrixAt(k, hidden);
  let flakesShown = 0;

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const noTurn = new THREE.Quaternion();

  const stepSnow = (amount: number, time: number): void => {
    const n = Math.floor(amount * FLAKES);
    if (n === 0 && flakesShown === 0) return;
    for (let k = 0; k < FLAKES; k += 1) {
      if (k >= n) {
        if (k < flakesShown) flakes.setMatrixAt(k, zero);
        continue;
      }
      const d = k * 5;
      const y = 15 - ((time * flakeData[d + 3] + flakeData[d + 2]) % 20);
      const x = flakeData[d] + 0.5 * Math.sin(time * 0.6 + k);
      const z = flakeData[d + 1] + 0.4 * Math.cos(time * 0.5 + k * 1.3);
      tmpM.compose(tmpV.set(x, y, z), noTurn, tmpS.setScalar(flakeData[d + 4]));
      flakes.setMatrixAt(k, tmpM);
    }
    flakes.instanceMatrix.needsUpdate = true;
    flakesShown = n;
  };

  const pickBlossom = (): L.V3 | null => {
    if (!blossomPoints.length) return null;
    const p = blossomPoints[Math.floor(rand() * blossomPoints.length)];
    return p;
  };
  const pickLeaf = (): L.V3 | null => {
    if (!blossomPoints.length) return null;
    // Only leaves still on the tree can fall.
    for (let tries = 0; tries < 6; tries += 1) {
      const i = Math.floor(rand() * blossomPoints.length);
      if (leafThreshold[i] < leafShown) return blossomPoints[i];
    }
    return null;
  };

  // ------------------------------------------------------------ colours
  // The bars see only brightness. The ground in its grass is dim, about a
  // third of a bar; under snow it is pale, most of a bar. Summer leaves
  // are mid-grey, half a bar, so a crown in leaf reads thinner than one in
  // blossom; autumn leaves are near white, full bars, which is how they
  // show as turned.
  const hillSummer = new THREE.Color("#4a3e44");
  const hillSnow = new THREE.Color("#d6cfd3");
  const barkBare = new THREE.Color(0xb4a2ac);
  const barkSnow = new THREE.Color(0xe2d8de);
  const leafGreen = new THREE.Color("#5e5058");
  const leafTurned = new THREE.Color("#f3dde8");

  let stillSeeded = false;

  // ---------------------------------------------------------- the frame
  const render = (f: SceneFrame): void => {
    if (disposed) return;
    const { look, time } = f;
    const gust = f.still ? 0 : L.clamp((gustEnvelope(time, 0) - 0.72) / 0.45, 0, 1);

    camera.position.set(...f.pose.pos);
    camera.lookAt(f.pose.target[0], f.pose.target[1], f.pose.target[2]);
    camera.updateMatrixWorld();

    // Night takes the daylight down and lights the lantern.
    const day = 1 - 0.72 * f.night;
    hemi.intensity = 1.7 * day;
    key.intensity = 2.4 * day;
    fill.intensity = 0.9 * day;
    lamp.intensity = 60 * f.night;
    lantern.fire.emissiveIntensity = 0.25 + 1.6 * f.night;

    // The cursor leans the tree a little, and moving it stirs the twigs.
    const beat = f.still ? 0 : 0.006 * Math.sin(time * 0.7);
    sway.rotation.set(f.pointerY * 0.012, 0, -f.pointerX * 0.022 + beat);
    const strength = f.still ? 0 : 0.3 + 0.5 * gust + 0.9 * f.stir;
    if (wind) {
      wind.uWindTime.value = f.still ? 0 : time;
      wind.uWindStrength.value = strength;
      wind.uPointerStrength.value = 0;
    }
    if (growth) growth.value = look.bloom;
    setLeaves(look.leaves);
    if (leafMaterial) leafMaterial.color.copy(leafGreen).lerp(leafTurned, look.turn);
    if (bark) bark.color.copy(barkBare).lerp(barkSnow, look.snow * 0.8);
    hill.material.color.copy(hillSummer).lerp(hillSnow, look.snow * 0.9);

    // Plaques: each hangs facing out from the trunk and turns to the camera as its project comes up.
    for (let i = 0; i < hanging.plaques.length; i += 1) {
      const p = hanging.plaques[i];
      const c = L.plaqueCentre(i);
      const out = L.plaqueAz(i);
      const toCam = Math.atan2(f.pose.pos[2] - c[2], f.pose.pos[0] - c[0]);
      const k = f.still ? 0 : L.plaqueForward(i, f.u);
      let d = toCam - out;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const face = out + d * k;
      const swing = f.still ? 0 : 0.05 * Math.sin(time * 1.1 + i * 2.1) + 0.08 * gust * Math.sin(time * 2.3 + i) + 0.1 * f.stir * Math.sin(time * 3 + i);
      // A face whose normal points along `face`: three turns +z by rotation.y.
      p.group.rotation.set(0, Math.PI / 2 - face, swing * (1 - 0.6 * k));
      p.board.rotation.set(f.still ? 0 : 0.04 * Math.sin(time * 0.8 + i), 0, 0);
    }

    // Skill blossoms: buds until the skills come up, then open one after another.
    for (let k = 0; k < skillPositions.length; k += 1) {
      const open = L.clamp(f.skills * 1.6 - (k / skillPositions.length) * 0.6, 0, 1);
      const hover = f.hover === k ? 1.35 : 1;
      const turn = f.still ? 0 : 0.08 * Math.sin(time * 1.1 + k);
      if (open <= 0) {
        skillMesh.setMatrixAt(k, zero);
        continue;
      }
      tmpS.setScalar(skillBase * (0.1 + 0.9 * open) * hover);
      tmpQ.copy(skillTurn[k]);
      tmpE.set(0, 0, turn);
      tmpQ.multiply(tmpQ2.setFromEuler(tmpE));
      tmpM.compose(skillPositions[k], tmpQ, tmpS);
      skillMesh.setMatrixAt(k, tmpM);
    }
    skillMesh.instanceMatrix.needsUpdate = true;

    if (f.still) {
      if (!stillSeeded && treeBuilt) {
        stillSeeded = true;
        for (let k = 0; k < 60; k += 1) {
          const p = pickBlossom();
          if (p) petals.spawn(p[0] + (rand() - 0.5) * 4, p[1] - rand() * 6, p[2] + (rand() - 0.5) * 4, 1);
        }
        petals.freeze();
      }
      stepSnow(look.snow, 0);
    } else {
      petals.step(f.dt, time, treeBuilt ? look.petalFall * (10 + 30 * gust + 20 * f.stir) : 0, gust, pickBlossom);
      falling.step(f.dt, time, treeBuilt ? look.leafFall * (14 + 30 * gust + 20 * f.stir) : 0, gust, pickLeaf);
      stepSnow(look.snow, time);
    }

    renderer.render(scene, camera);
  };

  const setSize = (cssW: number, cssH: number): void => {
    const w = Math.max(2, Math.min(SOURCE_MAX_W, Math.round(cssW * SOURCE_SHARE)));
    const h = Math.max(2, Math.round((w * cssH) / Math.max(1, cssW)));
    renderer.setSize(w, h, false);
    camera.aspect = cssW / Math.max(1, cssH);
    camera.updateProjectionMatrix();
  };

  const proj = new THREE.Vector3();
  const toScreen = (p: L.V3 | THREE.Vector3, out: { x: number; y: number; z: number }): void => {
    if (Array.isArray(p)) proj.set(p[0], p[1], p[2]);
    else proj.copy(p);
    proj.project(camera);
    out.x = proj.x * 0.5 + 0.5;
    out.y = 0.5 - proj.y * 0.5;
    out.z = proj.z;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (treeGroup) disposeTree(treeGroup);
    leafGeo?.dispose();
    leafMaterial?.dispose();
    for (const k of kits) k.dispose();
    skillGeometry.dispose();
    skillMaterial.dispose();
    petalGeo.dispose();
    petalMat.dispose();
    fallGeo.dispose();
    fallMat.dispose();
    flakeGeo.dispose();
    flakeMat.dispose();
    petals.mesh.dispose();
    falling.mesh.dispose();
    flakes.dispose();
    skillMesh.dispose();
    renderer.dispose();
    // A page is allowed only a few live contexts. Give this one back now.
    renderer.forceContextLoss();
  };

  return {
    canvas,
    setSize,
    render,
    toScreen,
    skillCount: skillPositions.length,
    skillWorld: (k, out) => {
      sway.updateMatrixWorld();
      return out.copy(skillPositions[k]).applyMatrix4(sway.matrixWorld);
    },
    plaqueWorld: (i, out) => {
      const p = hanging.plaques[i];
      p.board.updateMatrixWorld(true);
      return p.board.getWorldPosition(out);
    },
    built: () => treeBuilt,
    dispose,
  };
}
