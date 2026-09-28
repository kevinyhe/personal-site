import * as THREE from "three";

import { buildRibbon, GESTURES, placeCamera, type Box, type Ribbon } from "@/components/below/b20/layout";
import { RIBBON_FRAG, RIBBON_VERT } from "@/components/below/b20/shaders";

/**
 * Brush strokes over the pond, the ones design 20 paints: for each
 * project one gesture sweeps in around its lily pad as the camera
 * arrives, dry-brushed at the end, and lifts away as the camera leaves.
 *
 * They are drawn in blossom straight onto a transparent canvas laid over
 * the bars and under the words. Not through the bar shader: on top of
 * the rippling bars a second set of bars would be mush, and a solid
 * painted stroke is what reads from across the room.
 *
 * The geometry, the brush shader and the gestures are design 20's own
 * (b20/layout, b20/shaders). Only the colour is changed here: that
 * shader writes a grey for the dither to read, and this one needs the
 * grey as coverage over the water.
 */

const FRAG = RIBBON_FRAG.replace(
  "gl_FragColor = vec4(vec3(clamp(ink, 0.0, 1.0) * uLevel), 1.0);",
  "gl_FragColor = vec4(uInk, clamp(ink, 0.0, 1.0) * uLevel);",
).replace("uniform float uDraw;", "uniform float uDraw;\nuniform vec3 uInk;");

export type Strokes = {
  /** Draw at scroll position s; `draw(k)` and `level(k)` say how far each stroke is painted. */
  render(draw: (k: number) => number, level: (k: number) => number): void;
  resize(): void;
  dispose(): void;
};

export function createStrokes(canvas: HTMLCanvasElement, boxes: (k: number) => Box, ink: string): Strokes | null {
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

  type S = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; geo: THREE.BufferGeometry; ribbon: Ribbon | null };
  const strokes: S[] = GESTURES.map((g) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: FRAG,
      uniforms: { uDraw: { value: 0 }, uLevel: { value: 1 }, uLen: { value: 1 }, uSeed: { value: g.seed }, uInk: { value: colour } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, geo, ribbon: null };
  });

  let aspect = 1;
  const resize = (): void => {
    const w = Math.max(2, canvas.clientWidth);
    const h = Math.max(2, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, 2560 / w));
    renderer.setSize(w, h, false);
    aspect = w / h;
    placeCamera(camera, aspect);
    strokes.forEach((s, k) => {
      const r = buildRibbon(GESTURES[k], boxes(k), aspect, "contain");
      s.geo.setAttribute("position", new THREE.BufferAttribute(r.positions, 3));
      s.geo.setAttribute("uv", new THREE.BufferAttribute(r.uvs, 2));
      s.geo.setIndex(new THREE.BufferAttribute(r.index, 1));
      s.geo.computeBoundingSphere();
      s.mat.uniforms.uLen.value = r.length;
      s.ribbon = r;
    });
  };
  resize();

  let last = "";
  const render = (draw: (k: number) => number, level: (k: number) => number): void => {
    let key = "";
    strokes.forEach((s, k) => {
      const d = draw(k);
      const l = level(k);
      s.mesh.visible = d > 0.001 && l > 0.001;
      s.mat.uniforms.uDraw.value = d;
      s.mat.uniforms.uLevel.value = l;
      key += `${d.toFixed(3)}:${l.toFixed(3)};`;
    });
    // Nothing changed since the last frame: keep what is on the canvas.
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
