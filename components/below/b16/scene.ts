import * as THREE from "three";
import { createSakuraBlossomGeometry, type Branch, type BranchWindUniforms, WeepingCherryGenerator } from "@/components/BareThreeCanvas";
import { gustEnvelope, seededRandom } from "@/components/petalGlyphs";
import { INTRO_TREE_SEED } from "@/components/treeTuning";
import * as L from "./layout";
import { buildCollar, buildHangers, buildTrunk, type Kit, petalGeometry } from "./objects";

/**
 * The tree, drawn by three.js into a canvas that is never shown. The bar
 * dither (createBarCanvas) reads that canvas each frame and redraws it as
 * the valley's vertical bars. This file knows nothing about the page: it
 * is handed the scroll, the camera and the cursor, and draws.
 *
 * The wood and blossoms are the site's own generator. Each of the five
 * branches is one generateSpray (the bough under the hero is one of
 * these), each with its own bloom value, so each opens on its own. The
 * crown is one whole generate(), the hero's tree, rooted on the trunk top.
 */

export type SceneFrame = {
  u: number;
  time: number;
  dt: number;
  pose: L.Pose;
  /** Cursor, -1..1 across the stage, smoothed by the caller. */
  pointerX: number;
  pointerY: number;
  /** Everything open, nothing moving. */
  still: boolean;
  /** The skill blossom under the cursor, or -1. */
  hover: number;
};

export type Scene = {
  canvas: HTMLCanvasElement;
  setSize(cssW: number, cssH: number): void;
  render(f: SceneFrame): void;
  /** A world point to shares of the stage (x from the left, y from the top). Writes into out. */
  toScreen(p: L.V3 | THREE.Vector3, out: { x: number; y: number; z: number }): void;
  skillCount: number;
  skillWorld(k: number): THREE.Vector3;
  branchInfo(i: number): { root: THREE.Vector3; tip: THREE.Vector3; object: THREE.Vector3; built: boolean };
  /** How many of the five branches and the crown are built. */
  progress(): { branches: number; crown: boolean };
  dispose(): void;
};

/** Longest side of the hidden canvas. The bars are about 240 across, so four texels a bar is plenty. */
const SOURCE_MAX_W = 1280;
const SOURCE_SHARE = 0.5;
const PETALS = 280;
const PETAL_SIZE = 0.3;
const BRANCH_BLOSSOMS = 240;
const CROWN_BLOSSOMS = 6200;
const BRANCH_SEED = 71104;

const pause = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

type BuiltBranch = {
  group: THREE.Group;
  growth: { value: number };
  wind: BranchWindUniforms | null;
  /** Twig tips in world space, where this branch's petals start. */
  tips: THREE.Vector3[];
  stem: Branch;
};

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
  if (!gl) throw new Error("b16: no WebGL2");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setPixelRatio(1);
  // Near black but not black. The dither throws away any cell next to a
  // pure black texel, which would eat every twig; this grey is dark enough
  // to draw no bar at all, and keeps the thin wood.
  renderer.setClearColor(0x0e0e0e, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, 1.85, L.NEAR, L.FAR);

  // Lit to be bright. A blossom turned to the lens comes out near white,
  // which the grade turns into a full bar; bark in the key at about half.
  scene.add(new THREE.HemisphereLight("#fff4f9", "#7a5468", 1.7));
  const key = new THREE.DirectionalLight("#fff1ea", 2.4);
  key.position.set(-8, 14, 16);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#f9b9dc", 0.9);
  fill.position.set(10, 4, 10);
  scene.add(fill);

  const kits: Kit[] = [];
  let disposed = false;

  // ------------------------------------------------------------ trunk
  const trunk = buildTrunk();
  kits.push(trunk.kit);
  scene.add(trunk.mesh);

  // ---------------------------------------------------------- hangers
  const hangers = buildHangers();
  kits.push(hangers.kit);
  for (const h of hangers.groups) {
    h.visible = false;
    scene.add(h);
  }

  // --------------------------------------------------------- branches
  const collarMaterial = new THREE.MeshStandardMaterial({ color: "#a8969f", roughness: 0.9, metalness: 0, emissive: new THREE.Color("#2a1c24") });
  kits.push(collarMaterial);
  const branches: (BuiltBranch | null)[] = L.BRANCHES.map(() => null);
  const branchGroups = L.BRANCHES.map((b, i) => {
    const g = new THREE.Group();
    g.name = `Branch ${i}`;
    g.position.set(...L.branchRoot(i));
    g.rotation.set(0, L.branchYaw(i), 0);
    g.scale.setScalar(L.SPRAY_SCALE);
    scene.add(g);
    return g;
  });

  const crown = new THREE.Group();
  crown.name = "Crown";
  crown.position.set(...L.CROWN_BASE);
  crown.scale.setScalar(L.CROWN_SCALE);
  scene.add(crown);
  let crownGrowth: { value: number } | null = null;
  let crownWind: BranchWindUniforms | null = null;
  let crownTips: THREE.Vector3[] = [];

  const buildBranch = async (i: number): Promise<void> => {
    const gen = new WeepingCherryGenerator({ seed: BRANCH_SEED + i * 977, quality: "medium", blossomCount: BRANCH_BLOSSOMS, petalCount: 0 });
    const tree = await gen.generateSpray(pause);
    if (disposed || !tree.branchMesh) {
      disposeTree(gen.group);
      return;
    }
    const group = branchGroups[i];
    // The generator's group stays at identity for a spray; move it whole.
    group.add(gen.group);
    const bark = tree.branchMesh.material as THREE.MeshStandardMaterial;
    // A little lighter than the trunk, since a thin stem shows fewer bars,
    // and lifted so its shadow side still keeps a hairline.
    bark.color.setHex(0xb4a2ac);
    bark.emissive.setHex(0x4a3842);
    bark.emissiveIntensity = 0.6;
    // Not the bark material: that one carries the generator's wind and
    // vertex colours, which a plain cylinder has no attributes for.
    group.add(buildCollar(collarMaterial));
    tree.blossomGrowth.value = 0;
    group.updateMatrixWorld(true);
    const tips = tree.branches
      .filter((b) => b.terminal)
      .map((b) => group.localToWorld(b.getEnd(new THREE.Vector3())));
    branches[i] = { group, growth: tree.blossomGrowth, wind: tree.branchWindUniforms, tips, stem: tree.stem };
    hangers.groups[i].visible = true;
  };

  const buildCrown = async (): Promise<void> => {
    const gen = new WeepingCherryGenerator({ seed: INTRO_TREE_SEED, quality: "medium", blossomCount: CROWN_BLOSSOMS, petalCount: 0 });
    const tree = await gen.generate(pause);
    if (disposed) {
      disposeTree(gen.group);
      return;
    }
    // generate() bakes in the hero's placement; this crown is rooted on
    // our trunk instead, so it starts from identity.
    tree.group.position.set(0, 0, 0);
    tree.group.rotation.set(0, 0.2, 0);
    tree.group.scale.set(1, 1, 1);
    // The hero fades its trunk's foot into the dark with vertex colours.
    // Here the foot joins our trunk, so the fade goes.
    const colour = tree.branchMesh?.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (colour) {
      (colour.array as Float32Array).fill(1);
      colour.needsUpdate = true;
    }
    const bark = tree.branchMesh?.material as THREE.MeshStandardMaterial | undefined;
    if (bark) {
      bark.color.setHex(0xb4a2ac);
      bark.emissive.setHex(0x4a3842);
      bark.emissiveIntensity = 0.6;
    }
    crown.add(tree.group);
    tree.blossomGrowth.value = 0;
    crownGrowth = tree.blossomGrowth;
    crownWind = tree.branchWindUniforms;
    crown.updateMatrixWorld(true);
    const terminals = tree.branches.filter((b) => b.terminal);
    const step = Math.max(1, Math.floor(terminals.length / 90));
    crownTips = [];
    for (let k = 0; k < terminals.length; k += step) crownTips.push(tree.group.localToWorld(terminals[k].getEnd(new THREE.Vector3())));
  };

  // One at a time, a breath between, lowest first: the first branch is
  // the one the reader meets.
  let built = 0;
  let crownBuilt = false;
  void (async () => {
    try {
      for (let i = 0; i < L.BRANCHES.length; i += 1) {
        if (disposed) return;
        await buildBranch(i);
        built += 1;
        await pause();
      }
      if (disposed) return;
      await buildCrown();
      crownBuilt = true;
    } catch {
      // A tree that cannot be grown leaves the trunk and the words.
    }
  })();

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
    emissiveIntensity: 0.45,
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const skillMesh = new THREE.InstancedMesh(skillGeometry, skillMaterial, skillPositions.length);
  skillMesh.frustumCulled = false;
  skillMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(skillMesh);
  const skillTurn = skillPositions.map((_, k) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12 * Math.sin(k * 1.7), 0.18 * Math.cos(k * 2.3), k * 0.9)));
  const skillBase = L.SKILL_BLOSSOM_SIZE / flowerSpan;

  // ------------------------------------------------------------ petals
  const petalGeo = petalGeometry();
  const petalMat = new THREE.MeshBasicMaterial({ color: "#fff0f7", side: THREE.DoubleSide });
  const petalMesh = new THREE.InstancedMesh(petalGeo, petalMat, PETALS);
  petalMesh.frustumCulled = false;
  petalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(petalMesh);
  const rand = seededRandom(0xb16);
  const pPos = new Float32Array(PETALS * 3);
  const pRot = new Float32Array(PETALS * 3);
  const pSpin = new Float32Array(PETALS * 3);
  const pLife = new Float32Array(PETALS).fill(-1);
  const pPhase = new Float32Array(PETALS);
  const pFall = new Float32Array(PETALS);
  let nextPetal = 0;
  const spawnCarry = new Float32Array(L.BRANCHES.length + 2);

  const spawn = (x: number, y: number, z: number): void => {
    const k = nextPetal;
    nextPetal = (nextPetal + 1) % PETALS;
    pPos[k * 3] = x;
    pPos[k * 3 + 1] = y;
    pPos[k * 3 + 2] = z;
    for (let n = 0; n < 3; n += 1) {
      pRot[k * 3 + n] = rand() * Math.PI * 2;
      pSpin[k * 3 + n] = (rand() - 0.5) * 3;
    }
    pLife[k] = 0;
    pPhase[k] = rand() * 20;
    pFall[k] = 0.45 + rand() * 0.4;
  };

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const stepPetals = (f: L.Pose, u: number, time: number, dt: number, gust: number): void => {
    const camY = f.pos[1];
    // Where petals come from this frame, and how many a second.
    const sources: { rate: number; from: (() => void) | null }[] = [];
    for (let i = 0; i < L.BRANCHES.length; i += 1) {
      const b = branches[i];
      const bloom = L.branchBloom(i, u);
      if (!b || bloom < 0.3 || Math.abs(L.BRANCHES[i].y - camY) > 12) {
        sources.push({ rate: 0, from: null });
        continue;
      }
      const near = 1 - L.smooth(0.2, 0.7, Math.abs(u - L.STOP_U[i]));
      sources.push({
        rate: bloom * (0.8 + 6 * near + 12 * gust),
        from: () => {
          const t = b.tips[Math.floor(rand() * b.tips.length)];
          if (t) spawn(t.x, t.y, t.z);
        },
      });
    }
    const cb = L.crownBloom(u);
    sources.push({
      rate: crownTips.length && cb > 0.3 && camY > 26 ? cb * (3 + 12 * gust) : 0,
      from: () => {
        const t = crownTips[Math.floor(rand() * crownTips.length)];
        if (t) spawn(t.x, t.y, t.z);
      },
    });
    const sky = L.skyAmount(u);
    sources.push({
      rate: sky * (7 + 10 * gust),
      from: () => spawn(-30 + rand() * 40, f.pos[1] + 6 + rand() * 8, -6 + rand() * 16),
    });
    for (let s = 0; s < sources.length; s += 1) {
      const src = sources[s];
      if (!src.from || src.rate <= 0) {
        spawnCarry[s] = 0;
        continue;
      }
      spawnCarry[s] += src.rate * dt;
      while (spawnCarry[s] >= 1) {
        spawnCarry[s] -= 1;
        src.from();
      }
    }

    // A gust carries them sideways across the screen; between gusts they fall and turn.
    const windX = 0.3 + 3.2 * gust;
    for (let k = 0; k < PETALS; k += 1) {
      if (pLife[k] < 0) {
        petalMesh.setMatrixAt(k, zero);
        continue;
      }
      pLife[k] += dt;
      const ph = pPhase[k];
      pPos[k * 3] += (windX + 0.35 * Math.sin(time * 1.3 + ph)) * dt;
      pPos[k * 3 + 1] -= (pFall[k] + 0.2 * Math.sin(time * 2.1 + ph * 1.7)) * dt;
      pPos[k * 3 + 2] += 0.25 * Math.sin(time * 0.9 + ph) * dt;
      for (let n = 0; n < 3; n += 1) pRot[k * 3 + n] += pSpin[k * 3 + n] * dt * (1 + gust);
      if (pLife[k] > 18 || pPos[k * 3 + 1] < camY - 16) {
        pLife[k] = -1;
        petalMesh.setMatrixAt(k, zero);
        continue;
      }
      // They come out of the blossom small and open to full size.
      const grow = Math.min(1, pLife[k] * 2.5) * PETAL_SIZE;
      tmpE.set(pRot[k * 3], pRot[k * 3 + 1], pRot[k * 3 + 2]);
      tmpQ.setFromEuler(tmpE);
      tmpV.set(pPos[k * 3], pPos[k * 3 + 1], pPos[k * 3 + 2]);
      tmpS.setScalar(grow);
      tmpM.compose(tmpV, tmpQ, tmpS);
      petalMesh.setMatrixAt(k, tmpM);
    }
    petalMesh.instanceMatrix.needsUpdate = true;
  };

  // The still frame gets a handful of petals in the air, fixed.
  let stillSeeded = false;
  const seedStill = (): void => {
    stillSeeded = true;
    for (let k = 0; k < 70; k += 1) {
      spawn(-18 + rand() * 36, 2 + rand() * 44, -4 + rand() * 10);
      pLife[(nextPetal + PETALS - 1) % PETALS] = 1;
    }
    for (let k = 0; k < PETALS; k += 1) {
      if (pLife[k] < 0) {
        petalMesh.setMatrixAt(k, zero);
        continue;
      }
      tmpE.set(pRot[k * 3], pRot[k * 3 + 1], pRot[k * 3 + 2]);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(pPos[k * 3], pPos[k * 3 + 1], pPos[k * 3 + 2]), tmpQ, tmpS.setScalar(PETAL_SIZE * 1.4));
      petalMesh.setMatrixAt(k, tmpM);
    }
    petalMesh.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------- the frame
  const hookLocal = new THREE.Vector3();
  const render = (f: SceneFrame): void => {
    if (disposed) return;
    const { u, time } = f;
    const gust = f.still ? 0 : L.clamp((gustEnvelope(time, 0) - 0.72) / 0.45, 0, 1);

    camera.position.set(...f.pose.pos);
    camera.lookAt(f.pose.target[0], f.pose.target[1], f.pose.target[2]);
    camera.updateMatrixWorld();

    const windStrength = f.still ? 0 : 0.45 + 0.55 * gust;
    for (let i = 0; i < L.BRANCHES.length; i += 1) {
      const g = branchGroups[i];
      // The cursor leans every branch a little, each on its own beat.
      const beat = f.still ? 0 : 0.012 * Math.sin(time * 0.8 + i * 1.9);
      g.rotation.set(f.pointerY * 0.035 + beat, L.branchYaw(i), -f.pointerX * 0.04 * L.BRANCHES[i].side + beat);
      const b = branches[i];
      if (b) {
        b.growth.value = f.still ? 1 : L.branchBloom(i, u);
        if (b.wind) {
          b.wind.uWindTime.value = f.still ? 0 : time;
          b.wind.uWindStrength.value = windStrength;
          b.wind.uPointerStrength.value = 0;
        }
        // The object hangs from the real stem, and swings.
        g.updateMatrixWorld(true);
        b.stem.getPoint(L.HANG_T, hookLocal);
        g.localToWorld(hookLocal);
        const h = hangers.groups[i];
        h.position.copy(hookLocal);
        const swing = f.still ? 0 : 0.07 * Math.sin(time * 1.05 + i * 2.1) + 0.12 * gust * Math.sin(time * 2.3 + i) - f.pointerX * 0.08;
        h.rotation.set(f.still ? 0 : 0.05 * Math.sin(time * 0.8 + i), (i % 2 ? -0.35 : 0.35) + (f.still ? 0 : 0.25 * Math.sin(time * 0.4 + i)), swing);
      }
    }
    if (crownGrowth) crownGrowth.value = f.still ? 1 : L.crownBloom(u);
    if (crownWind) {
      crownWind.uWindTime.value = f.still ? 0 : time;
      crownWind.uWindStrength.value = windStrength;
      crownWind.uPointerStrength.value = 0;
    }
    crown.rotation.set(0, 0, f.still ? 0 : -f.pointerX * 0.01);

    // Skill blossoms: buds until the camera is nearly at the crown, then open one after another.
    for (let k = 0; k < skillPositions.length; k += 1) {
      const open = f.still ? 1 : L.smooth(6.05 + k * 0.01, 6.45 + k * 0.01, u);
      const hover = f.hover === k ? 1.35 : 1;
      const sway = f.still ? 0 : 0.08 * Math.sin(time * 1.1 + k);
      tmpS.setScalar(skillBase * (0.08 + 0.92 * open) * hover);
      tmpQ.copy(skillTurn[k]);
      tmpE.set(0, 0, sway);
      tmpQ.multiply(tmpQ2.setFromEuler(tmpE));
      tmpM.compose(skillPositions[k], tmpQ, tmpS);
      skillMesh.setMatrixAt(k, tmpM);
    }
    skillMesh.instanceMatrix.needsUpdate = true;

    if (f.still) {
      if (!stillSeeded) seedStill();
    } else {
      stepPetals(f.pose, u, time, f.dt, gust);
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

  const branchInfo = (i: number) => {
    const b = branches[i];
    const root = new THREE.Vector3(...L.branchRoot(i));
    if (!b) {
      return { root, tip: new THREE.Vector3(...L.branchLocalToWorld(i, L.sprayStem(1))), object: new THREE.Vector3(...L.hangAnchor(i)), built: false };
    }
    const tip = b.group.localToWorld(b.stem.getEnd(new THREE.Vector3()));
    const object = hangers.groups[i].position.clone();
    object.y -= L.HANG_DROP + L.HANG_SIZE / 2;
    return { root, tip, object, built: true };
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const g of branchGroups) disposeTree(g);
    disposeTree(crown);
    for (const k of kits) k.dispose();
    skillGeometry.dispose();
    skillMaterial.dispose();
    petalGeo.dispose();
    petalMat.dispose();
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
    skillWorld: (k) => skillPositions[k],
    branchInfo,
    progress: () => ({ branches: built, crown: crownBuilt }),
    dispose,
  };
}
