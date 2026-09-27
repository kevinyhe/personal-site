/**
 * The flight itself: sky, clouds, petals, the dart and its trail, the
 * five titles with their objects, and the lanterns.
 *
 * The page hands this a scroll progress. Each frame the scene moves its
 * own progress a share of the way toward it, puts the camera that far
 * along the path, draws, and reports where on screen the labels belong.
 */
import * as THREE from "three";
import { BAND } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { hexToRgb, LIGHT_FROM, paletteAt } from "./palette";
import { buildTrack, distanceAt, GROUP_AHEAD, GROUP_P, groupDistance, LEAD, PASS_S, sampleTrack, STOP_P, stopDistance, TITLE_AHEAD } from "./plan";
import { inkRgb, makeBuilder, makeDart, makeObjects, type Floater, type Ink } from "./props";
import { cloudFrag, cloudVert, lanternFrag, lanternVert, petalFrag, petalVert, skyFrag, skyVert, solidFrag, solidVert, titleFrag, titleVert, trailFrag, trailVert } from "./shaders";
import { CLOUD_COLS, CLOUD_ROWS, makeCloudAtlas } from "./clouds";
import { ATLAS_COLS, ATLAS_ROWS, fontsReady, interFamily, makeSkillAtlas, makeTitleTexture, seeded } from "./textures";

export type FlightView = {
  /** Eased progress, 0..1. */
  p: number;
  /** Per project: x, y of the corner under its title as shares of the stage, then how visible. */
  stops: Float32Array;
  /** Per skill group: x, y of where its name goes, then how visible. */
  groups: Float32Array;
  /** Per skill, in profile order: x, y under its lantern. */
  skills: Float32Array;
};

export type FlightOptions = {
  /** One frame at `stillAt` and no more, for reduced motion. */
  still: boolean;
  stillAt: number;
  progress: () => number;
  onFrame: (view: FlightView) => void;
};

export type Flight = { dispose: () => void };

const UP = new THREE.Vector3(0, 1, 0);
const FAR = 430;
const PETALS = 5200;
const LANTERN = 2.7;
/** The disc is the middle 46% of its quad. lanternFrag has the same number. */
const DISC_R = LANTERN * 0.23;

const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Up from 0 to 1 between the first pair, down again between the second. */
const span = (v: number, inA: number, inB: number, outA: number, outB: number): number => smooth(inA, inB, v) * (1 - smooth(outA, outB, v));

export function createFlight(canvas: HTMLCanvasElement, stage: HTMLElement, opts: FlightOptions): Flight {
  // Throws where WebGL cannot start. The caller falls back to the page without it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(new THREE.Color().setRGB(...hexToRgb(BAND), THREE.LinearSRGBColorSpace), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1.85, 0.1, 520);
  const probe = new THREE.PerspectiveCamera();
  const track = buildTrack();
  const L = track.length;

  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Colours every shader shares. One object each, written to per frame.
  const v3 = (): THREE.Vector3 => new THREE.Vector3();
  const pal = { top: v3(), horizon: v3(), low: v3(), cloudLit: v3(), cloudShade: v3(), sun: v3(), objLight: v3(), objShade: v3(), stars: 0 };
  const sunDir = new THREE.Vector3(0.1, 0.1, -1).normalize();
  // The sun is ahead of the camera, so everything solid shows its
  // shaded side. This second light stands behind the lens and above,
  // leaning to the sun's side, and is what the solids are lit by.
  const keyDir = new THREE.Vector3(0, 1, 0);
  const shared = {
    uKeyDir: { value: keyDir },
    uTop: { value: pal.top },
    uHorizon: { value: pal.horizon },
    uLow: { value: pal.low },
    uSun: { value: pal.sun },
    uSunDir: { value: sunDir },
    uCloudLit: { value: pal.cloudLit },
    uCloudShade: { value: pal.cloudShade },
    uObjLight: { value: pal.objLight },
    uObjShade: { value: pal.objShade },
    uTime: { value: 0 },
  };

  // ---- sky
  const skyGeo = keep(new THREE.BufferGeometry());
  skyGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const skyMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTop: shared.uTop,
        uHorizon: shared.uHorizon,
        uLow: shared.uLow,
        uSun: shared.uSun,
        uSunDir: shared.uSunDir,
        uStars: { value: 0 },
        uInvProj: { value: camera.projectionMatrixInverse },
        uCamWorld: { value: camera.matrixWorld },
      },
    }),
  );
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- the camera's place at a distance along the path
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const A = new THREE.Vector3();
  const R = new THREE.Vector3();
  const U = new THREE.Vector3();
  const V = new THREE.Vector3();
  const pose = (s: number, cam: THREE.PerspectiveCamera): void => {
    const turn = sampleTrack(track, s, P, T);
    sampleTrack(track, s + 10, A);
    cam.position.copy(P).addScaledVector(UP, 1.4);
    A.addScaledVector(UP, 0.5);
    // A few degrees of roll into the turn.
    const roll = clamp(turn * 9, -0.11, 0.11);
    V.copy(A).sub(cam.position).normalize();
    R.crossVectors(V, UP).normalize();
    cam.up.copy(UP).multiplyScalar(Math.cos(roll)).addScaledVector(R, Math.sin(roll));
    cam.lookAt(A);
  };

  /** The dart's frame at `s`: right and up, banked. Forward is left in T. */
  const frame = (s: number, bank: number, extra: number): void => {
    const turn = sampleTrack(track, s, P, T);
    const roll = clamp(turn * bank, -0.62, 0.62) + extra;
    R.crossVectors(T, UP).normalize();
    U.crossVectors(R, T);
    const c = Math.cos(roll);
    const n = Math.sin(roll);
    V.copy(R).multiplyScalar(c).addScaledVector(U, -n);
    U.multiplyScalar(c).addScaledVector(R, n);
    R.copy(V);
  };

  // ---- solids: the dart and the objects share one shader
  const solidMats = new Map<string, THREE.ShaderMaterial>();
  const solid = (ink: Ink): THREE.ShaderMaterial => {
    let m = solidMats.get(ink);
    if (!m) {
      m = keep(
        new THREE.ShaderMaterial({
          vertexShader: solidVert,
          fragmentShader: solidFrag,
          side: THREE.DoubleSide,
          uniforms: {
            uBase: { value: inkRgb(ink) },
            uUseTint: { value: 0 },
            uBack: { value: inkRgb("blossom") },
            uUseBack: { value: 0 },
            uSunDir: shared.uKeyDir,
            uObjLight: shared.uObjLight,
            uObjShade: shared.uObjShade,
            uSun: shared.uSun,
          },
        }),
      );
      solidMats.set(ink, m);
    }
    return m;
  };

  const dartGeo = keep(makeDart());
  const dartMat = keep(solid("white").clone());
  dartMat.uniforms.uUseTint.value = 1;
  dartMat.uniforms.uUseBack.value = 1;
  dartMat.uniforms.uBack.value = inkRgb("blossom");
  // A clone copies the values. These have to be the shared ones, which change.
  dartMat.uniforms.uSunDir = shared.uKeyDir;
  for (const k of ["uObjLight", "uObjShade", "uSun"] as const) dartMat.uniforms[k] = shared[k];
  const dart = new THREE.Mesh(dartGeo, dartMat);
  dart.scale.setScalar(0.85);
  dart.matrixAutoUpdate = false;
  dart.frustumCulled = false;
  scene.add(dart);

  // ---- trail: two thin ribbons, one from each wing tip, laid along the path
  const trailGeo = keep(new THREE.BufferGeometry());
  {
    const step = 0.5;
    const n = Math.floor(L / step) + 1;
    const pos: number[] = [];
    const dist: number[] = [];
    const edge: number[] = [];
    const index: number[] = [];
    for (const sideSign of [-1, 1]) {
      const base = pos.length / 3;
      for (let k = 0; k < n; k += 1) {
        const s = k * step;
        frame(s, 55, 0);
        for (const e of [-1, 1]) {
          const off = sideSign * 0.88 * 0.85 + e * 0.035;
          pos.push(P.x + R.x * off + U.x * 0.11, P.y + R.y * off + U.y * 0.11, P.z + R.z * off + U.z * 0.11);
          // The tips sit a little behind the dart's middle.
          dist.push(s + 0.8);
          edge.push(e);
        }
        if (k > 0) {
          const a = base + (k - 1) * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    trailGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    trailGeo.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1));
    trailGeo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
    trailGeo.setIndex(index);
  }
  const trailMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: trailVert,
      fragmentShader: trailFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uCraft: { value: 0 }, uLength: { value: 17 }, uColour: { value: new THREE.Vector3(1, 1, 1) } },
    }),
  );
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 2;
  scene.add(trail);

  // ---- clouds
  const quad = (): THREE.InstancedBufferGeometry => {
    const g = keep(new THREE.InstancedBufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  };
  const cloudGeo = quad();
  {
    type Cloud = { x: number; y: number; z: number; w: number; h: number; v: number; flip: number; seed: number; a: number };
    const rand = seeded(4242);
    const list: Cloud[] = [];
    const put = (s: number, side: number, lift: number, w: number, a = 1): void => {
      // Past either end of the path, carry on straight.
      const sc = clamp(s, 0, L);
      sampleTrack(track, sc, P, T);
      P.addScaledVector(T, s - sc);
      R.crossVectors(T, UP).normalize();
      list.push({
        x: P.x + R.x * side,
        y: P.y + lift,
        z: P.z + R.z * side,
        w,
        h: w * (0.9 + rand() * 0.2),
        v: Math.floor(rand() * CLOUD_COLS * CLOUD_ROWS),
        flip: rand() < 0.5 ? -1 : 1,
        seed: rand(),
        a,
      });
    };
    // Fewer where the lanterns hang, so they are seen against open sky.
    const thin = (s: number): number => 1 - 0.62 * smooth(360, 400, s) * (1 - smooth(560, 590, s));
    // Beside the path, near enough to pass close. Never on it: the
    // titles hang in the clear lane down the middle.
    for (let s = -10; s < L + 120; s += 5.5) {
      if (rand() > thin(s)) continue;
      const w = 16 + rand() * 20;
      const side = (rand() < 0.5 ? -1 : 1) * (15 + w * 0.4 + rand() * 34);
      put(s + rand() * 5, side, -16 + rand() * 24, w);
    }
    // Far out to either side, large.
    for (let s = 0; s < L + 260; s += 10) {
      if (rand() > thin(s)) continue;
      const w = 50 + rand() * 70;
      put(s + rand() * 9, (rand() < 0.5 ? -1 : 1) * (70 + rand() * 150), -30 + rand() * 80, w);
    }
    // A floor of cloud a long way under the path.
    for (let s = 0; s < L + 240; s += 7) {
      const w = 80 + rand() * 70;
      put(s + rand() * 6, (rand() - 0.5) * 340, -58 - rand() * 40, w);
    }
    // Clouds on the path itself, to fly through.
    for (const s of PASS_S) {
      for (let k = 0; k < 7; k += 1) {
        put(s + (k - 3) * 3.4 + rand() * 2, (rand() - 0.5) * 14, (rand() - 0.5) * 6 + 2.5, 20 + rand() * 10);
      }
    }
    // The last layer: a sheet at one height that the descent cuts through.
    {
      sampleTrack(track, L - 78, P);
      const sheet = P.y;
      for (let k = 0; k < 84; k += 1) {
        const s = L - 140 + rand() * 120;
        sampleTrack(track, clamp(s, 0, L), P);
        put(s, (rand() - 0.5) * 190, sheet - P.y + (rand() - 0.5) * 5 + 3, 30 + rand() * 26);
      }
    }
    // The camera always faces roughly down -z, so farthest first is smallest z first.
    list.sort((a, b) => a.z - b.z);
    const centre = new Float32Array(list.length * 3);
    const size = new Float32Array(list.length * 2);
    const info = new Float32Array(list.length * 4);
    list.forEach((c, i) => {
      centre.set([c.x, c.y, c.z], i * 3);
      size.set([c.w, c.h], i * 2);
      info.set([c.v, c.flip, c.seed, c.a], i * 4);
    });
    cloudGeo.setAttribute("aCentre", new THREE.InstancedBufferAttribute(centre, 3));
    cloudGeo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 2));
    cloudGeo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
    cloudGeo.instanceCount = list.length;
  }
  const cloudAtlas = keep(makeCloudAtlas());
  const cloudMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uAtlas: { value: cloudAtlas },
        uTop: shared.uTop,
        uHorizon: shared.uHorizon,
        uLow: shared.uLow,
        uSun: shared.uSun,
        uSunDir: shared.uSunDir,
        uCloudLit: shared.uCloudLit,
        uCloudShade: shared.uCloudShade,
        uTime: shared.uTime,
        uFar: { value: FAR },
        uSheet: { value: new THREE.Vector2(CLOUD_COLS, CLOUD_ROWS) },
      },
    }),
  );
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.frustumCulled = false;
  clouds.renderOrder = 1;
  scene.add(clouds);

  // ---- petals
  const petalGeo = quad();
  {
    const rand = seeded(77);
    const offset = new Float32Array(PETALS * 3);
    const rnd = new Float32Array(PETALS * 4);
    for (let i = 0; i < offset.length; i += 1) offset[i] = rand();
    for (let i = 0; i < rnd.length; i += 1) rnd[i] = rand();
    petalGeo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 3));
    petalGeo.setAttribute("aRand", new THREE.InstancedBufferAttribute(rnd, 4));
    petalGeo.instanceCount = PETALS;
  }
  // Blossom against the dark skies. Against the pink ones that would
  // vanish, so there they go white with a rose shade.
  const petalShadeDark = new THREE.Vector3(...hexToRgb("#e889bd"));
  const petalShadeLight = new THREE.Vector3(...hexToRgb("#d2639f"));
  const petalLightDark = new THREE.Vector3(...hexToRgb("#fbcfe6"));
  const petalLightLight = new THREE.Vector3(1, 1, 1);
  const petalMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: petalVert,
      fragmentShader: petalFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: shared.uTime,
        uCentre: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(56, 36, 64) },
        uSunDir: shared.uSunDir,
        uPetalLight: { value: new THREE.Vector3() },
        uPetalShade: { value: new THREE.Vector3() },
      },
    }),
  );
  const petals = new THREE.Mesh(petalGeo, petalMat);
  petals.frustumCulled = false;
  petals.renderOrder = 4;
  scene.add(petals);

  // ---- the five stops. Each is laid out in the camera's own frame at
  // the moment it stops there, so the title is square to the lens then.
  type Stop = {
    group: THREE.Group;
    title: THREE.Mesh | null;
    material: THREE.ShaderMaterial | null;
    floaters: Floater[];
    /** World position of the corner the DOM text hangs from. */
    corner: THREE.Vector3;
    side: number;
    built: boolean;
  };
  const builder = makeBuilder(solid);
  const stops: Stop[] = projects.map((_, i) => {
    pose(distanceAt(STOP_P[i], L), probe);
    probe.updateMatrixWorld();
    const group = new THREE.Group();
    // On the side away from the sun, so the letters never cross the disc.
    R.set(1, 0, 0).applyQuaternion(probe.quaternion);
    const sunRight = sunDir.dot(R);
    const side = Math.abs(sunRight) > 0.06 ? -Math.sign(sunRight) : i % 2 ? -1 : 1;
    group.quaternion.copy(probe.quaternion);
    group.visible = false;
    scene.add(group);
    return { group, title: null, material: null, floaters: [], corner: new THREE.Vector3(), side, built: false };
  });
  const titleGeo = keep(new THREE.PlaneGeometry(1, 1));

  const buildStops = (family: string): void => {
    const maxTex = Math.min(renderer.capabilities.maxTextureSize, 2048);
    stops.forEach((stop, i) => {
      const t = makeTitleTexture(projects[i].title, family, maxTex);
      keep(t.texture);
      // 1.5 world units of type per line, the long ones shrunk to fit.
      let h = t.lines * 1.5 * 0.98 + 0.36;
      let w = h * t.aspect;
      const fit = Math.min(1, 8.6 / w);
      w *= fit;
      h *= fit;
      const material = keep(
        new THREE.ShaderMaterial({
          vertexShader: titleVert,
          fragmentShader: titleFrag,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uMap: { value: t.texture },
            uColour: { value: STOP_P[i] > LIGHT_FROM ? inkRgb("plum") : inkRgb("white") },
            uOpacity: { value: 0 },
          },
        }),
      );
      const title = new THREE.Mesh(titleGeo, material);
      title.scale.set(w, h, 1);
      title.renderOrder = 5;
      stop.group.add(title);
      stop.title = title;
      stop.material = material;

      pose(stopDistance(i), probe);
      probe.updateMatrixWorld();
      const centre = new THREE.Vector3(stop.side * (2.7 + w / 2), 1.55, -TITLE_AHEAD).applyMatrix4(probe.matrixWorld);
      stop.group.position.copy(centre);
      stop.group.updateMatrixWorld();
      stop.corner.set(-w / 2 + 0.18 * fit, -h / 2, 0).applyMatrix4(stop.group.matrixWorld);

      stop.floaters = makeObjects(i, builder, w, h, -stop.side);
      for (const f of stop.floaters) {
        f.group.position.copy(f.home);
        stop.group.add(f.group);
      }
      stop.built = true;
    });
  };

  // ---- lanterns
  const allSkills = skillGroups.flatMap((g) => g.skills);
  const lanternHome = new Float32Array(allSkills.length * 3);
  const lanternSeed = new Float32Array(allSkills.length);
  const groupAnchor = skillGroups.map(() => new THREE.Vector3());
  const lanternGeo = quad();
  {
    const rand = seeded(1311);
    const info = new Float32Array(allSkills.length * 3);
    let n = 0;
    skillGroups.forEach((g, gi) => {
      pose(groupDistance(gi), probe);
      probe.updateMatrixWorld();
      const count = g.skills.length;
      const rows = Math.ceil(count / 4);
      const per = Math.floor(count / rows);
      const extra = count % rows;
      const side = gi % 2 ? -1 : 1;
      const dx = 2.4;
      const dy = 2.35;
      const widest = (per + (extra ? 1 : 0) + 0.3) * dx;
      const left = side > 0 ? 1.5 : -1.5 - widest;
      const top = 0.8 + (rows * dy) / 2;
      for (let r = 0; r < rows; r += 1) {
        const inRow = per + (r < extra ? 1 : 0);
        for (let c = 0; c < inRow; c += 1) {
          // A loose grid: every other row pushed over, every lantern nudged.
          const x = left + (c + 0.5 + (r % 2 ? 0.3 : 0)) * dx + (rand() - 0.5) * 0.3;
          const y = top - (r + 0.5) * dy + (rand() - 0.5) * 0.4;
          const z = -GROUP_AHEAD + (rand() - 0.5) * 1.6;
          V.set(x, y, z).applyMatrix4(probe.matrixWorld);
          lanternHome.set([V.x, V.y, V.z], n * 3);
          lanternSeed[n] = rand();
          info.set([n % ATLAS_COLS, Math.floor(n / ATLAS_COLS), lanternSeed[n]], n * 3);
          n += 1;
        }
      }
      groupAnchor[gi].set(left + 0.2, top + 0.55, -GROUP_AHEAD).applyMatrix4(probe.matrixWorld);
    });
    lanternGeo.setAttribute("aCentre", new THREE.InstancedBufferAttribute(lanternHome, 3));
    lanternGeo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 3));
    lanternGeo.instanceCount = allSkills.length;
  }
  const lanternMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: lanternVert,
      fragmentShader: lanternFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uAtlas: { value: null },
        uGrid: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
        uSize: { value: LANTERN },
        uTime: shared.uTime,
        uSunDir: shared.uSunDir,
        uInk: { value: inkRgb("plum") },
        uGlow: { value: new THREE.Vector3(...hexToRgb("#fff6ec")) },
        uRim: { value: new THREE.Vector3(...hexToRgb("#f3a0cc")) },
      },
    }),
  );
  const lanterns = new THREE.Mesh(lanternGeo, lanternMat);
  lanterns.frustumCulled = false;
  lanterns.renderOrder = 3;
  lanterns.visible = false;
  scene.add(lanterns);

  // ---- what the page reads back
  const view: FlightView = {
    p: 0,
    stops: new Float32Array(projects.length * 3),
    groups: new Float32Array(skillGroups.length * 3),
    skills: new Float32Array(allSkills.length * 2),
  };
  const project = (v: THREE.Vector3, out: Float32Array, at: number): boolean => {
    v.project(camera);
    out[at] = v.x * 0.5 + 0.5;
    out[at + 1] = 0.5 - v.y * 0.5;
    return v.z < 1;
  };

  // ---- state
  let disposed = false;
  let ready = false;
  let raf = 0;
  let onScreen = false;
  let last = 0;
  let time = opts.still ? 14 : 0;
  let p = opts.still ? opts.stillAt : clamp(opts.progress(), 0, 1);
  let width = 1;
  let height = 1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const draw = (dt: number): void => {
    const target = opts.still ? opts.stillAt : clamp(opts.progress(), 0, 1);
    // A share of the way there each frame: stops and starts come out soft.
    const before = p;
    p += (target - p) * (1 - Math.exp(-dt * 3.4));
    if (Math.abs(target - p) < 0.00002) p = target;
    const s = distanceAt(p, L);
    const speed = dt > 0 ? (s - distanceAt(before, L)) / dt : 0;
    time += dt;
    shared.uTime.value = time;

    paletteAt(p, pal);
    skyMat.uniforms.uStars.value = pal.stars;
    // The sun climbs from just under the horizon as the flight goes on.
    const lift = -0.03 + 0.3 * smooth(0.02, 0.6, p);
    sunDir.set(0.1, lift, -1).normalize();
    const light = smooth(LIGHT_FROM - 0.06, LIGHT_FROM + 0.06, p);
    (petalMat.uniforms.uPetalShade.value as THREE.Vector3).copy(petalShadeDark).lerp(petalShadeLight, light);
    (petalMat.uniforms.uPetalLight.value as THREE.Vector3).copy(petalLightDark).lerp(petalLightLight, light);
    (trailMat.uniforms.uColour.value as THREE.Vector3).set(1, 1 - 0.1 * light, 1 - 0.04 * light);

    pose(s, camera);
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));
    camera.rotateY(-pointer.x * 0.035);
    camera.rotateX(-pointer.y * 0.022);
    // Wider when it is going fast.
    const base = width / height >= 1.5 ? 52 : clamp(2 * Math.atan(Math.tan((52 * Math.PI) / 360) * (1.5 / (width / height))) * (180 / Math.PI), 52, 82);
    const fov = base + clamp(Math.abs(speed) * 0.07, 0, 5);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 5));
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    // The dart pulls ahead under speed, and goes on ahead at the landing.
    const lead = LEAD + clamp(speed * 0.035, -0.8, 2.2) + smooth(0.93, 1, p) * 3;
    const sd = Math.min(s + lead, L - 0.5);
    frame(sd, 55, Math.sin(time * 0.7) * 0.05);
    P.addScaledVector(U, Math.sin(time * 1.3) * 0.05 + smooth(0.93, 1, p) * 1.9);
    V.copy(T).negate();
    dart.matrix.makeBasis(R, U, V).scale(dart.scale).setPosition(P);
    dart.matrixWorldNeedsUpdate = true;
    trailMat.uniforms.uCraft.value = sd;

    camera.getWorldDirection(V);
    (petalMat.uniforms.uCentre.value as THREE.Vector3).copy(camera.position).addScaledVector(V, 24);
    keyDir.copy(V).multiplyScalar(-0.7).addScaledVector(UP, 0.6);
    R.crossVectors(V, UP).normalize();
    keyDir.addScaledVector(R, clamp(sunDir.dot(R) * 3, -0.4, 0.4)).normalize();

    for (let i = 0; i < stops.length; i += 1) {
      const stop = stops[i];
      const d = p - STOP_P[i];
      // The still frame is sky and dart only: the titles are in the text under it.
      const showTitle = opts.still ? 0 : span(d, -0.062, -0.026, 0.016, 0.034);
      const showText = span(d, -0.03, -0.008, 0.012, 0.028);
      stop.group.visible = stop.built && showTitle > 0.001;
      view.stops[i * 3 + 2] = 0;
      if (!stop.group.visible || !stop.material) continue;
      // Lost in the haze until it is near. Without this a title showed
      // faintly through the cloud the camera was still inside.
      const away = camera.position.distanceTo(stop.group.position);
      stop.material.uniforms.uOpacity.value = showTitle * (1 - smooth(26, 40, away));
      for (const f of stop.floaters) {
        f.group.position.copy(f.home);
        f.group.position.y += Math.sin(time * 0.7 + f.phase) * f.bob;
        f.group.rotation.x += f.spin.x * dt;
        f.group.rotation.y += f.spin.y * dt;
        f.group.rotation.z += f.spin.z * dt;
        // They arrive small and grow into place.
        f.group.scale.setScalar(0.001 + 1.3 * showTitle * showTitle * (3 - 2 * showTitle));
      }
      V.copy(stop.corner);
      const front = project(V, view.stops, i * 3);
      view.stops[i * 3 + 2] = front ? showText : 0;
    }

    lanterns.visible = ready && p > 0.5;
    let n = 0;
    for (let g = 0; g < skillGroups.length; g += 1) {
      const d = p - GROUP_P[g];
      const show = span(d, -0.03, -0.012, 0.007, 0.019);
      V.copy(groupAnchor[g]);
      const front = project(V, view.groups, g * 3);
      view.groups[g * 3 + 2] = front ? show : 0;
      const count = skillGroups[g].skills.length;
      if (show > 0.001) {
        for (let k = n; k < n + count; k += 1) {
          V.set(lanternHome[k * 3], lanternHome[k * 3 + 1] + Math.sin(time * 0.8 + lanternSeed[k] * 6.283) * 0.12 - DISC_R - 0.16, lanternHome[k * 3 + 2]);
          project(V, view.skills, k * 2);
        }
      }
      n += count;
    }

    renderer.render(scene, camera);
    view.p = p;
    opts.onFrame(view);
  };

  const tick = (now: number): void => {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    // Zooming the page, or dragging the window to another screen, changes
    // this without changing the stage's size, so nothing else reports it.
    if ((window.devicePixelRatio || 1) !== ratio) resize();
    draw(dt);
    if (onScreen && !document.hidden && !opts.still) raf = requestAnimationFrame(tick);
  };
  const wake = (): void => {
    if (disposed || raf) return;
    if (opts.still) {
      if (ready) raf = requestAnimationFrame(() => {
        raf = 0;
        if (!disposed) draw(0);
      });
      return;
    }
    if (onScreen && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  };

  let ratio = 0;
  const resize = (): void => {
    width = Math.max(stage.clientWidth, 1);
    height = Math.max(stage.clientHeight, 1);
    ratio = window.devicePixelRatio || 1;
    // Never more than 2560 across, whatever the screen.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, 2560 / width));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (opts.still) wake();
  };
  const sizes = new ResizeObserver(resize);
  sizes.observe(stage);
  resize();

  const seen = new IntersectionObserver(
    (entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      wake();
    },
    { rootMargin: "10% 0px" },
  );
  seen.observe(stage);
  const onVisible = (): void => wake();
  document.addEventListener("visibilitychange", onVisible);
  const onPointer = (e: PointerEvent): void => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!opts.still) window.addEventListener("pointermove", onPointer, { passive: true });

  // The titles and marks are drawn in the page's Inter, which may still
  // be loading. The flight starts without them and they join it.
  const family = interFamily();
  void fontsReady(family).then(() => {
    if (disposed) return;
    buildStops(family);
    const dpr = renderer.getPixelRatio();
    lanternMat.uniforms.uAtlas.value = keep(makeSkillAtlas(allSkills, family, dpr * width > 2200 ? 256 : 192));
    ready = true;
    wake();
  });

  return {
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      sizes.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointermove", onPointer);
      for (const g of builder.geometries) g.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
