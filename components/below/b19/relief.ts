import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { SkillGroup } from "@/components/profile";
import * as L from "./layout";
import { DEPTH_FRAG, DEPTH_VERT, WALL_FRAG, WALL_VERT } from "./shaders";
import { drawTile, ROBOT_FLOOR_IN, type TileOptions } from "./wall";

/**
 * The wall in 3D. A row of tiles, each a dense plane pushed out by its
 * height map and shaded in grey by one light. It draws to a small canvas
 * that is never put on the page: the bar dither reads it and draws the
 * bars the visitor sees.
 *
 * It knows nothing about scroll. It is told where the camera and the
 * light are and draws.
 */

export type ReliefFrame = {
  cam: L.Cam;
  light: { x: number; y: number };
  dim: number;
  lintel: number;
};

export type Relief = {
  canvas: HTMLCanvasElement;
  /** Size of the grey picture, in its own pixels. */
  resize(width: number, height: number): void;
  render(f: ReliefFrame): void;
  /** Draw the skill marks again once the page's font is in. */
  redrawSkills(sans: string): void;
  /** Settles once the robot is carved, or could not be. */
  robot: Promise<void>;
  robotState(): "waiting" | "carved" | "failed";
  dispose(): void;
};

const SEGMENTS_X = 200;
const SEGMENTS_Y = 150;
/** The robot's depth picture: this many model units square, this many pixels. */
const ROBOT_SPAN = 0.49;
const ROBOT_PX = 512;

export function buildRelief(groups: SkillGroup[], sans: string, onRobot: () => void): Relief {
  const canvas = document.createElement("canvas");
  canvas.width = L.COLS * 2;
  canvas.height = L.rowsFor(1.85) * 2;
  // The context is asked for here, not by three, so a browser without
  // one fails before anything is built and the page falls back.
  const attributes: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    // The bar dither copies this canvas on its own frame; the picture
    // must still be there when it does.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  };
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) throw new Error("b19: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setPixelRatio(1);
  renderer.setClearColor(new THREE.Color(0.03, 0.03, 0.03), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, 1.85, 0.05, 20);
  let viewH = canvas.height;

  // The uniforms every tile shares, by reference, so one write moves the light on all of them.
  const shared = {
    uDepth: { value: L.DEPTH },
    uLight: { value: new THREE.Vector3(0, 0, L.LIGHT_Z) },
    uPoolR: { value: L.POOL_R },
    uDim: { value: 0 },
    uSpot: { value: new THREE.Vector4(L.panelX(L.CONTACT_PANEL) + L.SPOT.x, L.SPOT.y, L.SPOT.rx, L.SPOT.ry) },
    uLintel: { value: 0 },
    uLintelDepth: { value: L.LINTEL_DEPTH },
    uViewH: { value: viewH },
    uTileSize: { value: new THREE.Vector2(L.TILE_W, L.TILE_H) },
  };

  const opts: TileOptions = { robot: null, robotSpan: ROBOT_SPAN, groups, sans };
  const geometry = new THREE.PlaneGeometry(L.TILE_W, L.TILE_H, SEGMENTS_X, SEGMENTS_Y);
  const tiles = Array.from({ length: L.TILE_COUNT }, (_, t) => {
    const sheet = drawTile(t, document.createElement("canvas"), opts);
    const texture = new THREE.CanvasTexture(sheet);
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uHeight: { value: texture },
        uTexel: { value: new THREE.Vector2(1 / sheet.width, 1 / sheet.height) },
      },
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(L.tileX(t), 0, 0);
    scene.add(mesh);
    return { sheet, texture, material };
  });
  const redraw = (panel: number): void => {
    const tile = tiles[panel - L.TILE_FIRST];
    if (!tile) return;
    drawTile(panel - L.TILE_FIRST, tile.sheet, opts);
    tile.texture.needsUpdate = true;
  };

  // --------------------------------------------- the robot, in profile
  let disposed = false;
  let robotState: "waiting" | "carved" | "failed" = "waiting";
  const robot = (async () => {
    const response = await fetch("/models/hero.glb", { priority: "low" } as RequestInit);
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (disposed) return;
    // Seen from its right side: +z toward the lens, +x to the right.
    const min = L.ROBOT_BOX.min;
    const max = L.ROBOT_BOX.max;
    const midX = (min[0] + max[0]) / 2;
    const half = ROBOT_SPAN / 2;
    const bottom = min[1] - ROBOT_FLOOR_IN;
    const eye = new THREE.OrthographicCamera(midX - half, midX + half, bottom + ROBOT_SPAN, bottom, 0.5, 1.5);
    eye.position.set(0, 0, 1);
    eye.lookAt(0, 0, 0);
    // Keep the camera's own frame: lookAt from (0,0,1) to the origin leaves the axes as they are.
    const depthMat = new THREE.ShaderMaterial({
      uniforms: { uNear: { value: 1 - max[2] }, uFar: { value: 1 - min[2] } },
      vertexShader: DEPTH_VERT,
      fragmentShader: DEPTH_FRAG,
      side: THREE.DoubleSide,
    });
    const holder = new THREE.Scene();
    holder.add(gltf.scene);
    holder.overrideMaterial = depthMat;
    const target = new THREE.WebGLRenderTarget(ROBOT_PX, ROBOT_PX, { depthBuffer: true, generateMipmaps: false });
    const pixels = new Uint8Array(ROBOT_PX * ROBOT_PX * 4);
    const clear = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(holder, eye);
    renderer.readRenderTargetPixels(target, 0, 0, ROBOT_PX, ROBOT_PX, pixels);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, 1);
    target.dispose();
    depthMat.dispose();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.dispose();
    });
    if (disposed) return;
    // The GPU hands rows back bottom first; the height map wants top first.
    const picture = document.createElement("canvas");
    picture.width = ROBOT_PX;
    picture.height = ROBOT_PX;
    const pctx = picture.getContext("2d");
    if (!pctx) throw new Error("b19: no 2D context");
    const data = pctx.createImageData(ROBOT_PX, ROBOT_PX);
    const row = ROBOT_PX * 4;
    for (let y = 0; y < ROBOT_PX; y += 1) data.data.set(pixels.subarray((ROBOT_PX - 1 - y) * row, (ROBOT_PX - y) * row), y * row);
    pctx.putImageData(data, 0, 0);
    opts.robot = picture;
    redraw(L.ROBOT_PANEL);
    robotState = "carved";
    onRobot();
  })().catch(() => {
    // The frame and the field stand without it.
    robotState = "failed";
  });

  const resize = (width: number, height: number): void => {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (canvas.width === w && canvas.height === h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewH = h;
    shared.uViewH.value = h;
  };

  const render = (f: ReliefFrame): void => {
    if (disposed) return;
    camera.position.set(f.cam.x, f.cam.y, f.cam.z);
    camera.rotation.set(0, f.cam.yaw, 0);
    camera.updateMatrixWorld();
    shared.uLight.value.set(f.light.x, f.light.y, L.LIGHT_Z);
    shared.uDim.value = f.dim;
    shared.uLintel.value = f.lintel;
    shared.uViewH.value = viewH;
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    for (const t of tiles) {
      t.texture.dispose();
      t.material.dispose();
      t.sheet.width = 0;
      t.sheet.height = 0;
    }
    renderer.dispose();
    renderer.forceContextLoss();
  };

  return {
    canvas,
    resize,
    render,
    redrawSkills: (family: string) => {
      opts.sans = family;
      redraw(L.SKILLS_PANEL);
    },
    robot,
    robotState: () => robotState,
    dispose,
  };
}
