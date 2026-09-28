import * as THREE from "three";

import { buildRibbon, GESTURES, placeCamera, type Box } from "@/components/below/b20/layout";
import { RIBBON_FRAG, RIBBON_VERT } from "@/components/below/b20/shaders";

/**
 * A column of brush strokes running down the page (design 20's brush).
 *
 * The strokes stand in a tall strip of world space, one every STEP
 * screens, and the camera moves down the strip with the scroll. Each one
 * paints itself in as it comes up from the bottom of the screen, is done
 * by the time it reaches the middle, and fades as it leaves at the top,
 * so however far you scroll there is always one being painted.
 *
 * Solid blossom on a transparent canvas, not through the bar shader:
 * over plum a painted stroke reads at a glance.
 */

const FRAG = RIBBON_FRAG.replace(
  "gl_FragColor = vec4(vec3(clamp(ink, 0.0, 1.0) * uLevel), 1.0);",
  "gl_FragColor = vec4(uInk, clamp(ink, 0.0, 1.0) * uLevel);",
).replace("uniform float uDraw;", "uniform float uDraw;\nuniform vec3 uInk;");

/** Screens between one stroke and the next. */
const STEP = 0.72;
const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Where stroke i goes on its own screen: down the right, drifting. */
const boxFor = (i: number): Box => {
  const lanes = [
    { x0: 0.5, x1: 0.94 },
    { x0: 0.56, x1: 0.97 },
    { x0: 0.46, x1: 0.88 },
  ];
  const l = lanes[i % lanes.length];
  return { x0: l.x0, y0: 0.08, x1: l.x1, y1: 0.92 };
};

export type BrushColumn = {
  /** screens: how far the column's top is above the top of the screen. */
  render(screens: number, strength: number): void;
  resize(): void;
  dispose(): void;
};

export function createBrushColumn(canvas: HTMLCanvasElement, count: number, ink: string): BrushColumn | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const colour = new THREE.Color(ink);

  const strokes = Array.from({ length: count }, (_, i) => {
    const g = GESTURES[i % GESTURES.length];
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: FRAG,
      uniforms: { uDraw: { value: 0 }, uLevel: { value: 0 }, uLen: { value: 1 }, uSeed: { value: g.seed + i * 1.7 }, uInk: { value: colour } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geo, mat);
    // Screen height is two world units at the camera's rest distance.
    mesh.position.y = -2 * STEP * i;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, geo, gesture: g };
  });

  let aspect = 1;
  const resize = (): void => {
    const w = Math.max(2, canvas.clientWidth);
    const h = Math.max(2, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, 2560 / w));
    renderer.setSize(w, h, false);
    aspect = w / h;
    placeCamera(camera, aspect);
    strokes.forEach((s, i) => {
      const r = buildRibbon(s.gesture, boxFor(i), aspect, "contain");
      s.geo.setAttribute("position", new THREE.BufferAttribute(r.positions, 3));
      s.geo.setAttribute("uv", new THREE.BufferAttribute(r.uvs, 2));
      s.geo.setIndex(new THREE.BufferAttribute(r.index, 1));
      s.geo.computeBoundingSphere();
      s.mat.uniforms.uLen.value = r.length;
    });
  };
  resize();

  let last = "";
  const render = (screens: number, strength: number): void => {
    camera.position.y = -2 * screens;
    camera.lookAt(camera.position.x, camera.position.y, 0);
    camera.updateMatrixWorld(true);
    let key = `${screens.toFixed(4)}|${strength.toFixed(3)}`;
    strokes.forEach((s, i) => {
      // Where the stroke's middle is, in screens below the screen's middle.
      const at = STEP * i - screens;
      const draw = smooth((0.75 - at) / 0.75);
      const level = strength * (1 - smooth((-at - 0.25) / 0.45));
      s.mesh.visible = draw > 0.002 && level > 0.002;
      s.mat.uniforms.uDraw.value = draw;
      s.mat.uniforms.uLevel.value = level;
      if (s.mesh.visible) key += `${i}`;
    });
    if (key === last) return;
    last = key;
    renderer.render(scene, camera);
  };

  return {
    render,
    resize: () => {
      last = "";
      resize();
    },
    dispose: () => {
      strokes.forEach((s) => {
        s.geo.dispose();
        s.mat.dispose();
      });
      renderer.dispose();
    },
  };
}
