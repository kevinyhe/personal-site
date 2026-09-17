/**
 * The field: points, ribbons and five panels in a dark space, and the
 * camera that travels through them.
 *
 * One number drives everything, `u` (see timeline.ts). Each frame the
 * scene measures it from the page, eases towards it, places the camera
 * and the panels, hands the shaders their uniforms, and draws. Nothing is
 * allocated inside the frame.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import {
  GROUND_FRAG,
  GROUND_VERT,
  PANEL_FRAG,
  PANEL_VERT,
  POINTS_FRAG,
  POINTS_VERT,
  RIBBON_FRAG,
  RIBBON_VERT,
} from "./shaders";
import { sampleWord, seeded, titleTexture, WORD_H, WORD_W } from "./textures";
import {
  END_AT,
  nearestPanel,
  PANEL_SIDE,
  panelFocus,
  PANELS,
  panelText,
  ringAmount,
  smoothstep,
  SPACING,
  travel,
  VIEW_DIST,
  wordState,
} from "./timeline";

/** The ground of the field, deeper than the band above it. */
export const DEEP = "#1a0812";
/** The dark the far distance sinks into. */
export const FAR = "#090306";
/** The two colours that are this design's own. */
export const ROSE = "#d8346f";
export const AMBER = "#ffb37a";

const POINTS = 180_000;
const WORD_POINTS = 104_000;
const RIBBONS = 3;
const RIBBON_STEPS = 1400;
const PANEL_W = 3.6;
const PANEL_H = 5;
const FOV = 40;
const WORD_DIST = 10;
const RING_DIST = 10;
/** Never draw more than this many pixels across, whatever the screen. */
const MAX_BUFFER_W = 2560;

export type FieldOptions = {
  /** The box the canvas fills. The canvas is made here and put in it. */
  stage: HTMLElement;
  /** The whole design. `u` is measured from its top edge. */
  root: HTMLElement;
  /** Reduced motion: one frame, the first panel, no loop. */
  still: boolean;
  fonts: { sans: string; mono: string };
  titles: { title: string; year: string }[];
  words: string[];
  /** Called once a frame with the eased `u`, for the DOM text. */
  onFrame: (u: number) => void;
  /** The GPU took the context away. The page should go back to plain. */
  onLost: () => void;
};

export type Field = { dispose: () => void };

/** How each panel hangs when nobody is looking at it. */
const REST: [number, number, number, number][] = [
  // y, then the turn about x, y and z
  [0.15, 0.05, -1.0, 0.06],
  [-0.25, -0.06, 1.05, -0.08],
  [0.3, 0.1, -0.92, -0.1],
  [0.0, 0.0, 1.1, 0.12],
  [-0.15, -0.08, -1.0, 0.05],
];

const panelPlace = (i: number): THREE.Vector3 =>
  new THREE.Vector3(PANEL_SIDE[i] * 3.05, REST[i][0], -(i * SPACING + VIEW_DIST));

/**
 * The three ribbons as one mesh: three strips of quads, each laid along a
 * smooth curve through points down the length of the travel. Each curve
 * is taken past the back of the panels it is given.
 */
function ribbonGeometry(): THREE.BufferGeometry {
  const rand = seeded(505);
  const verts = RIBBONS * RIBBON_STEPS * 2;
  const position = new Float32Array(verts * 3);
  const next = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 3);
  const index: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  for (let r = 0; r < RIBBONS; r += 1) {
    // Points every half spacing, so every other one is level with a
    // panel. Two ribbons keep a lane each, one high and one low; the
    // third stays near the middle height and out to the side.
    const pts: THREE.Vector3[] = [];
    const lane = r === 0 ? 1 : r === 1 ? -1 : 0;
    const half = SPACING / 2;
    for (let m = 4; m >= -20; m -= 1) {
      const z = -VIEW_DIST + m * half;
      const i = -m / 2;
      const atPanel = Number.isInteger(i) && i >= 0 && i < PANELS;
      // High and low enough to be off the screen until well ahead of the
      // camera, so a lane never crosses the face of the panel in front.
      const high = lane * (3.7 + rand() * 1.4) + (lane === 0 ? (rand() - 0.5) * 3 : 0);
      if (i > PANELS - 0.75) {
        // Past the last panel the middle of the screen belongs to the
        // words and the email. The ribbons run down the sides.
        // One left, one right, one under the foot of the screen.
        if (lane === 0) pts.push(new THREE.Vector3((rand() - 0.5) * 7, -(5 + rand() * 2), z));
        else pts.push(new THREE.Vector3(-lane * (7 + rand() * 3), (rand() - 0.5) * 8, z));
      } else if (!atPanel) {
        // Between two panels: anywhere.
        pts.push(new THREE.Vector3((rand() - 0.5) * 10, high, z));
      } else if (i % RIBBONS === r) {
        // This panel's own ribbon: in from beyond its outer edge, then
        // past the back of it. Never across the face.
        const p = panelPlace(i);
        const side = PANEL_SIDE[i];
        const y = p.y + lane * 1.5 + (rand() - 0.5);
        pts.push(new THREE.Vector3(p.x + side * 5.2, p.y + high * 0.5, p.z + 4));
        pts.push(new THREE.Vector3(p.x + side * 2.7, y, p.z - 1));
        pts.push(new THREE.Vector3(p.x - side * 1.2, y + lane * 0.4, p.z - 1.5));
      } else if (lane !== 0) {
        // Level with a panel that is not its own: over the text's side,
        // above or below the text.
        pts.push(new THREE.Vector3(-PANEL_SIDE[i] * (0.5 + rand() * 4.5), high, z));
      } else {
        // The third ribbon passes wide of a panel that is not its own.
        pts.push(new THREE.Vector3(PANEL_SIDE[i] * (6.6 + rand() * 2), high, z));
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const base = r * RIBBON_STEPS * 2;
    for (let s = 0; s < RIBBON_STEPS; s += 1) {
      const t = s / (RIBBON_STEPS - 1);
      curve.getPoint(t, a);
      curve.getPoint(Math.min(1, t + 0.0008), b);
      // At the very end there is no further point: carry the last step on.
      if (t + 0.0008 > 1) {
        curve.getPoint(t - 0.0008, b);
        b.subVectors(a, b).add(a);
      }
      for (let e = 0; e < 2; e += 1) {
        const v = base + s * 2 + e;
        position.set([a.x, a.y, a.z], v * 3);
        next.set([b.x, b.y, b.z], v * 3);
        uv.set([t, e === 0 ? -1 : 1, r], v * 3);
      }
      if (s < RIBBON_STEPS - 1) {
        const v = base + s * 2;
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setAttribute("aNext", new THREE.BufferAttribute(next, 3));
  g.setAttribute("aUv", new THREE.BufferAttribute(uv, 3));
  g.setIndex(index);
  return g;
}

/** The points: a place in the box, four random numbers, and a place in
 *  each of the five words for those that take part in words. */
function pointsGeometry(words: string[], sans: string): THREE.BufferGeometry {
  const rand = seeded(5);
  const position = new Float32Array(POINTS * 3);
  const seed = new Float32Array(POINTS * 4);
  for (let i = 0; i < POINTS; i += 1) {
    position[i * 3] = rand() - 0.5;
    position[i * 3 + 1] = rand() - 0.5;
    position[i * 3 + 2] = rand() - 0.5;
    seed[i * 4] = rand();
    seed[i * 4 + 1] = rand();
    seed[i * 4 + 2] = rand();
    seed[i * 4 + 3] = rand();
  }
  const places = words.map((w) => sampleWord(w, WORD_POINTS, sans, rand));
  const wa = new Float32Array(POINTS * 4);
  const wb = new Float32Array(POINTS * 4);
  const wc = new Float32Array(POINTS * 4);
  const at = (k: number, i: number, axis: number): number => places[k]?.[i * 2 + axis] ?? 0;
  for (let i = 0; i < WORD_POINTS; i += 1) {
    wa.set([at(0, i, 0), at(0, i, 1), at(1, i, 0), at(1, i, 1)], i * 4);
    wb.set([at(2, i, 0), at(2, i, 1), at(3, i, 0), at(3, i, 1)], i * 4);
    wc.set([at(4, i, 0), at(4, i, 1), 1, 0], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  g.setAttribute("aWA", new THREE.BufferAttribute(wa, 4));
  g.setAttribute("aWB", new THREE.BufferAttribute(wb, 4));
  g.setAttribute("aWC", new THREE.BufferAttribute(wc, 4));
  return g;
}

export function createField(o: FieldOptions): Field | null {
  // Ask for the context first. If the machine has none, say so by
  // returning nothing, without three logging an error on the way.
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const context = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!context) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context });
  } catch {
    return null;
  }
  renderer.setClearColor(new THREE.Color(FAR), 1);
  renderer.toneMapping = THREE.NoToneMapping;
  o.stage.prepend(canvas);

  const colour = {
    blossom: new THREE.Color(BLOSSOM),
    rose: new THREE.Color(ROSE),
    amber: new THREE.Color(AMBER),
    ground: new THREE.Color(DEEP),
    band: new THREE.Color(BAND),
    far: new THREE.Color(FAR),
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 160);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

  // What the shaders share. One object per uniform, handed to every
  // material that reads it, so a value is set once a frame.
  const shared = {
    uTime: { value: 0 },
    uScale: { value: 1000 },
    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uRingR: { value: 2.6 },
    uRingDist: { value: RING_DIST },
    uQuiet: { value: new THREE.Vector4(0, 0, 1, 1) },
    uQuietAmt: { value: 0 },
    uBlossom: { value: colour.blossom },
    uRose: { value: colour.rose },
    uAmber: { value: colour.amber },
    uGround: { value: colour.ground },
    uBand: { value: colour.band },
    uFar: { value: colour.far },
  };

  /* The ground. */
  const groundUniforms = { ...shared, uAspect: { value: 1 }, uDrift: { value: 0 } };
  const groundMaterial = new THREE.ShaderMaterial({
    uniforms: groundUniforms,
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const groundGeometry = new THREE.PlaneGeometry(2, 2);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.frustumCulled = false;
  ground.renderOrder = -10;
  scene.add(ground);

  /* The panels. */
  const panelGeometry = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const textures: THREE.Texture[] = [];
  const panels = o.titles.slice(0, PANELS).map((t, i) => {
    const texture = titleTexture(t.title, i, t.year, o.fonts);
    textures.push(texture);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uKind: { value: i },
        uFocus: { value: 0 },
        uShow: { value: 0 },
        uSize: { value: new THREE.Vector2(PANEL_W, PANEL_H) },
        uTitle: { value: texture },
      },
      vertexShader: PANEL_VERT,
      fragmentShader: PANEL_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const mesh = new THREE.Mesh(panelGeometry, material);
    mesh.renderOrder = 0;
    mesh.position.copy(panelPlace(i));
    const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(REST[i][1], REST[i][2], REST[i][3], "YXZ"));
    mesh.quaternion.copy(rest);
    scene.add(mesh);
    return { mesh, material, rest };
  });

  /* The ribbons. */
  const ribbonUniforms = {
    ...shared,
    uWidth: { value: 0.12 },
    uRing: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  };
  const ribbonMaterial = new THREE.ShaderMaterial({
    uniforms: ribbonUniforms,
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const ribbonGeo = ribbonGeometry();
  const ribbons = new THREE.Mesh(ribbonGeo, ribbonMaterial);
  ribbons.frustumCulled = false;
  ribbons.renderOrder = 1;
  scene.add(ribbons);

  /* The points. */
  const pointUniforms = {
    ...shared,
    uCamZ: { value: 0 },
    uBox: { value: new THREE.Vector3(46, 27, 72) },
    uRayO: { value: new THREE.Vector3() },
    uRayD: { value: new THREE.Vector3(0, 0, -1) },
    uStir: { value: 0 },
    uPanelMat: { value: new THREE.Matrix4() },
    uPanelSize: { value: new THREE.Vector2(PANEL_W, PANEL_H) },
    uGather: { value: 0 },
    uGatherRing: { value: 0 },
    uWordFrom: { value: 0 },
    uWordMix: { value: 0 },
    uForm: { value: 0 },
    uWordScale: { value: 10 },
    uWordDist: { value: WORD_DIST },
    uWordY: { value: 1.8 },
    uFieldDim: { value: 1 },
  };
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: pointUniforms,
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const pointGeo = pointsGeometry(o.words, o.fonts.sans);
  const points = new THREE.Points(pointGeo, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  /* Bloom, held down: the glow is for the ribbons and the thick of the
     field, and the text beside them still has to be read. */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.65, 0.84);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);

  /* Size. */
  const resize = (): void => {
    const w = Math.max(1, o.stage.clientWidth);
    const h = Math.max(1, o.stage.clientHeight);
    let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (w * ratio > MAX_BUFFER_W) ratio = MAX_BUFFER_W / w;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const bufferH = h * ratio;
    shared.uScale.value = bufferH / (2 * tanHalf);
    groundUniforms.uAspect.value = camera.aspect;
    ribbonUniforms.uRes.value.set(w * ratio, bufferH);

    // The word and the ring are sized to the screen, not to the world.
    const seenH = 2 * WORD_DIST * tanHalf;
    const seenW = seenH * camera.aspect;
    pointUniforms.uWordScale.value = Math.min(0.84 * seenW, (0.4 * seenH) / (WORD_H / WORD_W));
    pointUniforms.uWordY.value = 0.245 * seenH;
    shared.uRingR.value = Math.min(0.37 * seenH, 0.44 * seenW);
  };

  /* The cursor. */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, stir: 0, inside: false };
  const onPointer = (e: PointerEvent): void => {
    const r = o.stage.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    pointer.inside = inside;
    if (!inside) return;
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    // How hard the field is stirred goes with how fast the cursor moves.
    pointer.stir = Math.min(1, pointer.stir + Math.hypot(x - pointer.tx, y - pointer.ty) * 2.2);
    pointer.tx = x;
    pointer.ty = y;
  };

  /* One frame. */
  const look = new THREE.Vector3();
  const face = new THREE.Quaternion();
  const turn = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  let u = 0;
  let time = 0;
  let first = true;

  const measure = (): number => {
    const top = o.root.getBoundingClientRect().top;
    const screen = Math.max(1, o.stage.clientHeight);
    return Math.max(-1.2, Math.min(END_AT + 0.2, -top / screen));
  };

  const draw = (dt: number): void => {
    const target = o.still ? 0.5 : measure();
    u = first ? target : u + (target - u) * (1 - Math.exp(-dt * 8));
    first = false;
    time += dt;
    shared.uTime.value = time;

    const ease = 1 - Math.exp(-dt * 4);
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
    pointer.stir *= Math.exp(-dt * 1.4);

    // The camera goes forward with the scroll, leans towards the panel
    // that is on, and shifts a little with the cursor.
    const z = -travel(u);
    const n = nearestPanel(u);
    const focus = panelFocus(n, u);
    const place = panels[n]?.mesh.position;
    camera.position.set(pointer.x * 0.75, pointer.y * 0.42, z);
    look.set(
      (place ? place.x * 0.2 * focus : 0) + pointer.x * 0.25,
      (place ? place.y * 0.5 * focus : 0) + pointer.y * 0.12,
      z - 14,
    );
    camera.up.copy(up);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    const m = camera.matrixWorld.elements;
    shared.uCamPos.value.copy(camera.position);
    shared.uCamRight.value.set(m[0], m[1], m[2]);
    shared.uCamUp.value.set(m[4], m[5], m[6]);
    shared.uCamFwd.value.set(-m[8], -m[9], -m[10]);

    // The cursor as a line from the lens out into the field.
    pointUniforms.uRayO.value.copy(camera.position);
    pointUniforms.uRayD.value
      .copy(shared.uCamFwd.value)
      .addScaledVector(shared.uCamRight.value, pointer.x * tanHalf * camera.aspect)
      .addScaledVector(shared.uCamUp.value, pointer.y * tanHalf)
      .normalize();
    pointUniforms.uStir.value = pointer.inside ? 0.3 + 0.7 * pointer.stir : 0;
    pointUniforms.uCamZ.value = z;

    // Each panel turns from how it hangs to facing the lens, and back.
    for (let i = 0; i < panels.length; i += 1) {
      const p = panels[i];
      const f = panelFocus(i, u);
      turn.lookAt(camera.position, p.mesh.position, up);
      face.setFromRotationMatrix(turn);
      // Not square on: a panel seen dead flat looks like a picture of one.
      p.mesh.quaternion.copy(p.rest).slerp(face, f * 0.86);
      p.mesh.rotateY(Math.sin(time * 0.3 + i * 1.7) * 0.035);
      p.mesh.updateMatrixWorld();
      p.material.uniforms.uFocus.value = f;
      // A panel comes out of the dark as the camera nears it. The next
      // one along hangs on the side the text stands on, so it must not
      // be there yet while this one is being read.
      const shown = smoothstep(30, 19, z - p.mesh.position.z);
      p.material.uniforms.uShow.value = shown;
      p.mesh.visible = shown > 0.01;
      // Only a solid panel hides what is behind it.
      p.material.depthWrite = shown > 0.7;
    }
    if (place) pointUniforms.uPanelMat.value.copy(panels[n].mesh.matrixWorld);
    pointUniforms.uGather.value = focus;

    const word = wordState(u);
    pointUniforms.uWordFrom.value = word.from;
    pointUniforms.uWordMix.value = word.mix;
    pointUniforms.uForm.value = word.form;

    const ring = ringAmount(u);
    ribbonUniforms.uRing.value = ring;
    pointUniforms.uGatherRing.value = ring;
    pointUniforms.uFieldDim.value = 1 - 0.5 * word.form - 0.25 * ring;
    groundUniforms.uDrift.value = -z;

    // Where the DOM text stands, the field is turned down.
    const text = panelText(n, u);
    const quiet = shared.uQuiet.value;
    if (ring > 0.02 && ring >= word.form) {
      quiet.set(0, 0, 0.3, 0.5);
      shared.uQuietAmt.value = 0.9 * ring;
    } else if (word.form > 0.02) {
      quiet.set(0, -0.36, 0.9, 0.56);
      shared.uQuietAmt.value = 0.9 * word.form;
    } else {
      quiet.set(-PANEL_SIDE[n] * 0.5, 0, 0.44, 0.66);
      shared.uQuietAmt.value = 0.88 * text;
    }

    composer.render(dt);
    o.onFrame(u);
  };

  /* The loop: only while the design is on screen and the tab is showing. */
  let raf = 0;
  let last = 0;
  let onScreen = false;
  let lost = false;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    draw(dt);
  };
  const still = (): void => {
    // A fixed moment, so the one frame is the same frame every time.
    time = 24;
    first = true;
    draw(0);
  };
  const sync = (): void => {
    const run = !o.still && !lost && onScreen && document.visibilityState === "visible";
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const seen = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      sync();
    },
    { rootMargin: "10% 0px" },
  );
  seen.observe(o.stage);

  const sized = new ResizeObserver(() => {
    resize();
    if (o.still && !lost) still();
  });
  sized.observe(o.stage);

  const onLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    sync();
    o.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  document.addEventListener("visibilitychange", sync);
  if (!o.still) window.addEventListener("pointermove", onPointer, { passive: true });

  resize();
  if (o.still) still();

  return {
    dispose: () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      seen.disconnect();
      sized.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointer);

      groundGeometry.dispose();
      groundMaterial.dispose();
      panelGeometry.dispose();
      panels.forEach((p) => p.material.dispose());
      textures.forEach((t) => t.dispose());
      ribbonGeo.dispose();
      ribbonMaterial.dispose();
      pointGeo.dispose();
      pointMaterial.dispose();
      bloom.dispose();
      output.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.dispose();
      // The canvas is this scene's own, so the context can go with it.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
