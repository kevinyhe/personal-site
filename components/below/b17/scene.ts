import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CanvasSource } from "@/components/valley/barShader";
import { skillGroups } from "@/components/profile";
import { atlasRect, type Card, makeCards, makeLampAtlas } from "./cards";
import {
  BIG_H,
  FAR,
  FOV,
  GATE_H,
  GATE_W,
  GATE_Z,
  HALL,
  LAMP_H,
  LAMP_LIFT,
  LAMP_W,
  LANTERN_X,
  LANTERN_Z,
  lampX,
  NEAR,
  PAGODA,
  type Pose,
  RACK_STEP,
  RACK_X0,
  RACK_Z,
  rackRowY,
  SIDES,
  SMALL_H,
  SMALL_LANTERNS,
  TREES,
  WINDOW_AT,
} from "./path";
import {
  CARD_FRAG,
  FLAT_FRAG,
  FLAT_VERT,
  LAMP_FRAG,
  LAMP_VERT,
  LIGHTS,
  PATH_FRAG,
  PETAL_FRAG,
  PETAL_VERT,
  SHADE_FRAG,
  SHADE_VERT,
  SKY_FRAG,
  SKY_VERT,
  SOLID_FRAG,
  VERT,
} from "./shaders";

/**
 * The night approach, drawn off screen in greys and handed to the bar
 * shader as a canvas source. It knows nothing about the page: each frame
 * it is told where the camera is and how lit each lantern is.
 *
 * The render is small on purpose. The bar shader samples one texel per
 * cell and there are about 260 cells across, so three texels a cell is
 * plenty and the whole scene costs little.
 */

export type View = {
  pose: Pose;
  /** 0..1 per project lantern. */
  lit: readonly number[];
  /** 0..1 per skill row. */
  rows: readonly number[];
  time: number;
};

export type Night = {
  source: CanvasSource;
  resize(aspect: number): void;
  draw(view: View): void;
  dispose(): void;
};

const RENDER_W = 780;

/** A seeded generator, so the trees are the same on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gives a geometry a constant `shade` and drops what the merge does not need. */
function shaded(geo: THREE.BufferGeometry, value: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  const n = g.getAttribute("position").count;
  g.setAttribute("shade", new THREE.Float32BufferAttribute(new Array<number>(n).fill(value), 1));
  return g;
}

export function buildNight(
  canvas: HTMLCanvasElement,
  opts: { animated: boolean; sansFamily: string; update?: (time: number, dt: number) => void },
): Night {
  // The context is asked for here, not by three, so a browser without one
  // fails before anything is built and the page keeps its words.
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    // The bar shader copies this canvas after the frame is drawn.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("b17: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  try {
    return assemble(renderer, canvas, opts);
  } catch (error) {
    // Half a scene is no scene: hand the context back and let the page fall back.
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function assemble(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  opts: { animated: boolean; sansFamily: string; update?: (time: number, dt: number) => void },
): Night {
  // An off-screen buffer of a fixed small size; the screen's pixel ratio
  // does not apply to it.
  renderer.setPixelRatio(1);
  // The greys are written straight out: no colour conversion, no tone curve.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(0.08, 0.08, 0.08), 1);

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(t: T): T => {
    owned.push(t);
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  camera.rotation.order = "YXZ";

  // One set of light uniforms, shared by every material.
  const common = {
    uLights: { value: Array.from({ length: LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uRadii: { value: new Array<number>(LIGHTS).fill(1) },
    uSmall: { value: 0.85 },
    uCam: { value: new THREE.Vector3() },
  };
  const mat = (vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform> = {}, side: THREE.Side = THREE.FrontSide) =>
    keep(new THREE.ShaderMaterial({ uniforms: { ...common, ...extra }, vertexShader, fragmentShader, side }));
  const solid = (base: number, side: THREE.Side = THREE.FrontSide) => mat(VERT, SOLID_FRAG, { uBase: { value: base } }, side);

  // ---------------------------------------------------------------- sky
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(300, 24, 12)),
    keep(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const moon = new THREE.Mesh(
    keep(new THREE.CircleGeometry(9, 40)),
    keep(new THREE.ShaderMaterial({ vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG, uniforms: { uTone: { value: 0.92 } } })),
  );
  moon.position.set(-70, 90, -250);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // ------------------------------------------------------------- ground
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(600, 600)), solid(0.075));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const pathLen = 16 - (RACK_Z - 4);
  const path = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.8, pathLen)), mat(VERT, PATH_FRAG));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 16 - pathLen / 2);
  scene.add(path);

  // -------------------------------------------------- the shrine's cards
  const cards = makeCards();
  for (const c of [cards.torii, cards.lantern, cards.hall, cards.pagoda]) if (c) keep(c.texture);
  const cardMat = (card: Card, win: number) => mat(VERT, CARD_FRAG, { uMap: { value: card.texture }, uWin: { value: win } }, THREE.DoubleSide);
  /** A plane standing on the ground, its foot at y = 0. */
  const cardGeo = (w: number, h: number) => {
    const g = keep(new THREE.PlaneGeometry(w, h));
    g.translate(0, h / 2, 0);
    return g;
  };

  if (cards.torii) {
    const m = cardMat(cards.torii, 0);
    const g = cardGeo(GATE_W, GATE_H);
    for (const z of GATE_Z) {
      const gate = new THREE.Mesh(g, m);
      gate.position.set(0, 0, z);
      scene.add(gate);
    }
  }

  // The lanterns turn to face the camera each frame.
  const facing: THREE.Mesh[] = [];
  const projectWin: { value: number }[] = [];
  if (cards.lantern) {
    const aspect = cards.lantern.aspect;
    const smallGeo = cardGeo(SMALL_H * aspect, SMALL_H);
    const smallMat = cardMat(cards.lantern, 0.85);
    for (const at of SMALL_LANTERNS) {
      const l = new THREE.Mesh(smallGeo, smallMat);
      l.position.set(at.x, 0, at.z);
      scene.add(l);
      facing.push(l);
    }
    const bigGeo = cardGeo(BIG_H * aspect, BIG_H);
    LANTERN_Z.forEach((z, k) => {
      const m = cardMat(cards.lantern as Card, 0.22);
      projectWin.push(m.uniforms.uWin as { value: number });
      const l = new THREE.Mesh(bigGeo, m);
      l.position.set(SIDES[k] * LANTERN_X, 0, z);
      scene.add(l);
      facing.push(l);
    });
  }

  if (cards.hall) {
    const hall = new THREE.Mesh(cardGeo(HALL.h * cards.hall.aspect, HALL.h), cardMat(cards.hall, 0));
    hall.position.set(0, 0, HALL.z);
    scene.add(hall);
  }
  if (cards.pagoda) {
    const pagoda = new THREE.Mesh(cardGeo(PAGODA.h * cards.pagoda.aspect, PAGODA.h), cardMat(cards.pagoda, 0));
    pagoda.position.set(PAGODA.x, 0, PAGODA.z);
    pagoda.rotation.y = 0.25;
    scene.add(pagoda);
  }

  // -------------------------------------------------------------- trees
  // A trunk, two limbs, and a crown of lumpy blossom clumps. All the trees
  // are one geometry, drawn in one call.
  {
    const parts: THREE.BufferGeometry[] = [];
    const m4 = new THREE.Matrix4();
    for (const t of TREES) {
      const r = rng(t.seed);
      const trunk = new THREE.CylinderGeometry(0.16, 0.3, t.h, 7);
      trunk.translate(t.x, t.h / 2, t.z);
      parts.push(shaded(trunk, 0.12));
      for (const side of [-1, 1]) {
        const limb = new THREE.CylinderGeometry(0.07, 0.13, t.r * 0.9, 5);
        limb.translate(0, (t.r * 0.9) / 2, 0);
        m4.makeRotationZ(side * (0.6 + r() * 0.3));
        limb.applyMatrix4(m4);
        limb.translate(t.x, t.h * 0.85, t.z);
        parts.push(shaded(limb, 0.12));
      }
      const clumps = 7 + Math.floor(r() * 4);
      for (let i = 0; i < clumps; i += 1) {
        const a = r() * Math.PI * 2;
        const d = r() * t.r * 0.62;
        const size = t.r * (0.42 + r() * 0.3);
        const clump = new THREE.IcosahedronGeometry(size, 1);
        const pos = clump.getAttribute("position");
        for (let v = 0; v < pos.count; v += 1) {
          const k = 0.82 + r() * 0.3;
          pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * 0.78, pos.getZ(v) * k);
        }
        clump.computeVertexNormals();
        clump.translate(t.x + Math.cos(a) * d, t.h + t.r * 0.45 + (r() - 0.3) * t.r * 0.5, t.z + Math.sin(a) * d);
        parts.push(shaded(clump, 0.3 + r() * 0.16));
      }
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (merged) {
      keep(merged);
      scene.add(new THREE.Mesh(merged, mat(SHADE_VERT, SHADE_FRAG)));
    }
  }

  // ------------------------------------------------- shelves and lamps
  const rows = skillGroups.map((g) => g.skills.length);
  const rackLeft = RACK_X0 - 0.2;
  const rackRight = RACK_X0 + RACK_STEP * Math.max(...rows) + 0.2;
  const rackMid = (rackLeft + rackRight) / 2;
  const rackW = rackRight - rackLeft;
  const woodMat = solid(0.26);
  {
    const boards: THREE.BufferGeometry[] = [];
    rows.forEach((_, r) => {
      const b = new THREE.BoxGeometry(rackW, 0.06, 0.45);
      b.translate(rackMid, rackRowY(r), RACK_Z);
      boards.push(b);
    });
    const top = rackRowY(0) + 0.55;
    for (const x of [rackLeft, rackMid, rackRight]) {
      const post = new THREE.BoxGeometry(0.12, top, 0.12);
      post.translate(x, top / 2, RACK_Z - 0.18);
      boards.push(post);
    }
    const lintel = new THREE.BoxGeometry(rackW + 0.9, 0.16, 0.6);
    lintel.translate(rackMid, top + 0.08, RACK_Z - 0.1);
    boards.push(lintel);
    const merged = mergeGeometries(boards, false);
    for (const b of boards) b.dispose();
    if (merged) scene.add(new THREE.Mesh(keep(merged), woodMat));
  }
  const rowLit = { value: new Array<number>(5).fill(0) };
  const atlas = keep(makeLampAtlas(skillGroups, opts.sansFamily));
  {
    const bodies: THREE.BufferGeometry[] = [];
    const faces: THREE.BufferGeometry[] = [];
    let i = 0;
    skillGroups.forEach((g, r) => {
      g.skills.forEach((_, col) => {
        const x = lampX(col);
        const y = rackRowY(r) + LAMP_LIFT;
        const body = new THREE.BoxGeometry(LAMP_W, LAMP_H, 0.26);
        body.translate(x, y, RACK_Z);
        bodies.push(body);
        const face = new THREE.PlaneGeometry(LAMP_W * 0.86, LAMP_H * 0.86);
        const [u0, v0, u1, v1] = atlasRect(i);
        const uv = face.getAttribute("uv");
        for (let v = 0; v < uv.count; v += 1) {
          uv.setXY(v, uv.getX(v) < 0.5 ? u0 : u1, uv.getY(v) < 0.5 ? v0 : v1);
        }
        face.translate(x, y, RACK_Z + 0.135);
        face.setAttribute("aRow", new THREE.Float32BufferAttribute(new Array<number>(uv.count).fill(r), 1));
        faces.push(face);
        i += 1;
      });
    });
    const body = mergeGeometries(bodies, false);
    const face = mergeGeometries(faces, false);
    for (const b of [...bodies, ...faces]) b.dispose();
    if (body) scene.add(new THREE.Mesh(keep(body), solid(0.2)));
    if (face) {
      const m = keep(
        new THREE.ShaderMaterial({
          uniforms: { ...common, uAtlas: { value: atlas }, uRows: rowLit },
          vertexShader: LAMP_VERT,
          fragmentShader: LAMP_FRAG,
        }),
      );
      scene.add(new THREE.Mesh(keep(face), m));
    }
  }

  // ------------------------------------------------------------- petals
  const petalUniforms = {
    uTime: { value: 0 },
    uCentre: { value: new THREE.Vector3() },
    uSize: { value: 40 },
  };
  {
    const r = rng(417);
    const n = 360;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (r() - 0.5) * 18;
      pos[i * 3 + 1] = r() * 8;
      pos[i * 3 + 2] = (r() - 0.5) * 28;
      phase[i] = r() * Math.PI * 2;
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    const petals = new THREE.Points(g, keep(new THREE.ShaderMaterial({ uniforms: petalUniforms, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG })));
    petals.frustumCulled = false;
    scene.add(petals);
  }

  // ------------------------------------------------------------ drawing
  let renderH = Math.round(RENDER_W / 1.85);
  const resize = (aspect: number): void => {
    const a = Math.max(0.4, Math.min(4, aspect || 1.85));
    renderH = Math.max(2, Math.round(RENDER_W / a));
    renderer.setSize(RENDER_W, renderH, false);
    camera.aspect = a;
    camera.updateProjectionMatrix();
    // A petal 0.1 m across, in render pixels at one metre.
    petalUniforms.uSize.value = (0.1 * renderH) / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
  };
  resize(1.85);

  const forward = new THREE.Vector3();
  let disposed = false;
  const draw = (view: View): void => {
    if (disposed) return;
    const { pose } = view;
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    camera.updateMatrixWorld();
    common.uCam.value.copy(camera.position);
    sky.position.copy(camera.position);

    LANTERN_Z.forEach((z, k) => {
      const lit = view.lit[k] ?? 0;
      common.uLights.value[k].set(SIDES[k] * LANTERN_X, BIG_H * WINDOW_AT, z, 1.3 * lit);
      common.uRadii.value[k] = 0.5 + 3.3 * lit;
      if (projectWin[k]) projectWin[k].value = 0.22 + 0.78 * lit;
    });
    // The shelves' own glow, as the lamps come on.
    const rowsLit = view.rows.reduce((a, b) => a + b, 0) / 5;
    common.uLights.value[5].set(rackMid, rackRowY(2), RACK_Z + 0.9, 0.9 * rowsLit);
    common.uRadii.value[5] = 0.8 + 2.6 * rowsLit;
    for (let r = 0; r < 5; r += 1) rowLit.value[r] = view.rows[r] ?? 0;

    for (const l of facing) l.rotation.y = Math.atan2(camera.position.x - l.position.x, camera.position.z - l.position.z);

    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    petalUniforms.uCentre.value.set(camera.position.x + forward.x * 11, 3.5, camera.position.z + forward.z * 11);
    petalUniforms.uTime.value = view.time;

    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const t of owned) t.dispose();
    renderer.dispose();
    // Contexts are few; give this one back now.
    renderer.forceContextLoss();
  };

  const source: CanvasSource = {
    canvas,
    animated: opts.animated,
    ready: Promise.resolve(),
    update: opts.update
      ? (time, dt) => {
          opts.update?.(time, dt);
          return true;
        }
      : undefined,
    // The page disposes the scene itself; the engine must not do it twice.
  };

  return { source, resize, draw, dispose };
}
