import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import { type BarCanvas, type BarLayerConfig, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { cameraPos, FOV, SCENE_COUNT, SCENES, SHIFT } from "./layout";
import {
  Bag,
  type Built,
  buildBlaster,
  buildField,
  buildMicrophone,
  buildPlanet,
  buildPlinth,
  buildRing,
  buildSkills,
  makeGreys,
  type RobotScene,
} from "./scenes";

/**
 * The picture behind the index. One three.js renderer draws the scene for
 * the row under the cursor into a small canvas that is never shown. Each
 * frame that picture is copied into a second canvas, darkened by the
 * current level, and the bar pass redraws it full screen as blossom bars
 * on the plum ground. Bright parts give wide bars, dark parts thin ones,
 * and black gives none. So a swap is: the level falls to zero (the bars
 * thin to nothing), the scene changes, the level rises (the new bars grow).
 */

export type StageState = {
  /** The scene on screen now. */
  scene: number;
  /** The scene asked for. -1 means none: the first project, faint. */
  target: number;
  /** 0 no bars, 1 full. */
  level: number;
  robotLoaded: boolean;
  /** Source picture size, px. */
  source: [number, number];
  /** Bar grid, cells. */
  grid: [number, number];
};

export type Stage = {
  setTarget: (i: number) => void;
  state: () => StageState;
  destroy: () => void;
};

/** How bright the bars are with nothing hovered. */
const IDLE_LEVEL = 0.42;
/** Bar columns across the screen. */
const COLUMNS = 170;
/** Source pixels per bar column. */
const TEXELS_PER_COLUMN = 4;

export function startStage(host: HTMLElement, barEl: HTMLCanvasElement, opts: { still: boolean; monoFamily: string }): Stage {
  const bag = new Bag();

  // The context is asked for here, before three.js sees the canvas, so a
  // browser without WebGL 2 throws now and the page keeps its words.
  const glCanvas = document.createElement("canvas");
  const gl = glCanvas.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  if (!gl) throw new Error("no webgl2");
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Lit so the faces the key misses stay near half grey, never black.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(3, 1, -2);
  scene.add(fill);
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 60);

  const greys = makeGreys(bag);
  const field = buildField(bag, greys);
  const plinth = buildPlinth(bag, greys);
  const built: Built[] = [
    buildMicrophone(bag, greys),
    buildBlaster(bag, greys),
    buildRing(bag, greys),
    field,
    buildPlanet(bag, greys),
    ...skillGroups.map((g, i) => buildSkills(bag, g, i + 1, opts.monoFamily)),
    plinth,
  ];
  if (built.length !== SCENE_COUNT) throw new Error("scene count");
  for (const b of built) {
    b.group.visible = false;
    scene.add(b.group);
  }

  // The source the bar pass reads: the render, scaled by the level.
  const src = document.createElement("canvas");
  const ctx = src.getContext("2d");
  if (!ctx) throw new Error("no 2d");

  const config: BarLayerConfig = {
    x: 0,
    y: 0,
    width: "100%",
    height: "100%",
    xSquares: COLUMNS,
    ySquares: 80,
    // Inverted grade: bright parts get the wide bars, so the lit subject
    // stands out in blossom. Black stays empty either way.
    blackPoint: 255,
    whitePoint: 0,
    minSquareWidth: "0%",
    maxSquareWidth: "96%",
    bgOpacity: 0,
    fillOpacity: 1,
  };

  let cur = 0;
  let target = -1;
  let level = 0;
  let clock = 0;
  let robotLoaded = false;
  let destroyed = false;
  // Cursor, -1..1, and where the camera has eased to.
  const aim = { x: 0, y: 0 };
  const drift = { x: 0, y: 0 };

  const resize = (): void => {
    const w = Math.max(2, host.clientWidth);
    const h = Math.max(2, host.clientHeight);
    const sw = COLUMNS * TEXELS_PER_COLUMN;
    const sh = Math.max(2, Math.round((sw * h) / w));
    if (glCanvas.width !== sw || glCanvas.height !== sh) {
      renderer.setSize(sw, sh, false);
      src.width = sw;
      src.height = sh;
    }
    camera.aspect = sw / sh;
    // Slide the picture right so the subject sits beside the titles.
    camera.setViewOffset(sw, sh, -SHIFT * sw, 0, sw, sh);
    camera.updateProjectionMatrix();
    // Square cells.
    config.ySquares = Math.max(10, Math.round((COLUMNS * h) / w));
  };

  const show = (i: number): void => {
    built.forEach((b, j) => {
      b.group.visible = j === i;
    });
    cur = i;
  };

  const renderFrame = (): void => {
    const spec = SCENES[cur];
    const [x, y, z] = cameraPos(spec, drift.x, drift.y);
    camera.position.set(x, y, z);
    camera.lookAt(spec.target[0], spec.target[1], spec.target[2]);
    renderer.render(scene, camera);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, src.width, src.height);
    ctx.globalAlpha = Math.max(0, Math.min(1, level));
    ctx.drawImage(glCanvas, 0, 0);
    ctx.globalAlpha = 1;
    // Fainter bars when nothing is hovered, as well as thinner.
    config.fillOpacity = 0.55 + 0.45 * Math.min(1, level);
  };

  const step = (dt: number): void => {
    clock += dt;
    const want = target < 0 ? 0 : target;
    const goal = want !== cur ? 0 : target < 0 ? IDLE_LEVEL : 1;
    // Eased toward the goal; about a third of a second each way.
    level += (goal - level) * (1 - Math.exp(-dt * 9));
    if (want !== cur && level < 0.03) {
      level = 0;
      show(want);
    }
    const ease = 1 - Math.exp(-dt * 3);
    drift.x += (aim.x - drift.x) * ease;
    drift.y += (aim.y - drift.y) * ease;
    built[cur].update(clock, dt);
  };

  resize();
  show(0);
  level = IDLE_LEVEL;
  renderFrame();

  const source: CanvasSource = {
    canvas: src,
    animated: !opts.still,
    update: (_t, dt) => {
      if (destroyed) return false;
      step(dt);
      renderFrame();
      return true;
    },
  };

  const bars: BarCanvas | null = createBarCanvas(barEl, [{ type: "canvas", source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
  });
  if (!bars) {
    renderer.dispose();
    bag.dispose();
    throw new Error("no bar canvas");
  }

  // The robot, loaded once and shared by the field and the plinth. Its
  // own materials are swapped for the pale grey the other scenes use.
  const robotScenes: RobotScene[] = [field, plinth];
  let robotRoot: THREE.Object3D | null = null;
  const loadRobot = async (): Promise<void> => {
    const response = await fetch("/models/hero.glb", { priority: "low" } as RequestInit);
    const bytes = await response.arrayBuffer();
    if (destroyed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (destroyed) return;
    robotRoot = gltf.scene;
    const olds = new Set<THREE.Material>();
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      bag.add(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) olds.add(mat);
      m.material = greys.light;
    });
    for (const mat of olds) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
    for (const s of robotScenes) s.attach(gltf.scene);
    robotLoaded = true;
    // A still page drew before the robot came; draw again with it.
    if (opts.still && (cur === 3 || cur === 10)) {
      renderFrame();
      bars.redraw();
    }
  };
  loadRobot().catch(() => {
    // The field and plinth stand without the robot.
  });

  const onPointer = (e: PointerEvent): void => {
    aim.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    aim.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
  };
  if (!opts.still) window.addEventListener("pointermove", onPointer, { passive: true });
  // A still page has no loop to pick up the new size, so it redraws here.
  const onResize = (): void => {
    resize();
    if (opts.still) {
      renderFrame();
      bars.redraw();
    }
  };
  window.addEventListener("resize", onResize);

  return {
    setTarget: (i: number) => {
      // A still page keeps the first scene.
      if (opts.still) return;
      target = i >= 0 && i < SCENE_COUNT ? i : -1;
    },
    state: () => ({
      scene: cur,
      target,
      level,
      robotLoaded,
      source: [src.width, src.height],
      grid: [config.xSquares ?? COLUMNS, config.ySquares ?? 0],
    }),
    destroy: () => {
      destroyed = true;
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      bars.destroy();
      scene.clear();
      bag.dispose();
      if (robotRoot) robotRoot.clear();
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
