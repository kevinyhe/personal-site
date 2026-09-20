import * as THREE from "three";
import { drawFace, type Fonts } from "./faces";
import { BLOSSOM, CAM_Z, FOV, type Look, type Pose, PROJECTS, rgbOf, type Scene, SHEETS, SLOT, VIEW_H } from "./layout";
import { SHADOW_FRAGMENT, SHADOW_VERTEX, SHEET_FRAGMENT, SHEET_VERTEX } from "./shaders";

/**
 * The five sheets and the shadow, drawn with three. This file knows
 * nothing about the page. It is handed a canvas and, each frame, where
 * layout.ts says every sheet is and what it shows.
 *
 * The canvas is see-through. The coloured ground is the page behind it.
 */

export type Tilt = {
  resize(width: number, height: number): void;
  draw(scene: Scene, time: number): void;
  redrawFaces(fonts: Fonts): void;
  dispose(): void;
};

const MAX_BUFFER_WIDTH = 2560;

/** Asks the browser for WebGL before three does, so a browser without
 *  it fails here, quietly, and the page keeps its words. */
function contextOf(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("b09: WebGL is not there");
  return gl;
}

type Uniforms = Record<string, THREE.IUniform>;

function sheetUniforms(face: THREE.Texture | null): Uniforms {
  return {
    uTime: { value: 0 },
    uWave: { value: 0 },
    uPhase: { value: 0 },
    uEdge: { value: 0 },
    uIdle: { value: 0 },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uFrom: { value: 0 },
    uTo: { value: 0 },
    uMix: { value: 1 },
    uDir: { value: 1 },
    uCropFrom: { value: new THREE.Vector3(0.5, 0.5, 1) },
    uCropTo: { value: new THREE.Vector3(0.5, 0.5, 1) },
    uSoft: { value: 0.002 },
    uSize: { value: new THREE.Vector2(1.6, 1) },
    uRound: { value: 0.06 },
    uPixel: { value: 0.01 },
    uFace: { value: face },
    uCard: { value: 0 },
    uFlatColour: { value: new THREE.Vector3(...rgbOf(BLOSSOM)) },
    uFlat: { value: 0 },
    uAlpha: { value: 1 },
  };
}

function sheetMaterial(uniforms: Uniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHEET_VERTEX,
    fragmentShader: SHEET_FRAGMENT,
    transparent: true,
  });
}

function place(mesh: THREE.Mesh, p: Pose): void {
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.set(p.rx, p.ry, p.rz);
  mesh.scale.set(p.w, p.h, 1);
}

function show(u: Uniforms, look: Look, time: number): void {
  u.uTime.value = time;
  u.uWave.value = look.wave;
  u.uPhase.value = look.phase;
  u.uEdge.value = look.edge;
  u.uIdle.value = look.idle;
  (u.uPointer.value as THREE.Vector2).set(...look.at);
  u.uFrom.value = look.artFrom;
  u.uTo.value = look.artTo;
  u.uMix.value = look.mix;
  u.uDir.value = look.dir;
  (u.uCropFrom.value as THREE.Vector3).set(...look.cropFrom);
  (u.uCropTo.value as THREE.Vector3).set(...look.cropTo);
  u.uCard.value = look.card;
  u.uFlat.value = look.flat;
}

export function buildTilt(canvas: HTMLCanvasElement, fonts: Fonts): Tilt {
  const gl = contextOf(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  // The large sheet has many more points than the rest: its wave is the
  // one looked at.
  const fine = new THREE.PlaneGeometry(1, 1, 140, 88);
  const coarse = new THREE.PlaneGeometry(1, 1, 64, 40);
  const flatGeometry = new THREE.PlaneGeometry(1, 1);

  const faceCanvases: HTMLCanvasElement[] = [];
  const faces: THREE.CanvasTexture[] = [];
  const sheets: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; uniforms: Uniforms }[] = [];
  for (let k = 0; k < SHEETS; k += 1) {
    const faceCanvas = document.createElement("canvas");
    drawFace(faceCanvas, SLOT[k], fonts);
    // Left as drawn: the shader writes the canvas's own values to the screen.
    const face = new THREE.CanvasTexture(faceCanvas);
    face.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    faceCanvases.push(faceCanvas);
    faces.push(face);

    const uniforms = sheetUniforms(face);
    const material = sheetMaterial(uniforms);
    const mesh = new THREE.Mesh(k === 0 ? fine : coarse, material);
    // A sheet that waves leaves the box three thinks it is in.
    mesh.frustumCulled = false;
    scene.add(mesh);
    sheets.push({ mesh, material, uniforms });
  }

  const shadowUniforms: Uniforms = { uAlpha: { value: 0.4 }, uSize: { value: new THREE.Vector2(1, 1) } };
  const shadowMaterial = new THREE.ShaderMaterial({
    uniforms: shadowUniforms,
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(flatGeometry, shadowMaterial);
  shadow.renderOrder = -1;
  scene.add(shadow);

  let bufferH = 1;

  return {
    resize(width, height) {
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, MAX_BUFFER_WIDTH / w);
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      bufferH = h * ratio;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    draw(layout, time) {
      for (let k = 0; k < SHEETS; k += 1) {
        const { mesh, uniforms } = sheets[k];
        const pose = layout.poses[k];
        const look = layout.looks[k];
        mesh.visible = pose.a > 0.01;
        if (!mesh.visible) continue;
        place(mesh, pose);
        show(uniforms, look, time);
        const near = CAM_Z / Math.max(1, CAM_Z - pose.z);
        const pixels = Math.max(1, (pose.h / VIEW_H) * near * bufferH);
        uniforms.uSoft.value = 1 / pixels;
        uniforms.uPixel.value = (1.5 * pose.h) / pixels;
        (uniforms.uSize.value as THREE.Vector2).set(pose.w, pose.h);
        uniforms.uRound.value = (0.06 + 0.04 * look.card) * (1 - look.flat);
        uniforms.uAlpha.value = pose.a;
      }
      const s = layout.shadow;
      shadow.visible = s.a > 0.01;
      if (shadow.visible) {
        place(shadow, s);
        (shadowUniforms.uSize.value as THREE.Vector2).set(s.w, s.h);
        shadowUniforms.uAlpha.value = 0.42 * s.a;
      }
      renderer.render(scene, camera);
    },

    redrawFaces(next) {
      for (let k = 0; k < SHEETS; k += 1) {
        drawFace(faceCanvases[k], SLOT[k], next);
        faces[k].needsUpdate = true;
      }
    },

    dispose() {
      for (const s of sheets) s.material.dispose();
      for (const f of faces) f.dispose();
      shadowMaterial.dispose();
      fine.dispose();
      coarse.dispose();
      flatGeometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** A moment of each picture that shows it well, seconds. */
const STILL_TIME = [3, 2, 1.6, 4, 2];

/** Draws each project's picture once, flat, into the canvases given.
 *  For the visitor who asked for less motion. Throws if WebGL cannot
 *  start. */
export function drawStills(targets: HTMLCanvasElement[]): void {
  const canvas = document.createElement("canvas");
  const width = 1280;
  const height = 800;
  canvas.width = width;
  canvas.height = height;
  const gl = contextOf(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uniforms = sheetUniforms(null);
  const material = sheetMaterial(uniforms);
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;
    scene.add(new THREE.Mesh(geometry, material));
    uniforms.uSoft.value = 1 / height;
    uniforms.uPixel.value = 1.5 / height;
    (uniforms.uSize.value as THREE.Vector2).set(1.6, 1);
    uniforms.uRound.value = 0.035;

    targets.forEach((target, i) => {
      const art = Math.min(i, PROJECTS - 1);
      uniforms.uFrom.value = art;
      uniforms.uTo.value = art;
      uniforms.uTime.value = STILL_TIME[art];
      renderer.render(scene, camera);
      target.width = width;
      target.height = height;
      // Copied in the same turn as it was drawn, before the browser
      // clears the drawing.
      target.getContext("2d")?.drawImage(canvas, 0, 0);
    });
  } finally {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
