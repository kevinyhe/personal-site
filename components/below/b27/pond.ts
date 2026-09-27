import * as THREE from "three";
import type { CanvasSource } from "@/components/valley/barShader";
import { skillGroups } from "@/components/profile";
import {
  CONTACT_AT,
  DOMAIN,
  eyeOf,
  FAR,
  FOV,
  KOI,
  KOI_Y,
  koiAt,
  LANTERN_SCATTER,
  LANTERN_Y,
  NEAR,
  PADS,
  type Pose,
  ringSpot,
  rng,
  SIM_H,
  SIM_W,
  SMALL_PADS,
} from "./layout";
import {
  Bag,
  buildBlaster,
  buildFloor,
  buildGlove,
  buildKoiGeometry,
  buildLantern,
  buildMicrophone,
  buildPad,
  buildRingedStone,
  buildRobot,
  buildStone,
  lambert,
  lanternAtlas,
  lanternParts,
  objectMaterials,
  padTexture,
  REFL_RECT,
  reflectionTexture,
} from "./pieces";
import { KOI_FRAG, KOI_VERT, PETAL_FRAG, PETAL_VERT, QUAD_VERT, SIM_FRAG, WATER_FRAG, WORLD_VERT } from "./shaders";

/**
 * The pond, drawn off screen in greys and handed to the bar shader as a
 * canvas source. Each frame: one step of the ripple simulation, then the
 * koi and the floor into a picture of their own, then the water (which
 * bends that picture by the ripples), the pads, the petals and the
 * lanterns on top. It knows nothing about the page: it is told where the
 * camera is and what to show.
 *
 * The render is small on purpose. The bar shader samples one texel per
 * cell and there are about 240 cells across.
 */

export type View = {
  pose: Pose;
  time: number;
  /** 0 lanterns drifting, 1 in their rings. */
  gather: number;
  /** The contact stone's height above the water, or null when it is not in the air. */
  stoneY: number | null;
};

export type Pond = {
  source: CanvasSource;
  resize(aspect: number): void;
  /** One ripple step. */
  step(): void;
  draw(view: View): void;
  /** A soft bump in the water at world (x, z). */
  drop(x: number, z: number, strength: number, radius: number): void;
  /** A stroke of the cursor from one world point to another. */
  stroke(ax: number, az: number, bx: number, bz: number, strength: number): void;
  readonly ripples: boolean;
  dispose(): void;
};

const RENDER_W = 960;
/** How much of the wave survives each step. */
const DAMP = 0.988;

export function buildPond(canvas: HTMLCanvasElement, opts: { animated: boolean; monoFamily: string; update?: (time: number, dt: number) => void }): Pond {
  // The context is asked for here, before three.js sees the canvas, so a
  // browser without WebGL 2 throws now and the page keeps its words.
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("b27: no WebGL2 context");
  // The ripples need a float target. Without one the water lies still and
  // everything else draws as usual.
  const floatOk = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  try {
    return assemble(renderer, canvas, floatOk, opts);
  } catch (error) {
    renderer.dispose();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw error;
  }
}

function assemble(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  floatOk: boolean,
  opts: { animated: boolean; monoFamily: string; update?: (time: number, dt: number) => void },
): Pond {
  const bag = new Bag();
  renderer.setPixelRatio(1);
  // Greys go out exactly as written: no colour conversion anywhere.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const domain = new THREE.Vector4(DOMAIN.x0, DOMAIN.z0, DOMAIN.w, DOMAIN.d);
  const texel = new THREE.Vector2(1 / SIM_W, 1 / SIM_H);

  // --- Ripple simulation: two targets, read one, write the other.
  const simTargets = floatOk
    ? [0, 1].map(() =>
        bag.add(
          new THREE.WebGLRenderTarget(SIM_W, SIM_H, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false,
          }),
        ),
      )
    : [];
  const flat = bag.add(new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));
  flat.needsUpdate = true;
  let simRead = 0;
  const heightTex = (): THREE.Texture => (floatOk ? simTargets[simRead].texture : flat);

  const simUniforms = {
    uPrev: { value: null as THREE.Texture | null },
    uTexel: { value: texel },
    uDamp: { value: DAMP },
    uDomain: { value: domain },
    uSeg: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSegStrength: { value: 0 },
    uSegRadius: { value: 0.3 },
  };
  const simScene = new THREE.Scene();
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const simQuad = new THREE.Mesh(
    bag.add(new THREE.PlaneGeometry(2, 2)),
    bag.add(new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SIM_FRAG, uniforms: simUniforms, depthTest: false, depthWrite: false })),
  );
  simQuad.frustumCulled = false;
  simScene.add(simQuad);
  if (floatOk) {
    for (const t of simTargets) {
      renderer.setRenderTarget(t);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
  }

  // Impulses wait here for the next step. A stone beats a cursor stroke.
  type Impulse = { seg: [number, number, number, number]; strength: number; radius: number };
  let pendingDrop: Impulse | null = null;
  let pendingStroke: Impulse | null = null;

  // --- The picture under the water.
  const underScene = new THREE.Scene();
  underScene.add(buildFloor(bag));
  const koiGeo = buildKoiGeometry(bag);
  const koiR = rng(77);
  const koi = KOI.map((k, i) => {
    const mat = bag.add(
      new THREE.ShaderMaterial({
        vertexShader: KOI_VERT,
        fragmentShader: KOI_FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: koiR() * 6.28 },
          uBend: { value: 0 },
          uLen: { value: 1 },
          uSeed: { value: k.seed },
          uKind: { value: i % 5 === 3 ? 2 : i % 3 === 1 ? 1 : 0 },
        },
      }),
    );
    const m = new THREE.Mesh(koiGeo, mat);
    m.scale.setScalar(k.len);
    m.frustumCulled = false;
    underScene.add(m);
    return { k, m, mat };
  });
  let underTarget = bag.add(new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true }));

  // --- The surface.
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-3, 10, -4);
  scene.add(sun);

  const reflTex = reflectionTexture(bag);
  const waterUniforms = {
    uHeight: { value: heightTex() },
    uUnder: { value: underTarget.texture as THREE.Texture },
    uRefl: { value: reflTex as THREE.Texture },
    uDomain: { value: domain },
    uTexel: { value: texel },
    uRes: { value: new THREE.Vector2(2, 2) },
    uReflRect: { value: new THREE.Vector4(REFL_RECT.x0, REFL_RECT.z0, REFL_RECT.w, REFL_RECT.d) },
    uCam: { value: new THREE.Vector2() },
    uTime: { value: 0 },
  };
  const waterGeo = bag.add(new THREE.PlaneGeometry(DOMAIN.w, DOMAIN.d));
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, bag.add(new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: WATER_FRAG, uniforms: waterUniforms })));
  water.position.set(DOMAIN.x0 + DOMAIN.w / 2, 0, DOMAIN.z0 + DOMAIN.d / 2);
  water.renderOrder = -1;
  scene.add(water);

  // Pads: five with a project's object each, and small ones round them.
  const padMat = bag.add(new THREE.MeshLambertMaterial({ map: padTexture(bag), emissive: new THREE.Color().setScalar(0.06) }));
  const mats = objectMaterials(bag);
  const builders = [buildMicrophone, buildBlaster, buildGlove, buildRobot, buildRingedStone];
  const pads: { g: THREE.Group; x: number; z: number; phase: number; yaw: number }[] = [];
  const padR = rng(303);
  PADS.forEach((p, k) => {
    const g = new THREE.Group();
    const pad = buildPad(bag, p.r, padMat);
    pad.rotation.y = padR() * Math.PI * 2;
    const thing = builders[k](bag, mats);
    thing.position.y = 0.02;
    g.add(pad, thing);
    g.position.set(p.x, 0.02, p.z);
    scene.add(g);
    pads.push({ g, x: p.x, z: p.z, phase: padR() * 6.28, yaw: 0 });
  });
  for (const p of SMALL_PADS) {
    const g = new THREE.Group();
    const pad = buildPad(bag, p.r, padMat);
    g.add(pad);
    const yaw = padR() * Math.PI * 2;
    g.rotation.y = yaw;
    g.position.set(p.x, 0.015, p.z);
    scene.add(g);
    pads.push({ g, x: p.x, z: p.z, phase: padR() * 6.28, yaw });
  }

  // Petals: drifts of them, each drift a loose cluster.
  const PETALS = 760;
  const seeds = new Float32Array(PETALS * 4);
  const pr = rng(808);
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < PETALS; i += 1) {
    if (i % 19 === 0) {
      cx = DOMAIN.x0 + pr() * DOMAIN.w;
      cz = DOMAIN.z0 + 1 + pr() * (DOMAIN.d - 2);
    }
    const a = pr() * Math.PI * 2;
    const d = Math.sqrt(pr()) * 1.6;
    seeds[i * 4] = cx + Math.cos(a) * d * 1.6;
    seeds[i * 4 + 1] = cz + Math.sin(a) * d;
    seeds[i * 4 + 2] = pr() * Math.PI * 2;
    seeds[i * 4 + 3] = pr() * 100;
  }
  const petalBase = bag.add(new THREE.PlaneGeometry(1.6, 1));
  const petalGeo = bag.add(new THREE.InstancedBufferGeometry());
  petalGeo.index = petalBase.index;
  petalGeo.setAttribute("position", petalBase.getAttribute("position"));
  petalGeo.setAttribute("uv", petalBase.getAttribute("uv"));
  petalGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  petalGeo.instanceCount = PETALS;
  const petalUniforms = {
    uHeight: { value: heightTex() },
    uDomain: { value: domain },
    uTexel: { value: texel },
    uTime: { value: 0 },
  };
  const petals = new THREE.Mesh(petalGeo, bag.add(new THREE.ShaderMaterial({ vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, uniforms: petalUniforms, side: THREE.DoubleSide })));
  petals.frustumCulled = false;
  scene.add(petals);

  // Lanterns, one per skill, in the skills' order.
  const atlas = lanternAtlas(bag, opts.monoFamily);
  const parts = lanternParts(bag, atlas);
  const lanterns: { g: THREE.Group; group: number; j: number; n: number }[] = [];
  let li = 0;
  skillGroups.forEach((grp, gi) => {
    grp.skills.forEach((_, j) => {
      const g = buildLantern(bag, li, parts);
      scene.add(g);
      lanterns.push({ g, group: gi, j, n: grp.skills.length });
      li += 1;
    });
  });

  const stone = buildStone(bag);
  stone.visible = false;
  scene.add(stone);
  // A dark spot on the water under the falling stone.
  const shadow = new THREE.Mesh(bag.add(new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2)), lambert(bag, 0.03, 0.0));
  shadow.visible = false;
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, NEAR, FAR);
  let aspect = 16 / 9;

  const resize = (a: number): void => {
    aspect = a;
    const w = RENDER_W;
    const h = Math.max(2, Math.round(RENDER_W / a));
    renderer.setSize(w, h, false);
    if (underTarget.width !== w || underTarget.height !== h) {
      underTarget.dispose();
      underTarget = bag.add(new THREE.WebGLRenderTarget(w, h, { depthBuffer: true }));
      waterUniforms.uUnder.value = underTarget.texture;
    }
    waterUniforms.uRes.value.set(w, h);
    camera.aspect = a;
    camera.updateProjectionMatrix();
  };

  const step = (): void => {
    if (!floatOk) return;
    const imp = pendingDrop ?? pendingStroke;
    if (imp === pendingDrop) pendingDrop = null;
    else pendingStroke = null;
    const u = simUniforms;
    if (imp) {
      u.uSeg.value.set(imp.seg[0], imp.seg[1], imp.seg[2], imp.seg[3]);
      u.uSegStrength.value = imp.strength;
      u.uSegRadius.value = imp.radius;
    } else {
      u.uSegStrength.value = 0;
    }
    u.uPrev.value = simTargets[simRead].texture;
    const write = 1 - simRead;
    renderer.setRenderTarget(simTargets[write]);
    renderer.render(simScene, simCam);
    renderer.setRenderTarget(null);
    simRead = write;
  };

  const draw = (view: View): void => {
    const t = view.time;
    const eye = eyeOf(view.pose);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(view.pose.x, 0, view.pose.z);
    camera.updateMatrixWorld();

    for (const { k, m, mat } of koi) {
      const at = koiAt(k, t);
      m.position.set(at.x, KOI_Y, at.z);
      m.rotation.y = -at.heading;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uBend.value = Math.max(-1.2, Math.min(1.2, at.turn * k.len));
    }

    for (const p of pads) {
      // A slow bob and a slight turn, as if the water breathes under them.
      p.g.position.y = 0.02 + 0.012 * Math.sin(t * 0.7 + p.phase);
      p.g.rotation.y = p.yaw + 0.04 * Math.sin(t * 0.23 + p.phase);
    }

    const gth = Math.max(0, Math.min(1, view.gather));
    for (let i = 0; i < lanterns.length; i += 1) {
      const L = lanterns[i];
      const sc = LANTERN_SCATTER[i];
      const fx = sc.x + 0.5 * Math.sin(t * 0.11 + sc.phase);
      const fz = sc.z + 0.35 * Math.cos(t * 0.09 + sc.phase * 1.3);
      const ring = ringSpot(L.group, L.j, L.n, aspect);
      L.g.position.set(fx + (ring.x - fx) * gth, LANTERN_Y - 0.3 + 0.015 * Math.sin(t * 0.8 + sc.phase), fz + (ring.z - fz) * gth);
      L.g.rotation.y = (1 - gth) * Math.sin(t * 0.07 + sc.phase) * 1.2;
    }

    if (view.stoneY !== null && view.stoneY > 0) {
      stone.visible = true;
      stone.position.set(CONTACT_AT.x, view.stoneY, CONTACT_AT.z);
      stone.rotation.set(t * 1.3, t * 0.7, 0);
      // A dark spot on the water under the stone grows as it nears.
      shadow.visible = true;
      shadow.position.set(CONTACT_AT.x, 0.01, CONTACT_AT.z);
      shadow.scale.setScalar(0.6 + 0.4 * Math.max(0, 1 - view.stoneY / 5));
    } else {
      stone.visible = false;
      shadow.visible = false;
    }

    const h = heightTex();
    waterUniforms.uHeight.value = h;
    petalUniforms.uHeight.value = h;
    waterUniforms.uCam.value.set(view.pose.x, view.pose.z);
    waterUniforms.uTime.value = t;
    petalUniforms.uTime.value = t;

    renderer.setRenderTarget(underTarget);
    renderer.render(underScene, camera);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
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
      : () => false,
  };

  return {
    source,
    resize,
    step,
    draw,
    drop(x, z, strength, radius) {
      pendingDrop = { seg: [x, z, x, z], strength, radius };
    },
    stroke(ax, az, bx, bz, strength) {
      pendingStroke = { seg: [ax, az, bx, bz], strength, radius: 0.22 };
    },
    ripples: floatOk,
    dispose() {
      scene.clear();
      underScene.clear();
      simScene.clear();
      bag.dispose();
      renderer.dispose();
      renderer.getContext().getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
