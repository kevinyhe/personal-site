import * as THREE from "three";
import { projects, skillGroups } from "@/components/profile";
import type { CanvasSource } from "@/components/valley/barShader";
import { fbm2, makeRng } from "@/components/valley/sources/noise";
import { makePaper } from "./paper";
import { BIG_H, FAR, FOV, GROUND_SIZE, groundLamp, GROUP_X, GROUP_Z, LAMP_STEP, lanternRadius, MOON, NEAR, type Pose, SMALL_H, TAN_HALF } from "./path";
import {
  BIG_FRAG,
  BIG_VERT,
  LAND_FRAG,
  LAND_VERT,
  LANTERN_FRAG,
  LANTERN_VERT,
  MOON_FRAG,
  MOON_VERT,
  SKY_FRAG,
  SKY_VERT,
} from "./shaders";

/**
 * The lantern night, drawn off screen in greys and handed to the bar
 * shader as a canvas source. It knows nothing about the page: each frame
 * it is told where the camera is, where the five project lanterns are and
 * how lit things are.
 *
 * The render is small on purpose. The bar shader samples one texel per
 * cell and there are 300 cells across, so three texels a cell is plenty.
 */

export type Big = { x: number; y: number; z: number; lit: number };

export type View = {
  pose: Pose;
  time: number;
  bigs: readonly Big[];
  /** 0..1 per skill group: how lit its ground lanterns are. */
  rows: readonly number[];
  /** Field lanterns below this height are hidden. */
  floor: number;
  /** The cursor on the stage, -1..1 each way, y up; push 0..1 is how much it pushes. */
  pointer: { x: number; y: number; push: number };
};

export type Night = {
  source: CanvasSource;
  resize(aspect: number): void;
  draw(view: View): void;
  repaint(fonts: { serif: string; sans: string }): void;
  dispose(): void;
};

const RENDER_W = 900;
/** How many lanterns rise, and the height of the band they wrap in round the camera. */
const FIELD = 640;
const BAND = 45;

/** The valley floor is flat inside this box; hills rise outside it. */
const FLOOR = { x: 38, zNear: 25, zFar: -60 };

function landHeight(x: number, z: number): number {
  const dx = Math.max(Math.abs(x) - FLOOR.x, 0);
  const dz = Math.max(FLOOR.zFar - z, z - FLOOR.zNear, 0);
  const d = Math.hypot(dx, dz);
  const s1 = Math.min(1, d / 50);
  const near = s1 * s1 * (3 - 2 * s1) * (12 + 34 * fbm2(x * 0.011, z * 0.011, 4, 2601));
  const s2 = Math.max(0, Math.min(1, (d - 90) / 170));
  const far = s2 * s2 * (3 - 2 * s2) * 55 * fbm2(x * 0.004 + 3.1, z * 0.004, 3, 2602);
  return near + far;
}

/** A paper lantern, open at both ends, of the given height, centred on the origin. */
function lanternGeometry(h: number, segments: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    pts.push(new THREE.Vector2(lanternRadius(u) * h, (u - 0.5) * h));
  }
  return new THREE.LatheGeometry(pts, segments);
}

export function buildNight(canvas: HTMLCanvasElement, opts: { animated: boolean; fonts: { serif: string; sans: string }; update?: (time: number, dt: number) => void }): Night {
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
  if (!gl) throw new Error("b26: no WebGL2 context");
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
  opts: { animated: boolean; fonts: { serif: string; sans: string }; update?: (time: number, dt: number) => void },
): Night {
  // A fixed small buffer; the screen's pixel ratio does not apply to it.
  renderer.setPixelRatio(1);
  // The greys are written straight out: no colour conversion, no tone curve.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(0.1, 0.1, 0.1), 1);

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(t: T): T => {
    owned.push(t);
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  camera.rotation.order = "YXZ";

  // ---------------------------------------------------------------- sky
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(600, 24, 12)),
    keep(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const moon = new THREE.Mesh(keep(new THREE.CircleGeometry(MOON.r, 48)), keep(new THREE.ShaderMaterial({ vertexShader: MOON_VERT, fragmentShader: MOON_FRAG })));
  moon.position.set(MOON.x, MOON.y, MOON.z);
  scene.add(moon);

  // --------------------------------------------------------------- land
  const pools = Array.from({ length: 5 }, (_, r) => {
    const n = skillGroups[r]?.skills.length ?? 1;
    // x, z, half-length of the group along z, strength.
    return new THREE.Vector4(GROUP_X[r], GROUP_Z, (n * LAMP_STEP) / 2 + 1, 0);
  });
  const landUniforms = {
    uCam: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3(MOON.x, MOON.y, MOON.z + 100).normalize() },
    uPools: { value: pools },
  };
  {
    const g = keep(new THREE.PlaneGeometry(560, 560, 170, 170));
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -170);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i += 1) pos.setY(i, landHeight(pos.getX(i), pos.getZ(i)));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, keep(new THREE.ShaderMaterial({ uniforms: landUniforms, vertexShader: LAND_VERT, fragmentShader: LAND_FRAG }))));
  }

  // ------------------------------------------------------ small lanterns
  const small = keep(lanternGeometry(SMALL_H, 10));
  const lanternUniforms = (band: number, rows: number[]) => ({
    uTime: { value: 0 },
    uCamY: { value: 0 },
    uBand: { value: band },
    uFloor: { value: -1000 },
    uGround: { value: 0 },
    uDrift: { value: 1 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uPush: { value: 0 },
    uAspect: { value: 1.85 },
    uTanHalf: { value: TAN_HALF },
    uRows: { value: rows },
  });
  const makeInstances = (base: Float32Array, misc: Float32Array, uniforms: Record<string, THREE.IUniform>): THREE.Mesh => {
    const g = keep(new THREE.InstancedBufferGeometry());
    g.index = small.index;
    g.setAttribute("position", small.getAttribute("position"));
    g.setAttribute("normal", small.getAttribute("normal"));
    g.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
    g.setAttribute("aMisc", new THREE.InstancedBufferAttribute(misc, 4));
    g.instanceCount = base.length / 3;
    const m = new THREE.Mesh(g, keep(new THREE.ShaderMaterial({ uniforms, vertexShader: LANTERN_VERT, fragmentShader: LANTERN_FRAG, side: THREE.DoubleSide })));
    // The shader moves every lantern, so three's bounds are meaningless.
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };

  // The field: spread wider with distance so it fills the view, and never
  // nearer than 18 m, so it stays behind the project lanterns.
  const fieldU = lanternUniforms(BAND, [1, 1, 1, 1, 1, 0.95]);
  {
    const r = makeRng(2626);
    const base = new Float32Array(FIELD * 3);
    const misc = new Float32Array(FIELD * 4);
    for (let i = 0; i < FIELD; i += 1) {
      const z = -18 - Math.pow(r(), 0.75) * 100;
      const half = -z * TAN_HALF * 1.85 * 1.15 + 4;
      base[i * 3] = (r() * 2 - 1) * half;
      base[i * 3 + 1] = r() * 2 * BAND;
      base[i * 3 + 2] = z;
      misc[i * 4] = 0.22 + r() * 0.3;
      misc[i * 4 + 1] = r() * Math.PI * 2;
      misc[i * 4 + 2] = 0.8 + r() * 0.45;
      misc[i * 4 + 3] = 5;
    }
    makeInstances(base, misc, fieldU);
  }

  // The ground groups: one per skill group, standing still.
  const groundRows = [0.3, 0.3, 0.3, 0.3, 0.3, 0];
  const groundU = lanternUniforms(1000, groundRows);
  groundU.uFloor.value = -1000;
  groundU.uGround.value = -1000;
  groundU.uDrift.value = 0;
  {
    const total = skillGroups.reduce((n, g) => n + g.skills.length, 0);
    const base = new Float32Array(total * 3);
    const misc = new Float32Array(total * 4);
    const r = makeRng(4242);
    let i = 0;
    skillGroups.forEach((g, row) => {
      g.skills.forEach((_, j) => {
        const p = groundLamp(row, j, g.skills.length);
        base.set([p.x, p.y, p.z], i * 3);
        misc.set([0, r() * Math.PI * 2, GROUND_SIZE, row], i * 4);
        i += 1;
      });
    });
    makeInstances(base, misc, groundU);
  }

  // ---------------------------------------------------- project lanterns
  const bigGeo = keep(lanternGeometry(BIG_H, 40));
  const bigs = projects.map((p) => {
    const paper = makePaper(p.title, opts.fonts);
    keep(paper.texture);
    const glow = { value: 0.5 };
    const mesh = new THREE.Mesh(
      bigGeo,
      keep(new THREE.ShaderMaterial({ uniforms: { uPaper: { value: paper.texture }, uGlow: glow }, vertexShader: BIG_VERT, fragmentShader: BIG_FRAG, side: THREE.DoubleSide })),
    );
    scene.add(mesh);
    return { mesh, glow, paper };
  });

  // ------------------------------------------------------------ drawing
  let renderH = Math.round(RENDER_W / 1.85);
  let aspectNow = 1.85;
  const resize = (aspect: number): void => {
    aspectNow = Math.max(0.4, Math.min(4, aspect || 1.85));
    renderH = Math.max(2, Math.round(RENDER_W / aspectNow));
    renderer.setSize(RENDER_W, renderH, false);
    camera.aspect = aspectNow;
    camera.updateProjectionMatrix();
    fieldU.uAspect.value = aspectNow;
    groundU.uAspect.value = aspectNow;
  };
  resize(1.85);

  let disposed = false;
  const draw = (view: View): void => {
    if (disposed) return;
    const { pose, time } = view;
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    moon.lookAt(camera.position);
    landUniforms.uCam.value.copy(camera.position);

    for (const u of [fieldU, groundU]) {
      u.uTime.value = time;
      u.uCamY.value = pose.y;
    }
    fieldU.uFloor.value = view.floor;
    fieldU.uPointer.value.set(view.pointer.x, view.pointer.y);
    fieldU.uPush.value = view.pointer.push;
    for (let r = 0; r < 5; r += 1) {
      const lit = view.rows[r] ?? 0;
      groundRows[r] = 0.3 + 0.7 * lit;
      pools[r].w = lit;
    }

    bigs.forEach((b, k) => {
      const at = view.bigs[k];
      if (!at) return;
      b.mesh.position.set(at.x, at.y + 0.1 * Math.sin(time * 0.6 + k * 1.7), at.z);
      // u = 0.5, where the name is, faces the camera.
      b.mesh.rotation.set(0, Math.atan2(camera.position.x - at.x, camera.position.z - at.z) - Math.PI, 0.035 * Math.sin(time * 0.7 + k));
      b.glow.value = 0.4 + 0.6 * at.lit;
    });

    renderer.render(scene, camera);
  };

  const repaint = (fonts: { serif: string; sans: string }): void => {
    if (disposed) return;
    for (const b of bigs) b.paper.repaint(fonts);
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

  return { source, resize, draw, repaint, dispose };
}
