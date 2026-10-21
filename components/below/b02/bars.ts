import * as THREE from "three";

/**
 * The scene printed in the site's bars (valley/barShader's look): it is
 * rendered off screen, then every cell of a grid is read once and drawn as
 * one vertical bar, centred in the cell, as wide as the cell is bright.
 * Bars span the whole cell height, so a lit face comes out as a run of
 * vertical lines, as the valley and the flowers do. Where the scene is
 * empty nothing is drawn and the page shows through.
 *
 * Done in the scene's own WebGL context (a second context for the bar
 * engine would cost one more than the page can spare). Tone mapping and
 * the sRGB curve are applied here, because three.js only applies them when
 * drawing to the screen, not into a render target.
 */

export type BarsOpts = {
  /** Cell width in CSS px; cells are square. */
  cell: number;
  /** The one ink the bars are drawn in. */
  ink: string;
  /** Grey levels (0..1, after tone mapping) that map to no bar and to the
   *  widest bar. */
  black: number;
  white: number;
  /** The widest bar, as a share of the cell. Under 1, so a bright face
   *  stays a run of lines rather than one solid block. */
  maxWidth: number;
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uCell;
uniform vec3 uInk;
uniform float uBlack;
uniform float uWhite;
uniform float uMaxW;
uniform float uExposure;
varying vec2 vUv;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 px = vUv * uRes;
  vec2 cell = floor(px / uCell);
  vec2 c0 = (cell + 0.5) * uCell / uRes;
  vec2 d = vec2(uCell) / uRes * 0.25;
  // Four reads inside the cell, so a thin edge is not lost between centres.
  vec4 s = texture2D(tScene, c0 + vec2(-d.x, -d.y)) + texture2D(tScene, c0 + vec2(d.x, -d.y))
         + texture2D(tScene, c0 + vec2(-d.x, d.y)) + texture2D(tScene, c0 + vec2(d.x, d.y));
  s *= 0.25;
  float a = s.a;
  if (a < 0.03) discard;
  // The target holds colour already multiplied by its alpha.
  vec3 col = pow(aces(s.rgb / max(a, 1e-3) * uExposure), vec3(1.0 / 2.2));
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float w = clamp((L - uBlack) / (uWhite - uBlack), 0.0, 1.0) * uMaxW * a;
  if (w < 0.06) discard;
  float x = fract(px.x / uCell) - 0.5;
  if (abs(x) > w * 0.5) discard;
  gl_FragColor = vec4(uInk, 1.0);
}
`;

export type Bars = {
  setSize(w: number, h: number, ratio: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
};

export function createBars(renderer: THREE.WebGLRenderer, o: BarsOpts): Bars {
  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
  const ink = new THREE.Color(o.ink);
  // Wanted as written: this pass draws straight to the screen, unconverted.
  ink.convertLinearToSRGB();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: target.texture },
      uRes: { value: new THREE.Vector2(2, 2) },
      uCell: { value: o.cell },
      uInk: { value: ink },
      uBlack: { value: o.black },
      uWhite: { value: o.white },
      uMaxW: { value: o.maxWidth },
      uExposure: { value: renderer.toneMappingExposure },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    setSize: (w, h, ratio) => {
      const pw = Math.max(2, Math.round(w * ratio));
      const ph = Math.max(2, Math.round(h * ratio));
      target.setSize(pw, ph);
      mat.uniforms.uRes.value.set(pw, ph);
      mat.uniforms.uCell.value = o.cell * ratio;
    },
    render: (scene, camera) => {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(post, flat);
    },
    dispose: () => {
      target.dispose();
      mat.dispose();
      quad.geometry.dispose();
    },
  };
}
