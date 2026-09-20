import * as THREE from "three";
import { ATLAS_COLS, drawAtlas, SKILL_CELL0, SKILLS } from "./atlas";
import * as L from "./layout";
import { PETAL_FRAG, PETAL_VERT, RIBBON_FRAG, RIBBON_VERT } from "./shaders";

/**
 * The picture, drawn in grey on black into a canvas that is never shown.
 * The page hands that canvas to the bar dither, which is what the visitor
 * sees. This file knows nothing about the page: each frame it is told how
 * far the page has scrolled and how old each burst of petals is.
 */

export type SceneInput = {
  u: number;
  time: number;
  leanX: number;
  leanY: number;
  /** Seconds since each project's stroke finished (index 5 is the email's), or below 0 if it has not. */
  ages: readonly number[];
};

export type BrushScene = {
  resize(width: number, height: number, aspect: number): void;
  render(input: SceneInput): void;
  redrawAtlas(sansFamily: string): void;
  camera: THREE.PerspectiveCamera;
  /** The ribbons as laid out now, for the dev handle's boxes. */
  work(): readonly L.Ribbon[];
  skills(): readonly L.Ribbon[];
  contact(): L.Ribbon | null;
  dispose(): void;
};

const WORK_PETALS = 34;
const CONTACT_PETALS = 24;

type Stroke = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; ribbon: L.Ribbon | null };

function makeStroke(seed: number, order: number): Stroke {
  const mat = new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    uniforms: { uDraw: { value: 0 }, uLevel: { value: 1 }, uLen: { value: 1 }, uSeed: { value: seed } },
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.visible = false;
  return { mesh, mat, ribbon: null };
}

function setRibbon(s: Stroke, r: L.Ribbon): void {
  s.mesh.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(r.positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(r.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(r.index, 1));
  s.mesh.geometry = geo;
  s.mat.uniforms.uLen.value = r.length;
  s.ribbon = r;
}

type Petals = { mesh: THREE.InstancedMesh; cell: THREE.InstancedBufferAttribute; level: THREE.InstancedBufferAttribute };

function makePetals(count: number, mat: THREE.ShaderMaterial, order: number): Petals {
  const geo = new THREE.PlaneGeometry(1, 1);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const level = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  cell.setUsage(THREE.DynamicDrawUsage);
  level.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aCell", cell);
  geo.setAttribute("aLevel", level);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return { mesh, cell, level };
}

/**
 * still: the five project strokes side by side, painted, with their
 * petals held in the air. Nothing moves and nothing scrolls.
 */
export function buildScene(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, sansFamily: string, still: boolean): BrushScene {
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  // This canvas is a source for the dither, not what is shown, and its
  // size is set in pixels by resize(); the dither canvas has the 1.5 cap.
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  // Grey in, grey out: no colour conversion on the way.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, 1.85, L.NEAR, L.FAR);
  L.placeCamera(camera, 1.85);

  const atlasCanvas = document.createElement("canvas");
  drawAtlas(atlasCanvas, sansFamily);
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.anisotropy = 4;

  const petalMat = new THREE.ShaderMaterial({
    vertexShader: PETAL_VERT,
    fragmentShader: PETAL_FRAG,
    uniforms: { uAtlas: { value: atlas }, uCols: { value: ATLAS_COLS } },
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Three layers that scroll on their own, as the page's three sections do.
  const workGroup = new THREE.Group();
  const skillGroup = new THREE.Group();
  const contactGroup = new THREE.Group();
  scene.add(workGroup, skillGroup, contactGroup);

  const work = L.GESTURES.map((g, k) => makeStroke(g.seed, 1 + k));
  const skills = Array.from({ length: L.GROUPS }, (_, c) => makeStroke(L.SKILL_GESTURE.seed + c * 1.7, 10));
  const contact = makeStroke(L.CONTACT_GESTURE.seed, 11);
  for (const s of work) workGroup.add(s.mesh);
  for (const s of skills) skillGroup.add(s.mesh);
  contactGroup.add(contact.mesh);

  const workPetals = makePetals(L.WORK * WORK_PETALS, petalMat, 20);
  const blossoms = makePetals(SKILLS.length, petalMat, 21);
  const contactPetals = makePetals(CONTACT_PETALS, petalMat, 20);
  workGroup.add(workPetals.mesh);
  skillGroup.add(blossoms.mesh);
  contactGroup.add(contactPetals.mesh);
  SKILLS.forEach((_, i) => blossoms.cell.setX(i, SKILL_CELL0 + i));
  blossoms.cell.needsUpdate = true;

  let workSpecs: L.PetalSpec[][] = [];
  /** Where each skills stroke ends: its cluster grows from there. */
  const ends = Array.from({ length: L.GROUPS }, () => new THREE.Vector3());
  let contactSpecs: L.PetalSpec[] = [];
  let aspect = 1.85;

  const layOut = (): void => {
    work.forEach((s, k) => {
      const r = still ? L.buildRibbon(L.GESTURES[k], L.stillBox(k), aspect, "contain") : L.buildRibbon(L.GESTURES[k], L.workBox(k), aspect);
      setRibbon(s, r);
    });
    // In the still frame the strokes are about a third of their size, and so are their petals.
    const scale = still ? 0.45 : 1;
    workSpecs = work.map((s, k) => (s.ribbon ? L.petalSpecs(s.ribbon, WORK_PETALS, 101 + k * 17, scale) : []));
    workSpecs.forEach((list, k) => list.forEach((p, j) => workPetals.cell.setX(k * WORK_PETALS + j, p.variant)));
    workPetals.cell.needsUpdate = true;
    skills.forEach((s, c) => {
      const r = L.buildRibbon(L.SKILL_GESTURE, L.skillBox(c), aspect);
      setRibbon(s, r);
      r.curve.getPointAt(1, ends[c]);
    });
    const cr = L.buildRibbon(L.CONTACT_GESTURE, L.CONTACT_BOX, aspect);
    setRibbon(contact, cr);
    // Only the end of the underline blooms: petals from along it would fall across the links.
    contactSpecs = L.petalSpecs(cr, CONTACT_PETALS, 777, 0.7).map((p) => {
      const end = cr.curve.getPointAt(1);
      return { ...p, ox: end.x, oy: end.y, oz: end.z, delay: p.delay * 0.4 };
    });
    contactSpecs.forEach((p, j) => contactPetals.cell.setX(j, p.variant));
    contactPetals.cell.needsUpdate = true;
  };
  layOut();

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scl = new THREE.Vector3();
  const pose: L.PetalPose = { x: 0, y: 0, z: 0, rx: 0, rz: 0, size: 0, level: 0 };

  const placePetals = (p: Petals, specs: readonly L.PetalSpec[], base: number, age: number, frozen: boolean): void => {
    for (let j = 0; j < specs.length; j += 1) {
      const i = base + j;
      if (age < 0) {
        p.level.setX(i, 0);
        m.makeScale(0, 0, 0);
        p.mesh.setMatrixAt(i, m);
        continue;
      }
      L.petalAt(specs[j], age, pose, frozen);
      pos.set(pose.x, pose.y, pose.z);
      euler.set(pose.rx, 0, pose.rz);
      quat.setFromEuler(euler);
      scl.set(pose.size, pose.size, pose.size);
      m.compose(pos, quat, scl);
      p.mesh.setMatrixAt(i, m);
      p.level.setX(i, pose.level);
    }
  };

  const render = (f: SceneInput): void => {
    const tl = L.timeline(f.u);
    L.placeCamera(camera, aspect, f.leanX, f.leanY);

    if (still) {
      work.forEach((s) => {
        s.mat.uniforms.uDraw.value = 1;
        s.mat.uniforms.uLevel.value = 1;
        s.mesh.visible = true;
      });
      workSpecs.forEach((list, k) => placePetals(workPetals, list, k * WORK_PETALS, 1.4, true));
      workPetals.mesh.instanceMatrix.needsUpdate = true;
      workPetals.level.needsUpdate = true;
      skillGroup.visible = false;
      contactGroup.visible = false;
      renderer.render(scene, camera);
      return;
    }

    // Work: each stroke paints, then lifts up the page and back into it.
    workGroup.position.y = 2 * tl.workShift;
    workGroup.visible = tl.workShift < 1.15;
    work.forEach((s, k) => {
      const g = tl.ghost[k];
      const level = L.ghostLevel(g);
      const [gx, gy, gz] = L.ghostOffset(g);
      s.mesh.position.set(gx, gy, gz);
      s.mat.uniforms.uDraw.value = tl.draw[k];
      s.mat.uniforms.uLevel.value = level;
      s.mesh.visible = tl.draw[k] > 0.001 && level > 0.003;
    });
    workSpecs.forEach((list, k) => placePetals(workPetals, list, k * WORK_PETALS, f.ages[k] ?? -1, false));
    workPetals.mesh.instanceMatrix.needsUpdate = true;
    workPetals.level.needsUpdate = true;

    // Skills: five short strokes, each ending in its cluster of blossoms.
    skillGroup.position.y = -2 * tl.skillShift;
    skillGroup.visible = Math.abs(tl.skillShift) < 1.15;
    if (skillGroup.visible) {
      skills.forEach((s, c) => {
        s.mat.uniforms.uDraw.value = tl.skillDraw[c];
        s.mesh.visible = tl.skillDraw[c] > 0.001;
      });
      const inGroup = new Array<number>(L.GROUPS).fill(0);
      SKILLS.forEach((skill, i) => {
        const c = skill.group;
        const j = inGroup[c]++;
        const [dx, dy] = L.clusterOffset(j);
        // They open one after another, from the middle out.
        const open = L.smooth(j * 0.05, 0.5 + j * 0.05, tl.bloom[c]);
        const grow = open * (1 + 0.12 * Math.sin(open * Math.PI));
        const size = L.BLOSSOM_SIZE * grow;
        const sway = f.time * 0.6 + i * 1.3;
        pos.set(ends[c].x + dx * open, ends[c].y + dy * open, ends[c].z + 0.02 * j);
        euler.set(0.22 * Math.sin(sway), 0.22 * Math.sin(sway * 0.8 + 1), (1 - open) * 1.2);
        quat.setFromEuler(euler);
        scl.set(size, size, size);
        m.compose(pos, quat, scl);
        blossoms.mesh.setMatrixAt(i, m);
        blossoms.level.setX(i, open > 0.01 ? 0.95 : 0);
      });
      blossoms.mesh.instanceMatrix.needsUpdate = true;
      blossoms.level.needsUpdate = true;
    }

    // Contact: the long underline, with a few petals where it lifts.
    contactGroup.position.y = -2 * tl.contactShift;
    contactGroup.visible = tl.contactShift < 1.15;
    contact.mat.uniforms.uDraw.value = tl.contactDraw;
    contact.mesh.visible = tl.contactDraw > 0.001;
    placePetals(contactPetals, contactSpecs, 0, f.ages[5] ?? -1, false);
    contactPetals.mesh.instanceMatrix.needsUpdate = true;
    contactPetals.level.needsUpdate = true;

    renderer.render(scene, camera);
  };

  return {
    camera,
    resize(width: number, height: number, a: number): void {
      renderer.setSize(width, height, false);
      if (Math.abs(a - aspect) > 1e-4) {
        aspect = a;
        layOut();
      }
    },
    render,
    redrawAtlas(family: string): void {
      drawAtlas(atlasCanvas, family);
      atlas.needsUpdate = true;
    },
    work: () => work.map((s) => s.ribbon).filter((r): r is L.Ribbon => r !== null),
    skills: () => skills.map((s) => s.ribbon).filter((r): r is L.Ribbon => r !== null),
    contact: () => contact.ribbon,
    dispose(): void {
      for (const s of [...work, ...skills, contact]) {
        s.mesh.geometry.dispose();
        s.mat.dispose();
      }
      for (const p of [workPetals, blossoms, contactPetals]) {
        p.mesh.geometry.dispose();
        p.mesh.dispose();
      }
      petalMat.dispose();
      atlas.dispose();
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
