import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import type { Skill } from "@/components/profile";
import { PALE, ROSE } from "./colours";
import {
  type Box,
  CAM_Z,
  clamp,
  CONTACT_STOP,
  fitHeadline,
  FOV,
  type Grid,
  type Headline,
  headlineSpecs,
  LENS,
  LENS_IOR,
  LENS_THICKNESS,
  LENS_Z,
  LIFT_GROW,
  LIFT_Z,
  lensGrid,
  lensShow,
  type Placed,
  type Pose,
  rowLift,
  sheetAt,
  SKILLS_STOP,
  smooth,
  solidPoses,
  SOLIDS,
  stageAt,
  STOPS,
  toWorld,
  type View,
  viewHeightAt,
} from "./layout";
import { drawHeadline, drawMarks, makeMeasure } from "./sheet";
import { buildLensGeometry, buildSolidGeometries } from "./solids";

/**
 * The scene: a sheet of type at the back, glass in front of it, one
 * fixed camera. It knows nothing about the page. It is handed a canvas
 * and, each frame, how far the page has scrolled.
 *
 * The glass is three's own: it draws the sheet to a texture first, then
 * each solid looks that texture up where its bent ray lands. That is why
 * the sheet is an ordinary solid mesh and the shadows are drawn into the
 * sheet itself: only solid things are in that texture.
 */

export type Content = {
  titles: string[];
  email: string;
  /** All the skills in one list, group after group. */
  skills: Skill[];
  /** How many skills each group has. */
  counts: number[];
};

export type Seen = { name: string; x: number; y: number; r: number; show: number };

export type Glass = {
  resize(width: number, height: number): void;
  /** u: scroll in screens from where the stage pins. t, dt: seconds. */
  frame(u: number, t: number, dt: number): void;
  /** Where the cursor is on the stage, 0 to 1 each way, and whether it is on it. */
  pointer(x: number, y: number, on: boolean): void;
  /** Draw the type again: the page's font has arrived. */
  redraw(): void;
  /** Put every solid where it belongs now, with no gliding. */
  snap(): void;
  heads(): Headline[];
  grid(): Grid;
  seen(): Seen[];
  dispose(): void;
};

const MAX_BUFFER_WIDTH = 2560;
const MAX_SHEET_WIDTH = 2048;
const SHADOWS = SOLIDS.length + 42;

type Look = {
  tint: string;
  /** How deep the tint is: 0 clear, 1 the tint itself. */
  depth: number;
  /**
   * How far the ray travels inside, in radii. More bends the type more,
   * but past about twice the radius of the curve it meets, a curved
   * solid shows only a speck of what is behind it, blown up. These are
   * set so a curved one shows about the middle half.
   */
  thickness: number;
  ior: number;
  dispersion: number;
  rot: [number, number, number];
  /** Turning, radians a second, about x and y. */
  spin: [number, number];
  /** Rocks to and fro instead of turning right round. */
  swing: boolean;
  /** Turns of tumble per stop travelled. */
  tumble: number;
};

/** One per solid, in the order of SOLIDS. */
const LOOKS: Look[] = [
  { tint: BLOSSOM, depth: 0.6, thickness: 1.6, ior: 1.45, dispersion: 9, rot: [0.5, 0.6, 0.1], spin: [0.05, 0.08], swing: false, tumble: 0.9 },
  { tint: ROSE, depth: 0.45, thickness: 1.2, ior: 1.45, dispersion: 8, rot: [-0.4, 0.5, 0.3], spin: [0.07, -0.05], swing: false, tumble: -0.7 },
  { tint: BLOSSOM, depth: 0.7, thickness: 0.5, ior: 1.5, dispersion: 10, rot: [0.45, 0.35, 0], spin: [0.31, 0.23], swing: true, tumble: 0.4 },
  { tint: ROSE, depth: 0.5, thickness: 1.2, ior: 1.45, dispersion: 8, rot: [0.2, -0.4, 0.5], spin: [0.27, 0.21], swing: true, tumble: -0.5 },
  { tint: BLOSSOM, depth: 0.3, thickness: 1.8, ior: 1.45, dispersion: 6, rot: [0.1, -0.12, 0], spin: [0.37, 0.29], swing: true, tumble: 0 },
  { tint: BLOSSOM, depth: 0.6, thickness: 1.2, ior: 1.5, dispersion: 12, rot: [0.3, 0, 0.5], spin: [0.03, 0.12], swing: false, tumble: 0.8 },
  { tint: BLOSSOM, depth: 0.3, thickness: 0.7, ior: 1.45, dispersion: 8, rot: [0.2, 0.3, -0.7], spin: [0.06, 0.07], swing: false, tumble: -0.9 },
  { tint: BLOSSOM, depth: 0.5, thickness: 1.0, ior: 1.45, dispersion: 6, rot: [0, 0, 0], spin: [0.04, 0.05], swing: false, tumble: 0.3 },
  { tint: ROSE, depth: 0.55, thickness: 1.4, ior: 1.5, dispersion: 12, rot: [0.4, 0.2, 0.3], spin: [0.08, 0.06], swing: false, tumble: 1.0 },
  { tint: BLOSSOM, depth: 0.7, thickness: 1.0, ior: 1.45, dispersion: 8, rot: [-0.3, 0.5, -0.6], spin: [0.33, 0.19], swing: true, tumble: 0.6 },
];

const SHEET_VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vAt;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vAt = world.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The ground, the type going, the type coming, then the shadows.
// The type going slides up as it fades and the type coming rises into
// its place, by uSlide of the sheet's height.
// uShadow: xy the middle of a shadow on the sheet, z its reach, w its strength.
const SHEET_FRAG = /* glsl */ `
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uMix;
uniform float uSlide;
uniform vec3 uGround;
uniform vec3 uShade;
uniform vec4 uShadow[SHADOWS];
varying vec2 vUv;
varying vec2 vAt;

vec4 sheet(sampler2D tex, vec2 at) {
  vec4 c = texture2D(tex, at);
  float inside = step(0.0, at.y) * step(at.y, 1.0);
  return vec4(c.rgb, c.a * inside);
}

void main() {
  vec4 going = sheet(uFrom, vUv - vec2(0.0, uSlide * uMix));
  vec4 coming = sheet(uTo, vUv + vec2(0.0, uSlide * (1.0 - uMix)));
  vec3 col = uGround;
  col = mix(col, going.rgb, going.a * (1.0 - uMix));
  col = mix(col, coming.rgb, coming.a * uMix);
  float shade = 0.0;
  for (int i = 0; i < SHADOWS; i++) {
    vec4 s = uShadow[i];
    if (s.w <= 0.0) continue;
    vec2 d = (vAt - s.xy) / max(s.z, 0.0001);
    shade += s.w * exp(-dot(d, d) * 1.4);
  }
  col = mix(col, uShade, min(shade, 0.6));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function buildGlass(canvas: HTMLCanvasElement, family: string, content: Content): Glass {
  // Asked for here and not by three, so that a browser with no WebGL
  // fails at this line, before anything has been built.
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("b08: WebGL did not start");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  renderer.setClearColor(new THREE.Color(PALE), 1);
  // Neutral leaves the palette as it is and only rolls off the highlights.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, 0.5, 40);
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  // What the glass reflects: a plain lit room, drawn once.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = keep(pmrem.fromScene(room, 0.04));
  room.dispose();
  pmrem.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1;

  // One hard light for a bright glint on each solid.
  const sun = new THREE.DirectionalLight("#ffffff", 2.6);
  sun.position.set(-5, 7, 9);
  scene.add(sun);

  // ------------------------------------------------------- the sheet
  const sheetCanvases: HTMLCanvasElement[] = [];
  const sheetTextures: THREE.CanvasTexture[] = [];
  for (let i = 0; i < STOPS; i += 1) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 4;
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    sheetCanvases.push(c);
    sheetTextures.push(tex);
  }
  const shadows: THREE.Vector4[] = [];
  for (let i = 0; i < SHADOWS; i += 1) shadows.push(new THREE.Vector4(0, 0, 1, 0));
  const sheetUniforms = {
    uFrom: { value: sheetTextures[0] as THREE.Texture },
    uTo: { value: sheetTextures[0] as THREE.Texture },
    uMix: { value: 0 },
    uSlide: { value: 0.12 },
    uGround: { value: new THREE.Color(PALE) },
    // A shadow on blossom is a deeper blossom, part way to the plum.
    uShade: { value: new THREE.Color(BLOSSOM).lerp(new THREE.Color(BAND), 0.5) },
    uShadow: { value: shadows },
  };
  const sheetMat = keep(
    new THREE.ShaderMaterial({
      uniforms: sheetUniforms,
      defines: { SHADOWS },
      vertexShader: SHEET_VERT,
      fragmentShader: SHEET_FRAG,
      toneMapped: false,
    }),
  );
  const sheet = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), sheetMat);
  sheet.frustumCulled = false;
  scene.add(sheet);

  // ------------------------------------------------------ the solids
  const glass = (look: Look, radius: number): THREE.MeshPhysicalMaterial =>
    keep(
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        metalness: 0,
        roughness: 0.03,
        transmission: 1,
        ior: look.ior,
        thickness: look.thickness,
        // The tint a ray picks up, and the distance inside over which it
        // picks up all of it. The ray's own path is thickness times radius.
        attenuationColor: new THREE.Color(look.tint),
        attenuationDistance: look.depth > 0 ? (look.thickness * radius) / look.depth : Infinity,
        dispersion: look.dispersion,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.25,
      }),
    );
  const restHeight = viewHeightAt(2);
  const solidGeos = buildSolidGeometries().map(keep);
  const solids = SOLIDS.map((spec, i) => {
    const mesh = new THREE.Mesh(solidGeos[i], glass(LOOKS[i], spec.r * restHeight));
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  const lensGeo = keep(buildLensGeometry());
  const lensLook: Look = { ...LOOKS[LENS], tint: BLOSSOM, depth: 0.3, thickness: LENS_THICKNESS, ior: LENS_IOR, dispersion: 4 };
  const lensMat = glass(lensLook, 0.05 * viewHeightAt(LENS_Z));
  const lenses = content.skills.map(() => {
    const mesh = new THREE.Mesh(lensGeo, lensMat);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  // ------------------------------------------------------- the state
  const view: View = { w: 1, h: 1 };
  let heads: Headline[] = [];
  let boxes: Box[] = [];
  let grid: Grid = lensGrid({ w: 1.85, h: 1 }, content.counts);
  let measure = makeMeasure(family);
  let sized = false;
  let snapNext = true;

  const now: Pose[] = SOLIDS.map(() => ({ x: 0.5, y: 0.5, z: 2, r: 0.1, squash: 1, show: 0 }));
  const seen: Seen[] = SOLIDS.map((s) => ({ name: s.name, x: 0.5, y: 0.5, r: 0, show: 0 }));
  const placed: Placed = { x: 0, y: 0, z: 0, radius: 0 };
  const spot = { x: 0, y: 0, z: 0, r: 0 };
  const cursor = { x: 0.5, y: 0.5, on: false, tx: 0.5, ty: 0.5, amount: 0 };

  const draw = (): void => {
    if (!sized) return;
    const specs = headlineSpecs(content.titles, content.email);
    heads = specs.map((s) => fitHeadline(s, view, measure));
    boxes = heads.map((h) => h.box);
    grid = lensGrid(view, content.counts);
    const pixels = renderer.getPixelRatio() * view.w;
    const cw = Math.round(clamp(pixels, 512, MAX_SHEET_WIDTH));
    const ch = Math.max(2, Math.round((cw * view.h) / view.w));
    sheetCanvases.forEach((c, i) => {
      const changed = c.width !== cw || c.height !== ch;
      if (changed) {
        c.width = cw;
        c.height = ch;
        // A texture keeps the size it was first given. Let it go, and
        // three makes a new one at the new size.
        sheetTextures[i].dispose();
      }
      if (i === SKILLS_STOP) drawMarks(c, grid, content.skills, family, view);
      else drawHeadline(c, heads[i], i === CONTACT_STOP ? "CONTACT" : specs[i].text, family, i !== CONTACT_STOP);
      sheetTextures[i].needsUpdate = true;
    });
  };

  const resize = (width: number, height: number): void => {
    if (width < 2 || height < 2) return;
    view.w = width;
    view.h = height;
    sized = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, MAX_BUFFER_WIDTH / width));
    renderer.setSize(width, height, false);
    // Past 1920 across, the copy of the sheet the glass looks into is
    // kept at three quarters: it is the costliest thing drawn.
    renderer.transmissionResolutionScale = width * renderer.getPixelRatio() > 1920 ? 0.75 : 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const h0 = viewHeightAt(0);
    sheet.scale.set(h0 * camera.aspect, h0, 1);
    draw();
  };

  const frame = (u: number, t: number, dt: number): void => {
    if (!sized) return;
    const aspect = view.w / view.h;
    const stage = stageAt(u);
    const travelled = stage.from + smooth(stage.t) * (stage.to - stage.from);
    const follow = snapNext ? 1 : 1 - Math.exp(-dt * 9);
    snapNext = false;

    cursor.amount += ((cursor.on ? 1 : 0) - cursor.amount) * (1 - Math.exp(-dt * 3));
    const glide = 1 - Math.exp(-dt * 5);
    cursor.x += (cursor.tx - cursor.x) * glide;
    cursor.y += (cursor.ty - cursor.y) * glide;
    // The small lenses hold over their marks, so they lean less.
    const calm = 1 - 0.6 * smooth(1 - Math.abs(travelled - SKILLS_STOP));

    const want = solidPoses(u, view, boxes, grid);
    for (let i = 0; i < solids.length; i += 1) {
      const p = now[i];
      const q = want[i];
      p.x += (q.x - p.x) * follow;
      p.y += (q.y - p.y) * follow;
      p.z += (q.z - p.z) * follow;
      p.r += (q.r - p.r) * follow;
      p.squash += (q.squash - p.squash) * follow;
      p.show += (q.show - p.show) * follow;

      const look = LOOKS[i];
      const dx = (cursor.x - p.x) * aspect;
      const dy = cursor.y - p.y;
      const pull = 0.1 * Math.exp(-(dx * dx + dy * dy) * 4) * cursor.amount * calm;
      const bob = Math.sin(t * (0.5 + i * 0.07) + i * 1.7) * 0.008;
      spot.x = p.x + (dx * pull) / aspect;
      spot.y = p.y + dy * pull + bob;
      spot.z = p.z;
      spot.r = p.r * p.show;
      toWorld(spot, view, placed);

      const mesh = solids[i];
      mesh.visible = p.show > 0.002;
      mesh.position.set(placed.x, placed.y, placed.z);
      const size = Math.max(placed.radius, 1e-4);
      mesh.scale.set(size, size, size * p.squash);
      // Pressed flat, a solid faces the eye, as the lens it turns into does.
      const free = clamp((p.squash - 0.45) / 0.55, 0, 1);
      const rx = look.swing ? Math.sin(t * look.spin[0] + i) * 0.3 : t * look.spin[0];
      const ry = look.swing ? Math.sin(t * look.spin[1] + i * 2.1) * 0.45 : t * look.spin[1];
      const turn = travelled * look.tumble * Math.PI * 2;
      const lean = 0.5 * cursor.amount * calm;
      mesh.rotation.set(
        (look.rot[0] + rx + turn * 0.35 + clamp(dy, -1, 1) * lean) * free,
        (look.rot[1] + ry + turn + clamp(dx, -1, 1) * lean) * free,
        look.rot[2] * free,
      );

      seen[i].x = spot.x;
      seen[i].y = spot.y;
      seen[i].r = spot.r;
      seen[i].show = p.show;

      // Its shadow: under it as the eye sees it, pushed down and to the
      // right the more it stands off the sheet, and fainter.
      const onto = CAM_Z / (CAM_Z - placed.z);
      shadows[i].set(
        placed.x * onto + placed.z * 0.1,
        placed.y * onto - placed.z * 0.14,
        placed.radius * onto * 1.05 + placed.z * 0.04,
        mesh.visible ? (0.36 * p.show) / (1 + 0.3 * placed.z) : 0,
      );
    }

    const count = lenses.length;
    for (let j = 0; j < count; j += 1) {
      const at = grid.lenses[j];
      const mesh = lenses[j];
      const shown = at ? lensShow(j, count, u) : 0;
      const shadow = shadows[solids.length + j];
      mesh.visible = shown > 0.002;
      if (!at || !mesh.visible) {
        shadow.w = 0;
        continue;
      }
      const lift = rowLift(at.row, u);
      const dx = (cursor.x - at.x) * aspect;
      const dy = cursor.y - at.y;
      const near = Math.exp(-(dx * dx + dy * dy) * 30) * cursor.amount;
      spot.x = at.x;
      spot.y = at.y + Math.sin(t * 0.6 + j * 0.9) * 0.002;
      const up = Math.max(lift, near);
      spot.z = LENS_Z + up * LIFT_Z;
      spot.r = grid.r * shown * (1 + LIFT_GROW * up);
      toWorld(spot, view, placed);
      mesh.position.set(placed.x, placed.y, placed.z);
      mesh.scale.setScalar(Math.max(placed.radius, 1e-4));
      // A small lean only: a tilted lens slides its mark toward its rim.
      mesh.rotation.set(clamp(dy, -1, 1) * 0.2 * cursor.amount, clamp(dx, -1, 1) * 0.2 * cursor.amount, 0);
      const onto = CAM_Z / (CAM_Z - placed.z);
      shadow.set(
        placed.x * onto + placed.z * 0.1,
        placed.y * onto - placed.z * 0.14,
        placed.radius * onto * 1.05 + placed.z * 0.04,
        0.2 * shown,
      );
    }

    const words = sheetAt(u);
    sheetUniforms.uFrom.value = sheetTextures[words.from];
    sheetUniforms.uTo.value = sheetTextures[words.to];
    sheetUniforms.uMix.value = words.from === words.to ? 0 : words.t;
    // The marks do not slide: each has to be under its lens as the lens lands.
    sheetUniforms.uSlide.value = words.from === SKILLS_STOP || words.to === SKILLS_STOP ? 0 : 0.12;

    renderer.render(scene, camera);
  };

  return {
    resize,
    frame,
    pointer(x, y, on) {
      cursor.tx = x;
      cursor.ty = y;
      cursor.on = on;
    },
    redraw() {
      measure = makeMeasure(family);
      draw();
    },
    snap() {
      snapNext = true;
    },
    heads: () => heads,
    grid: () => grid,
    seen: () => seen,
    dispose() {
      for (const mesh of solids) scene.remove(mesh);
      for (const mesh of lenses) scene.remove(mesh);
      scene.remove(sheet);
      scene.remove(sun);
      scene.environment = null;
      for (const d of disposables) d.dispose();
      for (const c of sheetCanvases) {
        c.width = 1;
        c.height = 1;
      }
      renderer.dispose();
      // The copy of the sheet the glass looks into is three's own and it
      // keeps no handle on it. Letting the context go frees that too.
      // The canvas is ours alone and is thrown away after this.
      renderer.forceContextLoss();
    },
  };
}
