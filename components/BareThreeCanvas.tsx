"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  addViewportChangeListener,
  getViewportMetrics,
  getViewportWidth,
} from "@/components/viewportMetrics";
import { TREE_BASE_SCALE, treeTuning } from "@/components/treeTuning";
import { sceneFx } from "@/components/sceneFx";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
// Hero composition: the tree floats alone in a near-black void. The camera
// target sits on the tree axis (world x ~2.6) so the canopy reads
// near-centered. The frame's bottom edge at the trunk plane sits at world
// y ~0.55, so the trunk (base at y=0) rises out of the bottom of the
// viewport instead of ending mid-air, and the crown keeps ~15% headroom
// below the top edge.
const FINAL_CAMERA_POSITION = new THREE.Vector3(2.9, 8.35, 15.6);
const INTRO_CAMERA_POSITION = new THREE.Vector3(10.4, 12.9, 17.2);
const HERO_CAMERA_TARGET = new THREE.Vector3(2.55, 6.85, 0);
const HERO_CAMERA_FOV = 42;

// Stage lights. Declared here rather than only at the scene-graph call site
// because the canopy shader needs the same numbers to compute how much light
// passes THROUGH a petal, and two copies of a light position drift apart.
const KEY_LIGHT_POSITION = new THREE.Vector3(-6.5, 10.5, 7.5);
const KEY_LIGHT_COLOR = 0xffd9b4;
const KEY_LIGHT_INTENSITY = 2.7;
const RIM_LIGHT_POSITION = new THREE.Vector3(6.5, 7.5, -9);
const ROSE_GLOW_POSITION = new THREE.Vector3(2.7, 1.1, -4.5);
const ROSE_GLOW_COLOR = 0xff4f8b;

// Halftone post-pass: the finished frame is redrawn as a print-style grid of
// round dots (ordered dither), like the reference site's dot-matrix render.
// Cell edge in CSS px — multiplied by the render pixel ratio at runtime, so
// dots read ~3-5 screen px. "low" quality bumps it one step larger.
const HALFTONE_CELL_CSS_PX = 4.1;
// 0..1 mix of dithered over the smooth render; below 1 a hint of the smooth
// image survives under the dots.
const HALFTONE_STRENGTH = 0.85;

const HALFTONE_VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute vec3 position;
// Single clip-space triangle covering the screen; no matrices needed.
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HALFTONE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uCellSize;
uniform float uStrength;
uniform float uExposure;
// The scene texture is EXTENDED upward past the viewport (see the CRT
// stage): the flat hero path samples only its bottom band, which stays
// pixel-identical to a plain viewport render.
uniform vec2 uSceneRemap;
uniform vec2 uSceneOffset;
// Shifts the dot/Bayer lattice so the band region's grid is identical in
// the flat and display passes (portrait centres the band at a non-cell
// x offset; without this the whole dot field jumped sideways and
// re-dithered at the path switch).
uniform vec2 uGridOffset;

// The target holds the LINEAR frame (three skips renderer.toneMapping and
// output encoding for render targets), so the pass applies tone mapping and
// sRGB itself before dithering. ACES here is the Narkowicz fit — visually
// close to three's ACESFilmic for this scene's dark range.
vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 srgbEncode(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

vec3 displayColor(vec2 uv) {
  return srgbEncode(acesFilm(texture2D(uScene, uv * uSceneRemap + uSceneOffset).rgb * uExposure));
}

// 2x2 Bayer rank: [[0, .5], [.75, .25]].
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

// Exact 8x8 Bayer threshold: 64 distinct values in [0, 63/64]. The fine 2x2
// carries the coarse steps; each coarser level refines by a quarter.
float bayer8(vec2 a) {
  return bayer2(a) + bayer2(a * 0.5) * 0.25 + bayer2(a * 0.25) * 0.0625;
}

void main() {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 cell = floor((fragPx - uGridOffset) / uCellSize);
  vec2 cellCenter = (cell + 0.5) * uCellSize + uGridOffset;

  vec3 cellColor = displayColor(cellCenter / uResolution);
  vec3 smoothColor = displayColor(fragPx / uResolution);

  float luma = dot(cellColor, vec3(0.2126, 0.7152, 0.0722));
  // Bayer jitter staggers the tone step from cell to cell so gradients
  // break into dither texture instead of concentric rings.
  float bayerJitter = bayer8(cell);
  float tone = clamp(luma + (bayerJitter - 0.5) * 0.22, 0.0, 1.0);

  // Print-style sizing: dot area tracks tone, sqrt turns area into radius
  // (in cell units). Cells darker than the floor print nothing, so the
  // void stays clean black.
  float radius = tone < 0.05 ? 0.0 : sqrt(tone) * 0.57;
  float dist = length(fragPx - cellCenter) / uCellSize;
  float edge = 0.7 / uCellSize;
  float inDot = radius <= 0.0
    ? 0.0
    : 1.0 - smoothstep(max(radius - edge, 0.0), radius + edge, dist);

  // Dithered quantization: jittering each cell's rounding by its Bayer
  // value makes adjacent cells alternate between neighbouring levels, so
  // smooth gradients stay smooth at viewing distance instead of breaking
  // into contour bands (a hard floor posterized the dark backdrop into
  // topographic layers).
  vec3 ink = floor(cellColor * 6.0 + vec3(bayerJitter)) / 6.0;
  vec3 voidInk = vec3(10.0 / 255.0); // #0a0a0a
  vec3 dotted = mix(voidInk, ink, inDot);

  // Final output dither. The Bayer jitter above only dithers the 6-level ink
  // step; nothing was dithering the write to the 8-bit framebuffer itself.
  // This scene lives almost entirely in the dark end, where a gentle ramp
  // crosses very few of the 256 codes — the backdrop measured 45px flat
  // plateaus with a 1/255 edge between them, which is what reads as contour
  // lines across the sky. White noise at exactly the rounding interval
  // (+-0.5/255) randomises which way each pixel rounds, so the plateau edges
  // dissolve and the average value is preserved.
  // A single rectangular draw of +-0.5 LSB. Textbook dither theory prefers
  // triangular noise (two independent draws, +-1 LSB) because it decorrelates
  // the quantisation error from the signal — but measured here it was worse,
  // 34px residual plateaus against 12px for this version. These sin-based
  // hashes are not independent enough on a pixel grid for the sum to actually
  // come out triangular, so the theoretical win never materialises. Keeping
  // the version that measured better.
  float outDither =
    fract(sin(dot(fragPx, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  vec3 outColor = mix(smoothColor, dotted, uStrength) + outDither / 255.0;
  gl_FragColor = vec4(outColor, 1.0);
}
`;

// Void backdrop: an animated fluid gradient — a few large, soft pink blobs
// drifting and morphing slowly on near-black, replacing the old static
// radial glow. Runs on the backdrop plane behind the tree; the halftone
// post-pass dithers it along with the rest of the frame (intended). The
// scene target holds the LINEAR frame, so this shader outputs linear
// values (its color uniforms are THREE.Color, already converted to the
// linear working space) and the halftone pass applies ACES + sRGB once —
// same pipeline the old sRGB-texture backdrop went through, no
// double-brightening.
const VOID_BACKDROP_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VOID_BACKDROP_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerForce;
uniform vec3 uBase;
uniform vec3 uDeep;
uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uViolet;
uniform vec3 uWarmTint;
uniform vec3 uCoolTint;
varying vec2 vUv;

// One vertical light shaft: a soft horizontal gaussian bump.
float shaft(float x, float c, float w) {
  float d = (x - c) / w;
  return exp(-d * d);
}

// One backlit curtain. Returns (weighted intensity, its square, its square
// times the hue bias), so the caller can recover a hue that tracks whichever
// curtain dominates locally. Squared weighting matters: with a plain
// intensity-weighted mean every overlap averages back to the middle hue and
// the colour variation cancels out almost exactly where the frame is
// brightest, which measured as LESS hue spread than the version it replaced.
//
// Every curtain used to share ONE sway term and ONE vertical fade, and that
// is exactly why the backdrop read as a single blob: four gaussians swaying
// in lockstep and dissolving at the same height sum to one smooth smear no
// matter how their centers are spaced. Each now carries its own sway phase
// and amplitude, its own dissolve depth, its own fold spacing and its own
// hue, so they overlap as separate hanging panels.
vec3 curtain(vec2 p, float wgt, float cx, float w, float amp, float ph,
             float drop, float folds, float hue) {
  float t = uTime;
  // Aurora sway. The old version had every fold STANDING — the phase held
  // still and only the amplitude breathed, which is how fabric moves, not
  // how an aurora moves. What makes the real thing read as an aurora is that
  // the folds PROPAGATE along the curtain: a ripple enters at one end and
  // travels the length of it. Every phase term below therefore carries a
  // time coefficient large enough to cross the visible frame in 10-25s,
  // rather than the 1-3 minute drift this used to have.
  float sway =
    0.085 * amp * sin(p.y * 4.5 + t * 0.42 + ph) +
    0.045 * amp * sin(p.y * 9.0 - t * 0.31 + ph * 1.7);
  float x = p.x + sway;
  float s = shaft(x, cx, w);
  // Rays: the fine vertical striations inside a curtain, sweeping sideways.
  // Deliberately low frequency — at ~15-25 cycles across the plane a ray is
  // 150-580 screen px, far above the 4.1px halftone cell, so it dithers as
  // shading rather than as speckle.
  s *= 1.0 + 0.16 * sin(x * folds - t * 1.6 + ph * 3.0) +
       0.09 * sin(x * folds * 2.3 + t * 1.1 + ph);
  // Vertical pulse travelling UP the rays, which is the other half of the
  // aurora read: brightness surges run along a curtain's height while the
  // folds run along its width.
  s *= 1.0 + 0.12 * sin(p.y * 7.0 - t * 0.95 + x * 3.0 + ph);
  // Own dissolve height, so the bottom edge is ragged across the frame
  // instead of every panel ending on one flat horizon. The edge ripples too,
  // so the curtain's lower border is never still.
  float vTop = clamp((0.26 - p.y) / drop, 0.0, 1.3);
  float fade =
    1.0 - smoothstep(0.0, 1.25, vTop + 0.13 * sin(x * 2.5 - t * 0.5 + ph));
  float i = wgt * max(s, 0.0) * fade;
  return vec3(i, i * i, i * i * hue);
}

void main() {
  // Plane-local coords corrected for the 110x62 plane aspect so radii are
  // isotropic. The camera sees roughly x in [-0.47, 0.45] and
  // y in [-0.27, 0.24] of this space.
  // 1.774 = 110/62 and 1.6129 = 100/62: the plane grew to 110x100 for
  // ultrawide coverage, but p keeps the original 62-unit world scale so
  // every tuned constant below is unchanged.
  vec2 p = vec2((vUv.x - 0.5) * 1.774, (vUv.y - 0.5) * 1.6129);
  float t = uTime;

  // The reference background reads as tall backlit CURTAINS hanging from
  // the top edge — hot highlights up top, a saturated core through the
  // middle, dissolving into black around two-thirds down, the left/bottom
  // staying void. Rebuilt here in pinks.
  //
  // The cursor gently pulls the curtains toward itself over a very broad
  // radius, and lifts a soft glow — a smooth lean, not a distortion.
  //
  // uPointerForce is a PRESENCE, not a velocity: it ramps to 1 the first time
  // the cursor is seen and then holds. It used to carry pointerRustleStrength,
  // which decays to zero about a second after the mouse stops, so the whole
  // field slid back to its unwarped shape every time you paused — the lean
  // was tied to moving rather than to being somewhere.
  vec2 toPtr = p - uPointer;
  float ptrInf = exp(-dot(toPtr, toPtr) / 0.16) * uPointerForce;
  p.x -= toPtr.x * ptrInf * 0.4;

  // A dominant pair right of center, a mid drifter and a faint far-left
  // panel. Centers drift on 1-3 minute periods; everything else about them
  // differs, which is what keeps the overlap from averaging out.
  vec3 c = vec3(0.0);
  c += curtain(p, 1.00, 0.17 + 0.06 * sin(t * 0.050),
        0.30, 1.00, 0.0, 0.50, 15.0, 0.35);
  c += curtain(p, 0.85, 0.35 + 0.05 * sin(t * 0.041 + 2.0),
        0.22, 0.70, 2.3, 0.62, 21.0, 0.85);
  c += curtain(p, 0.55, -0.05 + 0.07 * sin(t * 0.033 + 4.1),
        0.17, 1.35, 4.7, 0.41, 18.0, -0.55);
  c += curtain(p, 0.28, -0.31 + 0.05 * sin(t * 0.046 + 1.2),
        0.15, 1.10, 1.1, 0.34, 25.0, -0.95);

  float I = c.x + ptrInf * 0.3;
  float hue = c.y > 1e-6 ? c.z / c.y : 0.0;
  // Slow spatial drift on top, so a region where two curtains overlap evenly
  // still shifts warm and cool over minutes instead of sitting at the mean.
  hue = clamp(
    hue + 0.40 * sin(p.x * 2.1 + t * 0.031) * sin(p.y * 1.6 - t * 0.023 + 0.7),
    -1.0, 1.0);

  // Intensity ramp: deep rose-maroon shadows, saturated pink core, warm
  // light-pink highlights where curtains overlap near the top.
  vec3 col = uBase;
  col += uDeep * smoothstep(0.0, 0.7, I);
  col = mix(col, uCore, smoothstep(0.3, 1.2, I));
  col = mix(col, uHot, smoothstep(1.0, 2.4, I) * 0.5);

  // Hue spread. Without it colour is a pure function of brightness, so
  // every point at a given intensity is the identical pink and the field
  // flattens into one wash however much the intensity itself varies.
  col *= mix(vec3(1.0), uWarmTint, clamp(hue, 0.0, 1.0) * 0.85);
  col *= mix(vec3(1.0), uCoolTint, clamp(-hue, 0.0, 1.0) * 0.85);

  // Very slow, very large-scale breathing, decorrelated from the curtains,
  // so even an evenly overlapped region is never perfectly flat.
  float breathe =
    sin(p.x * 1.7 + t * 0.037) * sin(p.y * 2.3 - t * 0.029 + 1.4);
  col *= 0.88 + 0.20 * breathe;

  // Faint violet bleed on the far right, like the reference's edge tint.
  float edgeTop = clamp((0.26 - p.y) / 0.50, 0.0, 1.3);
  float edgeFade = 1.0 - smoothstep(0.0, 1.25, edgeTop);
  col += uViolet * (0.14 * shaft(p.x, 0.45, 0.18) * edgeFade);

  // Mild rolloff keeps overlapping peaks luminous but not clipped.
  col = col / (1.0 + 0.35 * col);
  gl_FragColor = vec4(col, 1.0);
}
`;

// CSS homography: maps the viewport rect onto an arbitrary projected quad
// with one matrix3d (a 4x4 with a live w-row IS a projective map). Classic
// adjugate method: H = basis(dst) * adj(basis(src)). Applied from INSIDE the
// render loop, same frame as the camera that produced the quad — computing
// it anywhere else (a separate ticker) lags the DOM one frame behind the
// WebGL screen and the text visibly slips against the glass during scroll.
function homographyAdj(m: number[]) {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}
function homographyMul(a: number[], b: number[]) {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i += 1)
    for (let j = 0; j < 3; j += 1)
      r[i * 3 + j] =
        a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
function homographyBasis(p: number[][]) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
  const a = homographyAdj(m);
  const v = [
    a[0] * p[3][0] + a[1] * p[3][1] + a[2],
    a[3] * p[3][0] + a[4] * p[3][1] + a[5],
    a[6] * p[3][0] + a[7] * p[3][1] + a[8],
  ];
  return [
    m[0] * v[0], m[1] * v[1], m[2] * v[2],
    m[3] * v[0], m[4] * v[1], m[5] * v[2],
    m[6] * v[0], m[7] * v[1], m[8] * v[2],
  ];
}
const HOMOGRAPHY_IDENTITY = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";

type BareThreeCanvasProps = {
  introActive?: boolean;
  /**
   * DOM layer to warp onto the monitor's screen (the website overlay).
   * Applied inside the render loop so DOM and WebGL agree every frame.
   */
  screenLayerRef?: React.RefObject<HTMLDivElement | null>;
  onIntroComplete?: () => void;
  onReady?: () => void;
  onProgress?: (progress: { loaded: number; total: number }) => void;
};

export const SCENE_BUILD_MILESTONE_TOTAL = 5;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function randomPointInUnitSphere(
  rng: () => number,
  target = new THREE.Vector3(),
) {
  do {
    target.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
  } while (target.lengthSq() > 1 || target.lengthSq() < 1e-6);
  return target;
}

function vectorFromAngles(theta: number) {
  return new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)).normalize();
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

type SpringState = { current: number; velocity: number };

function dampSpring(
  current: number,
  target: number,
  velocity: number,
  stiffness: number,
  damping: number,
  dt: number,
  out: SpringState,
) {
  const force = (target - current) * stiffness;
  velocity += force * dt;
  velocity *= Math.exp(-damping * dt);
  current += velocity * dt;

  out.current = current;
  out.velocity = velocity;
  return out;
}

function noiseHash2(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const n00 = noiseHash2(xi, zi);
  const n10 = noiseHash2(xi + 1, zi);
  const n01 = noiseHash2(xi, zi + 1);
  const n11 = noiseHash2(xi + 1, zi + 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

function fbm2(x: number, z: number, octaves = 5) {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2(x, z) * amplitude;
    total += amplitude;
    x = x * 2.03 + 17.2;
    z = z * 2.03 - 11.1;
    amplitude *= 0.52;
  }
  return total > 0 ? value / total : 0;
}

function resolveSceneQuality(q: Quality): Exclude<Quality, "auto"> {
  if (q !== "auto") return q;
  if (typeof window === "undefined") return "high";
  const w = getViewportWidth();
  const dpr = window.devicePixelRatio || 1;
  if (w < 700 || dpr > 2.5) return "low";
  if (w < 1100) return "medium";
  return "high";
}

type Quality = "auto" | "low" | "medium" | "high";

type TreeOptions = {
  seed?: number;
  quality?: Quality;
  blossomCount?: number;
  petalCount?: number;
  showDebugLobes?: boolean;
};

type OccupiedPoint = {
  branchId: number;
  depth: number;
  position: THREE.Vector3;
};

// One flower (or bud) rigidly attached to a twig. `position` is the spur
// point ON the twig curve; the geometry's pedicel starts at its origin, so
// the corolla ends up offset from the spur by exactly the pedicel length.
type BlossomPlacement = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
  wind1: [number, number, number, number];
  wind2: [number, number, number, number];
  revealT: number;
  // Scroll ungrow key (see UNGROW ORDER); flowers go ahead of their twig.
  growKey: number;
  color: THREE.Color;
  // Per-instance multiplier on the material's emissive lift, so clusters
  // glow unevenly instead of as one flat pink mass.
  emissive: number;
  phase: number;
  flutter: number;
  // Baked canopy self-occlusion: bent normal in xyz, openness in w. Filled
  // in after every blossom is placed, since it depends on all of them.
  shade: [number, number, number, number];
};

type BranchFrame = {
  binormal: THREE.Vector3;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  radius: number;
  tangent: THREE.Vector3;
};

class CanopyLobe {
  id: number;
  center: THREE.Vector3;
  radius: THREE.Vector3;
  colorBias: number;
  density: number;
  weight: number;
  targets: THREE.Vector3[] = [];

  constructor({
    id,
    center,
    radius,
    colorBias = 0.08,
    density = 1,
    weight = 1,
  }: {
    id: number;
    center: THREE.Vector3;
    radius: THREE.Vector3;
    colorBias?: number;
    density?: number;
    weight?: number;
  }) {
    this.id = id;
    this.center = center;
    this.radius = radius;
    this.colorBias = colorBias;
    this.density = density;
    this.weight = weight;
  }
}

class Branch {
  id: number;
  parent: Branch | null;
  children: Branch[] = [];
  depth: number;
  attachT: number;
  curve: THREE.CatmullRomCurve3;
  baseRadius: number;
  tipRadius: number;
  lobeId: number;
  terminal: boolean;
  weight = 0;
  windLimbPhase = 0;
  windLimbAmpBase = 0;
  windLimbAmpLocal = 0;
  windLimbLagBase = 0;
  windLimbLagLocal = 0;
  windTwigPhase = 0;
  windTwigAmpBase = 0;
  windTwigAmpLocal = 0;
  windTwigLagBase = 0;
  windTwigLagLocal = 0;
  windFlutterBase = 0;
  windFlutterLocal = 0;
  // Ungrow order (see computeGrowthOrder): the retract key at t=0 and t=1.
  // Linear in t because the curve is arc-length parametrised.
  growKey0 = 0;
  growKey1 = 0;

  constructor({
    id,
    parent,
    depth,
    attachT,
    curve,
    baseRadius,
    tipRadius,
    lobeId,
    terminal = false,
  }: {
    id: number;
    parent: Branch | null;
    depth: number;
    attachT: number;
    curve: THREE.CatmullRomCurve3;
    baseRadius: number;
    tipRadius: number;
    lobeId: number;
    terminal?: boolean;
  }) {
    this.id = id;
    this.parent = parent;
    this.depth = depth;
    this.attachT = attachT;
    this.curve = curve;
    this.baseRadius = baseRadius;
    this.tipRadius = tipRadius;
    this.lobeId = lobeId;
    this.terminal = terminal;
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    return this.curve.getPointAt(clamp01(t), target);
  }

  getTangent(t: number, target = new THREE.Vector3()) {
    return this.curve.getTangentAt(clamp01(t), target).normalize();
  }

  getEnd(target = new THREE.Vector3()) {
    return this.getPoint(1, target);
  }

  getRadius(t: number) {
    return THREE.MathUtils.lerp(this.baseRadius, this.tipRadius, clamp01(t));
  }
}

// ---------------------------------------------------------------------------
// Branch wind parameters (CPU side).
//
// The displacement is a sum of two coherent tiers plus tip flutter (see
// WIND_SHADER_CHUNK for the exact GPU formula):
//   limb tier  depths 1-3. Every branch in a primary's subtree shares the
//              primary's phase, so the tier collapses to one amplitude/lag
//              pair per point and joints stay continuous.
//   twig tier  depths 4+. Each depth-4 twig leader draws its own phase from
//              its attachment position; sub-twigs inherit that phase, so a
//              strand family sways as one while neighbouring strands stay
//              decorrelated under the shared gust envelope.
// Per branch we store base values (inherited chain, frozen at the attach
// point) and local values (this branch's own contribution, ramped along the
// branch). getBranchWindVectors(branch, t) collapses everything into the two
// vec4s fed to the shaders; any point rigidly attached to a branch
// (blossoms!) must bake those same vec4s to reproduce the anchor motion.
// ---------------------------------------------------------------------------
function getWindRamp(t: number) {
  return Math.pow(smoothstep(0.06, 1, clamp01(t)), 1.75);
}

function getWindFlutterRamp(t: number) {
  return smoothstep(0.45, 1, clamp01(t));
}

// CPU mirror of arborGust() in WIND_SHADER_CHUNK — keep the two in sync.
// Lets CPU-simulated systems (falling petals) surge with the same gust
// envelope the branch/blossom shaders sample from uWindTime.
function arborGustEnvelope(t: number, phase: number) {
  const n =
    Math.sin(t * 0.36 + phase * 0.1) +
    0.6 * Math.sin(t * 0.83 + 1.7 + phase * 0.05) +
    0.35 * Math.sin(t * 0.11 + 4.2);
  return 0.2 + 1.02 * smoothstep(-1.9, 1.75, n);
}

function getLimbWindAmplitude(branch: Branch) {
  const depthAmp =
    branch.depth === 1 ? 0.078 : branch.depth === 2 ? 0.122 : 0.158;
  const radiusFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(0.42, 0.03, branch.baseRadius),
    0.3,
    1,
  );
  return depthAmp * radiusFactor;
}

function getTwigWindAmplitude(branch: Branch) {
  const depthAmp =
    branch.depth === 4 ? 0.175 : branch.depth === 5 ? 0.225 : 0.26;
  const radiusFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(0.06, 0.008, branch.baseRadius),
    0.4,
    1,
  );
  return depthAmp * radiusFactor;
}

function getTwigWindFlutter(branch: Branch) {
  const depthAmp =
    branch.depth === 4 ? 0.008 : branch.depth === 5 ? 0.012 : 0.016;
  const radiusFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(0.05, 0.005, branch.baseRadius),
    0.35,
    1,
  );
  return depthAmp * radiusFactor;
}

type BranchWindVectors = {
  wind1: [number, number, number, number];
  wind2: [number, number, number, number];
};

function getBranchWindVectors(branch: Branch, t: number): BranchWindVectors {
  const ramp = getWindRamp(t);
  const along = clamp01(t);
  return {
    wind1: [
      branch.windLimbPhase,
      branch.windLimbAmpBase + branch.windLimbAmpLocal * ramp,
      branch.windLimbLagBase + branch.windLimbLagLocal * along,
      branch.windTwigPhase,
    ],
    wind2: [
      branch.windTwigAmpBase + branch.windTwigAmpLocal * ramp,
      branch.windTwigLagBase + branch.windTwigLagLocal * along,
      branch.windFlutterBase + branch.windFlutterLocal * getWindFlutterRamp(t),
      0,
    ],
  };
}

function getBranchFrame(branch: Branch, t: number): BranchFrame {
  const point = branch.getPoint(t);
  const tangent = branch.getTangent(t);
  const helper =
    Math.abs(tangent.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : UP.clone();
  const normal = new THREE.Vector3().crossVectors(helper, tangent).normalize();
  const binormal = new THREE.Vector3()
    .crossVectors(tangent, normal)
    .normalize();
  return {
    binormal,
    normal,
    point,
    radius: branch.getRadius(t),
    tangent,
  };
}

class SpatialHash {
  private cellSize: number;
  private buckets = new Map<string, OccupiedPoint[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear() {
    this.buckets.clear();
  }

  private keyFromCell(x: number, y: number, z: number) {
    return `${x},${y},${z}`;
  }

  private cell(v: number) {
    return Math.floor(v / this.cellSize);
  }

  insert(point: OccupiedPoint) {
    const k = this.keyFromCell(
      this.cell(point.position.x),
      this.cell(point.position.y),
      this.cell(point.position.z),
    );
    const bucket = this.buckets.get(k);
    if (bucket) bucket.push(point);
    else this.buckets.set(k, [point]);
  }

  query(position: THREE.Vector3, radius: number) {
    const results: OccupiedPoint[] = [];
    const cr = Math.ceil(radius / this.cellSize);
    const cx = this.cell(position.x);
    const cy = this.cell(position.y);
    const cz = this.cell(position.z);

    for (let x = cx - cr; x <= cx + cr; x += 1) {
      for (let y = cy - cr; y <= cy + cr; y += 1) {
        for (let z = cz - cr; z <= cz + cr; z += 1) {
          const bucket = this.buckets.get(this.keyFromCell(x, y, z));
          if (!bucket) continue;
          for (const point of bucket) {
            if (point.position.distanceTo(position) <= radius)
              results.push(point);
          }
        }
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// UNGROW ORDER.
//
// The CRT transition takes the tree apart the way it grew, in reverse: every
// point on every branch carries a scalar key, and a front sweeps from key 1
// down to key 0, pinching the wood to a point and clipping it past the front.
// The key is a depth tier plus the path distance from the trunk base, so
// sub-twigs and blossoms go first (top of the tree, outermost wood), then
// tertiary/secondary limbs, then the primaries, and the trunk last — each
// retracting tip-to-base. A child's keys all exceed its parent's key at the
// attach point (the tier term), so nothing is ever left hanging in the air.
const UNGROW_DEPTH_WEIGHT = 0.55;
// Width of the pinch zone ahead of the front, in key units.
const UNGROW_FEATHER = 0.035;
// Blossoms start retracting this far ahead of their twig (key units) so the
// flowers are gone before the wood under them goes.
const UNGROW_BLOSSOM_LEAD = 0.06;
// Extra key for flowers high in the canopy (0 at its lowest flower, this at
// the highest), so the canopy visibly peels from the top down. Flowers are
// free instances, so unlike wood this needs no continuity at joints: the
// bias is only ever positive, so a flower still goes before its twig.
const UNGROW_BLOSSOM_HEIGHT_SPREAD = 0.3;
const UNGROW_BLOSSOM_JITTER = 0.04;
// Where the front starts: above the highest possible blossom key plus the
// width of the blossom shrink ramp, so nothing is retracted at rest.
const UNGROW_FRONT_START =
  1 +
  UNGROW_BLOSSOM_LEAD +
  UNGROW_BLOSSOM_HEIGHT_SPREAD +
  UNGROW_BLOSSOM_JITTER +
  0.08;

function branchGrowKey(branch: Branch, t: number) {
  return THREE.MathUtils.lerp(branch.growKey0, branch.growKey1, clamp01(t));
}

// GLSL: the front position for a 0..1 ungrow level. Runs past both ends so
// the feather fully resolves at 0 and at 1.
const UNGROW_SHADER_CHUNK = `
  uniform float uUngrow;
  float arborGrowFront() {
    return mix(${UNGROW_FRONT_START.toFixed(3)}, -0.02, uUngrow);
  }
`;

class BranchGeometryBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  windParams1: number[] = [];
  windParams2: number[] = [];
  // (ungrow key, ring radius) per vertex. The radius lets the vertex shader
  // recover the ring centre from position - normal * radius and collapse
  // the tube onto its spine as the front arrives.
  growParams: number[] = [];
  indices: number[] = [];
  private barkColor = new THREE.Color();
  private center = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private binormal = new THREE.Vector3();
  private point = new THREE.Vector3();

  private getTubularSegments(branch: Branch) {
    return branch.depth === 0
      ? 24
      : branch.depth === 1
        ? 20
        : branch.depth === 2
          ? 14
          : branch.depth === 3
            ? 10
            : branch.depth === 4
              ? 9
              : branch.depth === 5
                ? 6
                : 5;
  }

  // Fine twigs drop to 4/3 radial segments so the much denser sub-twig
  // population stays within a similar overall geometry budget.
  private getRadialSegments(branch: Branch) {
    return branch.baseRadius > 0.55
      ? 18
      : branch.baseRadius > 0.34
        ? 14
        : branch.baseRadius > 0.16
          ? 10
          : branch.baseRadius > 0.06
            ? 7
            : branch.baseRadius > 0.025
              ? 5
              : branch.baseRadius > 0.012
                ? 4
                : 3;
  }

  append(branch: Branch) {
    const depth = branch.depth;
    const tubularSegments = this.getTubularSegments(branch);
    const radialSegments = this.getRadialSegments(branch);
    const baseIndex = this.positions.length / 3;
    const depthFactor = clamp01(depth / 4);
    const transportedNormal = new THREE.Vector3();
    const previousTangent = new THREE.Vector3();
    let hasTransportedFrame = false;

    for (let i = 0; i <= tubularSegments; i += 1) {
      const t = i / tubularSegments;
      const wind = getBranchWindVectors(branch, t);
      const taperT = Math.pow(t, 0.82 - depthFactor * 0.2);
      const baseFlare =
        depth <= 1
          ? 1 + (1 - smoothstep(0, 0.22, t)) * (depth === 0 ? 0.45 : 0.22)
          : 1;
      const tipPinch = branch.terminal ? smoothstep(0.68, 1, t) * 0.58 : 0;
      const radius = Math.max(
        branch.terminal ? 0.006 : 0.003,
        THREE.MathUtils.lerp(branch.baseRadius, branch.tipRadius, taperT) *
          baseFlare *
          (1 - tipPinch),
      );

      branch.curve.getPointAt(t, this.center);
      branch.curve.getTangentAt(t, this.tangent).normalize();

      if (!hasTransportedFrame) {
        const helper =
          Math.abs(this.tangent.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : UP;
        this.normal.crossVectors(helper, this.tangent).normalize();
        transportedNormal.copy(this.normal);
        previousTangent.copy(this.tangent);
        hasTransportedFrame = true;
      } else {
        const tangentAlignment = THREE.MathUtils.clamp(
          previousTangent.dot(this.tangent),
          -1,
          1,
        );
        if (tangentAlignment < 0.999) {
          transportedNormal
            .sub(
              this.tangent
                .clone()
                .multiplyScalar(transportedNormal.dot(this.tangent)),
            )
            .normalize();
        }
        if (transportedNormal.lengthSq() < 1e-6) {
          const helper =
            Math.abs(this.tangent.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : UP;
          transportedNormal.crossVectors(helper, this.tangent).normalize();
        }
        this.normal.copy(transportedNormal);
        previousTangent.copy(this.tangent);
      }
      this.binormal.crossVectors(this.tangent, this.normal).normalize();

      for (let j = 0; j < radialSegments; j += 1) {
        const theta = (j / radialSegments) * TAU;
        const ridge =
          Math.sin(theta * 7.0 + i * 0.36 + depth * 1.3) *
            THREE.MathUtils.lerp(0.1, 0.025, depthFactor) +
          Math.sin(theta * 15.0 + i * 0.71) *
            THREE.MathUtils.lerp(0.036, 0.006, depthFactor);
        const ringRadius = radius * (1 + ridge);

        const nx =
          Math.cos(theta) * this.normal.x + Math.sin(theta) * this.binormal.x;
        const ny =
          Math.cos(theta) * this.normal.y + Math.sin(theta) * this.binormal.y;
        const nz =
          Math.cos(theta) * this.normal.z + Math.sin(theta) * this.binormal.z;

        this.point
          .copy(this.center)
          .addScaledVector(this.normal, Math.cos(theta) * ringRadius)
          .addScaledVector(this.binormal, Math.sin(theta) * ringRadius);

        this.positions.push(this.point.x, this.point.y, this.point.z);
        this.normals.push(nx, ny, nz);
        this.uvs.push(j / radialSegments, t);
        this.windParams1.push(...wind.wind1);
        this.windParams2.push(...wind.wind2);
        this.growParams.push(branchGrowKey(branch, t), ringRadius);

        // Vertex color is a multiplier on the bark map: white everywhere
        // except the last stretch of trunk below the frame's bottom edge
        // (world y ~0.55, local ~0.52), where it ramps toward black so the
        // off-screen cut end melts into the void. On screen this reads as
        // only a subtle darkening right at the frame edge.
        const baseFade = 0.05 + 0.95 * smoothstep(-0.1, 0.8, this.point.y);
        this.barkColor.setScalar(baseFade);
        this.colors.push(this.barkColor.r, this.barkColor.g, this.barkColor.b);
      }
    }

    for (let i = 0; i < tubularSegments; i += 1) {
      for (let j = 0; j < radialSegments; j += 1) {
        const a = baseIndex + i * radialSegments + j;
        const b = baseIndex + i * radialSegments + ((j + 1) % radialSegments);
        const c = baseIndex + (i + 1) * radialSegments + j;
        const d =
          baseIndex + (i + 1) * radialSegments + ((j + 1) % radialSegments);
        this.indices.push(a, c, b, b, c, d);
      }
    }

    const addCap = (t: 0 | 1) => {
      const ringStart =
        baseIndex + (t === 0 ? 0 : tubularSegments * radialSegments);
      const centerIndex = this.positions.length / 3;
      branch.curve.getPointAt(t, this.center);
      branch.curve.getTangentAt(t, this.tangent).normalize();
      if (t === 0) this.tangent.multiplyScalar(-1);

      this.positions.push(this.center.x, this.center.y, this.center.z);
      this.normals.push(this.tangent.x, this.tangent.y, this.tangent.z);
      this.uvs.push(0.5, t);
      const capWind = getBranchWindVectors(branch, t);
      this.windParams1.push(...capWind.wind1);
      this.windParams2.push(...capWind.wind2);
      // Cap normals are the tangent, not radial: radius 0 so the ungrow
      // collapse leaves cap vertices where they are (they are clipped with
      // the ring they belong to).
      this.growParams.push(branchGrowKey(branch, t), 0);
      // Same void fade as the ring vertices: the trunk's bottom cap sits at
      // y=0, below the frame edge, and reads near-black.
      const capFade = 0.05 + 0.95 * smoothstep(-0.1, 0.8, this.center.y);
      this.barkColor.setScalar(capFade);
      this.colors.push(this.barkColor.r, this.barkColor.g, this.barkColor.b);

      const capRingStart = this.positions.length / 3;
      for (let j = 0; j < radialSegments; j += 1) {
        const source = ringStart + j;
        const positionOffset = source * 3;
        const uvOffset = source * 2;
        const colorOffset = source * 3;
        this.positions.push(
          this.positions[positionOffset],
          this.positions[positionOffset + 1],
          this.positions[positionOffset + 2],
        );
        this.normals.push(this.tangent.x, this.tangent.y, this.tangent.z);
        this.uvs.push(this.uvs[uvOffset], t);
        const windOffset = source * 4;
        this.windParams1.push(
          this.windParams1[windOffset],
          this.windParams1[windOffset + 1],
          this.windParams1[windOffset + 2],
          this.windParams1[windOffset + 3],
        );
        this.windParams2.push(
          this.windParams2[windOffset],
          this.windParams2[windOffset + 1],
          this.windParams2[windOffset + 2],
          this.windParams2[windOffset + 3],
        );
        this.colors.push(
          this.colors[colorOffset],
          this.colors[colorOffset + 1],
          this.colors[colorOffset + 2],
        );
        this.growParams.push(this.growParams[source * 2], 0);
      }

      for (let j = 0; j < radialSegments; j += 1) {
        const a = capRingStart + j;
        const b = capRingStart + ((j + 1) % radialSegments);
        if (t === 0) this.indices.push(centerIndex, b, a);
        else this.indices.push(centerIndex, a, b);
      }
    };

    if (depth === 0) addCap(0);
    if (branch.terminal) addCap(1);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(this.normals, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    geometry.setAttribute(
      "windParams1",
      new THREE.Float32BufferAttribute(this.windParams1, 4),
    );
    geometry.setAttribute(
      "windParams2",
      new THREE.Float32BufferAttribute(this.windParams2, 4),
    );
    geometry.setAttribute(
      "growParams",
      new THREE.Float32BufferAttribute(this.growParams, 2),
    );
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

type BranchWindUniforms = {
  uWindTime: { value: number };
  uWindStrength: { value: number };
  // Cursor rustle (see arborPointerRustle in WIND_SHADER_CHUNK): smoothed
  // pointer point on the world z=0 plane, the normalized camera->pointer ray
  // direction (influence falls off with distance from that ray so all
  // depths under the cursor react), 0..1 activity envelope, and the
  // world-space falloff radius.
  uPointerPos: { value: THREE.Vector3 };
  uPointerRayDir: { value: THREE.Vector3 };
  uPointerVel: { value: THREE.Vector3 };
  uPointerStrength: { value: number };
  uPointerRadius: { value: number };
  // 0..1 scroll ungrow level (see UNGROW ORDER). Shared with the blossom
  // materials so flowers and wood read one front.
  uUngrow: { value: number };
};

// ---------------------------------------------------------------------------
// WIND DISPLACEMENT (GPU).
//
// arborWindOffset() returns the tree-local displacement of a point rigidly
// attached to a branch. It is a pure function of uWindTime and two vec4s of
// per-point parameters, so ANY geometry (blossoms, future attachments) can
// reproduce the exact motion of its anchor by baking the same two vec4s.
//
//   windParams1.x = limbPhase   phase (radians) of the limb tier. Shared by a
//                               whole primary-branch subtree, so limbs sway
//                               as units and joints stay continuous.
//   windParams1.y = limbAmp     limb sway amplitude at this point,
//                               tree-local units at gust peak with
//                               uWindStrength = 1. Grows with distance along
//                               the limb, shrinks with limb radius; 0 on the
//                               trunk.
//   windParams1.z = limbLag     limb phase lag (radians); grows outward.
//   windParams1.w = twigPhase   phase of the twig tier. One value per
//                               depth-4 twig "leader", inherited by its
//                               sub-twigs, so each fine strand family sways
//                               together while neighbours are decorrelated.
//   windParams2.x = twigAmp     twig sway amplitude (same units as limbAmp).
//   windParams2.y = twigLag     twig phase lag; largest at the drooping tips
//                               so they trail the gust (the drag that makes
//                               the sway read as natural).
//   windParams2.z = flutterAmp  amplitude of the 2-4 Hz tip flutter; only
//                               non-zero near fine twig tips.
//   windParams2.w = spare (0).
//
// Displacement recipe:
//   gust  = slow smooth envelope (~0.06 / 0.13 Hz sines) shared by the whole
//           tree, sampled slightly late for lagged points; swings between
//           near-calm (0.28) and full gusts (1.0).
//   sway  = per-tier oscillation (limb ~0.32+0.49 Hz, twig ~0.41+0.59 Hz)
//           with per-tier phase, sampled at (uWindTime - lag).
//   dir   = prevailing wind in xz (+x with slight +z) plus slow lateral
//           wander.
//   bend  = limbAmp * gust * (lean + sway)
//         + twigAmp * gust * (lean + sway)
//         + flutterAmp * gust * flutterWave, all * uWindStrength.
//   offset = dir * bend with a small downward dip ~ |bend| (arc drop).
//
// Branch mesh: per-vertex attributes windParams1/windParams2, applied to
// `transformed` (tree-local) in begin_vertex.
// Blossom instances: per-instance attributes blossomWindParams1/
// blossomWindParams2 holding the branch vec4s evaluated at the anchor t
// (see getBranchWindVectors), applied AFTER instanceMatrix inside
// project_vertex - i.e. in the same tree-local space as the branch mesh, so
// blossoms track their twig exactly.
// ---------------------------------------------------------------------------
const WIND_SHADER_CHUNK = `
  uniform float uWindTime;
  uniform float uWindStrength;
  uniform vec3 uPointerPos;
  uniform vec3 uPointerRayDir;
  uniform vec3 uPointerVel;
  uniform float uPointerStrength;
  uniform float uPointerRadius;

  // Influence falls off with the distance from the CAMERA RAY through the
  // cursor, not from a fixed-depth point — front and back branches under
  // the cursor react equally (a plane-point distance excluded the frontmost
  // branches entirely).
  float arborPointerInfluence(vec3 worldPos) {
    vec3 rel = worldPos - uPointerPos;
    vec3 perp = rel - dot(rel, uPointerRayDir) * uPointerRayDir;
    float dist = length(perp);
    return (1.0 - smoothstep(0.0, uPointerRadius, dist)) * uPointerStrength;
  }

  // Cursor rustle: branches are BRUSHED along the pointer's motion plus a
  // small coherent per-branch shake, gated by arborPointerInfluence and
  // scaled by the same per-point wind amplitudes as arborWindOffset, so the
  // trunk and thick limbs barely move while twig tips (and the blossoms
  // baking the same vec4s) respond most. A whole twig family moves in ONE
  // direction — an earlier radial push away from the cursor made nearby
  // geometry expand outward, which read as swelling instead of movement.
  vec3 arborPointerRustle(vec3 worldPos, vec4 wp1, vec4 wp2) {
    float influence = arborPointerInfluence(worldPos);
    float bendWeight =
      clamp(wp1.y * 2.0 + wp2.x * 3.5 + wp2.z * 20.0, 0.0, 1.0);
    float w = influence * bendWeight;
    vec3 brush = uPointerVel * 0.014;
    float brushLen = length(brush);
    brush *= min(brushLen, 0.09) / max(brushLen, 1e-4);
    float phase = wp1.w * 2.0 + wp1.x;
    vec3 skewDir = normalize(vec3(sin(phase * 3.7), 0.35, cos(phase * 2.9)));
    // Decorrelate the response per twig family: without this every blossom
    // answers the brush with the identical vector and the canopy translates
    // as one rigid sheet. Each family gets its own gain (hash of its
    // phase), a slow timing wobble so reactions peak at different moments,
    // and a slight skew of the brush toward its own direction.
    float familyHash = fract(sin(phase * 12.9898) * 43758.5453);
    float gain = (0.55 + 0.9 * familyHash) *
      (0.85 + 0.3 * sin(uWindTime * 2.3 + phase * 5.0));
    vec3 response = mix(brush, skewDir * length(brush), 0.35) * gain;
    float shake =
      sin(uWindTime * 16.0 + phase) +
      0.5 * sin(uWindTime * 23.0 + phase * 1.9);
    return (response + skewDir * (shake * 0.026)) * w;
  }

  float arborGust(float t, float phase) {
    float n =
      sin(t * 0.36 + phase * 0.1) +
      0.6 * sin(t * 0.83 + 1.7 + phase * 0.05) +
      0.35 * sin(t * 0.11 + 4.2);
    return 0.2 + 1.02 * smoothstep(-1.9, 1.75, n);
  }

  vec3 arborWindOffset(vec4 wp1, vec4 wp2) {
    float limbPhase = wp1.x;
    float limbAmp = wp1.y;
    float limbLag = wp1.z;
    float twigPhase = wp1.w;
    float twigAmp = wp2.x;
    float twigLag = wp2.y;
    float flutterAmp = wp2.z;

    float gustLimb = arborGust(uWindTime - limbLag * 0.5, limbPhase);
    float gustTwig = arborGust(uWindTime - twigLag * 0.5, twigPhase);

    // Three tiers per band. The slow term is the gust LEAN: the canopy is
    // pushed over and held there for a second or two, which is what makes a
    // breeze read as a breeze instead of a vibration. The two faster terms
    // are the limb's own ring-down on top of that lean.
    float tl = uWindTime - limbLag;
    float limbSway =
      sin(tl * 1.15 + limbPhase * 0.7) * 0.42 +
      sin(tl * 2.0 + limbPhase) * 0.36 +
      sin(tl * 3.1 + limbPhase * 1.31 + 0.9) * 0.22;
    float tt = uWindTime - twigLag;
    float twigSway =
      sin(tt * 1.5 + twigPhase * 0.6) * 0.35 +
      sin(tt * 2.6 + twigPhase) * 0.42 +
      sin(tt * 3.7 + twigPhase * 1.7 + 1.4) * 0.23;
    float flutterWave =
      sin(uWindTime * 15.0 + twigPhase * 2.7) +
      0.5 * sin(uWindTime * 23.0 + twigPhase * 4.1);

    float bend =
      limbAmp * gustLimb * (0.45 + 0.55 * limbSway) +
      twigAmp * gustTwig * (0.4 + 0.6 * twigSway) +
      flutterAmp * gustTwig * flutterWave;
    bend *= uWindStrength;

    float wander =
      sin(uWindTime * 0.19 + 1.3) * 0.2 + sin(uWindTime * 0.067) * 0.13;
    vec2 windDir = normalize(vec2(1.0, 0.42 + wander));

    return vec3(windDir.x * bend, -abs(bend) * 0.22, windDir.y * bend);
  }
`;

function applyBranchWind(material: THREE.MeshStandardMaterial) {
  const uniforms: BranchWindUniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1 },
    uPointerPos: { value: new THREE.Vector3(0, 6.5, 0) },
    uPointerRayDir: { value: new THREE.Vector3(0, 0, -1) },
    uPointerVel: { value: new THREE.Vector3() },
    uPointerStrength: { value: 0 },
    uPointerRadius: { value: 2 },
    uUngrow: { value: 0 },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uPointerPos = uniforms.uPointerPos;
    shader.uniforms.uPointerRayDir = uniforms.uPointerRayDir;
    shader.uniforms.uPointerVel = uniforms.uPointerVel;
    shader.uniforms.uPointerStrength = uniforms.uPointerStrength;
    shader.uniforms.uPointerRadius = uniforms.uPointerRadius;
    shader.uniforms.uUngrow = uniforms.uUngrow;
    shader.vertexShader =
      `
        attribute vec4 windParams1;
        attribute vec4 windParams2;
        attribute vec2 growParams;
        varying float vGrowKey;
      ` +
      UNGROW_SHADER_CHUNK +
      WIND_SHADER_CHUNK +
      shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      // Ungrow: ahead of the sweeping front the tube pinches onto its
      // spine (position - normal * ringRadius is the ring centre), so each
      // branch tapers to a point and retracts instead of fading. Past the
      // front the fragment stage clips it entirely.
      vGrowKey = growParams.x;
      {
        float front = arborGrowFront();
        float pinch = smoothstep(
          front - ${UNGROW_FEATHER.toFixed(3)}, front, growParams.x);
        transformed -= objectNormal * (growParams.y * pinch);
      }
      transformed += arborWindOffset(windParams1, windParams2);
      transformed += arborPointerRustle(
        (modelMatrix * vec4(transformed, 1.0)).xyz,
        windParams1, windParams2);
      `,
    );

    shader.fragmentShader =
      `varying float vGrowKey;
      ` +
      UNGROW_SHADER_CHUNK +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      if (vGrowKey > arborGrowFront()) discard;
      `,
    );
  };

  material.customProgramCacheKey = () => "branch-wind-v9";
  return uniforms;
}

// ---------------------------------------------------------------------------
// Petal translucency
// ---------------------------------------------------------------------------
// A sakura petal is a couple of cell layers thick and passes more light than
// it reflects, which is why a backlit cherry glows instead of going to
// silhouette. Standard opaque shading cannot show that: it only knows about
// light arriving on the face pointed at the camera, so every petal on the far
// side of the tree renders as the same flat pink as every petal on the near
// side. This adds the light that comes THROUGH.
//
// Two forward-scattering lobes, one per light that sits behind the canopy
// from the camera's point of view: the warm key from upper-front-left and the
// rose glow underneath. Each is a narrow pow lobe for light aimed at the eye
// through the petal, plus a broader term for light merely landing on the back
// face.
type CanopyShadeUniforms = {
  uKeyDir: { value: THREE.Vector3 };
  uKeyColor: { value: THREE.Color };
  uGlowPos: { value: THREE.Vector3 };
  uGlowColor: { value: THREE.Color };
  uTransStrength: { value: number };
  uTransPower: { value: number };
  uBentAmount: { value: number };
};

function createCanopyShadeUniforms(): CanopyShadeUniforms {
  return {
    uKeyDir: { value: KEY_LIGHT_POSITION.clone().normalize() },
    uKeyColor: {
      value: new THREE.Color(KEY_LIGHT_COLOR).multiplyScalar(
        KEY_LIGHT_INTENSITY * 0.42,
      ),
    },
    uGlowPos: { value: ROSE_GLOW_POSITION.clone() },
    uGlowColor: { value: new THREE.Color(ROSE_GLOW_COLOR).multiplyScalar(2.6) },
    uTransStrength: { value: 0.62 },
    uTransPower: { value: 3.5 },
    // How far the shading normal leans toward the baked bent normal. Past
    // ~0.6 the corolla geometry stops reading and the canopy turns to fuzz.
    uBentAmount: { value: 0.38 },
  };
}

const TRANSLUCENCY_SHADER_CHUNK = `
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uGlowPos;
  uniform vec3 uGlowColor;
  uniform float uTransStrength;
  uniform float uTransPower;

  // nrm and fragViewPos are view space; uKeyDir/uGlowPos are world space and
  // get folded in through viewMatrix, which three declares for fragment
  // shaders in <common>.
  vec3 arborTransmission(vec3 nrm, vec3 fragViewPos, float thickness) {
    vec3 viewDir = normalize(-fragViewPos);
    vec3 keyL = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
    vec3 t = uKeyColor * (
      0.32 * max(dot(-nrm, keyL), 0.0) +
      0.68 * pow(max(dot(-viewDir, keyL), 0.0), uTransPower));
    vec3 glowVec = (viewMatrix * vec4(uGlowPos, 1.0)).xyz - fragViewPos;
    float glowDist = max(length(glowVec), 1e-4);
    vec3 glowL = glowVec / glowDist;
    float att = 1.0 / (1.0 + glowDist * glowDist * 0.06);
    t += uGlowColor * att * (
      0.32 * max(dot(-nrm, glowL), 0.0) +
      0.68 * pow(max(dot(-viewDir, glowL), 0.0), uTransPower));
    return t * (uTransStrength * thickness);
  }
`;

// Loose petals get the transmission term but no occlusion: they are in open
// air by definition, so their openness is 1 and there is nothing to bend a
// normal toward. What they do get is the per-instance variation the attached
// blossoms have — gloss, thickness and glow all vary flower to flower, and
// without it a dozen petals crossing the same patch of sky read as one
// repeated sprite. petalShade is (roughness multiplier, thickness, emissive
// multiplier), one vec3 per instance.
function applyPetalTranslucency(
  material: THREE.MeshStandardMaterial,
  shade: CanopyShadeUniforms,
) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, shade);
    shader.vertexShader =
      `attribute vec3 petalShade;
       varying vec3 vPetalShade;
      ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vPetalShade = petalShade;
      `,
    );
    shader.fragmentShader =
      `varying vec3 vPetalShade;
      ` +
      TRANSLUCENCY_SHADER_CHUNK +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor * vPetalShade.x, 0.04, 1.0);
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vPetalShade.z;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb *
        arborTransmission(normal, -vViewPosition, vPetalShade.y);
      `,
    );
  };
  material.customProgramCacheKey = () => "loose-petal-translucent-v2";
}

function applyBlossomWind(
  material: THREE.MeshStandardMaterial,
  uniforms: BranchWindUniforms,
  growthUniform: { value: number },
  shade: CanopyShadeUniforms,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uPointerPos = uniforms.uPointerPos;
    shader.uniforms.uPointerRayDir = uniforms.uPointerRayDir;
    shader.uniforms.uPointerVel = uniforms.uPointerVel;
    shader.uniforms.uPointerStrength = uniforms.uPointerStrength;
    shader.uniforms.uPointerRadius = uniforms.uPointerRadius;
    shader.uniforms.uUngrow = uniforms.uUngrow;
    shader.uniforms.uBlossomGrowth = growthUniform;
    Object.assign(shader.uniforms, shade);
    shader.vertexShader =
      `
        attribute vec4 blossomWindParams1;
        attribute vec4 blossomWindParams2;
        attribute float blossomPhase;
        attribute float blossomFlutter;
        // x = intro reveal stagger, y = scroll ungrow key. Packed: the
        // instanced blossom already uses 15 of the 16 attribute slots.
        attribute vec2 blossomGrow;
        attribute float blossomEmissive;
        attribute vec4 blossomShade;
        varying float vBlossomEmissive;
        varying vec3 vBentNormal;
        varying float vOpenness;
        varying float vKeyShadow;
        varying float vShadeVar;
        uniform float uBlossomGrowth;
      ` +
      UNGROW_SHADER_CHUNK +
      WIND_SHADER_CHUNK +
      shader.vertexShader;

    // Flower-local motion only; the anchor wind displacement is applied
    // after instanceMatrix (below) so it matches the branch mesh exactly.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vBlossomEmissive = blossomEmissive;
      // Baked canopy occlusion. The bent normal is in group space, not
      // instance space, so it takes normalMatrix (group -> view) alone and
      // must NOT go through instanceMatrix the way the geometry normal does.
      // Its MAGNITUDE carries the precomputed key-light shadow term
      // (0.15..1.0) — recover it before the normalize destroys it.
      vKeyShadow = clamp((length(blossomShade.xyz) - 0.15) / 0.85, 0.0, 1.0);
      vBentNormal = normalize(normalMatrix * blossomShade.xyz);
      vOpenness = blossomShade.w;
      // One hash per flower, spent on roughness and petal thickness below.
      // Two flowers side by side otherwise carry the identical highlight.
      vShadeVar = fract(sin(blossomPhase * 91.7) * 43758.5453);
      // Intro grow reveal: each flower scales in from its spur point (the
      // geometry origin sits on the twig), staggered by blossomGrow.x.
      float blossomReveal =
        smoothstep(blossomGrow.x, blossomGrow.x + 0.24, uBlossomGrowth);
      // Scroll ungrow: the flower shrinks back into its spur as the front
      // sweeps down to its twig, finishing just before the wood under it
      // is clipped (the key leads the twig's own key).
      blossomReveal *= smoothstep(
        blossomGrow.y, blossomGrow.y + 0.07, arborGrowFront());
      transformed *= blossomReveal;

      // Petal-local shimmer, tip-weighted so the pedicel and calyx stay
      // rigid while the petal edges ripple.
      float petalRadius = length(position.xy);
      float petalTip = smoothstep(0.1, 0.52, petalRadius);
      float petalAngle = atan(position.y, position.x + 1e-5);
      float shimmerNoise =
        sin(uWindTime * 7.5 + blossomPhase + petalAngle * 4.0) * 0.55 +
        sin(uWindTime * 11.0 + blossomPhase * 1.7 + position.x * 18.0) * 0.30 +
        cos(uWindTime * 5.2 + blossomPhase * 2.3 + position.y * 15.0) * 0.15;
      float shimmerAmount = blossomFlutter * petalTip * (0.016 * uWindStrength);
      transformed.z += shimmerNoise * shimmerAmount * blossomReveal;

      // Cursor rustle, flower-local part: influence sampled once at the
      // instance anchor (the spur point), then spent on a fast petal-edge
      // flutter plus extra pedicel swing below. Both are rotations/offsets
      // about the origin, so the flower can never detach from its twig.
      #ifdef USE_INSTANCING
      vec3 rustleAnchor =
        (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
      #else
      vec3 rustleAnchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float rustleInfluence = arborPointerInfluence(rustleAnchor);
      float rustleFlutter =
        sin(uWindTime * 24.0 + blossomPhase * 3.1 + petalAngle * 3.0) +
        0.6 * sin(uWindTime * 33.0 + blossomPhase * 1.9);
      transformed.z +=
        rustleFlutter * petalTip * (0.04 * rustleInfluence) * blossomReveal;

      // Whole-flower flutter: the flower swings on its pedicel around the
      // spur point, weighted by the twig-tip flutter amplitude
      // (blossomWindParams2.z) and the shared gust envelope, so flowers on
      // fine drooping tips bob hardest and only when the wind does.
      float flutterWeight = clamp(blossomWindParams2.z * 9.0, 0.0, 1.0);
      float gustHere =
        arborGust(uWindTime - blossomWindParams2.y * 0.5, blossomWindParams1.w);
      float swing =
        (0.3 + 0.7 * flutterWeight) * gustHere *
        (0.045 + 0.04 * blossomFlutter) * uWindStrength;
      float swingA =
        swing * (sin(uWindTime * 2.9 + blossomPhase) +
          0.45 * sin(uWindTime * 4.3 + blossomPhase * 1.7)) +
        rustleInfluence * (0.12 * sin(uWindTime * 17.0 + blossomPhase) +
          0.07 * sin(uWindTime * 26.0 + blossomPhase * 2.3));
      float swingB =
        swing * 0.7 * sin(uWindTime * 3.4 + blossomPhase * 2.3 + 1.1) +
        rustleInfluence * 0.09 * sin(uWindTime * 21.0 + blossomPhase * 1.4);
      float swingCosA = cos(swingA);
      float swingSinA = sin(swingA);
      transformed.yz = vec2(
        transformed.y * swingCosA - transformed.z * swingSinA,
        transformed.y * swingSinA + transformed.z * swingCosA);
      float swingCosB = cos(swingB);
      float swingSinB = sin(swingB);
      transformed.xz = vec2(
        transformed.x * swingCosB + transformed.z * swingSinB,
        -transformed.x * swingSinB + transformed.z * swingCosB);
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition.xyz += arborWindOffset(blossomWindParams1, blossomWindParams2);
      // Coherent cursor-rustle displacement: identical formula and baked
      // vec4s as the branch mesh evaluates at the anchor point, so the
      // whole flower translates exactly with its twig.
      mvPosition.xyz += arborPointerRustle(
        (modelMatrix * vec4(mvPosition.xyz, 1.0)).xyz,
        blossomWindParams1, blossomWindParams2);
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `,
    );

    // Per-instance emissive multiplier: instanceColor only scales the
    // diffuse term, so uneven glow needs its own attribute in the emissive
    // path.
    shader.fragmentShader =
      `varying float vBlossomEmissive;
       varying vec3 vBentNormal;
       varying float vOpenness;
       varying float vKeyShadow;
       varying float vShadeVar;
       uniform float uBentAmount;
      ` +
      TRANSLUCENCY_SHADER_CHUNK +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      // A flower buried in the sleeve is not lit from within either.
      totalEmissiveRadiance *= vBlossomEmissive * mix(0.55, 1.15, vOpenness);
      `,
    );
    // Colour temperature by depth. A flower on the rim is lit by the warm
    // key; one buried in the sleeve only ever sees skylight bounced off the
    // flowers around it. Splitting the diffuse tint the same way the light
    // actually splits gives the mass depth that a single pink cannot.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb *= mix(vec3(0.84, 0.87, 1.08), vec3(1.06, 1.0, 0.96),
        vOpenness);
      `,
    );
    // Per-flower gloss. Sakura petals are faintly waxy and no two catch the
    // key at the same size, which is most of what stops 23,500 identical
    // corollas from reading as one printed texture.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor * (0.68 + 0.66 * vShadeVar),
        0.04, 1.0);
      `,
    );
    // Lean the shading normal toward wherever light can actually reach this
    // flower. Rim flowers end up facing out into the key, interior ones turn
    // away and fall off — the canopy gets a shape instead of a silhouette.
    // Deliberately NOT flipped to the visible hemisphere: a petal whose gap
    // faces away should go dark on this side and pick its light back up from
    // the transmission term below, which is what actually happens.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>
      normal = normalize(mix(normal, vBentNormal, uBentAmount));
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
      // Indirect light is what the canopy shadows most: it arrives from the
      // whole hemisphere, so burial cuts it almost linearly. Direct light
      // keeps a floor, since a gap that lets the key through at all lets a
      // lot through.
      reflectedLight.indirectDiffuse *= vOpenness;
      // Precomputed key-light shadowing: canopy lobes facing the key carry
      // sun-struck flowers, the far side falls into soft shade — baked, so
      // this "rendered" light structure costs nothing per frame.
      reflectedLight.directDiffuse *=
        mix(0.38, 1.0, vOpenness) * mix(0.3, 1.0, vKeyShadow);
      reflectedLight.directSpecular *=
        mix(0.25, 1.0, vOpenness) * mix(0.2, 1.0, vKeyShadow);
      reflectedLight.indirectDiffuse += diffuseColor.rgb *
        arborTransmission(normal, -vViewPosition,
          (0.55 + 0.9 * vShadeVar) * mix(0.25, 1.0, vOpenness));
      `,
    );
  };

  material.customProgramCacheKey = () => "blossom-wind-v12";
}

// Sakura palette shared by attached blossoms and falling petals: cool
// lavender-pink throughout (matched to the full-bloom Yoshino reference),
// light petal edges, saturated pink base, and a magenta-crimson flower
// center / calyx.
const PETAL_EDGE_COLOR = new THREE.Color("#fdeff8");
const PETAL_MID_COLOR = new THREE.Color("#f7cfe6");
const PETAL_BASE_COLOR = new THREE.Color("#e79cc8");
const BLOSSOM_CENTER_COLOR = new THREE.Color("#c22e63");
const BLOSSOM_CALYX_COLOR = new THREE.Color("#a13d5d");
// Pedicels stay in the plum band — no green anywhere in the palette.
const PEDICEL_BASE_COLOR = new THREE.Color("#5d4150");
const PEDICEL_TIP_COLOR = new THREE.Color("#7d5560");
const STAMEN_FILAMENT_COLOR = new THREE.Color("#f6dce4");
const STAMEN_ANTHER_COLOR = new THREE.Color("#edd28c");

// Per-instance tint ramp shared by attached flowers and falling petals:
// a fairly uniform saturated lavender-pink band (the reference canopy reads
// as one pink mass, not a white-to-rose mix), with small hue/sat/light
// jitter on top and only a token pale-white share for sparkle. Multiplies
// the baked vertex-color gradient via instanceColor. Build-time only (no
// per-frame calls); lerpColors/offsetHSL mutate in place, so nothing is
// allocated.
const BLOSSOM_TINT_PALE = new THREE.Color("#f7c4e0");
const BLOSSOM_TINT_SOFT = new THREE.Color("#f1aed6");
const BLOSSOM_TINT_ROSE = new THREE.Color("#e693c4");
const BLOSSOM_TINT_BRIGHT = new THREE.Color("#fbdff0");

function sampleBlossomTint(rng: () => number, target: THREE.Color) {
  // Gentle pow-curve: draws spread across the whole pink band with a mild
  // lean toward the lighter end. Variation stays inside pink.
  const t = Math.pow(rng(), 1.25);
  if (t < 0.5) {
    target.lerpColors(BLOSSOM_TINT_PALE, BLOSSOM_TINT_SOFT, t * 2);
  } else {
    target.lerpColors(BLOSSOM_TINT_SOFT, BLOSSOM_TINT_ROSE, (t - 0.5) * 2);
  }
  // Small pale-white share (was the dominant mode before): occasional
  // brighter flowers keep the mass from going flat.
  if (rng() < 0.08) target.lerp(BLOSSOM_TINT_BRIGHT, 0.55);
  target.offsetHSL(
    (rng() * 2 - 1) * 0.008,
    -0.05 + rng() * 0.13,
    -0.035 + rng() * 0.06,
  );
  return target;
}

// Obcordate petal outline: narrow claw at the base, widest ~70% out, rounded
// tip lobes with a notch cleft at the center. uu in [0,1] across the petal,
// vv in [0,1] base->tip. Returns radial distance and lateral offset in units
// of petalLength/maxHalfWidth so flower petals and loose petals share it.
function sakuraPetalOutline(uu: number, vv: number) {
  const xu = uu * 2 - 1;
  const widthProfile = Math.pow(
    Math.sin(Math.PI * (0.06 + 0.62 * vv)),
    0.9,
  );
  const notch =
    0.21 *
    Math.pow(Math.max(0, 1 - Math.abs(xu) * 1.7), 2) *
    smoothstep(0.68, 1, vv);
  const cornerRound =
    0.17 * Math.pow(Math.abs(xu), 3) * smoothstep(0.6, 1, vv);
  return {
    radial: vv - notch - cornerRound,
    lateral: xu * widthProfile,
    xu,
  };
}

function getPetalVertexColor(
  target: THREE.Color,
  xu: number,
  vv: number,
) {
  if (vv < 0.5) {
    target.copy(PETAL_BASE_COLOR).lerp(PETAL_MID_COLOR, vv / 0.5);
  } else {
    target.copy(PETAL_MID_COLOR).lerp(PETAL_EDGE_COLOR, (vv - 0.5) / 0.5);
  }
  const edgePush = clamp01(
    Math.pow(Math.abs(xu), 2.2) * 0.55 + smoothstep(0.8, 1, vv) * 0.35,
  );
  return target.lerp(PETAL_EDGE_COLOR, edgePush);
}

const BLOSSOM_PEDICEL_LENGTH = 0.55;

// A full sakura flower in "flower units" (~1.1 across the open corolla):
// pedicel from the origin (the spur point on the twig) along +z, crimson
// calyx, five overlapping cupped/ruffled obcordate petals, a small
// magenta-crimson center disc and five stamen quads. Radial color gradient
// is baked as vertex colors so the standard material shades it directly.
// `openness` < 1 builds a half-open variant: shorter, narrower petals cupped
// steeply toward the axis, stamens still hidden inside.
// `lowDetail` builds a ~3x cheaper variant (2x2-quad petals, no stamens,
// coarser center disc) used for the smallest/deepest instances so the sleeve
// coverage model can raise instance counts without ballooning vertex work.
function createSakuraBlossomGeometry(openness = 1, lowDetail = false) {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rng = makeRng(0x5ab10);
  const rand = (min: number, max: number) => min + (max - min) * rng();
  const color = new THREE.Color();
  const zF = BLOSSOM_PEDICEL_LENGTH;

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    u: number,
    v: number,
    c: THREE.Color,
  ) => {
    positions.push(x, y, z);
    uvs.push(u, v);
    colors.push(c.r, c.g, c.b);
    return positions.length / 3 - 1;
  };

  // Pedicel: slim 3-sided tube, origin -> just below the calyx.
  {
    const sides = 3;
    const ringIndex: number[][] = [];
    const rings = [
      { z: 0, radius: 0.026, color: PEDICEL_BASE_COLOR },
      { z: zF * 0.55, radius: 0.021, color: PEDICEL_BASE_COLOR },
      { z: zF - 0.05, radius: 0.017, color: PEDICEL_TIP_COLOR },
    ];
    for (const ring of rings) {
      const row: number[] = [];
      for (let s = 0; s < sides; s += 1) {
        const a = (s / sides) * TAU;
        row.push(
          pushVertex(
            Math.cos(a) * ring.radius,
            Math.sin(a) * ring.radius,
            ring.z,
            0.5,
            0,
            ring.color,
          ),
        );
      }
      ringIndex.push(row);
    }
    for (let r = 0; r < rings.length - 1; r += 1) {
      for (let s = 0; s < sides; s += 1) {
        const a = ringIndex[r][s];
        const b = ringIndex[r][(s + 1) % sides];
        const c = ringIndex[r + 1][s];
        const d = ringIndex[r + 1][(s + 1) % sides];
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  // Calyx: crimson cone flaring from the pedicel tip to the petal bases.
  // Blossoms hang, so this is what reads from behind/below.
  {
    const spokes = 5;
    const apex = pushVertex(0, 0, zF - 0.1, 0.5, 0, BLOSSOM_CALYX_COLOR);
    const rim: number[] = [];
    color.copy(BLOSSOM_CALYX_COLOR).lerp(PETAL_BASE_COLOR, 0.35);
    for (let s = 0; s < spokes; s += 1) {
      const a = (s / spokes) * TAU + 0.31;
      const flare = 0.075 + (s % 2) * 0.012;
      rim.push(
        pushVertex(
          Math.cos(a) * flare,
          Math.sin(a) * flare,
          zF - 0.008,
          0.5,
          0.1,
          color,
        ),
      );
    }
    for (let s = 0; s < spokes; s += 1) {
      indices.push(apex, rim[s], rim[(s + 1) % spokes]);
    }
  }

  // Five petals, each a 4x4-quad grid (2x2 for the low-detail variant):
  // cupped toward the flower center, gently ruffled, wide enough to overlap
  // neighbours, alternating z-tilt so the overlaps layer instead of
  // z-fighting.
  const petalRows = lowDetail ? 2 : 4;
  const petalCols = lowDetail ? 2 : 4;
  const petalLength = 0.5 * lerp(0.78, 1, openness);
  const petalRootRadius = 0.055;
  const petalMaxHalfWidth = 0.27 * lerp(0.78, 1, openness);
  // Extra lengthwise cup for half-open corollas: petal tips fold up toward
  // the flower axis instead of lying flat.
  const cupStrength = 0.11 + 0.52 * (1 - openness);
  for (let p = 0; p < 5; p += 1) {
    const angle = (p / 5) * TAU + 0.31;
    const lengthVar = rand(0.94, 1.06);
    const widthVar = rand(0.95, 1.08);
    const rufflePhase = rand(0, TAU);
    const ruffleAmp = rand(0.012, 0.02);
    const zBias = (p % 2) * 0.016 + rand(-0.004, 0.004);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const sideX = -dirY;
    const sideY = dirX;
    const vertexBase = positions.length / 3;

    for (let row = 0; row <= petalRows; row += 1) {
      const vv = row / petalRows;
      for (let col = 0; col <= petalCols; col += 1) {
        const uu = col / petalCols;
        const outline = sakuraPetalOutline(uu, vv);
        const r = petalRootRadius + petalLength * lengthVar * outline.radial;
        const s = outline.lateral * petalMaxHalfWidth * widthVar;
        const cupLength = cupStrength * vv * vv;
        const cupAcross =
          outline.xu * outline.xu * 0.045 * (0.25 + vv * 0.75);
        const ruffle =
          ruffleAmp * Math.sin(outline.xu * 2.6 + rufflePhase + vv * 5.1) * vv;
        pushVertex(
          dirX * r + sideX * s,
          dirY * r + sideY * s,
          zF + zBias - 0.018 * Math.sin(Math.PI * vv) +
            cupLength +
            cupAcross +
            ruffle,
          uu,
          vv,
          getPetalVertexColor(color, outline.xu, vv),
        );
      }
    }

    const rowVerts = petalCols + 1;
    for (let row = 0; row < petalRows; row += 1) {
      for (let col = 0; col < petalCols; col += 1) {
        const a = vertexBase + row * rowVerts + col;
        const b = a + 1;
        const c = a + rowVerts;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  // Center disc: small domed magenta-crimson heart of the flower.
  {
    const spokes = lowDetail ? 4 : 6;
    const centerIdx = pushVertex(0, 0, zF + 0.035, 0.5, 0, BLOSSOM_CENTER_COLOR);
    const rim: number[] = [];
    color.copy(BLOSSOM_CENTER_COLOR).lerp(PETAL_BASE_COLOR, 0.55);
    for (let s = 0; s < spokes; s += 1) {
      const a = (s / spokes) * TAU;
      rim.push(
        pushVertex(
          Math.cos(a) * 0.09,
          Math.sin(a) * 0.09,
          zF + 0.02,
          0.5,
          0.08,
          color,
        ),
      );
    }
    for (let s = 0; s < spokes; s += 1) {
      indices.push(centerIdx, rim[(s + 1) % spokes], rim[s]);
    }
  }

  // Stamen suggestion: five tiny quads leaning out between the petals,
  // pale filaments with soft yellow anther tips. A half-open corolla still
  // furls over its stamens, and the low-detail variant drops them entirely.
  for (let s = 0; s < (openness > 0.75 && !lowDetail ? 5 : 0); s += 1) {
    const a = (s / 5) * TAU + 0.31 + TAU / 10 + rand(-0.12, 0.12);
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    const sideX = -dirY;
    const sideY = dirX;
    const tipR = rand(0.1, 0.14);
    const tipZ = zF + rand(0.1, 0.15);
    const base = positions.length / 3;
    pushVertex(
      dirX * 0.028 - sideX * 0.008,
      dirY * 0.028 - sideY * 0.008,
      zF + 0.03,
      0.5,
      0,
      STAMEN_FILAMENT_COLOR,
    );
    pushVertex(
      dirX * 0.028 + sideX * 0.008,
      dirY * 0.028 + sideY * 0.008,
      zF + 0.03,
      0.5,
      0,
      STAMEN_FILAMENT_COLOR,
    );
    pushVertex(
      dirX * tipR - sideX * 0.017,
      dirY * tipR - sideY * 0.017,
      tipZ,
      0.5,
      0.12,
      STAMEN_ANTHER_COLOR,
    );
    pushVertex(
      dirX * tipR + sideX * 0.017,
      dirY * tipR + sideY * 0.017,
      tipZ,
      0.5,
      0.12,
      STAMEN_ANTHER_COLOR,
    );
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Closed bud: short pedicel, crimson sepal ring, then a furled deep-pink
// ovoid with a slight twist. Sized/oriented like the flower geometry so the
// same placement + wind shader drives both meshes.
function createSakuraBudGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const pedicelLength = 0.3;
  const sides = 5;

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    v: number,
    c: THREE.Color,
  ) => {
    positions.push(x, y, z);
    uvs.push(0.5, v);
    colors.push(c.r, c.g, c.b);
    return positions.length / 3 - 1;
  };

  // Pedicel.
  {
    const ringA: number[] = [];
    const ringB: number[] = [];
    for (let s = 0; s < 3; s += 1) {
      const a = (s / 3) * TAU;
      ringA.push(
        pushVertex(Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0, 0, PEDICEL_BASE_COLOR),
      );
    }
    for (let s = 0; s < 3; s += 1) {
      const a = (s / 3) * TAU;
      ringB.push(
        pushVertex(
          Math.cos(a) * 0.015,
          Math.sin(a) * 0.015,
          pedicelLength,
          0.1,
          PEDICEL_TIP_COLOR,
        ),
      );
    }
    for (let s = 0; s < 3; s += 1) {
      const a = ringA[s];
      const b = ringA[(s + 1) % 3];
      const c = ringB[s];
      const d = ringB[(s + 1) % 3];
      indices.push(a, b, c, b, d, c);
    }
  }

  // Furled body rings. Vertex colors stay near-white so the deep-pink
  // per-instance color carries the hue; the tip shades a little deeper.
  const budWhite = new THREE.Color(0.99, 0.95, 0.97);
  const budTipShade = new THREE.Color(0.86, 0.68, 0.79);
  const rings = [
    { z: 0.0, radius: 0.045, color: BLOSSOM_CALYX_COLOR, squash: 1 },
    { z: 0.06, radius: 0.1, color: budWhite, squash: 0.94 },
    { z: 0.13, radius: 0.113, color: budWhite, squash: 0.96 },
    { z: 0.2, radius: 0.085, color: budWhite, squash: 0.94 },
    { z: 0.26, radius: 0.04, color: budTipShade, squash: 1 },
  ];
  const ringIndex: number[][] = [];
  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r];
    const row: number[] = [];
    for (let s = 0; s < sides; s += 1) {
      const a = (s / sides) * TAU + r * 0.42;
      const lobe = 1 + Math.sin(a * sides * 0.5) * 0.05;
      row.push(
        pushVertex(
          Math.cos(a) * ring.radius * lobe,
          Math.sin(a) * ring.radius * lobe * ring.squash,
          pedicelLength + ring.z,
          0.2 + (r / rings.length) * 0.7,
          ring.color,
        ),
      );
    }
    ringIndex.push(row);
  }
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let s = 0; s < sides; s += 1) {
      const a = ringIndex[r][s];
      const b = ringIndex[r][(s + 1) % sides];
      const c = ringIndex[r + 1][s];
      const d = ringIndex[r + 1][(s + 1) % sides];
      indices.push(a, b, c, b, d, c);
    }
  }
  color.copy(budTipShade).lerp(BLOSSOM_CENTER_COLOR, 0.3);
  const tip = pushVertex(0.004, 0.004, pedicelLength + 0.3, 1, color);
  const lastRing = ringIndex[ringIndex.length - 1];
  for (let s = 0; s < sides; s += 1) {
    indices.push(lastRing[s], lastRing[(s + 1) % sides], tip);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Small procedural petal-surface texture shared by attached blossoms and
// falling petals, mapped through the existing petal UVs (u across the petal,
// v base->tip): a soft deepening around the petal base, a few faint darker
// veins radiating from it, and a subtle rose blush along the tip and side
// edges. It multiplies the baked vertex gradient and instance tint, so it
// stays close to white overall; the non-petal parts of the flower (pedicel,
// calyx, stamens) all sample near u=0.5 / v<0.15 where the texture is
// almost neutral.
function createPetalDetailTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rng = makeRng(0x9e7a1);
  const rand = (min: number, max: number) => min + (max - min) * rng();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Base deepening: petal base is v=0, which is the canvas bottom row after
  // the default flipY.
  const baseGrad = ctx.createRadialGradient(64, 134, 4, 64, 134, 118);
  baseGrad.addColorStop(0, "rgba(233, 196, 209, 0.8)");
  baseGrad.addColorStop(0.4, "rgba(244, 224, 232, 0.38)");
  baseGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Faint darker veins fanning out from the petal base.
  ctx.lineCap = "round";
  const veinCount = 7;
  for (let i = 0; i < veinCount; i += 1) {
    // Angle from the petal axis, +-50deg fan, kept off dead-vertical so the
    // bud geometry's center-column UVs do not pick up a stripe.
    let angle = (i / (veinCount - 1) - 0.5) * 1.75 + rand(-0.1, 0.1);
    if (Math.abs(angle) < 0.1) angle = angle < 0 ? -0.1 : 0.1;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const startR = rand(10, 16);
    const endR = rand(82, 112);
    const midR = (startR + endR) / 2;
    const bow = rand(-7, 7);
    ctx.strokeStyle = `rgba(198, 126, 158, ${rand(0.09, 0.16).toFixed(3)})`;
    ctx.lineWidth = rand(1, 1.7);
    ctx.beginPath();
    ctx.moveTo(64 + sinA * startR, 126 - cosA * startR);
    ctx.quadraticCurveTo(
      64 + sinA * midR + cosA * bow,
      126 - cosA * midR + sinA * bow,
      64 + sinA * endR,
      126 - cosA * endR,
    );
    ctx.stroke();
  }

  // Edge blush: subtle rose wash along the petal tip (v=1 -> canvas top)...
  const tipGrad = ctx.createLinearGradient(0, 0, 0, 40);
  tipGrad.addColorStop(0, "rgba(239, 164, 195, 0.3)");
  tipGrad.addColorStop(1, "rgba(239, 164, 195, 0)");
  ctx.fillStyle = tipGrad;
  ctx.fillRect(0, 0, size, 40);
  // ...and a softer one down the lateral edges.
  for (const [x0, x1] of [
    [0, 22],
    [size, size - 22],
  ] as const) {
    const sideGrad = ctx.createLinearGradient(x0, 0, x1, 0);
    sideGrad.addColorStop(0, "rgba(242, 178, 204, 0.18)");
    sideGrad.addColorStop(1, "rgba(242, 178, 204, 0)");
    ctx.fillStyle = sideGrad;
    ctx.fillRect(Math.min(x0, x1), 0, 22, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBarkTextures() {
  const width = 384;
  const height = 768;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  const roughCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  roughCanvas.width = width;
  roughCanvas.height = height;

  const colorContext = colorCanvas.getContext("2d");
  const bumpContext = bumpCanvas.getContext("2d");
  const roughContext = roughCanvas.getContext("2d");
  if (!colorContext || !bumpContext || !roughContext) {
    // Canvas 2D unavailable: hand back a 1x1 mid-bark texture so the
    // branches still render dark bark instead of the bare (near-white)
    // material color.
    const fallback = new THREE.DataTexture(new Uint8Array([84, 68, 60, 255]));
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.needsUpdate = true;
    return { colorMap: fallback, bumpMap: null, roughnessMap: null };
  }

  // fbm made periodic across the u wrap: inside the last wrapMargin of u
  // the sample cross-fades to the sample one period back, so the value at
  // u=1 equals the value at u=0 and the tube circumference tiles without
  // a vertical seam. Outside the margin only one sample is taken.
  const wrapMargin = 0.2;
  const fbmWrapU = (
    u: number,
    uFrequency: number,
    xOffset: number,
    y: number,
    octaves: number,
  ) => {
    const base = fbm2(u * uFrequency + xOffset, y, octaves);
    if (u < 1 - wrapMargin) return base;
    const t = (u - (1 - wrapMargin)) / wrapMargin;
    return lerp(base, fbm2((u - 1) * uFrequency + xOffset, y, octaves), t);
  };

  // Cherry lenticels: horizontal lens-shaped pores at random heights,
  // elongated along the circumference (u). Seeded so rebuilds are stable.
  // Denser than before: the horizontal banding is a primary cherry-bark cue
  // and has to survive the dark scene lighting.
  const lenticelRng = makeRng(0xba7c11);
  const lenticels: {
    vCenter: number;
    uCenter: number;
    uHalfLength: number;
    vSigma: number;
    strength: number;
  }[] = [];
  for (let i = 0; i < 24; i += 1) {
    lenticels.push({
      vCenter: lenticelRng(),
      uCenter: lenticelRng(),
      uHalfLength: 0.13 + lenticelRng() * 0.22,
      vSigma: 0.005 + lenticelRng() * 0.006,
      strength: 0.75 + lenticelRng() * 0.35,
    });
  }

  // Knots: dark sunken cores with a raised rim ring, scattered and seeded.
  // du wraps around the tube seam like the lenticels do.
  const knotRng = makeRng(0x6b07);
  const knots: {
    uCenter: number;
    vCenter: number;
    uRadius: number;
    vRadius: number;
    strength: number;
  }[] = [];
  for (let i = 0; i < 5; i += 1) {
    knots.push({
      uCenter: knotRng(),
      vCenter: knotRng(),
      uRadius: 0.06 + knotRng() * 0.07,
      vRadius: 0.028 + knotRng() * 0.035,
      strength: 0.6 + knotRng() * 0.4,
    });
  }

  // Bark color ramp stops (sRGB bytes): purple-brown shadow, warm
  // gray-brown mid, slightly desaturated highlight. The mid stop is shared
  // by both halves of the ramp so the transition stays continuous. Wider
  // spread than before: the dark stage lighting flattens subtle bump, so
  // the fissure/ridge contrast is baked into the albedo aggressively.
  const rampShadow = [28, 20, 25];
  const rampMid = [104, 84, 74];
  const rampHighlight = [174, 158, 144];

  const colorImage = colorContext.createImageData(width, height);
  const bumpImage = bumpContext.createImageData(width, height);
  const roughImage = roughContext.createImageData(width, height);
  const rowLenticels: typeof lenticels = [];
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    // Row prefilter: the v gate below is row-constant up to the +-0.003
    // stroke wobble, so most rows skip the lenticel work entirely.
    rowLenticels.length = 0;
    for (const lenticel of lenticels) {
      let dv0 = v - lenticel.vCenter;
      dv0 -= Math.round(dv0);
      if (Math.abs(dv0) <= lenticel.vSigma * 3.2 + 0.003) {
        rowLenticels.push(lenticel);
      }
    }
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      // Ridge flow along the branch with a slight helical drift (the v*1.4
      // term skews the ridges around the tube as v advances).
      const verticalRaw =
        fbmWrapU(u, 16.0, Math.sin(v * 18.0) * 0.36 + v * 1.4, v * 3.2, 5) *
          0.55 +
        fbmWrapU(u, 44.0, v * 2.1, v * 9.5 - 3.4, 3) * 0.45;
      // Contrast stretch so the fissure threshold below has real spread.
      const vertical = clamp01((verticalRaw - 0.5) * 1.75 + 0.5);
      const fineGrain = fbmWrapU(u, 96.0, -6.8, v * 32.0 + 2.4, 3);
      // Second, higher-frequency cross-grain octave: tight striations that
      // keep the surface busy between the deep fissures.
      const crossGrain =
        fbmWrapU(u, 168.0, 12.3, v * 64.0 + 7.7, 2) - 0.5;
      // Wider threshold + deeper floor than before: fissures claim more
      // area and cut harder.
      const fissure =
        smoothstep(0.5, 0.8, vertical) *
        (0.6 + smoothstep(0.5, 0.8, fineGrain) * 0.4);
      // Knots: sunken dark core inside a raised rim ring, with a slight
      // helical wobble on the center like real occluded branch stubs.
      let knotCore = 0;
      let knotRim = 0;
      for (const knot of knots) {
        let du = u - knot.uCenter - Math.sin(v * 9.0) * 0.02;
        du -= Math.round(du);
        const dv = v - knot.vCenter;
        if (Math.abs(dv) > knot.vRadius * 3) continue;
        const d = Math.sqrt(
          (du * du) / (knot.uRadius * knot.uRadius) +
            (dv * dv) / (knot.vRadius * knot.vRadius),
        );
        if (d > 2.6) continue;
        knotCore += knot.strength * Math.exp(-d * d * 1.6);
        knotRim +=
          knot.strength * Math.exp(-Math.pow((d - 1.35) / 0.42, 2));
      }
      knotCore = clamp01(knotCore);
      knotRim = clamp01(knotRim);
      const ridge = clamp01(
        0.42 +
          vertical * 0.45 +
          fineGrain * 0.18 +
          crossGrain * 0.22 -
          fissure * 0.36,
      );

      // Lenticel profile: gaussian falloff in v, lens taper plus fbm
      // breakup along u so the strokes read as broken pore bands.
      const strokeNoise =
        rowLenticels.length > 0 ? fbmWrapU(u, 26.0, 3.7, v * 88.0, 3) : 0.5;
      let lenticelCore = 0;
      let lenticelRim = 0;
      for (const lenticel of rowLenticels) {
        let dv = v - lenticel.vCenter;
        dv -= Math.round(dv);
        dv += (strokeNoise - 0.5) * 0.006;
        if (Math.abs(dv) > lenticel.vSigma * 3.2) continue;
        let du = u - lenticel.uCenter;
        du -= Math.round(du);
        const along = Math.abs(du) / lenticel.uHalfLength;
        if (along >= 1) continue;
        const gauss = Math.exp(
          -(dv * dv) / (2 * lenticel.vSigma * lenticel.vSigma),
        );
        const profile =
          lenticel.strength *
          (1 - along * along) *
          gauss *
          (0.4 + 0.6 * smoothstep(0.28, 0.72, strokeNoise));
        lenticelCore += smoothstep(0.26, 0.66, profile);
        lenticelRim +=
          smoothstep(0.16, 0.3, profile) * (1 - smoothstep(0.3, 0.5, profile));
      }
      lenticelCore = clamp01(lenticelCore);
      lenticelRim = clamp01(lenticelRim);

      // Horizontal peeling bands (slow in u, fast in v), a cherry-bark cue.
      const peelBand = fbmWrapU(u, 1.6, 7.7, v * 26.0, 2) - 0.5;

      const bump = clamp01(
        0.42 +
          ridge * 0.42 -
          fissure * 0.58 +
          knotRim * 0.34 -
          knotCore * 0.26 +
          crossGrain * 0.16 +
          peelBand * 0.14 +
          lenticelCore * 0.3 -
          lenticelRim * 0.08,
      );

      // Crevice occlusion baked into the color so fissures still read
      // where bump nuance is lost (distance, software rendering, and this
      // scene's dim stage lighting). The coefficients here are tuned as a
      // pair with the bump mix above: retune both together or the albedo
      // shading drifts from the relief. The occlusion floor is deeper than
      // before (0.34 vs 0.5) and a final contrast stretch keeps the
      // fissures near-black under the warm key.
      let shade =
        clamp01(
          0.5 +
            ridge * 0.5 -
            fissure * 0.62 +
            knotRim * 0.2 -
            knotCore * 0.3 +
            crossGrain * 0.2 +
            peelBand * 0.34,
        ) *
        (0.34 + 0.66 * bump);
      shade = clamp01((shade - 0.5) * 1.4 + 0.5);

      // Warm gray-brown ramp: purple-brown shadows, desaturated highlights.
      let r: number;
      let g: number;
      let b: number;
      if (shade < 0.5) {
        const t = shade * 2;
        r = lerp(rampShadow[0], rampMid[0], t);
        g = lerp(rampShadow[1], rampMid[1], t);
        b = lerp(rampShadow[2], rampMid[2], t);
      } else {
        const t = (shade - 0.5) * 2;
        r = lerp(rampMid[0], rampHighlight[0], t);
        g = lerp(rampMid[1], rampHighlight[1], t);
        b = lerp(rampMid[2], rampHighlight[2], t);
      }

      // Low-frequency warm/cool patchiness so the bark is not monochrome.
      const hueShift = fbmWrapU(u, 3.0, 9.1, v * 2.0 + 5.0, 3) - 0.5;
      r += hueShift * 20;
      g += hueShift * 7;
      b -= hueShift * 8;

      // Faint damp sheen in the crevices — a cool plum, not the old green
      // algae (the night palette is pink/plum/violet only).
      const damp =
        smoothstep(0.55, 0.8, fbmWrapU(u, 2.2, -4.3, v * 1.6 + 11.0, 2)) *
        smoothstep(0.25, 0.7, fissure) *
        0.45;
      r = lerp(r, 64, damp);
      g = lerp(g, 50, damp);
      b = lerp(b, 68, damp);

      // Dark rim first, then the light tan-orange lenticel fill.
      r = lerp(r, 38, lenticelRim * 0.35);
      g = lerp(g, 27, lenticelRim * 0.35);
      b = lerp(b, 31, lenticelRim * 0.35);
      r = lerp(r, 176, lenticelCore * 0.85);
      g = lerp(g, 138, lenticelCore * 0.85);
      b = lerp(b, 104, lenticelCore * 0.85);

      const index = (y * width + x) * 4;
      colorImage.data[index] = r;
      colorImage.data[index + 1] = g;
      colorImage.data[index + 2] = b;
      colorImage.data[index + 3] = 255;

      const bumpValue = Math.floor(bump * 255);
      bumpImage.data[index] = bumpValue;
      bumpImage.data[index + 1] = bumpValue;
      bumpImage.data[index + 2] = bumpValue;
      bumpImage.data[index + 3] = 255;

      // Baked roughness variation: crevices stay matte, exposed ridge tops
      // and the waxy lenticel bands turn slightly glossier so the warm key
      // and rose backlight pick up the relief as broken micro-highlights
      // instead of one smooth gradient.
      const roughValue = Math.floor(
        clamp01(
          0.88 +
            fissure * 0.12 -
            smoothstep(0.62, 0.95, shade) * 0.34 -
            lenticelCore * 0.3 -
            knotRim * 0.1 +
            crossGrain * 0.08,
        ) * 255,
      );
      roughImage.data[index] = roughValue;
      roughImage.data[index + 1] = roughValue;
      roughImage.data[index + 2] = roughValue;
      roughImage.data[index + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  roughContext.putImageData(roughImage, 0, 0);
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  // Integer u repeat: the map is periodic in u, and a whole number of
  // repeats keeps that periodicity intact across the tube seam. Raised from
  // (3, 1.9) so the grain reads at trunk scale.
  colorMap.repeat.set(4, 2.6);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.copy(colorMap.repeat);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(colorMap.repeat);
  return { colorMap, bumpMap, roughnessMap };
}

// A single loose falling petal. NOT the attached-flower outline: the deep
// obcordate tip notch reads as a heart under the halftone, so loose petals
// get their own soft rounded teardrop with at most a very shallow cleft, a
// slight lengthwise curl and a touch of lateral asymmetry. Three shape
// variants (cleft depth, widest point, skew, curl) are split across three
// instanced meshes. Same base->edge color gradient and UV layout as the
// flower petals. Lies in the xy plane along +y, normal +z.
const LOOSE_PETAL_VARIANTS = [
  { cleft: 0.0, peak: 0.5, skew: 0.09, sideBias: 0.1, curl: 0.042, twist: 0.018 },
  { cleft: 0.055, peak: 0.44, skew: -0.07, sideBias: -0.12, curl: 0.052, twist: -0.02 },
  { cleft: 0.03, peak: 0.56, skew: 0.12, sideBias: 0.08, curl: 0.034, twist: 0.012 },
] as const;
const PETAL_VARIANT_COUNT = LOOSE_PETAL_VARIANTS.length;

function createFallingPetalGeometry(variant: number) {
  const shape = LOOSE_PETAL_VARIANTS[variant % PETAL_VARIANT_COUNT];
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lengthSegments = 4;
  const widthSegments = 4;
  // A real sakura petal is ~15 mm long and nearly as wide. One world unit is
  // ~1 m here, so a true-to-life petal would be 0.015 u and vanish under the
  // halftone. This is the smallest card that still resolves at the hero
  // framing (~67 css px per world unit -> ~12-16 px long at the common
  // scales), which is about 16x life size; the proportions are the real
  // ones.
  const petalLength = 0.245;
  const maxHalfWidth = 0.093;
  const color = new THREE.Color();

  for (let i = 0; i <= lengthSegments; i += 1) {
    const vv = i / lengthSegments;
    for (let j = 0; j <= widthSegments; j += 1) {
      const uu = j / widthSegments;
      const xu = uu * 2 - 1;
      // Rounded-oval width profile: soft at both ends, widest at
      // shape.peak along the length (remapped so the sine peak lands there).
      const vvW =
        vv < shape.peak
          ? (vv / shape.peak) * 0.5
          : 0.5 + ((vv - shape.peak) / (1 - shape.peak)) * 0.5;
      const widthProfile = Math.pow(
        Math.sin(Math.PI * (0.055 + 0.89 * vvW)),
        0.72,
      );
      // At most a shallow dimple at the tip center, plus corner rounding
      // that keeps the tip oval instead of two heart lobes.
      const cleft =
        shape.cleft *
        Math.pow(Math.max(0, 1 - Math.abs(xu) * 2.3), 2) *
        smoothstep(0.76, 1, vv);
      const cornerRound =
        0.085 * Math.pow(Math.abs(xu), 2.4) * smoothstep(0.5, 1, vv);
      const radial = vv - cleft - cornerRound;
      // Asymmetry: one lobe slightly wider (sideBias) and the midline
      // bowed sideways (skew).
      const lateral =
        xu * (1 + shape.sideBias * xu) * widthProfile +
        shape.skew * Math.sin(Math.PI * vv);
      const x = lateral * maxHalfWidth;
      const y = (radial - 0.5) * petalLength;
      // Lengthwise curl + lateral cup + a slight diagonal twist, so the
      // shell reads as 3D while it banks through the light.
      const z =
        Math.sin(Math.PI * vv) * shape.curl +
        xu * xu * 0.02 * (0.3 + vv * 0.7) +
        xu * vv * shape.twist;
      positions.push(x, y, z);
      uvs.push(uu, vv);
      getPetalVertexColor(color, xu, vv);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = widthSegments + 1;
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < widthSegments; j += 1) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------
// Falling petals
// ---------------------------------------------------------------------------
// The descent is integrated from flat-plate aerodynamics instead of being
// drawn with scripted position offsets, so the zig-zag, the speed pulsing,
// the long glides and the steady sideways skate of a tumbling petal all fall
// out of the force balance rather than being animated in by hand.
//
// FORCES — the quasi-steady core of Andersen, Pesavento & Wang, "Unsteady
// aerodynamics of fluttering and tumbling plates", J. Fluid Mech. 541 (2005):
//
//   * A thin plate at angle of attack a carries a resultant force essentially
//     normal to its own face, of size ~ 1/2 rho C_N A U^2 sin(a). Resolved
//     along and across the flow that IS the textbook pair
//         C_D = C_N sin^2(a),   C_L = (C_N / 2) sin(2a),
//     so lift and drag come out of one term instead of two curves, and they
//     can never disagree about which way the petal is facing.
//   * A skin-friction floor C_D0, so an edge-on petal still has a terminal
//     speed instead of accelerating without limit.
//   * A rotational (Magnus) term ~ rho c^2 (omega x u). This is what makes a
//     tumbling petal skate steadily off to one side the way a topspun ball
//     dives. Without it a tumbler falls straight down and looks wrong.
//
// Divided through by mass it all collapses to ONE number per petal: broadside
// terminal speed is sqrt(g / kAero), so kAero = g / vTerm^2. A sakura petal
// is ~4 mg over ~1 cm^2, and
//     sqrt(2 m g / (rho C_D A)) = sqrt(2*4e-6*9.8 / (1.2*1.2*1e-4)) ~ 0.75 m/s
// which is the 0.5-1.0 m/s you get off video of a cherry in a breeze. One
// world unit is ~1 m here (the trunk is 5.4 u for a ~6 m tree), so the
// numbers are used as they are. A petal now crosses the frame in ~7 s; the
// old scripted version took ~30 s, which is why it read as drifting confetti.
//
// ATTITUDE is prescribed rather than solved — a full rotational solve with
// added inertia is the one part of that paper not worth its cost here. It is
// prescribed at the frequency plates are measured to flutter at, which is a
// Strouhal law: f = St * U / c, St ~ 0.15-0.25. A 0.13 u wide petal falling
// at 0.75 u/s therefore flips about once a second, and small petals visibly
// flicker faster than big ones. Everything downstream of the attitude — the
// forces, the path — is computed, so the pitch and the trajectory always
// agree.
//
// REGIMES follow Field, Klaus, Moore & Nori, Nature 388 (1997), which showed
// a falling plate settles into one of a few behaviours depending on its
// dimensionless moment of inertia:
//   FLUTTER  side-to-side rocking: broadside and stalled at each turn,
//            inclined and gliding fast in between.
//   TUMBLE   end-over-end rotation with a steady Magnus drift to one side.
//   CHAOTIC  flutter that occasionally goes over the top into a few tumbles
//            and then recovers — the transition that paper is named for.
//   SPIN     a cupped petal autorotating about a near-vertical axis at a
//            fixed tilt, so its lift sweeps a circle: a descending helix.
const PETAL_G = 9.8; // u/s^2, one world unit ~ 1 m
// Edge-on skin drag as a fraction of the normal-force coefficient. Sets how
// hard a petal accelerates when it knifes through the flow mid-flip.
const PETAL_CD0_RATIO = 0.07;
// Rotational-lift gain. At 0 a tumbler falls straight down, which is wrong;
// much above 1 it skates sideways faster than it falls and floats. 0.7 lands
// a tumbler at ~0.45 u/s of steady side drift, which is what the trace shows.
const PETAL_MAGNUS = 0.7;
// Non-dimensional tumbling rate, omega * c / U. Measured values sit near
// 0.4-0.9 for plates of this aspect ratio.
const PETAL_TUMBLE_RATE = 0.6;
// Flutter attitude is only meaningful at plausible rates: clamp so a gust
// cannot drive the pitch faster than the frame can resolve.
const PETAL_RATE_MIN = 1.5;
const PETAL_RATE_MAX = 12;

const PETAL_MODE_FLUTTER = 0;
const PETAL_MODE_TUMBLE = 1;
const PETAL_MODE_CHAOTIC = 2;
const PETAL_MODE_SPIN = 3;

// Petal lifecycle: HELD (invisible at a blossom anchor, waiting for a gust to
// work it loose) -> FALLING (aerodynamic descent; below the tree base the
// petal shrinks away into the void, then recycles to a new anchor). All
// per-petal constants are precomputed; update() allocates nothing.
const PETAL_HELD = 0;
const PETAL_FALLING = 1;
// With no ground, petals dissolve as they sink past the frame's bottom edge
// (world y ~0.55 at the trunk plane -> group-local ~0.52 after the 1.05 y
// scale): full size while visible, shrinking away just below the edge, gone
// well off-screen.
const PETAL_VOID_FADE_START = 0.45;
const PETAL_VOID_FADE_END = -0.75;

// Shared flow field: one smooth curl-noise current that every falling petal
// samples, so the flock reads as riding the same wind instead of confetti.
const FLOW_NOISE_SCALE = 0.12; // world -> noise units (~1 big swirl per 8u)
const FLOW_CURL_EPS = 0.35; // finite-difference step, in noise units
const FLOW_CURL_STRENGTH = 1.6; // horizontal swirl speed at full gust (u/s)
// Vertical channel scale (u/s). Kept below the ~0.6-0.95 terminal band so
// updrafts visibly slow a petal and occasionally float it, without petals
// hovering indefinitely.
const FLOW_LIFT_STRENGTH = 0.6;
// Gust front that travels downwind across the canopy: modulates both petal
// release and field strength, so detachment and acceleration sweep through
// the tree as a moving wave instead of firing uniformly at random.
const GUST_WAVE_LENGTH = 7; // world units crest-to-crest
const GUST_WAVE_SPEED = 0.45; // crest travels at LENGTH*SPEED ~ 3.2 u/s
// Gentle helical swirl in the wake trailing downwind of the trunk.
const HELIX_STRENGTH = 0.28;

function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

class FallingPetalSystem {
  // One InstancedMesh per loose-petal shape variant; petal i lives in
  // meshes[i % PETAL_VARIANT_COUNT] at slot (i / PETAL_VARIANT_COUNT) | 0.
  meshes: THREE.InstancedMesh[] = [];
  private rng: () => number;
  private lobes: CanopyLobe[];
  private anchors: THREE.Vector3[] | null;
  private positions: THREE.Vector3[] = [];
  private velocities: THREE.Vector3[] = [];
  private states: Uint8Array;
  // HELD: remaining release delay (gust-scaled).
  private timers: Float32Array;
  private fallAges: Float32Array;
  private modes: Uint8Array;
  // Broadside terminal speed, and the single aero coefficient g / vTerm^2
  // that reproduces it.
  private vTerms: Float32Array;
  private kAeros: Float32Array;
  // Rendered petal width. Sets the flutter frequency through f = St U / c,
  // so this must track baseScales.
  private chords: Float32Array;
  private strouhals: Float32Array;
  // Airspeed relaxed over ~0.5 s. Pitch rate is driven off this rather than
  // the instantaneous speed because a real plate has rotational inertia and
  // does not re-time its flip inside a single beat. Feeding it the raw speed
  // instead correlates the rotation with the drag pulse and cancels the
  // Magnus drift outright.
  private uSmooths: Float32Array;
  // Azimuth of the vertical plane the petal rocks in, and its drift rate
  // (fast, for SPIN petals: that is the autorotation).
  private phis: Float32Array;
  private phiRates: Float32Array;
  // Plate inclination from horizontal, its flutter half-swing and phase.
  private thetas: Float32Array;
  private thetaAmps: Float32Array;
  private thetaPhases: Float32Array;
  // Which way a tumbler rotates, hence which way its Magnus force points.
  private spinDirs: Float32Array;
  // CHAOTIC petals only: fall-age at which the current tumble burst ends and
  // at which the next one starts.
  private burstEnds: Float32Array;
  private nextBursts: Float32Array;
  private baseScales: Float32Array;
  // Weighted anchor pick table (indices into this.anchors, peripheral and
  // low anchors repeated more often). Built once in the constructor so
  // hold() samples it without allocating.
  private anchorPick: Uint16Array | null = null;
  private matrix = new THREE.Matrix4();
  private axisC = new THREE.Vector3();
  private axisS = new THREE.Vector3();
  private axisN = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private tmp = new THREE.Vector3();
  // Base air stream. Peak horizontal air speed is this times the gust
  // multiplier, ~1.1 u/s, so at the crest a petal is carried sideways faster
  // than it falls.
  private wind = new THREE.Vector3(0.22, 0, 0.07);
  // Unit wind direction in the horizontal plane (set in the constructor).
  private windDirX = 1;
  private windDirZ = 0;
  // Scratch output of sampleFlow — plain numbers, no per-frame allocation.
  private flowX = 0;
  private flowY = 0;
  private flowZ = 0;

  constructor({
    count,
    lobes,
    anchors,
    material,
    rng,
  }: {
    count: number;
    lobes: CanopyLobe[];
    anchors?: THREE.Vector3[];
    material: THREE.Material;
    rng: () => number;
  }) {
    this.rng = rng;
    this.lobes = lobes;
    this.anchors = anchors && anchors.length > 0 ? anchors : null;
    if (this.anchors) {
      // Real petals detach where wind and gravity work them loose: the
      // canopy rim and underside, not the sheltered interior. Weight each
      // anchor by horizontal distance from the canopy axis (squared, so
      // the rim dominates) and by how low it sits, then expand into a
      // pick table with 1..10 slots per anchor. A rim-bottom anchor sheds
      // ~10x as often as an interior-top one, which still releases
      // occasionally.
      const list = this.anchors;
      let cx = 0;
      let cz = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const a of list) {
        cx += a.x;
        cz += a.z;
        minY = Math.min(minY, a.y);
        maxY = Math.max(maxY, a.y);
      }
      cx /= list.length;
      cz /= list.length;
      let maxR = 0;
      for (const a of list) {
        maxR = Math.max(maxR, Math.hypot(a.x - cx, a.z - cz));
      }
      const invR = 1 / (maxR || 1);
      const invH = 1 / (maxY - minY || 1);
      const table: number[] = [];
      for (let i = 0; i < list.length; i += 1) {
        const a = list[i];
        const rim = Math.hypot(a.x - cx, a.z - cz) * invR;
        const under = 1 - (a.y - minY) * invH;
        const w = (0.08 + 0.92 * rim * rim) * (0.3 + 0.7 * under);
        table.push(i);
        const copies = Math.round(w * 9);
        for (let c = 0; c < copies; c += 1) table.push(i);
      }
      this.anchorPick = new Uint16Array(table);
    }
    const windLen = Math.hypot(this.wind.x, this.wind.z) || 1;
    this.windDirX = this.wind.x / windLen;
    this.windDirZ = this.wind.z / windLen;
    for (let v = 0; v < PETAL_VARIANT_COUNT; v += 1) {
      const slots = Math.ceil((count - v) / PETAL_VARIANT_COUNT);
      if (slots <= 0) break;
      const mesh = new THREE.InstancedMesh(
        createFallingPetalGeometry(v),
        material,
        slots,
      );
      mesh.frustumCulled = false;
      // Per-instance gloss / thickness / glow, read by applyPetalTranslucency.
      mesh.geometry.setAttribute(
        "petalShade",
        new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3),
      );
      this.meshes.push(mesh);
    }

    this.states = new Uint8Array(count);
    this.timers = new Float32Array(count);
    this.fallAges = new Float32Array(count);
    this.modes = new Uint8Array(count);
    this.vTerms = new Float32Array(count);
    this.kAeros = new Float32Array(count);
    this.chords = new Float32Array(count);
    this.strouhals = new Float32Array(count);
    this.uSmooths = new Float32Array(count);
    this.phis = new Float32Array(count);
    this.phiRates = new Float32Array(count);
    this.thetas = new Float32Array(count);
    this.thetaAmps = new Float32Array(count);
    this.thetaPhases = new Float32Array(count);
    this.spinDirs = new Float32Array(count);
    this.burstEnds = new Float32Array(count);
    this.nextBursts = new Float32Array(count);
    this.baseScales = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      this.positions.push(new THREE.Vector3());
      this.velocities.push(new THREE.Vector3());
      // Size is biased small: r^2 puts most of the flock near the bottom of
      // the band and leaves only a few large petals, which is both what a
      // real tree sheds and what keeps any one petal from reading as a
      // dinner plate.
      const r = this.rng();
      this.baseScales[i] = 0.58 + 0.42 * r * r;
      // Terminal speed spans the measured sakura band. It is deliberately
      // NOT correlated with size: for geometrically similar petals of the
      // same tissue, mass and area both scale with the square of length, so
      // sqrt(2mg / rho C_D A) is size-independent. The spread here comes
      // from how curled and how dried each petal is.
      this.vTerms[i] = this.rand(0.55, 0.85);
      this.kAeros[i] = PETAL_G / (this.vTerms[i] * this.vTerms[i]);
      // Rendered width, which is what sets the flutter frequency.
      this.chords[i] = 0.186 * this.baseScales[i];
      this.strouhals[i] = this.rand(0.1, 0.15);
      this.uSmooths[i] = this.vTerms[i];
      this.phis[i] = this.rand(0, TAU);
      // Half-swing of the rock. The petal glides along its own plane, so the
      // path leaves vertical by (90deg - theta): swing too far and it just
      // knifes straight down. 40-57deg maximises the sideways reach, and
      // traces out ~2.5 petal lengths of side-to-side travel per beat at
      // every size in the band.
      this.thetaAmps[i] = this.rand(0.7, 1.0);
      this.thetaPhases[i] = this.rand(0, TAU);
      this.spinDirs[i] = this.rng() < 0.5 ? -1 : 1;

      // Regime mix. Flutter dominates, as it does for real plates in this
      // inertia range; the rest add the variety you actually see under a
      // cherry in wind.
      const roll = this.rng();
      if (roll < 0.5) {
        this.modes[i] = PETAL_MODE_FLUTTER;
        this.phiRates[i] = this.rand(-0.13, 0.13);
      } else if (roll < 0.72) {
        this.modes[i] = PETAL_MODE_TUMBLE;
        this.phiRates[i] = this.rand(-0.1, 0.1);
      } else if (roll < 0.92) {
        this.modes[i] = PETAL_MODE_CHAOTIC;
        this.phiRates[i] = this.rand(-0.13, 0.13);
      } else {
        // Autorotation: a cupped petal locks at a shallow tilt and spins
        // about the vertical, so its lift sweeps a circle.
        this.modes[i] = PETAL_MODE_SPIN;
        this.thetas[i] = this.rand(0.42, 0.8) * this.spinDirs[i];
        this.phiRates[i] = this.rand(2.2, 4.2) * this.spinDirs[i];
      }

      // Same widened instance palette as the attached blossoms, so loose
      // petals match the canopy they fell from.
      sampleBlossomTint(this.rng, this.color);
      const mesh = this.meshes[i % PETAL_VARIANT_COUNT];
      const slot = (i / PETAL_VARIANT_COUNT) | 0;
      mesh.setColorAt(slot, this.color);
      // Gloss, thickness and glow, independent of each other so no two
      // petals crossing the same patch of sky read as the same sprite. A
      // thin dried petal is glossier and passes more light than a fresh
      // plump one, so thickness leans against roughness rather than being
      // drawn separately.
      const thin = this.rng();
      const shade = mesh.geometry.getAttribute(
        "petalShade",
      ) as THREE.InstancedBufferAttribute;
      shade.setXYZ(
        slot,
        0.62 + 0.72 * (1 - thin),
        0.5 + 1.05 * thin,
        this.rand(0.6, 1.5),
      );

      if (this.rng() < 0.45) {
        // Pre-seed part of the flock mid-fall so the scene is not empty at
        // load: drop each petal a random way down its own descent and shift
        // it downwind by the drift it would have accumulated.
        this.hold(i, 0);
        this.release(i, 0.5);
        const p = this.positions[i];
        const drop =
          this.rng() * Math.max(0, p.y - PETAL_VOID_FADE_START - 0.2);
        const driftT = Math.min(7, drop / this.vTerms[i]);
        this.fallAges[i] = driftT;
        p.y -= drop;
        p.x += this.wind.x * this.rand(1, 2.6) * driftT;
        p.z += this.wind.z * this.rand(1, 2.6) * driftT;
        this.velocities[i].y = -this.vTerms[i] * this.rand(0.6, 1);
      } else {
        this.hold(i, this.rand(0.5, 8));
      }
    }

    for (const mesh of this.meshes) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.getAttribute("petalShade").needsUpdate = true;
    }
    this.update(0);
  }

  private rand(min: number, max: number) {
    return min + (max - min) * this.rng();
  }

  // Park the petal (hidden) at a fresh detachment point and arm its delay.
  private hold(i: number, delay: number) {
    const p = this.positions[i];
    if (this.anchors) {
      // Spawn from a real blossom cluster, drawn through the weighted pick
      // table (rim and underside anchors dominate), nudged slightly
      // outward from the trunk axis and downward, like a petal separating
      // from a corolla.
      const pick = this.anchorPick;
      const a = pick
        ? this.anchors[pick[Math.floor(this.rng() * pick.length)]]
        : this.anchors[Math.floor(this.rng() * this.anchors.length)];
      const radial = Math.hypot(a.x, a.z) || 1;
      const out = this.rand(0.04, 0.2);
      p.set(
        a.x + (a.x / radial) * out + this.rand(-0.06, 0.06),
        a.y - this.rand(0.04, 0.22),
        a.z + (a.z / radial) * out + this.rand(-0.06, 0.06),
      );
    } else {
      // Lobe fallback (no blossoms built): shell-biased sample with the
      // top hemisphere squashed, so even here petals leave from the rim
      // and underside rather than the crown.
      const lobe = this.lobes[Math.floor(this.rng() * this.lobes.length)];
      const local = randomPointInUnitSphere(this.rng, this.tmp);
      local.multiplyScalar(0.75 + this.rng() * 0.35);
      if (local.y > 0) local.y *= 0.45;
      p.set(
        lobe.center.x + local.x * lobe.radius.x,
        lobe.center.y + local.y * lobe.radius.y + this.rand(-0.1, 0.3),
        lobe.center.z + local.z * lobe.radius.z,
      );
    }
    this.velocities[i].set(0, 0, 0);
    this.states[i] = PETAL_HELD;
    this.timers[i] = delay;
  }

  private release(i: number, gustHere: number) {
    const p = this.positions[i];
    const v = this.velocities[i];
    // The gust that tore the petal loose also flings it: the branch tip is
    // moving downwind at the moment of separation, so the petal inherits
    // some of that, on top of a small outward push off the corolla.
    const radial = Math.hypot(p.x, p.z) || 1;
    const out = this.rand(0.03, 0.16);
    const fling = gustHere * this.rand(0.35, 1.05);
    v.set(
      (p.x / radial) * out + this.windDirX * fling + this.rand(-0.05, 0.05),
      this.rand(-0.14, 0.02),
      (p.z / radial) * out + this.windDirZ * fling + this.rand(-0.05, 0.05),
    );
    this.states[i] = PETAL_FALLING;
    this.fallAges[i] = 0;
    // A petal separates roughly flat and only develops its instability once
    // it has some airspeed, so start it near broadside.
    if (this.modes[i] !== PETAL_MODE_SPIN) {
      this.thetas[i] = this.rand(-0.25, 0.25);
      this.thetaPhases[i] = this.rand(-0.2, 0.2);
    }
    this.burstEnds[i] = 0;
    this.nextBursts[i] = this.rand(1.5, 5);
    // It has no airspeed yet, so it has nothing to flip against.
    this.uSmooths[i] = 0.12;
  }

  // Smooth time-evolving velocity field shared by every petal. The
  // horizontal part is the curl of a scalar fbm potential (via finite
  // differences), so it is divergence-free: petals following it bunch into
  // ribbons and arcs instead of scattering, and nearby petals sample nearly
  // identical velocities. A second potential channel adds a smaller vertical
  // updraft/downdraft pattern. Cost: 5 fbm2 calls (2 octaves) per petal.
  private sampleFlow(
    px: number,
    pz: number,
    windTime: number,
    strength: number,
  ) {
    const t = windTime * 0.2;
    const nx = px * FLOW_NOISE_SCALE + t * 0.9;
    const nz = pz * FLOW_NOISE_SCALE - t * 0.55;
    const e = FLOW_CURL_EPS;
    const dPdx = fbm2(nx + e, nz, 2) - fbm2(nx - e, nz, 2);
    const dPdz = fbm2(nx, nz + e, 2) - fbm2(nx, nz - e, 2);
    const k = (FLOW_CURL_STRENGTH * strength) / (2 * e);
    this.flowX = dPdz * k;
    this.flowZ = -dPdx * k;
    this.flowY =
      (fbm2(nx + 37.2, nz - 21.7, 2) - 0.5) * FLOW_LIFT_STRENGTH * strength;
  }

  update(dt: number, windTime = 0, windStrength = 1) {
    const wind = this.wind;
    const count = this.positions.length;
    // Same gust envelope as the branch/blossom wind shaders, so petals tear
    // loose and accelerate exactly when the canopy leans.
    const gust = arborGustEnvelope(windTime, 0) * windStrength;
    // Traveling gust front: a plane wave sweeping downwind. Each petal folds
    // its own position into the phase, so both detachment and flow strength
    // propagate through the tree as a visible front.
    const dirX = this.windDirX;
    const dirZ = this.windDirZ;
    const invWaveLen = 1 / GUST_WAVE_LENGTH;
    const wavePhaseT = windTime * GUST_WAVE_SPEED;

    for (let i = 0; i < count; i += 1) {
      const p = this.positions[i];
      const v = this.velocities[i];

      // 0..1 crest of the traveling front at this petal, squared to sharpen
      // the leading edge, folded with the global gust envelope.
      const wave =
        0.5 +
        0.5 *
          Math.sin(
            TAU * ((p.x * dirX + p.z * dirZ) * invWaveLen - wavePhaseT),
          );
      const gustHere = gust * (0.4 + 0.95 * wave * wave);

      if (this.states[i] === PETAL_HELD) {
        // Detachment rides the front: held petals barely age while the crest
        // is elsewhere and shed in a sweep as it passes over their anchor.
        // The threshold is most of the way up the envelope, so a shower of
        // petals is visibly the consequence of the canopy being pushed over.
        const releaseRate = 0.06 + Math.max(0, gustHere - 0.55) * 8;
        this.timers[i] -= dt * releaseRate;
        if (this.timers[i] <= 0) this.release(i, gustHere);
      } else {
        const t = (this.fallAges[i] += dt);

        // --- air velocity at this point -------------------------------
        this.sampleFlow(p.x, p.z, windTime, gustHere);
        const airMul = 0.55 + gustHere * 3.6;
        let airX = wind.x * airMul + this.flowX;
        let airZ = wind.z * airMul + this.flowZ;
        let airY = this.flowY;

        // Gentle helix in the wake downwind of the trunk: petals passing
        // through it corkscrew around the wind axis, so streams curve
        // around the tree instead of shooting straight past it.
        const dw = p.x * dirX + p.z * dirZ;
        const lat = p.x * dirZ - p.z * dirX;
        if (dw > 0.5 && dw < 7 && lat > -2.6 && lat < 2.6) {
          const zone =
            HELIX_STRENGTH *
            gustHere *
            smoothstep(0.5, 1.8, dw) *
            (1 - smoothstep(4.5, 7, dw)) *
            (1 - smoothstep(1.1, 2.6, Math.abs(lat)));
          if (zone > 0.001) {
            const helixPhase = dw * 1.1 - windTime * 1.6;
            airY += Math.sin(helixPhase) * zone;
            airX += dirZ * Math.cos(helixPhase) * zone;
            airZ -= dirX * Math.cos(helixPhase) * zone;
          }
        }

        // --- velocity relative to the air ------------------------------
        let rx = v.x - airX;
        let ry = v.y - airY;
        let rz = v.z - airZ;
        let U = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (U < 1e-4) U = 1e-4;
        const invU = 1 / U;

        // --- attitude ---------------------------------------------------
        const mode = this.modes[i];
        const chord = this.chords[i];
        // Strouhal law: the faster it flies and the smaller it is, the
        // quicker it flips.
        const uS = (this.uSmooths[i] += (U - this.uSmooths[i]) *
          Math.min(1, 2 * dt));
        const rate = THREE.MathUtils.clamp(
          (TAU * this.strouhals[i] * uS) / chord,
          PETAL_RATE_MIN,
          PETAL_RATE_MAX,
        );
        let theta: number;
        let pitchRate = 0;
        if (mode === PETAL_MODE_SPIN) {
          theta = this.thetas[i];
        } else if (
          mode === PETAL_MODE_TUMBLE ||
          (mode === PETAL_MODE_CHAOTIC && t < this.burstEnds[i])
        ) {
          pitchRate = (this.spinDirs[i] * PETAL_TUMBLE_RATE * uS) / chord;
          theta = this.thetas[i] += pitchRate * dt;
        } else {
          if (mode === PETAL_MODE_CHAOTIC && this.burstEnds[i] > 0) {
            // Coming out of a tumble: pick up the rock from whatever pitch
            // the rotation left the plate at, so there is no snap.
            this.burstEnds[i] = 0;
            this.nextBursts[i] = t + this.rand(2.5, 8);
            this.thetaPhases[i] = Math.asin(
              THREE.MathUtils.clamp(
                wrapAngle(this.thetas[i]) / this.thetaAmps[i],
                -1,
                1,
              ),
            );
          }
          this.thetaPhases[i] += rate * dt;
          // The rocking builds over the first second: a petal that has just
          // let go has no airspeed and nothing to be unstable about.
          theta =
            this.thetaAmps[i] *
            Math.sin(this.thetaPhases[i]) *
            smoothstep(0, 1, t);
          this.thetas[i] = theta;
          if (mode === PETAL_MODE_CHAOTIC && t >= this.nextBursts[i]) {
            this.burstEnds[i] = t + this.rand(0.7, 2.2);
          }
        }

        const phi = (this.phis[i] += this.phiRates[i] * dt);
        const ex = Math.cos(phi);
        const ez = Math.sin(phi);
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        // Plate frame: chord across the rocking plane, span along the
        // horizontal rotation axis, normal off the face.
        const cxA = ex * cosT;
        const cyA = sinT;
        const czA = ez * cosT;
        const sxA = ez;
        const szA = -ex;
        const nxA = -sinT * ex;
        const nyA = cosT;
        const nzA = -sinT * ez;

        // --- flat-plate aerodynamics -----------------------------------
        const k = this.kAeros[i];
        // Signed sin(angle of attack): +-1 broadside, 0 edge-on.
        const sDot = (nxA * rx + nyA * ry + nzA * rz) * invU;
        const sAbs = Math.abs(sDot);
        const sg = sDot < 0 ? -1 : 1;
        // Along-flow part (form drag at this incidence, plus the skin
        // floor). Applied implicitly below so a gust can never blow the
        // integrator up.
        const cDrag = k * (sAbs * sAbs + PETAL_CD0_RATIO) * U;
        // Cross-flow part: the component of the face-normal force
        // perpendicular to the flow. Its size works out to
        // k U^2 sin(2a) / 2 exactly, and it flips sign with the plate, so
        // the rocking IS what drives the zig-zag.
        const liftMag = k * sAbs * U * U;
        let ax = -(nxA * sg - sAbs * rx * invU) * liftMag;
        let ay = -(nyA * sg - sAbs * ry * invU) * liftMag;
        let az = -(nzA * sg - sAbs * rz * invU) * liftMag;

        // Magnus: a spinning plate drags circulation round with it and gets
        // pushed across the flow. This is the whole reason a tumbling petal
        // travels sideways instead of dropping.
        if (pitchRate !== 0) {
          const m = PETAL_MAGNUS * k * chord * pitchRate;
          ax += m * -szA * ry;
          ay += m * (szA * rx - sxA * rz);
          az += m * sxA * ry;
        }

        // --- integrate --------------------------------------------------
        const damp = 1 / (1 + cDrag * dt);
        rx = (rx + ax * dt) * damp;
        ry = (ry + (ay - PETAL_G) * dt) * damp;
        rz = (rz + az * dt) * damp;
        v.set(rx + airX, ry + airY, rz + airZ);
        p.addScaledVector(v, dt);

        // No ground: once a petal has fully dissolved below the tree base
        // (or drifted far out of frame), recycle it to a new anchor.
        if (
          Math.abs(p.x) > 11 ||
          Math.abs(p.z) > 9 ||
          p.y < PETAL_VOID_FADE_END
        ) {
          this.hold(i, this.rand(1.5, 8));
        } else {
          this.axisC.set(cxA, cyA, czA);
          this.axisS.set(sxA, 0, szA);
          this.axisN.set(nxA, nyA, nzA);
        }
      }

      // Fade in from zero over ~0.5s at release (so recycled petals never
      // pop into view), then a scale-out ramp as the petal sinks past the
      // tree base into the void.
      const voidFade = clamp01(
        (p.y - PETAL_VOID_FADE_END) /
          (PETAL_VOID_FADE_START - PETAL_VOID_FADE_END),
      );
      const s =
        this.states[i] === PETAL_FALLING
          ? this.baseScales[i] *
            smoothstep(0, 0.5, this.fallAges[i]) *
            voidFade
          : 0;

      this.scale.setScalar(s);
      this.matrix.makeBasis(this.axisC, this.axisS, this.axisN);
      this.matrix.scale(this.scale);
      this.matrix.setPosition(p);
      this.meshes[i % PETAL_VARIANT_COUNT].setMatrixAt(
        (i / PETAL_VARIANT_COUNT) | 0,
        this.matrix,
      );
    }

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Canopy self-occlusion
// ---------------------------------------------------------------------------
// A real cherry canopy is not a uniform pink mass. The outside of the sleeve
// sees nearly the whole sky, the inside sees almost none, and that one
// gradient is most of what makes a tree read as a solid volume instead of a
// spray of confetti. A forward renderer with three directional lights cannot
// produce it — all 23,500 blossom instances are lit identically no matter how
// buried they are — so it is baked here, once, at build time.
//
// Every blossom is splatted into a coarse density grid carrying its own
// cross-section (scale^2). Each blossom then fires OCC_DIR_COUNT short rays
// through that grid and accumulates optical depth. Two things come back:
//
//   openness  exp(-k * mean optical depth). Scales indirect light, and more
//             gently the direct terms, so buried flowers go dim.
//   bent      the average unoccluded direction, transmittance-weighted. The
//             shading normal leans toward it, so a rim flower faces out into
//             the key light and an interior one turns away and falls off.
//             This is what gives the mass its shape.
//
// The extinction k is solved from the bake itself so the median blossom lands
// on OCC_TARGET_MEDIAN. That keeps the tonal range identical across quality
// tiers even though they differ 3x in blossom count, and it survives any
// later change to blossom density without needing a retune.
const OCC_CELL = 0.45; // grid cell edge, world units
const OCC_DIR_COUNT = 16;
const OCC_STEPS = 5;
const OCC_STEP = 0.62; // world units per march step
// Median blossom transmittance. Lower is a darker, deeper canopy interior.
const OCC_TARGET_MEDIAN = 0.6;
// The bake is a volume estimate, not a visibility test, so cap how dark and
// how bright it is allowed to push any one flower. Without the floor the
// canopy interior goes to holes and the tree reads as eaten away rather than
// as dense.
const OCC_MIN = 0.22;
const OCC_MAX = 1;

// Fibonacci sphere: an even spread of directions with no axis bias, which a
// hand-written set of 16 always has.
function buildOcclusionDirections() {
  const dirs = new Float32Array(OCC_DIR_COUNT * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < OCC_DIR_COUNT; i += 1) {
    const y = 1 - (i / (OCC_DIR_COUNT - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    dirs[i * 3] = Math.cos(theta) * r;
    dirs[i * 3 + 1] = y;
    dirs[i * 3 + 2] = Math.sin(theta) * r;
  }
  return dirs;
}

class CanopyOcclusion {
  private grid: Float32Array;
  private nx: number;
  private ny: number;
  private nz: number;
  private minX: number;
  private minY: number;
  private minZ: number;
  private dirs = buildOcclusionDirections();
  // Extinction coefficient, solved in solveExtinction() from the baked
  // optical depths.
  private k = 1;

  constructor(points: { position: THREE.Vector3; scale: number }[]) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.position.x);
      minY = Math.min(minY, p.position.y);
      minZ = Math.min(minZ, p.position.z);
      maxX = Math.max(maxX, p.position.x);
      maxY = Math.max(maxY, p.position.y);
      maxZ = Math.max(maxZ, p.position.z);
    }
    // One cell of padding so a ray leaving the canopy reads empty space
    // rather than clamping onto the boundary cell and staying occluded.
    const pad = OCC_CELL * 2;
    this.minX = minX - pad;
    this.minY = minY - pad;
    this.minZ = minZ - pad;
    this.nx = Math.max(1, Math.ceil((maxX - minX + pad * 2) / OCC_CELL));
    this.ny = Math.max(1, Math.ceil((maxY - minY + pad * 2) / OCC_CELL));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ + pad * 2) / OCC_CELL));
    this.grid = new Float32Array(this.nx * this.ny * this.nz);

    // Splat cross-section, not count: a full corolla blocks several times
    // what a bud does.
    const invVolume = 1 / (OCC_CELL * OCC_CELL * OCC_CELL);
    for (const p of points) {
      const idx = this.index(p.position.x, p.position.y, p.position.z);
      if (idx >= 0) this.grid[idx] += p.scale * p.scale * invVolume;
    }
  }

  private index(x: number, y: number, z: number) {
    const ix = Math.floor((x - this.minX) / OCC_CELL);
    const iy = Math.floor((y - this.minY) / OCC_CELL);
    const iz = Math.floor((z - this.minZ) / OCC_CELL);
    if (ix < 0 || iy < 0 || iz < 0) return -1;
    if (ix >= this.nx || iy >= this.ny || iz >= this.nz) return -1;
    return (iz * this.ny + iy) * this.nx + ix;
  }

  // Optical depth along one direction: density integrated over the march.
  private rayDepth(
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number,
  ) {
    let depth = 0;
    for (let s = 1; s <= OCC_STEPS; s += 1) {
      const d = s * OCC_STEP;
      const idx = this.index(px + dx * d, py + dy * d, pz + dz * d);
      if (idx >= 0) depth += this.grid[idx];
    }
    return depth * OCC_STEP;
  }

  // Mean optical depth over all directions, per point. Kept so the caller
  // can solve the extinction against the whole population before turning
  // depths into transmittances.
  meanDepth(p: THREE.Vector3) {
    let sum = 0;
    for (let i = 0; i < OCC_DIR_COUNT; i += 1) {
      sum += this.rayDepth(
        p.x,
        p.y,
        p.z,
        this.dirs[i * 3],
        this.dirs[i * 3 + 1],
        this.dirs[i * 3 + 2],
      );
    }
    return sum / OCC_DIR_COUNT;
  }

  // Pick k so the median blossom transmits OCC_TARGET_MEDIAN.
  solveExtinction(depths: Float32Array) {
    const sorted = Float32Array.from(depths).sort();
    const median = sorted[sorted.length >> 1] || 1e-3;
    this.k = Math.log(1 / OCC_TARGET_MEDIAN) / Math.max(median, 1e-3);
  }

  // Precomputed KEY-LIGHT shadowing: one longer march toward the key light,
  // so canopy lobes facing the light carry lit flowers and the far side
  // falls into soft shadow — the single strongest "offline render" cue, at
  // zero per-frame cost. The direction is the key light's, unscaled into
  // group space by the tree's baked non-uniform scale.
  keyShadow(p: THREE.Vector3, dx: number, dy: number, dz: number) {
    let depth = 0;
    for (let step = 1; step <= 8; step += 1) {
      const dist = step * 0.55;
      const idx = this.index(p.x + dx * dist, p.y + dy * dist, p.z + dz * dist);
      if (idx >= 0) depth += this.grid[idx];
    }
    // Slightly gentler than the ambient extinction: direct sun penetrates
    // a canopy deeper than skylight does.
    return Math.exp(-this.k * 0.7 * depth * 0.55);
  }

  // Final per-blossom shading terms: bent normal in xyz, openness in w.
  sample(p: THREE.Vector3, out: [number, number, number, number]) {
    let bx = 0;
    let by = 0;
    let bz = 0;
    let sum = 0;
    for (let i = 0; i < OCC_DIR_COUNT; i += 1) {
      const dx = this.dirs[i * 3];
      const dy = this.dirs[i * 3 + 1];
      const dz = this.dirs[i * 3 + 2];
      const t = Math.exp(-this.k * this.rayDepth(p.x, p.y, p.z, dx, dy, dz));
      bx += dx * t;
      by += dy * t;
      bz += dz * t;
      sum += t;
    }
    const len = Math.hypot(bx, by, bz);
    if (len > 1e-4) {
      out[0] = bx / len;
      out[1] = by / len;
      out[2] = bz / len;
    } else {
      // Uniformly enclosed: nothing to lean toward, so keep it upright.
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
    }
    out[3] = THREE.MathUtils.clamp(sum / OCC_DIR_COUNT, OCC_MIN, OCC_MAX);
    return out;
  }
}

class WeepingCherryGenerator {
  group = new THREE.Group();
  branchMesh: THREE.Mesh | null = null;
  blossomMesh: THREE.InstancedMesh | null = null;
  lowBlossomMesh: THREE.InstancedMesh | null = null;
  halfBlossomMesh: THREE.InstancedMesh | null = null;
  budMesh: THREE.InstancedMesh | null = null;
  petals: FallingPetalSystem | null = null;
  // One shared procedural petal-surface texture (blossom + loose petals).
  private petalDetailTexture: THREE.Texture | null = null;
  branchWindUniforms: BranchWindUniforms | null = null;
  // Intro grow reveal: 0 hides every blossom at its spur point, 1 is fully
  // bloomed. Driven per frame from the intro progress by the component.
  blossomGrowth = { value: 1 };
  // Occlusion strength and the transmission lobes, shared by the attached
  // blossoms and the loose petals so both react to the same stage lights.
  private canopyShade = createCanopyShadeUniforms();
  private rng: () => number;
  private nextBranchId = 1;
  private quality: Exclude<Quality, "auto">;
  private branches: Branch[] = [];
  private terminalTwigs: Branch[] = [];
  private lobes: CanopyLobe[] = [];
  private occupied = new SpatialHash(0.72);

  private params = {
    trunkHeight: 5.15,
    trunkRadius: 0.48,
    primaryBranchCount: 6,
    primaryLength: [5.4, 7.95] as const,
    secondaryLength: [2.35, 4.25] as const,
    tertiaryLength: [0.85, 1.65] as const,
    twigLength: [1.1, 2.25] as const,
    minDistanceByDepth: [0, 1.82, 1.04, 0.62, 0.22, 0.16, 0.1],
    curveSegments: 8,
  };

  constructor(private options: TreeOptions = {}) {
    this.rng = makeRng(options.seed ?? 20260705);
    this.quality = resolveSceneQuality(options.quality ?? "auto");
  }

  private rand(min: number, max: number) {
    return min + (max - min) * this.rng();
  }

  private int(min: number, max: number) {
    return Math.floor(this.rand(min, max + 1));
  }

  private randomVector(scaleY = 1) {
    const v = new THREE.Vector3(
      this.rand(-1, 1),
      this.rand(-1, 1) * scaleY,
      this.rand(-1, 1),
    );
    return v.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : v.normalize();
  }

  private getRadial(point: THREE.Vector3) {
    const radial = new THREE.Vector3(point.x, 0, point.z);
    if (radial.lengthSq() < 1e-6)
      radial.set(this.rand(-1, 1), 0, this.rand(-1, 1));
    return radial.normalize();
  }

  generate() {
    this.group.name = "Procedural Weeping Cherry Tree";
    // Frozen placement, chosen live with the ?tune panel. Lifted 2.25u and
    // pushed 4.35u toward the camera, scaled to 0.76x of the original to hold
    // its apparent size at that closer depth, with a slight yaw.
    //
    // The lift does not expose the trunk's cut base, and the depth change is
    // why: at z=4.35 the camera sees ~8.6u of height centred on y=7.27, so the
    // frame's bottom edge sits near y=2.95 — above the base at y=2.25. Lifting
    // the tree without moving it closer WOULD show the base, so treat these
    // three numbers as one setting rather than independently adjustable.
    this.group.position.set(2.0, 2.25, 4.35);
    this.group.rotation.y = 0.06;
    this.group.scale.set(0.7, 0.8, 0.64);
    this.lobes = this.createCanopyLobes();
    this.generateLobeTargets();

    const trunk = this.createTrunk();
    const primaries = this.createPrimaryBranches(trunk);
    const secondaries = this.createChildLayer(primaries, 2);
    const tertiaries = this.createChildLayer(secondaries, 3);
    this.createTerminalTwigs([...secondaries, ...tertiaries]);
    this.ensureTerminalProgression([
      ...primaries,
      ...secondaries,
      ...tertiaries,
    ]);
    this.createSubTwigs();

    this.solveRadii(trunk);
    this.computeWeights(trunk);
    this.applySagging(trunk);
    this.computeWindChains(trunk);
    this.computeGrowthOrder(trunk);
    this.buildBranchMesh();
    this.buildBlossomMeshes();
    this.buildPetals();

    if (this.options.showDebugLobes) this.addDebugLobes();
    return {
      group: this.group,
      branchMesh: this.branchMesh,
      blossomMesh: this.blossomMesh,
      lowBlossomMesh: this.lowBlossomMesh,
      halfBlossomMesh: this.halfBlossomMesh,
      budMesh: this.budMesh,
      petals: this.petals,
      branchWindUniforms: this.branchWindUniforms,
      blossomGrowth: this.blossomGrowth,
      branches: this.branches,
      lobes: this.lobes,
    };
  }

  private createCanopyLobes() {
    const raw = [
      [[-5.05, 5.72, 0.35], [2.95, 1.5, 1.95], 0.08, 1.08, 1.12],
      [[-2.32, 6.78, -1.08], [2.62, 1.62, 2.02], 0.04, 0.96, 0.95],
      [[1.28, 7.22, 0.75], [2.78, 1.68, 2.12], 0.1, 1.0, 1.0],
      [[4.72, 5.82, -0.42], [3.05, 1.48, 1.98], 0.07, 1.05, 1.1],
      [[-0.18, 5.35, 2.38], [3.2, 1.24, 1.75], 0.16, 0.9, 0.86],
      [[0.56, 5.95, -2.32], [2.55, 1.3, 1.58], 0.05, 0.78, 0.68],
    ] as const;

    return raw.map(
      (entry, id) =>
        new CanopyLobe({
          id,
          center: new THREE.Vector3(...entry[0]),
          radius: new THREE.Vector3(...entry[1]),
          colorBias: entry[2],
          density: entry[3],
          weight: entry[4],
        }),
    );
  }

  private generateLobeTargets() {
    for (const lobe of this.lobes) {
      const minDist = 0.46;
      let attempts = 0;
      while (lobe.targets.length < 180 && attempts < 3600) {
        attempts += 1;
        const local = randomPointInUnitSphere(this.rng, new THREE.Vector3());
        const outerBias = THREE.MathUtils.lerp(Math.cbrt(this.rng()), 1, 0.58);
        local.multiplyScalar(outerBias);
        const world = new THREE.Vector3(
          lobe.center.x + local.x * lobe.radius.x,
          lobe.center.y + local.y * lobe.radius.y,
          lobe.center.z + local.z * lobe.radius.z,
        );
        if (world.length() < 2.1) continue;
        let ok = true;
        for (const target of lobe.targets) {
          if (target.distanceTo(world) < minDist) {
            ok = false;
            break;
          }
        }
        if (ok) lobe.targets.push(world);
      }
    }
  }

  private createBranch({
    parent,
    depth,
    attachT,
    curve,
    baseRadius,
    tipRadius,
    lobeId,
    terminal = false,
  }: {
    parent: Branch | null;
    depth: number;
    attachT: number;
    curve: THREE.CatmullRomCurve3;
    baseRadius: number;
    tipRadius: number;
    lobeId: number;
    terminal?: boolean;
  }) {
    const branch = new Branch({
      id: this.nextBranchId++,
      parent,
      depth,
      attachT,
      curve,
      baseRadius,
      tipRadius,
      lobeId,
      terminal,
    });
    if (parent) parent.children.push(branch);
    this.branches.push(branch);
    this.registerCurve(branch);
    return branch;
  }

  private createTrunk() {
    const pts = [
      new THREE.Vector3(0.0, 0.0, 0.0),
      new THREE.Vector3(0.22, 0.95, -0.16),
      new THREE.Vector3(-0.28, 2.15, 0.22),
      new THREE.Vector3(0.34, 3.35, -0.1),
      new THREE.Vector3(-0.08, 4.38, 0.18),
      new THREE.Vector3(0.08, this.params.trunkHeight, 0.04),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.42);
    return this.createBranch({
      parent: null,
      depth: 0,
      attachT: 0,
      curve,
      baseRadius: this.params.trunkRadius,
      tipRadius: this.params.trunkRadius * 0.52,
      lobeId: -1,
    });
  }

  private createPrimaryBranches(trunk: Branch) {
    const branches: Branch[] = [];
    const attachTs = [0.58, 0.6, 0.62, 0.64, 0.66, 0.68];
    const primaryLobes = [0, 1, 2, 3, 4, 5];
    const lobeAngleOffsets = [-0.42, -0.22, 0.38, 0.46, 0.68, -0.62];
    const usedDirs: THREE.Vector3[] = [];

    for (let i = 0; i < this.params.primaryBranchCount; i += 1) {
      const lobe = this.lobes[primaryLobes[i]];
      const baseTheta = Math.atan2(lobe.center.z, lobe.center.x);
      const isUpperLobe = lobe.center.y > 6.1;
      let created = false;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        const attachT = THREE.MathUtils.clamp(
          attachTs[i] + this.rand(-0.012, 0.012),
          0.54,
          0.72,
        );
        const start = trunk.getPoint(attachT);
        const trunkTangent = trunk.getTangent(attachT);
        const theta =
          baseTheta +
          lobeAngleOffsets[i] * (attempt < 12 ? 1 : 0.55) +
          this.rand(-0.14, 0.14);
        const outward = vectorFromAngles(theta);
        const targetDir = lobe.center.clone().sub(start).normalize();
        const side = new THREE.Vector3(-outward.z, 0, outward.x).multiplyScalar(
          this.rand(-0.38, 0.38),
        );
        const primaryLift = this.rand(
          isUpperLobe ? 0.26 : 0.14,
          isUpperLobe ? 0.58 : 0.42,
        );
        const primaryDroop = this.rand(-0.055, 0.055);

        const dir = new THREE.Vector3()
          .addScaledVector(outward, this.rand(0.36, 0.68))
          .addScaledVector(targetDir, this.rand(0.28, 0.52))
          .addScaledVector(UP, primaryLift)
          .addScaledVector(trunkTangent, 0.34)
          .add(side)
          .addScaledVector(this.randomVector(0.35), 0.045)
          .normalize();

        if (
          usedDirs.some(
            (u) => Math.acos(THREE.MathUtils.clamp(u.dot(dir), -1, 1)) < 0.96,
          )
        )
          continue;

        const length = THREE.MathUtils.clamp(
          start.distanceTo(lobe.center) * this.rand(0.9, 1.12),
          this.params.primaryLength[0],
          this.params.primaryLength[1],
        );
        const curve = this.generateBranchCurve(
          start,
          dir,
          length,
          1,
          primaryDroop,
          trunkTangent,
        );
        if (this.isCurveTooClose(curve, 1, trunk.id, start, 0.36)) continue;

        const radius = this.rand(0.235, 0.365);
        const branch = this.createBranch({
          parent: trunk,
          depth: 1,
          attachT,
          curve,
          baseRadius: radius,
          tipRadius: radius * 0.45,
          lobeId: lobe.id,
        });
        branches.push(branch);
        usedDirs.push(dir.clone());
        created = true;
        break;
      }

      if (created) continue;

      const attachT = THREE.MathUtils.clamp(attachTs[i], 0.54, 0.72);
      const start = trunk.getPoint(attachT);
      const trunkTangent = trunk.getTangent(attachT);
      const length = THREE.MathUtils.clamp(
        start.distanceTo(lobe.center) * 1.02,
        this.params.primaryLength[0],
        this.params.primaryLength[1],
      );
      const centerDir = lobe.center.clone().sub(start).normalize();
      const fallbackOffsets = [
        lobeAngleOffsets[i] * 0.45,
        lobeAngleOffsets[i] * 0.78,
        0,
      ];
      let fallbackDir = centerDir.clone();
      let fallbackCurve: THREE.CatmullRomCurve3 | undefined;

      for (const offset of fallbackOffsets) {
        const outward = vectorFromAngles(baseTheta + offset);
        const dir = new THREE.Vector3()
          .addScaledVector(centerDir, 0.76)
          .addScaledVector(outward, 0.42)
          .addScaledVector(UP, isUpperLobe ? 0.38 : 0.24)
          .addScaledVector(trunkTangent, 0.12)
          .normalize();
        const primaryDroop = this.rand(-0.01, 0.06);
        const curve = this.generateBranchCurve(
          start,
          dir,
          length,
          1,
          primaryDroop,
          trunkTangent,
        );
        fallbackDir = dir;
        fallbackCurve = curve;
        if (!this.isCurveTooClose(curve, 1, trunk.id, start, 0.68, 1.9)) break;
      }

      const radius = this.rand(0.22, 0.325);
      const branch = this.createBranch({
        parent: trunk,
        depth: 1,
        attachT,
        curve:
          fallbackCurve ??
          this.generateBranchCurve(
            start,
            fallbackDir,
            length,
            1,
            this.rand(-0.01, 0.06),
            trunkTangent,
          ),
        baseRadius: radius,
        tipRadius: radius * 0.45,
        lobeId: lobe.id,
      });
      branches.push(branch);
      usedDirs.push(fallbackDir.clone());
    }

    return branches;
  }

  private createChildLayer(parents: Branch[], depth: 2 | 3) {
    const created: Branch[] = [];
    for (const parent of parents) {
      const parentOuter = parent.getPoint(0.75);
      const radialDistance = Math.hypot(parentOuter.x, parentOuter.z);
      let count = depth === 2 ? this.int(5, 8) : this.int(1, 3);
      if (radialDistance < 2.5 && depth === 3) count = Math.max(1, count - 1);
      if (parentOuter.y > 5.8 && depth === 3 && this.rng() < 0.2) count += 1;

      const attachValues = this.attachmentValues(
        count,
        depth === 2 && parent.depth === 1 ? 0.58 : depth === 2 ? 0.34 : 0.43,
        depth === 2 && parent.depth === 1 ? 0.96 : depth === 2 ? 0.88 : 0.94,
      );
      const siblingDirs: THREE.Vector3[] = [];
      const lobe = this.lobes[parent.lobeId];

      for (const baseT of attachValues) {
        let createdBranch: Branch | null = null;
        for (let attempt = 0; attempt < 28; attempt += 1) {
          const attachT = THREE.MathUtils.clamp(
            baseT + this.rand(-0.045, 0.045),
            0.28,
            0.97,
          );
          const start = parent.getPoint(attachT);
          const radial = this.getRadial(start);
          const target = this.sampleLobeTarget(lobe, depth === 2 ? 0.55 : 0.73);
          const targetDir = target.sub(start).normalize();
          const parentTangent = parent.getTangent(attachT);
          const random = this.randomVector(0.52);
          const side = new THREE.Vector3(-radial.z, 0, radial.x).multiplyScalar(
            depth === 2 ? this.rand(-0.36, 0.36) : this.rand(-0.2, 0.2),
          );
          const upperLift =
            depth === 2 && this.lobes[parent.lobeId].center.y > 6.1 ? 0.08 : 0;
          const upward =
            Math.max(0, 0.18 - depth * 0.052) +
            upperLift +
            this.rand(depth === 2 ? -0.03 : -0.08, depth === 2 ? 0.12 : 0.08);
          const droop =
            depth === 2 ? this.rand(-0.02, 0.14) : this.rand(0.02, 0.28);

          const dir = new THREE.Vector3()
            .addScaledVector(parentTangent, depth === 2 ? 0.46 : 0.38)
            .addScaledVector(radial, depth === 2 ? 0.31 : 0.22)
            .addScaledVector(targetDir, depth === 2 ? 0.4 : 0.31)
            .addScaledVector(UP, upward)
            .add(side)
            .addScaledVector(random, 0.075)
            .normalize();

          if (dir.dot(radial) < -0.1) continue;
          const minSiblingAngle = depth === 2 ? 0.48 : 0.36;
          if (
            siblingDirs.some(
              (u) =>
                Math.acos(THREE.MathUtils.clamp(u.dot(dir), -1, 1)) <
                minSiblingAngle,
            )
          )
            continue;

          const lenRange =
            depth === 2
              ? this.params.secondaryLength
              : this.params.tertiaryLength;
          const length =
            this.rand(lenRange[0], lenRange[1]) *
            THREE.MathUtils.lerp(1.08, 0.76, attachT);
          const curve = this.generateBranchCurve(
            start,
            dir,
            length,
            depth,
            droop,
            parentTangent,
          );
          if (
            this.isCurveTooClose(
              curve,
              depth,
              parent.id,
              start,
              depth === 2 ? 0.44 : 0.48,
            )
          )
            continue;

          const radius =
            parent.baseRadius *
            (depth === 2 ? this.rand(0.32, 0.42) : this.rand(0.22, 0.32));
          const branch = this.createBranch({
            parent,
            depth,
            attachT,
            curve,
            baseRadius: radius,
            tipRadius: radius * (depth === 2 ? 0.32 : 0.22),
            lobeId: parent.lobeId,
          });
          siblingDirs.push(dir.clone());
          created.push(branch);
          createdBranch = branch;
          break;
        }
        if (!createdBranch) {
          const fallback = this.tryCreateChildBranch(
            parent,
            depth,
            baseT,
            true,
          );
          if (fallback) {
            siblingDirs.push(fallback.getTangent(0.28));
            created.push(fallback);
          }
        }
      }
    }
    return created;
  }

  private createTerminalTwigs(parents: Branch[]) {
    for (const parent of parents) {
      const count = this.int(
        parent.depth === 2 ? 6 : 7,
        parent.depth === 2 ? 8 : 10,
      );
      const attachValues = this.attachmentValues(count, 0.52, 0.99);
      const siblingDirs: THREE.Vector3[] = [];

      for (let i = 0; i < attachValues.length; i += 1) {
        const baseT = attachValues[i];
        const relaxed = i > attachValues.length * 0.55;
        const twig = this.tryCreateTerminalTwig(
          parent,
          baseT,
          siblingDirs,
          relaxed,
        );
        if (twig) {
          siblingDirs.push(twig.getTangent(0.3));
          this.terminalTwigs.push(twig);
        }
      }
    }
  }

  private ensureTerminalProgression(branches: Branch[]) {
    for (const branch of branches.filter((b) => b.depth === 3)) {
      if (
        !this.hasTerminalDescendant(branch) ||
        !this.hasOuterContinuation(branch, 0.62)
      )
        this.forceTerminalTwig(branch, [0.78, 0.9, 0.97]);
    }

    for (const branch of branches.filter((b) => b.depth === 2)) {
      if (!this.hasTerminalDescendant(branch)) {
        const child = this.forceChildBranch(branch, 3, [0.58, 0.74, 0.9]);
        this.forceTerminalTwig(child ?? branch, [0.76, 0.88, 0.97]);
      }
      if (!this.hasOuterContinuation(branch, 0.72)) {
        const child = this.forceChildBranch(branch, 3, [0.74, 0.86, 0.95]);
        if (child) this.forceTerminalTwig(child, [0.78, 0.9, 0.97]);
      }
    }

    for (const branch of branches.filter((b) => b.depth === 1)) {
      if (!this.hasTerminalDescendant(branch)) {
        const secondary = this.forceChildBranch(branch, 2, [0.62, 0.78, 0.9]);
        const twigParent =
          secondary && this.hasTerminalDescendant(secondary)
            ? null
            : (secondary ?? branch.children.find((child) => child.depth === 2));
        if (twigParent) {
          const tertiary = this.forceChildBranch(
            twigParent,
            3,
            [0.6, 0.78, 0.92],
          );
          this.forceTerminalTwig(tertiary ?? twigParent, [0.78, 0.9, 0.97]);
        }
      }
      if (!this.hasOuterContinuation(branch, 0.72)) {
        const secondary = this.forceChildBranch(branch, 2, [0.8, 0.9, 0.94]);
        if (secondary) {
          const tertiary = this.forceChildBranch(
            secondary,
            3,
            [0.66, 0.82, 0.94],
          );
          this.forceTerminalTwig(tertiary ?? secondary, [0.8, 0.92, 0.98]);
        }
      }
    }
  }

  private hasTerminalDescendant(branch: Branch): boolean {
    if (branch.terminal) return true;
    return branch.children.some((child) => this.hasTerminalDescendant(child));
  }

  private hasOuterContinuation(branch: Branch, minAttachT: number) {
    for (const child of branch.children) {
      const childStart = child.getPoint(0);
      let bestT = 0;
      let bestDistanceSq = Infinity;
      for (let i = 0; i <= 12; i += 1) {
        const t = i / 12;
        const point = branch.getPoint(t);
        const distanceSq = point.distanceToSquared(childStart);
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          bestT = t;
        }
      }
      if (bestT >= minAttachT) return true;
    }
    return false;
  }

  private forceChildBranch(
    parent: Branch,
    depth: 2 | 3,
    attachValues: number[],
  ) {
    for (const attachT of attachValues) {
      const branch = this.tryCreateChildBranch(parent, depth, attachT, true);
      if (branch) return branch;
    }
    return null;
  }

  private tryCreateChildBranch(
    parent: Branch,
    depth: 2 | 3,
    baseT: number,
    relaxed = false,
  ) {
    const lobe = this.lobes[parent.lobeId];
    const attempts = relaxed ? 30 : 22;
    let fallback: {
      curve: THREE.CatmullRomCurve3;
      radius: number;
    } | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const attachT = THREE.MathUtils.clamp(
        baseT + this.rand(-0.045, 0.045),
        0.28,
        0.97,
      );
      const start = parent.getPoint(attachT);
      const radial = this.getRadial(start);
      const target = this.sampleLobeTarget(lobe, depth === 2 ? 0.55 : 0.73);
      const targetDir = target.sub(start).normalize();
      const parentTangent = parent.getTangent(attachT);
      const random = this.randomVector(0.52);
      const side = new THREE.Vector3(-radial.z, 0, radial.x).multiplyScalar(
        depth === 2 ? this.rand(-0.36, 0.36) : this.rand(-0.2, 0.2),
      );
      const upperLift =
        depth === 2 && this.lobes[parent.lobeId].center.y > 6.1 ? 0.08 : 0;
      const upward =
        Math.max(0, 0.18 - depth * 0.052) +
        upperLift +
        this.rand(depth === 2 ? -0.03 : -0.08, depth === 2 ? 0.12 : 0.08);
      const droop =
        depth === 2 ? this.rand(-0.02, 0.14) : this.rand(0.02, 0.28);

      const dir = new THREE.Vector3()
        .addScaledVector(parentTangent, depth === 2 ? 0.46 : 0.38)
        .addScaledVector(radial, depth === 2 ? 0.31 : 0.22)
        .addScaledVector(targetDir, depth === 2 ? 0.4 : 0.31)
        .addScaledVector(UP, upward)
        .add(side)
        .addScaledVector(random, relaxed ? 0.04 : 0.075)
        .normalize();

      if (!relaxed && dir.dot(radial) < -0.1) continue;

      const lenRange =
        depth === 2 ? this.params.secondaryLength : this.params.tertiaryLength;
      const length =
        this.rand(lenRange[0], lenRange[1]) *
        THREE.MathUtils.lerp(1.08, 0.76, attachT);
      const curve = this.generateBranchCurve(
        start,
        dir,
        length,
        depth,
        droop,
        parentTangent,
      );
      const radius =
        parent.baseRadius *
        (depth === 2 ? this.rand(0.32, 0.42) : this.rand(0.22, 0.32));
      fallback = { curve, radius };

      const startT = relaxed
        ? depth === 2
          ? 0.58
          : 0.62
        : depth === 2
          ? 0.44
          : 0.48;
      if (
        !this.isCurveTooClose(
          curve,
          depth,
          parent.id,
          start,
          startT,
          relaxed ? 1.85 : 1.15,
        )
      ) {
        return this.createBranch({
          parent,
          depth,
          attachT,
          curve,
          baseRadius: radius,
          tipRadius: radius * (depth === 2 ? 0.32 : 0.22),
          lobeId: parent.lobeId,
        });
      }
    }

    if (!relaxed || !fallback) return null;
    return this.createBranch({
      parent,
      depth,
      attachT: baseT,
      curve: fallback.curve,
      baseRadius: fallback.radius,
      tipRadius: fallback.radius * (depth === 2 ? 0.32 : 0.22),
      lobeId: parent.lobeId,
    });
  }

  private forceTerminalTwig(parent: Branch, attachValues: number[]) {
    const siblingDirs: THREE.Vector3[] = [];
    for (const attachT of attachValues) {
      const twig = this.tryCreateTerminalTwig(
        parent,
        attachT,
        siblingDirs,
        true,
      );
      if (!twig) continue;
      siblingDirs.push(twig.getTangent(0.3));
      this.terminalTwigs.push(twig);
      return twig;
    }
    return null;
  }

  private tryCreateTerminalTwig(
    parent: Branch,
    baseT: number,
    siblingDirs: THREE.Vector3[],
    relaxed = false,
  ) {
    const lobe = this.lobes[parent.lobeId];
    const attempts = relaxed ? 36 : 28;
    let fallback: {
      curve: THREE.CatmullRomCurve3;
      radius: number;
    } | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const attachT = THREE.MathUtils.clamp(
        baseT + this.rand(-0.035, 0.035),
        0.5,
        1,
      );
      const start = parent.getPoint(attachT);
      const radial = this.getRadial(start);
      const parentTangent = parent.getTangent(attachT);
      const target = this.sampleLobeTarget(lobe, 0.86).sub(start).normalize();
      const side = new THREE.Vector3(-radial.z, 0, radial.x).multiplyScalar(
        this.rand(-0.34, 0.34),
      );
      const upper = start.y > 5.9;

      const dir = new THREE.Vector3()
        .addScaledVector(parentTangent, upper ? 0.4 : 0.34)
        .addScaledVector(radial, upper ? 0.2 : 0.14)
        .addScaledVector(target, 0.18)
        .addScaledVector(
          UP,
          this.rand(upper ? -0.08 : -0.04, upper ? 0.1 : 0.06),
        )
        .add(side)
        .addScaledVector(this.randomVector(0.25), relaxed ? 0.03 : 0.055)
        .normalize();

      if (
        !relaxed &&
        siblingDirs.some(
          (u) => Math.acos(THREE.MathUtils.clamp(u.dot(dir), -1, 1)) < 0.105,
        )
      )
        continue;

      const length =
        this.rand(this.params.twigLength[0], this.params.twigLength[1]) *
        (upper ? 0.78 : 0.95);
      const droop = upper ? this.rand(0.5, 1.0) : this.rand(0.65, 1.25);
      const curve = this.generateBranchCurve(
        start,
        dir,
        length,
        4,
        droop,
        parentTangent,
      );
      const radius = parent.baseRadius * this.rand(0.09, 0.16);
      fallback = { curve, radius };

      if (
        !this.isCurveTooClose(
          curve,
          4,
          parent.id,
          start,
          relaxed ? 0.34 : 0.24,
          relaxed ? 1.45 : 0.95,
        )
      ) {
        return this.createBranch({
          parent,
          depth: 4,
          attachT,
          curve,
          baseRadius: radius,
          tipRadius: radius * 0.1,
          lobeId: parent.lobeId,
          terminal: true,
        });
      }
    }

    if (!relaxed || !fallback) return null;
    return this.createBranch({
      parent,
      depth: 4,
      attachT: baseT,
      curve: fallback.curve,
      baseRadius: fallback.radius,
      tipRadius: fallback.radius * 0.1,
      lobeId: parent.lobeId,
      terminal: true,
    });
  }

  // Second and third twig orders: every depth-4 twig leader sprouts a finer
  // drooping sub-twig (a second one ~35% of the time), and roughly a quarter
  // of those carry one more even finer tip twig. These skip the collision
  // hash - they are tiny and their gnarled overlap is what makes the canopy
  // read as fine strands.
  private createSubTwigs() {
    const leaders = [...this.terminalTwigs];
    const second: Branch[] = [];
    for (const leader of leaders) {
      const count = this.rng() < 0.35 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        second.push(this.createDroopTwig(leader, 5, this.rand(0.22, 0.85)));
      }
    }
    for (const twig of second) {
      if (this.rng() > 0.25) continue;
      this.createDroopTwig(twig, 6, this.rand(0.3, 0.75));
    }
  }

  private createDroopTwig(parent: Branch, depth: 5 | 6, attachT: number) {
    const start = parent.getPoint(attachT);
    const parentTangent = parent.getTangent(attachT);
    const helper =
      Math.abs(parentTangent.y) > 0.88
        ? new THREE.Vector3(1, 0, 0)
        : UP.clone();
    const side = new THREE.Vector3()
      .crossVectors(helper, parentTangent)
      .normalize()
      .multiplyScalar(this.rng() < 0.5 ? -1 : 1);
    const dir = parentTangent
      .clone()
      .multiplyScalar(0.55)
      .addScaledVector(side, this.rand(0.3, 0.62))
      .addScaledVector(UP, this.rand(-0.06, 0.14))
      .addScaledVector(this.randomVector(0.4), 0.09)
      .normalize();
    const length = depth === 5 ? this.rand(0.44, 0.95) : this.rand(0.23, 0.55);
    const droop = depth === 5 ? this.rand(0.7, 1.2) : this.rand(0.9, 1.5);
    const curve = this.generateBranchCurve(
      start,
      dir,
      length,
      depth,
      droop,
      parentTangent,
    );
    const radius = Math.max(0.0042, parent.baseRadius * this.rand(0.42, 0.58));
    return this.createBranch({
      parent,
      depth,
      attachT,
      curve,
      baseRadius: radius,
      tipRadius: radius * 0.12,
      lobeId: parent.lobeId,
      terminal: true,
    });
  }

  private attachmentValues(count: number, minT: number, maxT: number) {
    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const base = THREE.MathUtils.lerp(minT, maxT, (i + 1) / (count + 1));
      values.push(
        THREE.MathUtils.clamp(base + this.rand(-0.06, 0.06), minT, maxT),
      );
    }
    return values.sort((a, b) => a - b);
  }

  private sampleLobeTarget(lobe: CanopyLobe, outerBias: number) {
    if (lobe.targets.length > 0 && this.rng() < 0.72) {
      return lobe.targets[Math.floor(this.rng() * lobe.targets.length)].clone();
    }
    const local = randomPointInUnitSphere(this.rng, new THREE.Vector3());
    const bias = THREE.MathUtils.lerp(Math.cbrt(this.rng()), 1, outerBias);
    local.multiplyScalar(bias);
    return new THREE.Vector3(
      lobe.center.x + local.x * lobe.radius.x,
      lobe.center.y + local.y * lobe.radius.y,
      lobe.center.z + local.z * lobe.radius.z,
    );
  }

  private generateBranchCurve(
    start: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    depth: number,
    droop: number,
    parentTangent?: THREE.Vector3,
  ) {
    const points: THREE.Vector3[] = [];
    const segments = depth >= 5 ? 7 : depth === 4 ? 9 : this.params.curveSegments;
    const p = start.clone();
    const targetDir = dir.clone().normalize();
    const forkTangent = parentTangent?.clone().normalize();
    const forkBlend =
      forkTangent && forkTangent.lengthSq() > 1e-6
        ? THREE.MathUtils.clamp(0.52 - depth * 0.075, 0.2, 0.42)
        : 0;
    const d = forkTangent
      ? forkTangent
          .clone()
          .lerp(targetDir, 1 - forkBlend)
          .normalize()
      : targetDir.clone();
    const sideAxis = new THREE.Vector3(-targetDir.z, 0, targetDir.x);
    if (sideAxis.lengthSq() < 1e-6) sideAxis.set(1, 0, 0);
    sideAxis.normalize().multiplyScalar(this.rng() < 0.5 ? -1 : 1);
    const crossAxis = new THREE.Vector3()
      .crossVectors(targetDir, sideAxis)
      .normalize()
      .multiplyScalar(this.rng() < 0.5 ? -1 : 1);
    const bendStrength =
      depth === 1
        ? this.rand(0.2, 0.34)
        : depth === 2
          ? this.rand(0.18, 0.34)
          : depth === 3
            ? this.rand(0.075, 0.15)
            : depth === 4
              ? this.rand(0.05, 0.115)
              : this.rand(0.07, 0.16);
    const verticalBend =
      depth === 2
        ? this.rand(-0.1, 0.15)
        : depth <= 1
          ? this.rand(-0.07, 0.14)
          : this.rand(-0.05, 0.06);
    const phase = this.rand(0, TAU);
    points.push(p.clone());

    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const forkRelease = smoothstep(depth >= 4 ? 0.14 : 0.18, 0.82, t);
      const gravityRamp = smoothstep(depth >= 4 ? 0.16 : 0.24, 1, t);
      const gravity = DOWN.clone().multiplyScalar(
        droop * gravityRamp * gravityRamp,
      );
      const outward = this.getRadial(p).multiplyScalar(
        (depth <= 1 ? 0.045 : 0.02) * (0.45 + forkRelease * 0.55),
      );
      const curveBend = sideAxis
        .clone()
        .multiplyScalar(Math.sin(Math.PI * t) * bendStrength)
        .addScaledVector(
          crossAxis,
          Math.sin(TAU * t + phase) * bendStrength * (depth <= 2 ? 0.62 : 0.44),
        )
        .addScaledVector(UP, Math.sin(Math.PI * t) * verticalBend);
      const noise = new THREE.Vector3(
        this.rand(-0.08, 0.08),
        this.rand(-0.035, 0.045),
        this.rand(-0.08, 0.08),
      ).multiplyScalar(
        (depth <= 1 ? 0.28 : depth >= 4 ? 0.13 : 0.22) *
          (0.35 + forkRelease * 0.65),
      );

      if (forkTangent) {
        d.lerp(targetDir, 0.1 + forkRelease * 0.16);
      }
      d.add(gravity).add(outward).add(curveBend).add(noise);
      // Pseudo-nodes: fine twigs get occasional abrupt direction breaks,
      // like bud scars, so the outer growth reads gnarled instead of smooth.
      if (depth >= 4 && i > 1 && i < segments && this.rng() < 0.24) {
        d.addScaledVector(this.randomVector(0.7), this.rand(0.22, 0.5));
      }
      d.normalize();
      p.addScaledVector(d, length / segments);
      points.push(p.clone());
    }

    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.42);
    // Short fine twigs do not need the default 200 cached arc-length samples;
    // this keeps generation time flat despite the much larger twig count.
    if (depth >= 4) curve.arcLengthDivisions = 48;
    return curve;
  }

  private getMinDistance(depth: number) {
    return this.params.minDistanceByDepth[depth] ?? 0.2;
  }

  private isCurveTooClose(
    curve: THREE.CatmullRomCurve3,
    depth: number,
    parentId: number,
    attachPoint: THREE.Vector3,
    startT = 0.35,
    attachClearanceMultiplier = 1.15,
  ) {
    const minDist = this.getMinDistance(depth);
    for (let i = 0; i <= 8; i += 1) {
      const t = THREE.MathUtils.lerp(startT, 1, i / 8);
      const p = curve.getPointAt(t, new THREE.Vector3());
      const nearby = this.occupied.query(p, minDist * 1.25);
      for (const q of nearby) {
        if (q.branchId === parentId) continue;
        if (
          q.position.distanceTo(attachPoint) <
          minDist * attachClearanceMultiplier
        )
          continue;
        const depthClose =
          Math.abs(q.depth - depth) <= 1 || (depth <= 2 && q.depth <= 2);
        if (depthClose && p.distanceTo(q.position) < minDist) return true;
      }
    }
    return false;
  }

  private registerCurve(branch: Branch) {
    const count =
      branch.depth === 0
        ? 10
        : branch.depth === 1
          ? 11
          : branch.depth === 2
            ? 8
            : 5;
    const startT = branch.depth === 0 ? 0 : 0.18;
    for (let i = 0; i <= count; i += 1) {
      const t = THREE.MathUtils.lerp(startT, 1, i / count);
      this.occupied.insert({
        branchId: branch.id,
        depth: branch.depth,
        position: branch.getPoint(t),
      });
    }
  }

  private solveRadii(branch: Branch) {
    if (branch.children.length === 0) {
      branch.baseRadius = Math.max(
        branch.baseRadius,
        branch.terminal ? 0.009 : 0.016,
      );
      branch.tipRadius = Math.max(branch.tipRadius, branch.baseRadius * 0.1);
      return branch.baseRadius;
    }

    let sum = 0;
    for (const child of branch.children)
      sum += Math.pow(this.solveRadii(child), 2.38);
    const solved = Math.pow(sum, 1 / 2.38) * (branch.depth === 0 ? 0.82 : 0.78);
    branch.baseRadius = Math.max(branch.baseRadius, solved);
    branch.tipRadius = Math.max(
      branch.tipRadius,
      branch.baseRadius * (branch.depth <= 1 ? 0.28 : 0.16),
    );
    if (branch.depth === 0)
      branch.baseRadius = Math.max(branch.baseRadius, this.params.trunkRadius);
    return branch.baseRadius;
  }

  private computeWeights(branch: Branch) {
    let weight =
      branch.baseRadius * branch.baseRadius * (branch.terminal ? 0.15 : 0.7);
    for (const child of branch.children) weight += this.computeWeights(child);
    branch.weight = weight;
    return weight;
  }

  // Must run AFTER solveRadii: amplitudes scale with the final radii so the
  // trunk stays static, thick limbs barely move and fine twig tips move most.
  private computeWindChains(branch: Branch) {
    const parent = branch.parent;
    if (!parent) {
      branch.windLimbPhase = 0;
      branch.windLimbAmpBase = 0;
      // A real cherry trunk barely bends, but it bends: a small local
      // amplitude here is inherited by every limb above, so the canopy
      // leans as one body under a gust instead of only rippling at the
      // twig tips.
      branch.windLimbAmpLocal = 0.026;
      branch.windLimbLagBase = 0;
      branch.windLimbLagLocal = 0;
      branch.windTwigPhase = 0;
      branch.windTwigAmpBase = 0;
      branch.windTwigAmpLocal = 0;
      branch.windTwigLagBase = 0;
      branch.windTwigLagLocal = 0;
      branch.windFlutterBase = 0;
      branch.windFlutterLocal = 0;
    } else {
      const attachT = clamp01(branch.attachT);
      const ramp = getWindRamp(attachT);
      // Freeze the parent chain at the attachment point.
      branch.windLimbAmpBase =
        parent.windLimbAmpBase + parent.windLimbAmpLocal * ramp;
      branch.windLimbLagBase =
        parent.windLimbLagBase + parent.windLimbLagLocal * attachT;
      branch.windTwigAmpBase =
        parent.windTwigAmpBase + parent.windTwigAmpLocal * ramp;
      branch.windTwigLagBase =
        parent.windTwigLagBase + parent.windTwigLagLocal * attachT;
      branch.windFlutterBase =
        parent.windFlutterBase +
        parent.windFlutterLocal * getWindFlutterRamp(attachT);

      // Phases: primaries seed the limb tier from their attachment position
      // (neighbours decorrelated, subtree coherent); depth-4 leaders seed the
      // twig tier the same way and their sub-twigs inherit it.
      if (branch.depth === 1) {
        const start = branch.getPoint(0);
        branch.windLimbPhase =
          start.x * 0.3 + start.z * 0.5 + Math.sin(branch.id * 12.9898) * 0.6;
      } else {
        branch.windLimbPhase = parent.windLimbPhase;
      }
      if (branch.depth === 4) {
        const start = branch.getPoint(0);
        branch.windTwigPhase =
          start.x * 0.55 +
          start.z * 0.85 +
          start.y * 0.25 +
          Math.sin(branch.id * 78.233) * 0.5;
      } else {
        branch.windTwigPhase = parent.windTwigPhase;
      }

      // Own contribution, ramped along this branch in the shaders.
      if (branch.depth >= 1 && branch.depth <= 3) {
        branch.windLimbAmpLocal = getLimbWindAmplitude(branch);
        branch.windLimbLagLocal =
          branch.depth === 1 ? 0.12 : branch.depth === 2 ? 0.2 : 0.28;
        branch.windTwigAmpLocal = 0;
        branch.windTwigLagLocal = 0;
        branch.windFlutterLocal = 0;
      } else {
        branch.windLimbAmpLocal = 0;
        branch.windLimbLagLocal = 0;
        branch.windTwigAmpLocal = getTwigWindAmplitude(branch);
        branch.windTwigLagLocal =
          branch.depth === 4 ? 0.5 : branch.depth === 5 ? 0.7 : 0.85;
        branch.windFlutterLocal = getTwigWindFlutter(branch);
      }
    }

    for (const child of branch.children) this.computeWindChains(child);
  }

  // See UNGROW ORDER: higher flowers get a larger key, so the front (which
  // sweeps from high keys to low) takes the canopy apart top to bottom.
  private biasBlossomUngrowByHeight(groups: BlossomPlacement[][]) {
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const group of groups) {
      for (const placement of group) {
        yMin = Math.min(yMin, placement.position.y);
        yMax = Math.max(yMax, placement.position.y);
      }
    }
    const span = Math.max(1e-6, yMax - yMin);
    for (const group of groups) {
      for (const placement of group) {
        const h = (placement.position.y - yMin) / span;
        placement.growKey += UNGROW_BLOSSOM_HEIGHT_SPREAD * h;
      }
    }
  }

  // See UNGROW ORDER. Path distance uses the curves' cached arc-length
  // tables (the same ones getPointAt samples with), so the key is exactly
  // linear in the t the geometry builder walks.
  private computeGrowthOrder(trunk: Branch) {
    const reachOf = new Map<Branch, [number, number]>();
    const walk = (branch: Branch, base: number) => {
      const length = branch.curve.getLength();
      reachOf.set(branch, [base, base + length]);
      for (const child of branch.children) {
        walk(child, base + length * clamp01(child.attachT));
      }
    };
    walk(trunk, 0);
    let maxReach = 1e-6;
    for (const [, span] of reachOf) maxReach = Math.max(maxReach, span[1]);
    for (const branch of this.branches) {
      const span = reachOf.get(branch);
      if (!span) continue;
      const tier = (UNGROW_DEPTH_WEIGHT * Math.min(branch.depth, 6)) / 6;
      branch.growKey0 = tier + (1 - UNGROW_DEPTH_WEIGHT) * (span[0] / maxReach);
      branch.growKey1 = tier + (1 - UNGROW_DEPTH_WEIGHT) * (span[1] / maxReach);
    }
  }

  private applySagging(branch: Branch) {
    for (const child of branch.children) {
      const length = child.curve.getLength();
      const depthFactor = clamp01(child.depth / 4);
      const branchVariation = 0.72 + Math.sin(child.id * 12.9898) * 0.24;
      const sagAmount =
        child.depth <= 1
          ? 0.012 * length * branchVariation
          : 0.009 *
            child.weight *
            length *
            (0.45 + depthFactor * 0.85) *
            branchVariation;

      if (child.depth > 0) {
        const pts = child.curve.points;
        for (let i = 1; i < pts.length; i += 1) {
          const t = i / (pts.length - 1);
          pts[i].y -= sagAmount * t * t;
        }
      }
      this.applySagging(child);
    }
  }

  private buildBranchMesh() {
    const builder = new BranchGeometryBuilder();
    for (const branch of this.branches) builder.append(branch);
    const geometry = builder.build();
    const textures = createBarkTextures();
    const material = new THREE.MeshStandardMaterial({
      bumpMap: textures.bumpMap ?? undefined,
      // Raised so the fissures actually deflect the warm key / rose rim in
      // this dim scene (0.12 read as smooth plastic).
      bumpScale: 0.3,
      color: 0xcfc9c4,
      map: textures.colorMap ?? undefined,
      metalness: 0,
      // With the baked roughness map the material slider acts as a
      // multiplier, so it goes to 1 and the map carries the variation.
      roughness: textures.roughnessMap ? 1 : 0.82,
      roughnessMap: textures.roughnessMap ?? undefined,
      // Vertex colors carry only the trunk-base void fade (white elsewhere).
      vertexColors: true,
    });
    this.branchWindUniforms = applyBranchWind(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Attached cherry branch structure";
    this.branchMesh = mesh;
    this.group.add(mesh);
  }

  // Sleeve coverage model (matched to the full-bloom Yoshino reference):
  // the canopy reads as a continuous mass, so spur points WALK along every
  // fine branch curve at 0.5-0.8 cluster-diameter spacing — all of depth
  // 4-6, plus the outer ~60% of the depth 2-3 limbs — and every spur
  // scatters its flowers in a small 3D shell AROUND the branch. Adjacent
  // puffs overlap into unbroken pink sleeves; dark wood stays visible only
  // on the trunk and the innermost limb runs. No tip bias, no canopy-lobe
  // scatter — the lobes only steered branch growth.
  private createBlossomPlacements() {
    const flowers: BlossomPlacement[] = [];
    // Low-poly open-flower variant for the smallest/deepest instances.
    const flowersLow: BlossomPlacement[] = [];
    // Half-open variant: shares the flower budget (~16% of it) so the total
    // instance count is unchanged across quality tiers.
    const halves: BlossomPlacement[] = [];
    const buds: BlossomPlacement[] = [];

    type SleeveRun = { branch: Branch; tStart: number; runLength: number };
    const runs: SleeveRun[] = [];
    let totalRunLength = 0;
    for (const branch of this.branches) {
      if (branch.lobeId < 0) continue;
      const tStart =
        branch.depth >= 4 ? 0.02 : branch.depth >= 2 ? 0.4 : -1;
      if (tStart < 0) continue;
      const runLength = branch.curve.getLength() * (1 - tStart);
      if (runLength < 0.06) continue;
      runs.push({ branch, tStart, runLength });
      totalRunLength += runLength;
    }
    if (runs.length === 0) return { flowers, flowersLow, halves, buds };

    const totalOverride = this.options.blossomCount;
    const flowerTarget =
      totalOverride != null
        ? Math.max(1, Math.round(totalOverride * 0.73))
        : this.quality === "low"
          ? 7400
          : this.quality === "medium"
            ? 14200
            : 23500;
    const budTarget =
      totalOverride != null
        ? Math.max(0, totalOverride - flowerTarget)
        : this.quality === "low"
          ? 2600
          : this.quality === "medium"
            ? 5000
            : 8500;
    const totalTarget = flowerTarget + budTarget;

    // Approximate world-space diameter of one spur puff: corolla shell
    // radius (branch surface + pedicel + jitter) times two, plus a corolla
    // width. Spur spacing is expressed in fractions of this.
    const clusterDiameter = 0.4;
    // Spacing self-calibrates against the run length so the walk lands on
    // the tier budget: high tier stays inside the 0.5-0.8 diameter band
    // (sleeves), lower tiers may stretch further apart instead of leaving
    // whole strands bare.
    const spacingClamp: [number, number] =
      this.quality === "low"
        ? [0.6, 1.7]
        : this.quality === "medium"
          ? [0.55, 1.15]
          : [0.5, 0.8];
    const spacing = THREE.MathUtils.clamp(
      (totalRunLength * 6.5) / totalTarget,
      spacingClamp[0] * clusterDiameter,
      spacingClamp[1] * clusterDiameter,
    );
    // Cluster size range derived from the same budget: at the target
    // spacing each spur needs avgClusterGoal flowers on average.
    const avgClusterGoal = THREE.MathUtils.clamp(
      totalTarget / (totalRunLength / spacing),
      3,
      9,
    );
    const clusterLo = Math.max(2, Math.round(avgClusterGoal - 1.6));
    const clusterHi = Math.min(9, Math.round(avgClusterGoal + 1.9));

    const zAxis = new THREE.Vector3(0, 0, 1);
    const outward = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const roll = new THREE.Quaternion();
    const budFraction = budTarget / Math.max(1, totalTarget);

    // Places one spur puff on `branch` at curve parameter t: clusterLo..Hi
    // flowers/buds scattered at random azimuths around the tangent, spur
    // points on the branch surface with small radial jitter, orientations
    // outward-random with a mild droop — a shell around the wood, not a
    // flat fan.
    const placeCluster = (branch: Branch, t: number) => {
      const frame = getBranchFrame(branch, t);
      const wind = getBranchWindVectors(branch, t);
      const lobe = this.lobes[branch.lobeId];
      const clusterSize = this.int(clusterLo, clusterHi);
      const baseAzimuth = this.rand(0, TAU);
      // One size bias for the whole spur. A cluster opens together, so its
      // flowers are closer in size to each other than to the tree average —
      // and CLUSTERED variation is what actually reads at this scale.
      // Per-flower noise alone averages back out to a uniform mass once each
      // corolla is only a few halftone dots wide; clumps of big and small
      // survive. Skewed low (pow > 1) because a canopy carries far more
      // half-grown flowers than showy ones.
      const clusterScaleBias = 0.78 + 0.52 * Math.pow(this.rng(), 1.4);
      // Spurs on thicker, older wood are more developed than the ones out on
      // this year's whips, so size tracks the branch radius it grew from.
      const woodMaturity = THREE.MathUtils.lerp(
        0.88,
        1.12,
        THREE.MathUtils.clamp(
          THREE.MathUtils.inverseLerp(0.008, 0.06, frame.radius),
          0,
          1,
        ),
      );

      for (let k = 0; k < clusterSize; k += 1) {
        const flowersPlaced =
          flowers.length + flowersLow.length + halves.length;
        const wantBud =
          buds.length < budTarget &&
          (flowersPlaced >= flowerTarget || this.rng() < budFraction);
        if (!wantBud && flowersPlaced >= flowerTarget) continue;

        const azimuth =
          baseAzimuth + (k / clusterSize) * TAU + this.rand(-0.7, 0.7);
        outward
          .copy(frame.normal)
          .multiplyScalar(Math.cos(azimuth))
          .addScaledVector(frame.binormal, Math.sin(azimuth));
        // Outward-random puff orientation: mostly radial off the branch,
        // drifted along the tangent, with only a mild downward pull so the
        // sleeve wraps the wood on all sides.
        dir
          .copy(outward)
          .multiplyScalar(this.rand(0.75, 1.15))
          .addScaledVector(DOWN, this.rand(0.05, 0.5))
          .addScaledVector(frame.tangent, this.rand(-0.3, 0.45))
          .addScaledVector(this.randomVector(0.8), 0.22)
          .normalize();

        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          zAxis,
          dir,
        );
        // Random roll around the facing axis.
        roll.setFromAxisAngle(zAxis, this.rand(0, TAU));
        quaternion.multiply(roll);

        // Four independent terms instead of one flat draw. The old
        // rand(0.105, 0.155) spanned barely 1.5x end to end and was uniform
        // inside that, so almost every corolla landed near the middle and the
        // canopy read as one repeated stamp. This spans ~3.3x with the mean
        // held at the old value, so the overall mass of the canopy is
        // unchanged — only its evenness.
        // 0.133, not the 0.125 midpoint of the old range: the skewed cluster
        // draw and the wood-maturity term both pull downward (most spurs sit
        // on thin twigs), which measured a 6% drop in mean size — a visibly
        // thinner canopy. This puts the mean back on the old value so the
        // change reads purely as variation.
        const flowerScale =
          0.133 *
          clusterScaleBias *
          (0.86 + 0.28 * this.rng()) *
          woodMaturity *
          THREE.MathUtils.lerp(0.96, 1.12, clamp01(lobe.density));
        const color = new THREE.Color();
        const placement: BlossomPlacement = {
          // Spur point on the branch surface, jittered radially and slid a
          // touch along the tangent so consecutive spurs blur into a run
          // instead of reading as rings.
          position: frame.point
            .clone()
            .addScaledVector(outward, frame.radius * 0.65 + this.rand(0, 0.07))
            .addScaledVector(frame.tangent, this.rand(-0.09, 0.09)),
          quaternion,
          scale: flowerScale,
          wind1: wind.wind1,
          wind2: wind.wind2,
          revealT: clamp01(t * 0.5 + this.rand(0, 0.4)) * 0.7,
          // Height bias added in buildBlossomMeshes once the canopy's
          // extent is known.
          growKey:
            branchGrowKey(branch, t) +
            UNGROW_BLOSSOM_LEAD +
            this.rand(0, UNGROW_BLOSSOM_JITTER),
          color,
          emissive: 1,
          phase: this.rand(0, TAU),
          flutter: this.rand(0.65, 1.35),
          shade: [0, 1, 0, 1],
        };

        if (wantBud) {
          placement.scale = flowerScale * this.rand(0.52, 0.72);
          placement.emissive = this.rand(0.55, 1.15);
          // Buds sit a step deeper pink than the corolla tint band.
          color
            .set("#e07ab8")
            .lerp(new THREE.Color("#c9559f"), this.rng())
            .offsetHSL(
              this.rand(-0.012, 0.012),
              this.rand(-0.08, 0.08),
              this.rand(-0.06, 0.05),
            );
          buds.push(placement);
        } else {
          // Lavender-pink band with small jitter; biased lobes lean deeper.
          sampleBlossomTint(this.rng, color);
          if (this.rng() < lobe.colorBias * 0.6) {
            color.lerp(BLOSSOM_TINT_ROSE, 0.4);
          }
          if (this.rng() < 0.16) {
            // Half-open flower: a touch smaller and pinker (the furled
            // petals read deeper than a spread corolla).
            placement.scale = flowerScale * this.rand(0.72, 0.88);
            placement.emissive = this.rand(0.75, 1.5);
            color.lerp(BLOSSOM_TINT_ROSE, 0.25);
            halves.push(placement);
          } else {
            placement.emissive = this.rand(0.7, 1.45);
            // The finest drooping strands and the smallest corollas take
            // the cheap geometry; they are the most numerous and the least
            // individually readable inside the mass.
            if (branch.depth >= 5 || flowerScale < 0.118) {
              flowersLow.push(placement);
            } else {
              flowers.push(placement);
            }
          }
        }
      }
    };

    // Shuffle the run order so, if the budget caps out slightly before the
    // walk finishes, the unfilled remainder scatters across the canopy
    // instead of truncating one side of the tree.
    const shuffledRuns = [...runs];
    for (let i = shuffledRuns.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffledRuns[i], shuffledRuns[j]] = [shuffledRuns[j], shuffledRuns[i]];
    }

    const budgetDone = () =>
      flowers.length + flowersLow.length + halves.length >= flowerTarget &&
      buds.length >= budTarget;

    for (const run of shuffledRuns) {
      if (budgetDone()) break;
      const branchLength = run.branch.curve.getLength();
      // Continuous overlapping walk from the run start to the branch tip,
      // spacing jittered +-20% so the sleeve stays organic.
      let distance =
        branchLength * run.tStart + this.rand(0, spacing * 0.6);
      while (distance < branchLength - 0.02) {
        placeCluster(run.branch, distance / branchLength);
        if (budgetDone()) break;
        distance += spacing * this.rand(0.8, 1.2);
      }
    }

    return { flowers, flowersLow, halves, buds };
  }

  // Four InstancedMeshes (open flowers full + low-detail, half-open
  // flowers, closed buds) sharing one material. Per-instance wind: each
  // blossom bakes the branch wind vec4 pair evaluated at its spur t (see
  // getBranchWindVectors), so the shader reproduces the exact displacement
  // of the branch point it grows from.
  private buildBlossomMeshes() {
    const { flowers, flowersLow, halves, buds } =
      this.createBlossomPlacements();
    this.bakeCanopyOcclusion([flowers, flowersLow, halves, buds]);
    this.biasBlossomUngrowByHeight([flowers, flowersLow, halves, buds]);
    this.petalDetailTexture = createPetalDetailTexture();
    // Raised emissive lift for the dark void scene: clusters luminesce
    // slightly against the black background instead of relying on skylight.
    // emissiveIntensity is the base; the blossomEmissive instance attribute
    // scales it 0.55-1.5x per flower. Emissive sits on the same cool
    // lavender-pink as the tint band so the glow does not warm the mass.
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffa3d6,
      emissiveIntensity: 0.32,
      map: this.petalDetailTexture ?? undefined,
      metalness: 0,
      roughness: 0.55,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    if (this.branchWindUniforms) {
      applyBlossomWind(
        material,
        this.branchWindUniforms,
        this.blossomGrowth,
        this.canopyShade,
      );
    }

    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    const buildInstancedMesh = (
      geometry: THREE.BufferGeometry,
      placements: BlossomPlacement[],
      name: string,
    ) => {
      const count = placements.length;
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.name = name;
      mesh.frustumCulled = false;
      const windParams1 = new Float32Array(count * 4);
      const windParams2 = new Float32Array(count * 4);
      const phase = new Float32Array(count);
      const flutter = new Float32Array(count);
      const grow = new Float32Array(count * 2);
      const emissive = new Float32Array(count);
      const shade = new Float32Array(count * 4);

      for (let i = 0; i < count; i += 1) {
        const placement = placements[i];
        scale.setScalar(placement.scale);
        matrix.compose(placement.position, placement.quaternion, scale);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, placement.color);
        windParams1.set(placement.wind1, i * 4);
        windParams2.set(placement.wind2, i * 4);
        phase[i] = placement.phase;
        flutter[i] = placement.flutter;
        grow[i * 2] = placement.revealT;
        grow[i * 2 + 1] = placement.growKey;
        emissive[i] = placement.emissive;
        shade.set(placement.shade, i * 4);
      }

      geometry.setAttribute(
        "blossomWindParams1",
        new THREE.InstancedBufferAttribute(windParams1, 4),
      );
      geometry.setAttribute(
        "blossomWindParams2",
        new THREE.InstancedBufferAttribute(windParams2, 4),
      );
      geometry.setAttribute(
        "blossomPhase",
        new THREE.InstancedBufferAttribute(phase, 1),
      );
      geometry.setAttribute(
        "blossomFlutter",
        new THREE.InstancedBufferAttribute(flutter, 1),
      );
      geometry.setAttribute(
        "blossomGrow",
        new THREE.InstancedBufferAttribute(grow, 2),
      );
      geometry.setAttribute(
        "blossomEmissive",
        new THREE.InstancedBufferAttribute(emissive, 1),
      );
      geometry.setAttribute(
        "blossomShade",
        new THREE.InstancedBufferAttribute(shade, 4),
      );
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      return mesh;
    };

    this.blossomMesh = buildInstancedMesh(
      createSakuraBlossomGeometry(),
      flowers,
      "Attached cherry blossom corollas",
    );
    this.lowBlossomMesh = buildInstancedMesh(
      createSakuraBlossomGeometry(1, true),
      flowersLow,
      "Attached cherry blossom corollas (low detail)",
    );
    this.halfBlossomMesh = buildInstancedMesh(
      createSakuraBlossomGeometry(0.45),
      halves,
      "Attached cherry blossom half-open corollas",
    );
    this.budMesh = buildInstancedMesh(
      createSakuraBudGeometry(),
      buds,
      "Attached cherry blossom buds",
    );
  }

  // Two passes over every blossom: one to measure optical depth so the
  // extinction can be solved against the whole population, one to turn that
  // into a bent normal and an openness. Also darkens the bark buried inside
  // the canopy, which otherwise reads as brightly lit wood behind a dense
  // sleeve of flowers.
  private bakeCanopyOcclusion(groups: BlossomPlacement[][]) {
    const all: BlossomPlacement[] = [];
    for (const group of groups) for (const p of group) all.push(p);
    if (all.length === 0) return;
    const occlusion = new CanopyOcclusion(all);
    const depths = new Float32Array(all.length);
    for (let i = 0; i < all.length; i += 1) {
      depths[i] = occlusion.meanDepth(all[i].position);
    }
    occlusion.solveExtinction(depths);
    // Key direction in group-local space: world direction un-scaled by the
    // group's baked non-uniform scale (rotation ~3deg, ignored).
    const keyDir = KEY_LIGHT_POSITION.clone().normalize();
    const groupScale = this.group.scale;
    const kx = keyDir.x / groupScale.x;
    const ky = keyDir.y / groupScale.y;
    const kz = keyDir.z / groupScale.z;
    const klen = Math.hypot(kx, ky, kz) || 1;
    for (const placement of all) {
      occlusion.sample(placement.position, placement.shade);
      const keySh = occlusion.keyShadow(
        placement.position,
        kx / klen,
        ky / klen,
        kz / klen,
      );
      // Packed as the bent normal's MAGNITUDE (0.15..1.0), so no fifth
      // attribute channel is needed; the shader recovers both.
      const m = 0.15 + 0.85 * keySh;
      placement.shade[0] *= m;
      placement.shade[1] *= m;
      placement.shade[2] *= m;
    }

    const geometry = this.branchMesh?.geometry;
    const colors = geometry?.getAttribute("color");
    const positions = geometry?.getAttribute("position");
    if (!colors || !positions) return;
    const point = new THREE.Vector3();
    const shade: [number, number, number, number] = [0, 1, 0, 1];
    for (let i = 0; i < colors.count; i += 1) {
      point.fromBufferAttribute(positions, i);
      occlusion.sample(point, shade);
      // Gentler than the blossoms take: bark is already near-black in this
      // scene and crushing it further just loses the branch structure. The
      // key-shadow term adds the sun side / shade side split.
      const keySh = occlusion.keyShadow(point, kx / klen, ky / klen, kz / klen);
      const f = (0.55 + 0.45 * shade[3]) * (0.78 + 0.22 * keySh);
      colors.setXYZ(
        i,
        colors.getX(i) * f,
        colors.getY(i) * f,
        colors.getZ(i) * f,
      );
    }
    colors.needsUpdate = true;
  }

  private buildPetals() {
    const count =
      this.options.petalCount ??
      (this.quality === "low" ? 100 : this.quality === "medium" ? 180 : 280);
    if (count <= 0) return;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffddef,
      // Small emissive lift so loose petals stay readable while tumbling
      // through the unlit void below the canopy. Same lavender-pink band
      // as the attached blossoms.
      emissive: 0xf09ed0,
      emissiveIntensity: 0.22,
      // Same procedural vein/blush texture as the attached blossoms (the
      // loose-petal geometry shares the petal UV layout).
      map: this.petalDetailTexture ?? undefined,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      roughness: 0.65,
      vertexColors: true,
    });
    // A loose petal spends its whole descent between the camera and the
    // lights, so it is backlit far more often than the canopy is.
    applyPetalTranslucency(material, this.canopyShade);
    // Detachment anchors sampled from the real blossom instances (group-local
    // positions), so loose petals materialize at actual cluster points and
    // automatically track any change in blossom density. Lobes remain the
    // fallback when no blossoms were built.
    const anchors: THREE.Vector3[] = [];
    // Sample across both open-flower meshes so detachment points cover the
    // whole sleeve, including the low-detail deep strands.
    const sources = [this.blossomMesh, this.lowBlossomMesh].filter(
      (mesh): mesh is THREE.InstancedMesh => mesh != null && mesh.count > 0,
    );
    const totalBlossoms = sources.reduce((sum, mesh) => sum + mesh.count, 0);
    if (totalBlossoms > 0) {
      const anchorMatrix = new THREE.Matrix4();
      const sampleCount = Math.min(totalBlossoms, count * 2);
      for (let i = 0; i < sampleCount; i += 1) {
        let index = Math.floor(this.rng() * totalBlossoms);
        let mesh = sources[0];
        for (const source of sources) {
          if (index < source.count) {
            mesh = source;
            break;
          }
          index -= source.count;
        }
        mesh.getMatrixAt(index, anchorMatrix);
        anchors.push(new THREE.Vector3().setFromMatrixPosition(anchorMatrix));
      }
    }
    this.petals = new FallingPetalSystem({
      count,
      lobes: this.lobes,
      anchors,
      material,
      rng: this.rng,
    });
    for (const mesh of this.petals.meshes) this.group.add(mesh);
  }

  private addDebugLobes() {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff8cc6,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    for (const lobe of this.lobes) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        material,
      );
      mesh.position.copy(lobe.center);
      mesh.scale.copy(lobe.radius);
      this.group.add(mesh);
    }
  }
}

function disposeMaterialTextures(
  material: THREE.Material,
  disposedTextures: Set<THREE.Texture>,
) {
  const texturedMaterial = material as THREE.Material & {
    alphaMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    bumpMap?: THREE.Texture | null;
    displacementMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    envMap?: THREE.Texture | null;
    lightMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
  };
  const textures = [
    texturedMaterial.map,
    texturedMaterial.alphaMap,
    texturedMaterial.bumpMap,
    texturedMaterial.roughnessMap,
    texturedMaterial.metalnessMap,
    texturedMaterial.normalMap,
    texturedMaterial.displacementMap,
    texturedMaterial.emissiveMap,
    texturedMaterial.aoMap,
    texturedMaterial.lightMap,
    texturedMaterial.envMap,
  ];
  for (const texture of textures) {
    if (!texture || disposedTextures.has(texture)) continue;
    texture.dispose();
    disposedTextures.add(texture);
  }
}

export default function WeepingCherryTreeCanvas({
  introActive = false,
  onIntroComplete,
  onReady,
  onProgress,
  screenLayerRef,
}: BareThreeCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const screenLayerRefStable = useRef(screenLayerRef);
  screenLayerRefStable.current = screenLayerRef;
  const introActiveRef = useRef(introActive);
  const onIntroCompleteRef = useRef(onIntroComplete);
  const onReadyRef = useRef(onReady);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    introActiveRef.current = introActive;
  }, [introActive]);

  useEffect(() => {
    onIntroCompleteRef.current = onIntroComplete;
  }, [onIntroComplete]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let sceneBuildLoaded = 0;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    const waitForNextFrame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    const reportSceneBuildProgress = async () => {
      sceneBuildLoaded = Math.min(
        SCENE_BUILD_MILESTONE_TOTAL,
        sceneBuildLoaded + 1,
      );
      if (disposed) return;
      onProgressRef.current?.({
        loaded: sceneBuildLoaded,
        total: SCENE_BUILD_MILESTONE_TOTAL,
      });
      if (disposed) return;
      await waitForNextFrame();
    };
    const initializeScene = async () => {
      // Near-black void: the tree floats in darkness, lit like a stage
      // subject. The overlay uses mix-blend-difference, so the dark scene
      // flips the text light automatically.
      const voidColor = new THREE.Color(0x0a0a0a);
      const scene = new THREE.Scene();
      scene.background = null;
      // Fog starts behind the trunk (camera-to-trunk is ~15.7 world units)
      // so the front canopy keeps its color while the outer branch tips
      // melt into the darkness.
      scene.fog = new THREE.Fog(voidColor.getHex(), 20, 45);

      const initialViewport = getViewportMetrics();
      const width = mount.clientWidth || initialViewport.width;
      const height = mount.clientHeight || initialViewport.height;
      const sceneQuality = resolveSceneQuality("auto");
      const getRenderPixelRatio = () => {
        const dpr = window.devicePixelRatio || 1;
        return Math.min(dpr, 1);
      };

      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const worldGroup = new THREE.Group();
      worldGroup.name = "Arbor scene world";
      scene.add(worldGroup);
      const camera = new THREE.PerspectiveCamera(
        HERO_CAMERA_FOV,
        width / height,
        0.1,
        80,
      );
      camera.position.copy(
        prefersReducedMotion ? FINAL_CAMERA_POSITION : INTRO_CAMERA_POSITION,
      );

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setClearColor(voidColor, 1);
      renderer.setSize(width, height);
      renderer.setPixelRatio(getRenderPixelRatio());
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      // No ground, nothing catches shadows: shadow maps stay off.
      renderer.shadowMap.enabled = false;
      mount.appendChild(renderer.domElement);

      // ---- Halftone post-pass -------------------------------------------
      // The scene renders into an offscreen target each frame, then a
      // fullscreen triangle redraws that frame as a Bayer-dithered dot grid
      // (HALFTONE_* consts above). Three skips renderer.toneMapping and
      // output encoding for render-target renders, so the target holds the
      // LINEAR frame and the pass shader applies ACES + sRGB itself. Plain
      // non-MSAA target: multisample resolve is unreliable on software GL,
      // and the dot grid hides aliasing anyway.
      const drawingBufferSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(drawingBufferSize);
      // HalfFloat is required, not a quality nicety. This target holds the
      // LINEAR frame, and the halftone pass ACES-tone-maps and sRGB-encodes it
      // afterwards. At the 8-bit default a linear code of n/255 in the dark
      // end gets stretched by the sRGB curve (slope 12.92 near zero) into a
      // display step of 5-6/255, so the backdrop arrived at the halftone
      // already broken into 100px+ flat plateaus with visible edges between
      // them. Storing linear light in 8 bits spends almost all the codes on
      // highlights nobody can see and starves the shadows, which is where this
      // whole scene lives. No amount of dithering downstream recovers it —
      // the information is gone before the halftone reads the texture.
      const sceneTarget = new THREE.WebGLRenderTarget(
        drawingBufferSize.x,
        drawingBufferSize.y,
        { type: THREE.HalfFloatType },
      );
      const halftoneCellCssPx =
        sceneQuality === "low" ? HALFTONE_CELL_CSS_PX + 1 : HALFTONE_CELL_CSS_PX;
      const halftoneUniforms = {
        uScene: { value: sceneTarget.texture },
        uResolution: {
          value: new THREE.Vector2(drawingBufferSize.x, drawingBufferSize.y),
        },
        uCellSize: { value: halftoneCellCssPx * getRenderPixelRatio() },
        uStrength: { value: HALFTONE_STRENGTH },
        uExposure: { value: renderer.toneMappingExposure },
        uSceneRemap: { value: new THREE.Vector2(1, 1) },
        uSceneOffset: { value: new THREE.Vector2(0, 0) },
        uGridOffset: { value: new THREE.Vector2(0, 0) },
      };
      const halftoneMaterial = new THREE.RawShaderMaterial({
        uniforms: halftoneUniforms,
        vertexShader: HALFTONE_VERTEX_SHADER,
        fragmentShader: HALFTONE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const halftoneGeometry = new THREE.BufferGeometry();
      halftoneGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
          3,
        ),
      );
      const halftoneMesh = new THREE.Mesh(halftoneGeometry, halftoneMaterial);
      halftoneMesh.frustumCulled = false;
      const halftoneScene = new THREE.Scene();
      halftoneScene.add(halftoneMesh);
      const halftoneCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      // ---- CRT stage ----------------------------------------------------
      // The reference scene: a beige Macintosh-style all-in-one on a
      // gradient, three-quarter view, seen slightly from above. The monitor
      // is a real GLB in a second scene; the halftoned site view renders
      // into displayTarget and becomes the live content of a curved screen
      // plane mounted over the model's own (hidden) screen face. Scroll
      // drives a camera that starts ON the screen's normal, zoomed until
      // the site view fills the viewport exactly, then pulls out and swings
      // to the reference angle — the whole website viewport rides the
      // screen, DOM text included (HeroIntro warps the DOM layer onto
      // sceneFx.screenQuad each frame).
      const displayTarget = new THREE.WebGLRenderTarget(
        drawingBufferSize.x,
        drawingBufferSize.y,
      );
      // No mipmaps: regenerating a full chain for this near-viewport-sized
      // target every frame was a real share of the scroll cost, and at the
      // final pose the screen still covers most of the frame, so linear
      // minification holds up without them.
      displayTarget.texture.generateMipmaps = false;
      displayTarget.texture.minFilter = THREE.LinearFilter;

      renderer.setClearColor(0x000000, 0);
      const crtScene = new THREE.Scene();
      // Studio backdrop per the reference: dark blue above, pale blue
      // below. A clip-space triangle with toneMapped:false writes the EXACT
      // sRGB values — scene.background would push them through ACES and
      // shift both stops.
      {
        const bgGeometry = new THREE.BufferGeometry();
        bgGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
            3,
          ),
        );
        const bgMaterial = new THREE.RawShaderMaterial({
          uniforms: { uResolution: halftoneUniforms.uResolution },
          vertexShader: /* glsl */ `
            precision highp float;
            attribute vec3 position;
            void main() { gl_Position = vec4(position.xy, 0.99999, 1.0); }
          `,
          fragmentShader: /* glsl */ `
            precision highp float;
            uniform vec2 uResolution;
            void main() {
              float t = gl_FragCoord.y / uResolution.y; // 0 bottom, 1 top
              vec3 top = vec3(0.06666, 0.08627, 0.2); // #111633
              vec3 bottom = vec3(0.82745, 0.81569, 0.89020); // #d3d0e3
              gl_FragColor = vec4(mix(bottom, top, t), 1.0);
            }
          `,
          depthWrite: false,
          depthTest: false,
        });
        const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
        bgMesh.frustumCulled = false;
        bgMesh.renderOrder = -10;
        crtScene.add(bgMesh);
      }
      // Image-based lighting so the machine's plastic picks up believable
      // speculars instead of flat lambert fills.
      {
        const pmrem = new THREE.PMREMGenerator(renderer);
        crtScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        crtScene.environmentIntensity = 0.55;
        pmrem.dispose();
      }
      // Soft real shadow, shaped by the actual model, falling left like the
      // reference (key light sits upper right). ShadowMaterial keeps the
      // ground invisible except where the shadow lands on the backdrop.
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // The monitor never moves relative to its light: bake the shadow map
      // once (and once more when the GLB lands) instead of re-rendering
      // 2048x2048 of depth every frame — a large share of the scroll jank.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      const crtGround = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.ShadowMaterial({ opacity: 0.28 }),
      );
      crtGround.rotation.x = -Math.PI / 2;
      crtGround.position.y = -1.4; // refined to the model's base on load
      crtGround.receiveShadow = true;
      crtScene.add(crtGround);
      const crtCamera = new THREE.PerspectiveCamera(
        30, // long-ish lens, flat perspective, like the reference photo
        drawingBufferSize.x / drawingBufferSize.y,
        0.01,
        100,
      );

      // Shipped model: "TV , Old TV , Retro TV" by Denys Hroshko (user's
      // Sketchfab pick; see public/models/crt-LICENSE.txt — CC BY-NC). The
      // GLB (converted from the download's FBX) faces +X, so the loader
      // yaws it -90deg to face the camera. Screen rect measured by mapping
      // the glass region of the BaseColor texture through the mesh UVs:
      // 1.415 wide x 1.179 tall (aspect 1.20 — the near-square tube),
      // centred at y=2.483, glass apex at x=0.535 (post-yaw: z).
      const CRT_MODEL = {
        url: "/models/crt.glb",
        // POST-yaw coordinates (model rotated -90deg about Y).
        // +14% over the UV-measured glass rect (aspect preserved): the
        // model's own baked dome is wider than its glass texture region,
        // and at the exact rect our raster floated as a patch inside a grey
        // moat. The oversize spans the full recess; with the base recessed
        // at corner depth the edges tuck BEHIND the bezel lip and are
        // occluded by depth — unlike the old flat-proud plane, this cannot
        // read as a sticker.
        screen: { cx: 0, cy: 2.4829, cz: 0.375, w: 1.62, h: 1.35, pitch: 0 },
        yaw: -Math.PI / 2,
        textures: {
          map: "/models/tv-old-tv-retro-tv/textures/retro%20tv_1_BaseColor.png",
          normalMap: "/models/tv-old-tv-retro-tv/textures/retro%20tv_1_Normal.png",
          metalnessMap:
            "/models/tv-old-tv-retro-tv/textures/retro%20tv_1_Metallic.png",
          roughnessMap:
            "/models/tv-old-tv-retro-tv/textures/retro%20tv_1_Roughness.png",
        },
      };
      // Reference pose: front turned toward the viewer's right, left cheek
      // visible; camera settles slightly above.
      const CRT_YAW = 0.36; // ~20.6 deg
      const CRT_END_ELEV = 0.2; // ~11.5 deg
      // Measured off the reference photo: the set spans ~74% of the frame
      // height, centred. 0.72 with a pure-centre target reproduces that.
      const CRT_END_FILL = 0.72;

      const crtRoot = new THREE.Group();
      crtRoot.rotation.y = CRT_YAW;
      crtScene.add(crtRoot);

      // Live screen: gently curved like a tube face, mounted at the model's
      // screen center, tilted to the measured face pitch. All rig math
      // reads this mesh's matrixWorld, so tilt and yaw come along for free.
      const crtScreenState = {
        aspect: CRT_MODEL.screen.w / CRT_MODEL.screen.h,

        monitorHeight: 2.6, // replaced on load (screen-height units)
        monitorCenterY: -0.45,
      };
      // FLAT plane: the tube curvature is applied in the vertex shader and
      // ANIMATED IN with the pull-back. At the flat/CRT path switch the
      // glass has zero curvature, so the first CRT frame is pixel-identical
      // to the flat render — the old baked 0.15 bulge warped corner content
      // ~11% in a single frame, which was the visible "sudden" pop.
      const buildScreenGeometry = () => {
        const geo = new THREE.PlaneGeometry(crtScreenState.aspect, 1, 48, 36);
        const count = geo.attributes.position.count;
        const heights = new Float32Array(count).fill(0.15);
        const normals = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) normals[i * 3 + 2] = 1;
        geo.setAttribute("aHeight", new THREE.BufferAttribute(heights, 1));
        geo.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
        return geo;
      };

      const crtScreenUniforms = {
        uMap: { value: displayTarget.texture },
        uFx: { value: 0 },
        uTime: { value: 0 },
        uBulgeT: { value: 0 },
        uApexH: { value: 0.15 },
        // Viewport-aspect sub-rect of the screen carrying the site view
        // (contain-fit); outside it is dark glass. Values are half-extent
        // scales relative to the screen rect.
      };
      const crtScreenMaterial = new THREE.ShaderMaterial({
        uniforms: crtScreenUniforms,
        vertexShader: /* glsl */ `
          // aHeight/aNormal: the MODEL'S OWN tube surface, measured by
          // raycasting each plane vertex against the loaded mesh (plus a
          // small proud offset). uBulgeT animates flat-at-apex -> hugging,
          // so the flat/CRT switch is exact and the settled glass follows
          // the real dome instead of a guessed formula.
          uniform float uBulgeT;
          uniform float uApexH;
          attribute float aHeight;
          attribute vec3 aNormal;
          varying vec2 vUv;
          varying vec3 vNormalW;
          varying vec3 vViewW;
          void main() {
            vUv = uv;
            float z = mix(uApexH, aHeight, uBulgeT);
            vec3 displaced = vec3(position.xy, z);
            vec3 nrm = normalize(mix(vec3(0.0, 0.0, 1.0), aNormal, uBulgeT));
            vec4 wp = modelMatrix * vec4(displaced, 1.0);
            vNormalW = normalize(mat3(modelMatrix) * nrm);
            vViewW = cameraPosition - wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uFx;
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vNormalW;
          varying vec3 vViewW;

          void main() {
            // Barrel distortion of the raster itself: the beam sweep bows
            // outward on a real tube, on top of the physical glass curve.
            vec2 cuv = vUv - 0.5;
            float r2 = dot(cuv, cuv);
            vec2 buv = 0.5 + cuv * (1.0 + (0.055 * uFx) * r2);

            // Contain-fit: map the screen uv into the site-view sub-rect.
            // The display texture is rendered AT the glass ratio (the site
            // view extended upward), so it maps 1:1 — no cropping anywhere.
            vec2 ruv = buv;

            // Rounded raster corners at the GLASS edge — radius and edge
            // softness both ride uFx, so at the path switch the raster is
            // square and hard-edged (pixel-identical to the flat page) and
            // the rounding grows in with the rest of the tube.
            // Full rounded-box SDF, interior term included: without the
            // min() term the interior was a constant -cr, which at the
            // hand-off (cr = 0.002) sat INSIDE the soft-edge band and
            // dimmed the entire raster to 60% on the first CRT frame.
            float cr = 0.0005 + 0.0315 * uFx;
            vec2 q = abs(buv - 0.5) - vec2(0.5 - cr);
            float cornerDist =
              length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cr;
            float soft = 0.0005 + 0.006 * uFx;
            float inRegion =
              1.0 - smoothstep(-soft, soft + 0.02 * uFx, cornerDist);

            // Phosphor bleed: slight horizontal smear plus chromatic
            // misconvergence of the triads.
            float fringe = 0.0014 * uFx;
            vec2 blur = vec2(0.0011 * uFx, 0.0);
            vec3 col = vec3(
              texture2D(uMap, ruv + vec2(fringe, 0.0)).r,
              texture2D(uMap, ruv).g,
              texture2D(uMap, ruv - vec2(fringe, 0.0)).b
            );
            col = mix(
              col,
              0.5 * (texture2D(uMap, ruv + blur).rgb +
                     texture2D(uMap, ruv - blur).rgb),
              0.45 * uFx
            );

            // Bloom: bright content halates into its surroundings — a wide
            // 4-tap spread instead of a mip bias (the target carries no
            // mip chain any more).
            vec3 haze = 0.25 * (
              texture2D(uMap, ruv + vec2(0.012, 0.009)).rgb +
              texture2D(uMap, ruv + vec2(-0.012, 0.009)).rgb +
              texture2D(uMap, ruv + vec2(0.012, -0.009)).rgb +
              texture2D(uMap, ruv + vec2(-0.012, -0.009)).rgb
            );
            col += haze * haze * (0.45 * uFx);

            // The mask stack below (grille, scanlines, vignette, rim)
            // removes ~20% of average light as it ramps in; compensate so
            // the tube's apparent brightness stays constant through the
            // pull-back instead of suddenly dimming.
            col *= 1.0 + 0.24 * uFx;

            // Dark glass outside the raster: unpowered phosphor, grey-green.
            vec3 glass = vec3(0.016, 0.02, 0.018);
            col = mix(glass, col, inRegion);

            // Slot mask: RGB triads in device pixels with a half-period row
            // stagger — softer and more tube-like than straight stripes.
            float triad = mod(gl_FragCoord.x +
              3.0 * step(1.0, mod(gl_FragCoord.y / 3.0, 2.0)) * 0.5, 3.0);
            vec3 mask = vec3(
              1.0 - smoothstep(0.6, 1.4, abs(triad - 0.5)),
              1.0 - smoothstep(0.6, 1.4, abs(triad - 1.5)),
              1.0 - smoothstep(0.6, 1.4, abs(triad - 2.5))
            );
            col *= mix(vec3(1.0), mask * 1.6 + 0.55, 0.13 * uFx);

            // Scanlines whose depth ADAPTS to brightness: bright phosphor
            // floods the gap between lines, dark areas keep crisp lines.
            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            float scan = 0.5 + 0.5 * sin(buv.y * 640.0 * 3.14159);
            col *= 1.0 - (0.14 * uFx) * scan * (1.0 - 0.6 * luma);

            // Slow refresh band rolling down the tube.
            float band = fract(buv.y * 0.5 + uTime * 0.045);
            col *= 1.0 + 0.045 * uFx * smoothstep(0.0, 0.12, band) *
              (1.0 - smoothstep(0.12, 0.3, band));

            // Bezel occlusion: a soft shadow ring where the tube meets the
            // frame. Narrow — the plane now spans the whole recess, so most
            // of this band hides behind the bezel anyway.
            float rim = max(abs(buv.x - 0.5), abs(buv.y - 0.5));
            col *= 1.0 - 0.5 * uFx * smoothstep(0.455, 0.5, rim);

            // Electron-beam falloff: hot centre, dim corners.
            col *= 1.0 + 0.07 * uFx * (1.0 - r2 * 4.0);
            col *= 1.0 - 0.22 * uFx * smoothstep(0.2, 0.5, r2);

            // Curved-glass sheen: a view-dependent fresnel rim picking up
            // the room, strongest where the tube curves away from the eye.
            float fres = pow(
              1.0 - clamp(dot(normalize(vNormalW), normalize(vViewW)), 0.0, 1.0),
              3.0
            );
            col += vec3(0.85, 0.88, 1.0) * fres * (0.22 * uFx);

            gl_FragColor = vec4(col, 1.0);
          }
        `,
        toneMapped: false,
      });
      const crtScreenMesh = new THREE.Mesh(
        buildScreenGeometry(),
        crtScreenMaterial,
      );
      crtScreenMesh.rotation.x = -CRT_MODEL.screen.pitch;
      crtRoot.add(crtScreenMesh);

      // Placeholder body so the rig is testable before the model loads; the
      // GLB replaces it. Deliberately crude — it should never ship.
      const crtPlaceholder = new THREE.Group();
      {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(crtScreenState.aspect * 1.5, 2.6, 1.6),
          new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.6 }),
        );
        body.position.set(0, -0.5, -0.82);
        crtPlaceholder.add(body);
      }
      crtRoot.add(crtPlaceholder);

      // Studio lighting per the reference: bright soft key from the upper
      // right, cool fill, warm dome; plus a pink glow in front of the
      // screen so the display visibly lights its own bezel.
      // Product-photo setup for a DARK body: low neutral ambient so form
      // shading survives, a strong warm key, a crisp cool rim from behind
      // to cut the silhouette out of the light backdrop, minimal fill.
      const crtHemi = new THREE.HemisphereLight(0xffffff, 0x22242c, 0.55);
      crtScene.add(crtHemi);
      const crtKey = new THREE.DirectionalLight(0xfff1de, 2.8);
      crtKey.position.set(2.6, 3.2, 2.4);
      crtKey.castShadow = true;
      crtKey.shadow.mapSize.set(2048, 2048);
      crtKey.shadow.camera.near = 0.1;
      crtKey.shadow.camera.far = 20;
      crtKey.shadow.camera.left = -4;
      crtKey.shadow.camera.right = 4;
      crtKey.shadow.camera.top = 4;
      crtKey.shadow.camera.bottom = -4;
      crtKey.shadow.bias = -0.0005;
      crtScene.add(crtKey);
      const crtFill = new THREE.DirectionalLight(0xbfc4ff, 0.25);
      crtFill.position.set(-2.4, 0.8, 1.6);
      crtScene.add(crtFill);
      const crtRim = new THREE.DirectionalLight(0xeef4ff, 1.5);
      crtRim.position.set(-1.6, 3.4, -2.6);
      crtScene.add(crtRim);
      // Screen spill only — at higher intensities this pink point light
      // repainted the whole beige machine rose.
      const crtGlow = new THREE.PointLight(0xff7fae, 0, 4, 2);
      crtGlow.position.set(0, 0, 1.1);
      crtScene.add(crtGlow);

      // Camera rig, all in screen-height units. p=0: on the screen's own
      // (tilted, yawed) normal, close enough that the contain-fit region
      // fills the viewport exactly — pixel-continuous with the flat hero
      // path. p=1: pulled back to the reference viewpoint. crtFrame then
      // raises the target so the machine settles below centre for the text.
      const CRT_FOV_TAN = Math.tan((30 * Math.PI) / 180 / 2);
      // Upward extension: the display texture is the site view EXTENDED
      // past the viewport until it matches the glass ratio — full width
      // kept, extra scene revealed above (landscape). Portrait extends
      // width symmetrically instead. crtExt tracks the viewport band's
      // fraction of the extended image; the flat hero path samples just
      // that band, staying pixel-identical to a plain render.
      const crtExt = { bandW: 1, bandH: 1, extW: 1, extH: 1 };
      const updateCrtRegion = () => {
        const va = drawingBufferSize.x / Math.max(1, drawingBufferSize.y);
        const sa = crtScreenState.aspect;
        if (va >= sa) {
          crtExt.bandW = 1;
          crtExt.bandH = sa / va;
        } else {
          crtExt.bandW = va / sa;
          crtExt.bandH = 1;
        }
        halftoneUniforms.uSceneRemap.value.set(crtExt.bandW, crtExt.bandH);
        // Landscape extends UP only (band bottom-anchored: v offset 0);
        // portrait extends the width symmetrically (band centred).
        halftoneUniforms.uSceneOffset.value.set((1 - crtExt.bandW) / 2, 0);
        // Extended render dimensions in device px, and the off-axis view:
        // the scene camera renders the normal viewport PLUS the extra space
        // above (or beside), so the extra content is real scene, not a
        // stretch. setViewOffset's y origin is the TOP of the full view, so
        // a negative y with an oversized height reaches above the frame.
        const extW = Math.round(drawingBufferSize.x / crtExt.bandW);
        const extH = Math.round(drawingBufferSize.y / crtExt.bandH);
        sceneTarget.setSize(extW, extH);
        displayTarget.setSize(extW, extH);
        camera.setViewOffset(
          drawingBufferSize.x,
          drawingBufferSize.y,
          -(extW - drawingBufferSize.x) / 2,
          -(extH - drawingBufferSize.y),
          extW,
          extH,
        );
        crtExt.extW = extW;
        crtExt.extH = extH;
      };
      updateCrtRegion();

      const crtV = new THREE.Vector3();
      const crtTarget = new THREE.Vector3();
      const crtCorner = new THREE.Vector3();
      const CRT_QUAD_LOCAL: [number, number][] = [
        [-0.5, 0.5], // TL (uv 0,1)
        [0.5, 0.5], // TR
        [0.5, -0.5], // BR
        [-0.5, -0.5], // BL
      ];
      // Height of the glass surface at a plane-local (x, y), bilinear over
      // the baked aHeight grid, blended flat-at-apex -> dome exactly as the
      // vertex shader does. The DOM homography corners MUST sit on this
      // surface: projecting them at the plane base while the glass sat at
      // uApexH put the text ~7% smaller than the flat page on the very
      // first CRT frame.
      const surfaceHeightAt = (x: number, y: number) => {
        const geo = crtScreenMesh.geometry as THREE.PlaneGeometry;
        const hAttr = geo.attributes.aHeight as THREE.BufferAttribute;
        const cols = geo.parameters.widthSegments + 1;
        const rows = geo.parameters.heightSegments + 1;
        const aspect = geo.parameters.width;
        // PlaneGeometry rows run top (y=+h/2) to bottom, columns left to right.
        const fc = THREE.MathUtils.clamp(
          ((x + aspect / 2) / aspect) * (cols - 1),
          0,
          cols - 1,
        );
        const fr = THREE.MathUtils.clamp((0.5 - y) * (rows - 1), 0, rows - 1);
        const c0 = Math.floor(fc);
        const r0 = Math.floor(fr);
        const c1 = Math.min(cols - 1, c0 + 1);
        const r1 = Math.min(rows - 1, r0 + 1);
        const tx = fc - c0;
        const ty = fr - r0;
        const top =
          hAttr.getX(r0 * cols + c0) * (1 - tx) + hAttr.getX(r0 * cols + c1) * tx;
        const bottom =
          hAttr.getX(r1 * cols + c0) * (1 - tx) + hAttr.getX(r1 * cols + c1) * tx;
        const dome = top * (1 - ty) + bottom * ty;
        return THREE.MathUtils.lerp(
          crtScreenUniforms.uApexH.value,
          dome,
          crtScreenUniforms.uBulgeT.value,
        );
      };
      let lastDomTransform = "";
      const applyDomTransform = (value: string) => {
        const layer = screenLayerRefStable.current?.current;
        if (!layer || value === lastDomTransform) return;
        lastDomTransform = value;
        layer.style.transform = value;
      };
      const updateCrtRig = (elapsed: number) => {
        const p = clamp01(sceneFx.crtProgress);
        crtCamera.aspect = drawingBufferSize.x / Math.max(1, drawingBufferSize.y);

        crtScreenMesh.updateMatrixWorld(true);
        const m = crtScreenMesh.matrixWorld;
        // Screen frame from the plane itself: tilt and yaw included.
        const nAxis = crtV.set(m.elements[8], m.elements[9], m.elements[10]);
        const normalPitch = Math.asin(
          THREE.MathUtils.clamp(nAxis.y / nAxis.length(), -1, 1),
        );

        // Blend the view ray from the screen normal (p=0, site view flat)
        // to the reference viewpoint (p=1). Yaw decays to 0 in WORLD space,
        // which reads as the camera swinging round while the machine holds
        // its reference pose.
        const psi = CRT_YAW * (1 - p);
        const phi = normalPitch * (1 - p) + CRT_END_ELEV * p;

        // Distance: region fills frame at p=0; machine fills CRT_END_FILL
        // of the frame at p=1.
        // p=0 framing: the camera frames exactly the VIEWPORT BAND of the
        // extended image on the glass (bottom band, full width), which is
        // 1:1 with the flat site view. Measured from the SCREEN SURFACE
        // (mesh offset + corner lift), or the switch off the flat hero path
        // pops ~2%. The same expression covers portrait, where the band is
        // full-height and horizontally centred.
        // The surface morphs flat-at-apex -> hugging the measured dome as
        // the pull-back proceeds. The apex depth is constant by
        // construction (uApexH), so the p=0 framing never shifts, and the
        // model's own dome can never poke through mid-transition.
        crtScreenUniforms.uBulgeT.value = smoothstep(0.04, 0.45, p);
        const planeProud = crtScreenUniforms.uApexH.value;
        const d0 = crtExt.bandH / 2 / CRT_FOV_TAN + planeProud;
        const endFrameH = crtScreenState.monitorHeight / CRT_END_FILL;
        const d1 = endFrameH / 2 / CRT_FOV_TAN;
        // Exponential, not linear: dolly distance is perceived as zoom
        // FACTOR, and a linear lerp across a 10x range spends 1.5x of zoom
        // in the first 6% of scroll then crawls. Constant zoom rate reads
        // as a steady camera pull.
        const d = d0 * Math.pow(d1 / d0, p);

        // Target: a DIRECT interpolation between the two poses — the
        // viewport band's centre at p=0 and the machine's centre at p=1.
        // These sit within a few percent of each other, so the look-target
        // barely moves: the CRT stays in the middle of the frame for the
        // whole ride and the expansion reads as one clean dolly. (Both
        // earlier anchor schemes moved the target by whole screen-heights
        // mid-scroll, which is what made the centre jump around.)
        const bandCenterY = -0.5 + crtExt.bandH / 2;
        const targetY =
          bandCenterY + (crtScreenState.monitorCenterY - bandCenterY) * p;
        crtTarget.set(0, targetY, 0);

        crtCamera.position.set(
          crtTarget.x + Math.sin(psi) * Math.cos(phi) * d,
          crtTarget.y + Math.sin(phi) * d,
          crtTarget.z + Math.cos(psi) * Math.cos(phi) * d,
        );
        // Up vector: the screen's own up at p=0 (so the site is not rolled
        // or skewed), easing to world up as the camera swings out.
        const ux = m.elements[4];
        const uy = m.elements[5];
        const uz = m.elements[6];
        crtCamera.up
          .set(ux + (0 - ux) * p, uy + (1 - uy) * p, uz + (0 - uz) * p)
          .normalize();
        crtCamera.lookAt(crtTarget);
        crtCamera.updateProjectionMatrix();
        // Force matrixWorld AND matrixWorldInverse current NOW: .project()
        // uses matrixWorldInverse, and lookAt only writes the quaternion —
        // the inverse is otherwise refreshed by the renderer AFTER this
        // projection loop, one frame late. This was the DOM text slipping
        // against the glass during scroll.
        crtCamera.updateMatrixWorld(true);

        // Project the site-view region's corners for the DOM homography.
        // Corners of the VIEWPORT BAND on the plane: bottom-anchored, full
        // band width (landscape: the whole plane width; portrait: centred),
        // each lifted to the glass surface's height at that point so the
        // DOM quad and the rendered raster agree at every bulge level.
        const bandW = crtExt.bandW * crtScreenState.aspect;
        const bandTop = -0.5 + crtExt.bandH;
        for (let i = 0; i < 4; i += 1) {
          const cx = CRT_QUAD_LOCAL[i][0] * bandW;
          const cy = CRT_QUAD_LOCAL[i][1] < 0 ? -0.5 : bandTop;
          crtCorner
            .set(cx, cy, surfaceHeightAt(cx, cy))
            .applyMatrix4(m)
            .project(crtCamera);
          sceneFx.screenQuad[i * 2] = crtCorner.x;
          sceneFx.screenQuad[i * 2 + 1] = crtCorner.y;
        }

        // DOM-onto-screen homography, same frame as the camera above.
        {
          const w = window.innerWidth;
          const h = window.innerHeight;
          const q = sceneFx.screenQuad;
          const dst = [0, 1, 2, 3].map((i) => [
            ((q[i * 2] + 1) / 2) * w,
            ((1 - q[i * 2 + 1]) / 2) * h,
          ]);
          // Source is the full viewport: nothing is cropped — the whole
          // site lands on its band of the glass.
          const src = [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ];
          const H = homographyMul(
            homographyBasis(dst),
            homographyAdj(homographyBasis(src)),
          );
          let finite = true;
          for (let i = 0; i < 9; i += 1) {
            if (!Number.isFinite(H[i])) finite = false;
          }
          if (finite) {
            const k = H[8] || 1;
            const n = H.map((v) => v / k);
            applyDomTransform(
              `matrix3d(${n[0]},${n[3]},0,${n[6]},` +
                `${n[1]},${n[4]},0,${n[7]},` +
                `0,0,1,0,` +
                `${n[2]},${n[5]},0,${n[8]})`,
            );
          }
        }

        const fx = smoothstep(0.08, 0.55, p);
        crtScreenUniforms.uFx.value = fx;
        crtScreenUniforms.uTime.value = elapsed;
        crtGlow.intensity = 9 * fx;
      };

      // Model load: async, never blocks scene-ready.
      {
        const loader = new GLTFLoader();
        loader.load(
          CRT_MODEL.url,
          (gltf) => {
            if (disposed) {
              // Unmounted while loading: free the GLB instead of leaking it.
              gltf.scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.geometry?.dispose();
                const mats = Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material];
                for (const mat of mats) mat?.dispose();
              });
              return;
            }
            // Yaw wrapper first: every measurement below is post-yaw.
            const model = new THREE.Group();
            gltf.scene.rotation.y = CRT_MODEL.yaw;
            model.add(gltf.scene);

            // The FBX referenced texture files that were not embedded; bind
            // the download's 2K PBR set explicitly. flipY=false is the glTF
            // texture convention GLTFLoader geometry expects.
            const texLoader = new THREE.TextureLoader();
            const maxAniso = renderer.capabilities.getMaxAnisotropy();
            const loadTex = (url: string, srgb: boolean) => {
              const t = texLoader.load(url);
              t.flipY = false;
              // Oblique sampling is most of what separates "photo of a TV"
              // from "texture on a box" at these grazing camera angles.
              t.anisotropy = maxAniso;
              if (srgb) t.colorSpace = THREE.SRGBColorSpace;
              return t;
            };
            const tvMaterial = new THREE.MeshStandardMaterial({
              map: loadTex(CRT_MODEL.textures.map, true),
              normalMap: loadTex(CRT_MODEL.textures.normalMap, false),
              metalnessMap: loadTex(CRT_MODEL.textures.metalnessMap, false),
              roughnessMap: loadTex(CRT_MODEL.textures.roughnessMap, false),
              envMapIntensity: 1.35,
            });
            model.traverse((obj) => {
              if (!(obj as THREE.Mesh).isMesh) return;
              const mesh = obj as THREE.Mesh;
              const prev = mesh.material as THREE.Material;
              mesh.material = tvMaterial;
              prev?.dispose();
              mesh.castShadow = true;
            });

            const sc = CRT_MODEL.screen;
            const s = 1 / sc.h;
            model.scale.setScalar(s);
            model.position.set(-sc.cx * s, -sc.cy * s, -sc.cz * s);

            crtScreenState.aspect = sc.w / sc.h;
            const modelBox = new THREE.Box3().setFromObject(model);
            const modelSize = modelBox.getSize(new THREE.Vector3());
            const modelCenter = modelBox.getCenter(new THREE.Vector3());
            crtScreenState.monitorHeight = modelSize.y;
            crtScreenState.monitorCenterY = modelCenter.y;

            crtScreenMesh.geometry.dispose();
            crtScreenMesh.geometry = buildScreenGeometry();
            crtRoot.remove(crtPlaceholder);
            crtRoot.add(model);
            crtScreenMesh.position.z = 0;
            // Bake the model's ACTUAL tube surface into the plane: cast a
            // ray backwards through every plane vertex, record the hit
            // depth (+6mm proud), and smooth-fill the few misses from
            // their neighbours. Runs once per load (~1.8k rays).
            {
              // AFTER crtRoot.add(model): the raycast needs the model under
              // the same root yaw the plane already carries — baking before
              // the add measured the face 20.6deg tilted (the root yaw) and
              // warped the whole surface.
              crtRoot.updateMatrixWorld(true);
              const geo = crtScreenMesh.geometry;
              const posAttr = geo.attributes.position;
              const hAttr = geo.attributes.aHeight as THREE.BufferAttribute;
              const raycaster = new THREE.Raycaster();
              const origin = new THREE.Vector3();
              const dirWorld = new THREE.Vector3();
              const hitLocal = new THREE.Vector3();
              let apex = 0;
              const misses: number[] = [];
              for (let i = 0; i < posAttr.count; i += 1) {
                origin
                  .set(posAttr.getX(i), posAttr.getY(i), 2.5)
                  .applyMatrix4(crtScreenMesh.matrixWorld);
                dirWorld
                  .set(0, 0, -1)
                  .transformDirection(crtScreenMesh.matrixWorld);
                raycaster.set(origin, dirWorld);
                raycaster.far = 6;
                const hits = raycaster.intersectObject(model, true);
                if (hits.length > 0) {
                  hitLocal.copy(hits[0].point);
                  crtScreenMesh.worldToLocal(hitLocal);
                  const h = hitLocal.z + 0.006;
                  hAttr.setX(i, h);
                  if (h > apex) apex = h;
                } else {
                  misses.push(i);
                }
              }
              // Fill misses (rays off the model's silhouette) with the row
              // neighbour so edges stay continuous.
              for (const i of misses) {
                const left = i > 0 ? hAttr.getX(i - 1) : 0;
                hAttr.setX(i, left);
              }
              // Normals from the baked height field via central differences
              // on the grid (49 x 37 vertices).
              const nAttr = geo.attributes.aNormal as THREE.BufferAttribute;
              const cols = 49;
              const rows = 37;
              const cellW = crtScreenState.aspect / (cols - 1);
              const cellH = 1 / (rows - 1);
              for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                  const i = r * cols + c;
                  const hl = hAttr.getX(r * cols + Math.max(0, c - 1));
                  const hr = hAttr.getX(r * cols + Math.min(cols - 1, c + 1));
                  const hd = hAttr.getX(Math.max(0, r - 1) * cols + c);
                  const hu = hAttr.getX(Math.min(rows - 1, r + 1) * cols + c);
                  const dzdx = (hr - hl) / (2 * cellW);
                  const dzdy = (hu - hd) / (2 * cellH);
                  const inv = 1 / Math.hypot(dzdx, dzdy, 1);
                  nAttr.setXYZ(i, -dzdx * inv, -dzdy * inv, inv);
                }
              }
              hAttr.needsUpdate = true;
              nAttr.needsUpdate = true;
              crtScreenUniforms.uApexH.value = apex + 0.004;
            }

            // Seat the shadow ground exactly under the machine.
            crtRoot.updateMatrixWorld(true);
            const worldBox = new THREE.Box3().setFromObject(crtRoot);
            crtGround.position.y = worldBox.min.y + 0.001;
            renderer.shadowMap.needsUpdate = true;
            updateCrtRegion();
          },
          undefined,
          () => {
            // Keep the placeholder on failure; the scene still works.
          },
        );
      }

      // All scene/camera/uniform objects above are preallocated once; the
      // per-frame path only issues the render calls.
      const renderComposite = (elapsed: number) => {
        renderer.setRenderTarget(sceneTarget);
        renderer.render(scene, camera);
        if (sceneFx.crtProgress <= 0.001) {
          // Hero path: samples only the viewport band of the extended scene
          // texture — pixel-identical to a plain viewport render.
          applyDomTransform(HOMOGRAPHY_IDENTITY);
          halftoneUniforms.uResolution.value.set(
            drawingBufferSize.x,
            drawingBufferSize.y,
          );
          halftoneUniforms.uSceneRemap.value.set(
            crtExt.bandW,
            crtExt.bandH,
          );
          halftoneUniforms.uSceneOffset.value.set(
            (1 - crtExt.bandW) / 2,
            0,
          );
          halftoneUniforms.uGridOffset.value.set(0, 0);
          renderer.setRenderTarget(null);
          renderer.render(halftoneScene, halftoneCamera);
          return;
        }
        // Display pass: halftone the WHOLE extended frame at 1:1 for the
        // tube. Same cell size in device px, same bottom-left grid origin,
        // so the band's dots match the flat path exactly.
        halftoneUniforms.uResolution.value.set(crtExt.extW, crtExt.extH);
        halftoneUniforms.uSceneRemap.value.set(1, 1);
        halftoneUniforms.uSceneOffset.value.set(0, 0);
        halftoneUniforms.uGridOffset.value.set(
          (crtExt.extW - drawingBufferSize.x) / 2,
          0,
        );
        renderer.setRenderTarget(displayTarget);
        renderer.render(halftoneScene, halftoneCamera);
        renderer.setRenderTarget(null);
        updateCrtRig(elapsed);
        renderer.render(crtScene, crtCamera);
      };

      await reportSceneBuildProgress();

      // Precomputed image-based lighting: a tiny equirect painted in the
      // void's own palette (pink glow upper-right, plum dome, black floor),
      // prefiltered ONCE through PMREM at startup. Every blossom, branch
      // and petal then samples real directional irradiance instead of flat
      // hemisphere fill — the "rendered" look — for the per-frame price of
      // the texture lookups the standard shader already does.
      {
        const envCanvas = document.createElement("canvas");
        envCanvas.width = 64;
        envCanvas.height = 32;
        const ctx = envCanvas.getContext("2d");
        if (ctx) {
          const sky = ctx.createLinearGradient(0, 0, 0, 32);
          sky.addColorStop(0, "#241322");
          sky.addColorStop(0.55, "#3a1430");
          sky.addColorStop(0.72, "#12060f");
          sky.addColorStop(1, "#050308");
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, 64, 32);
          // The rose glow, matching the void backdrop's hot region.
          const glow = ctx.createRadialGradient(42, 12, 1, 42, 12, 14);
          glow.addColorStop(0, "rgba(255,105,160,0.95)");
          glow.addColorStop(0.5, "rgba(214,36,107,0.45)");
          glow.addColorStop(1, "rgba(214,36,107,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, 64, 32);
        }
        const envTex = new THREE.CanvasTexture(envCanvas);
        envTex.mapping = THREE.EquirectangularReflectionMapping;
        envTex.colorSpace = THREE.SRGBColorSpace;
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromEquirectangular(envTex).texture;
        scene.environmentIntensity = 0.32;
        envTex.dispose();
        pmrem.dispose();
      }

      // Stage lighting for the void: a dim, moody base so unlit bark never
      // clips to a pure-black mass, with the drama carried by three
      // directional accents below. The hemisphere drops now that the
      // environment carries the ambient term.
      const hemi = new THREE.HemisphereLight(0x2b2436, 0x0b0910, 0.3);
      scene.add(hemi);

      // Warm key from upper front-left: models the canopy and puts readable
      // highlights on the dark bark.
      const key = new THREE.DirectionalLight(
        KEY_LIGHT_COLOR,
        KEY_LIGHT_INTENSITY,
      );
      key.position.copy(KEY_LIGHT_POSITION);
      scene.add(key);

      // Cool blue-violet rim from behind-right for silhouette separation
      // against the black backdrop.
      const rim = new THREE.DirectionalLight(0x8d84ff, 1.7);
      rim.position.copy(RIM_LIGHT_POSITION);
      scene.add(rim);

      // Low deep-rose glow from behind/below the canopy, echoing the
      // glowing-dark-canvas reference; it warms the underside of the
      // blossom clusters without lifting the void.
      const roseGlow = new THREE.PointLight(ROSE_GLOW_COLOR, 18, 30, 2);
      roseGlow.position.copy(ROSE_GLOW_POSITION);
      scene.add(roseGlow);

      // Void backdrop: animated fluid pink gradient (shaders at the top of
      // the file). Kept smooth on purpose — the halftone post-pass
      // rasterizes the whole frame into dots, so any texture baked here
      // would double-dither. The color uniforms are THREE.Color values,
      // which land in the linear working space; the shader writes them to
      // the linear scene target and the halftone pass applies ACES + sRGB
      // once, exactly as it did for the old sRGB-texture backdrop.
      // Animation is a single uTime uniform driven from the render loop;
      // the fragment cost (~4 gaussians at <=1x DPR) is negligible on
      // every quality tier.
      const voidBackdropUniforms = {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0.1) },
        uPointerForce: { value: 0 },
        uBase: { value: new THREE.Color(0x0a0a0a) },
        // Curtain ramp: deep rose-maroon -> saturated pink -> warm light
        // pink, the reference's maroon/red/orange ramp shifted to pink.
        uDeep: { value: new THREE.Color(0x6d1a3c) },
        uCore: { value: new THREE.Color(0xd63c78) },
        uHot: { value: new THREE.Color(0xff8fae) },
        uViolet: { value: new THREE.Color(0x5c2f7a) },
        // Hue spread applied per curtain. Vector3 and NOT Color on purpose:
        // these are channel multipliers, and a Color would be pushed through
        // the sRGB -> linear conversion on upload, which would silently turn
        // a 1.14 gain into something else entirely.
        uWarmTint: { value: new THREE.Vector3(1.14, 0.93, 0.86) },
        uCoolTint: { value: new THREE.Vector3(0.8, 0.85, 1.2) },
      };
      const createVoidBackdrop = () => {
        const backdrop = new THREE.Mesh(
          // 100 tall (was 62): the upward-extended render's top ray
          // overshoots a 62-unit plane on viewports wider than ~1.9:1,
          // leaving a black band above the curtains on the tube.
          new THREE.PlaneGeometry(110, 100),
          new THREE.ShaderMaterial({
            uniforms: voidBackdropUniforms,
            vertexShader: VOID_BACKDROP_VERTEX_SHADER,
            fragmentShader: VOID_BACKDROP_FRAGMENT_SHADER,
            fog: false,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        backdrop.name = "Void backdrop";
        // Far behind the tree (z=0) and centered on the canopy glow; well
        // inside the camera far plane (80) at camera z ~16.4.
        backdrop.position.set(2.6, 5.4, -26);
        backdrop.renderOrder = -2;
        return backdrop;
      };
      // Added to the scene (not worldGroup) so the backdrop never inherits
      // any world transform.
      scene.add(createVoidBackdrop());
      await reportSceneBuildProgress();

      const generator = new WeepingCherryGenerator({
        seed: 20260705,
        quality: sceneQuality,
        showDebugLobes: false,
      });
      const tree = generator.generate();
      await reportSceneBuildProgress();

      worldGroup.add(tree.group);
      await reportSceneBuildProgress();

      const finePointerQuery = window.matchMedia("(pointer: fine)");
      let hasFinePointer = finePointerQuery.matches;
      const pointerParallaxTarget = {
        x: 0,
        y: 0,
      };
      const pointerParallaxSmooth = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const lookTarget = new THREE.Vector3();
      const springState: SpringState = { current: 0, velocity: 0 };
      let lastPointerTime = performance.now();
      let lastInteractionTime = lastPointerTime;
      // Cursor rustle: the pointer unprojected onto the world z=0 plane
      // through the trunk, spring-smoothed into uPointerPos, with a 0..1
      // strength that eases up while the pointer moves over the canvas and
      // decays to zero within ~1s of stillness or pointerleave. All scratch
      // vectors preallocated; no raycasting against tree geometry.
      const pointerWorldTarget = new THREE.Vector3(0, 6.5, 0);
      const pointerWorldSmooth = new THREE.Vector3(0, 6.5, 0);
      const pointerWorldVel = new THREE.Vector3();
      const pointerUnproject = new THREE.Vector3();
      let pointerRustleStrength = 0;
      let pointerRustleActive = false;
      // Latches true the first time the cursor is seen, and stays true: the
      // backdrop's lean is meant to persist wherever the cursor left it.
      let backdropPointerEngaged = false;
      let lastRustleMoveTime = 0;

      const markInteraction = () => {
        lastInteractionTime = performance.now();
      };

      const isPointerInsideMount = (event: PointerEvent) => {
        const rect = mount.getBoundingClientRect();
        return (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        );
      };

      const resetPointerParallax = () => {
        pointerParallaxTarget.x = 0;
        pointerParallaxTarget.y = 0;
        pointerRustleActive = false;
      };

      const onPointerCapabilityChange = () => {
        hasFinePointer = finePointerQuery.matches;
        if (!hasFinePointer) resetPointerParallax();
      };

      const onPointerMove = (event: PointerEvent) => {
        markInteraction();
        if (
          prefersReducedMotion ||
          !hasFinePointer ||
          event.pointerType === "touch" ||
          !isPointerInsideMount(event)
        ) {
          resetPointerParallax();
          return;
        }

        const now = event.timeStamp || performance.now();
        lastPointerTime = now;
        const rect = mount.getBoundingClientRect();
        pointerParallaxTarget.x = THREE.MathUtils.clamp(
          ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2,
          -1,
          1,
        );
        pointerParallaxTarget.y = THREE.MathUtils.clamp(
          (0.5 - (event.clientY - rect.top) / Math.max(1, rect.height)) * 2,
          -1,
          1,
        );

        // Rustle target: unproject the pointer through the camera onto the
        // world z=0 plane (the plane the trunk stands in). Ray-plane math
        // on preallocated vectors — no Raycaster, no geometry tests.
        // The camera's projection covers the EXTENDED frame (viewport plus
        // the reveal band above / beside it), so viewport-relative NDC must
        // be mapped into the band's sub-rect: bottom-anchored vertically,
        // centred horizontally. Feeding raw viewport NDC unprojected the
        // rustle point ~3 world units above the cursor.
        const ndcX =
          (((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1) *
          crtExt.bandW;
        const ndcY =
          -1 +
          (1 - (event.clientY - rect.top) / Math.max(1, rect.height)) *
            2 *
            crtExt.bandH;
        pointerUnproject.set(ndcX, ndcY, 0.5).unproject(camera);
        pointerUnproject.sub(camera.position);
        if (Math.abs(pointerUnproject.z) > 1e-4) {
          const planeT = -camera.position.z / pointerUnproject.z;
          if (planeT > 0) {
            pointerWorldTarget
              .copy(pointerUnproject)
              .multiplyScalar(planeT)
              .add(camera.position);
            pointerRustleActive = true;
            lastRustleMoveTime = now;
          }
        }
      };

      const onPointerLeave = () => {
        markInteraction();
        resetPointerParallax();
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      // Scroll drives the CRT scene (and the halftone dissolve uniform), so
      // it must hold the render loop at full rate; trackpad scrolling fires
      // no pointermove, which left the canvas at the 30fps idle rate while
      // the DOM transform around it ran at display rate.
      window.addEventListener("scroll", markInteraction, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
      window.addEventListener("blur", onPointerLeave);
      finePointerQuery.addEventListener("change", onPointerCapabilityChange);

      const clock = new THREE.Clock();
      let frame = 0;
      let reportedReady = false;
      let reportedIntroComplete = false;
      const introDuration = 2.7;
      let introElapsed = prefersReducedMotion ? introDuration : 0;
      let introComplete = prefersReducedMotion;
      let lastRenderedAt = 0;
      const idleFrameInterval = 1000 / 30;
      const activeFrameWindow = 260;

      const setCameraFov = (fov: number) => {
        if (Math.abs(camera.fov - fov) < 0.01) return;
        camera.fov = fov;
        camera.updateProjectionMatrix();
      };
      const reportIntroComplete = () => {
        if (reportedIntroComplete) return;
        reportedIntroComplete = true;
        onIntroCompleteRef.current?.();
      };

      const onResize = () => {
        markInteraction();
        if (!mount) return;
        const viewport = getViewportMetrics();
        const w = mount.clientWidth || viewport.width;
        const h = mount.clientHeight || viewport.height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        renderer.setPixelRatio(getRenderPixelRatio());
        // Keep the halftone target and its uniforms in step with the
        // drawing buffer (setSize x pixel ratio).
        renderer.getDrawingBufferSize(drawingBufferSize);
        updateCrtRegion();
        halftoneUniforms.uResolution.value.set(
          drawingBufferSize.x,
          drawingBufferSize.y,
        );
        halftoneUniforms.uCellSize.value =
          halftoneCellCssPx * getRenderPixelRatio();
      };
      const removeViewportResize = addViewportChangeListener(onResize);

      const animate = () => {
        if (disposed) return;
        const now = performance.now();
        frame = requestAnimationFrame(animate);
        const parallaxMoving =
          !prefersReducedMotion &&
          (Math.abs(pointerParallaxTarget.x - pointerParallaxSmooth.x) >
            0.001 ||
            Math.abs(pointerParallaxTarget.y - pointerParallaxSmooth.y) >
              0.001 ||
            Math.abs(pointerParallaxSmooth.vx) > 0.001 ||
            Math.abs(pointerParallaxSmooth.vy) > 0.001);
        const recentlyActive =
          now - lastInteractionTime < activeFrameWindow ||
          now - lastPointerTime < activeFrameWindow;
        const shouldRenderFullRate =
          !reportedReady ||
          !introComplete ||
          parallaxMoving ||
          recentlyActive ||
          pointerRustleStrength > 0.02;

        if (
          !shouldRenderFullRate &&
          lastRenderedAt > 0 &&
          now - lastRenderedAt < idleFrameInterval
        ) {
          return;
        }

        lastRenderedAt = now;
        const dt = Math.min(0.033, clock.getDelta());
        const elapsed = clock.elapsedTime;
        voidBackdropUniforms.uTime.value = elapsed;
        // Scroll-driven halftone level: the dot-matrix pass fades out as the
        // site view shrinks into the CRT, leaving the smooth render behind
        // the monitor glass. Written every frame; sceneFx is scrubbed by the
        // scroll timeline in HeroIntro.
        halftoneUniforms.uStrength.value =
          HALFTONE_STRENGTH * Math.max(0, Math.min(1, sceneFx.halftone));

        // Live tree placement. Applied unconditionally because the defaults
        // in treeTuning reproduce the transform baked into generate() exactly,
        // so a page without the tuner mounted is pixel-identical. Freezing a
        // placement means pasting the panel's output into generate(), bumping
        // TREE_BASE_SCALE and TREE_TUNING_DEFAULT to match, and bumping the
        // storage key.
        tree.group.position.set(treeTuning.x, treeTuning.y, treeTuning.z);
        tree.group.rotation.y = treeTuning.rotY;
        tree.group.scale.set(
          TREE_BASE_SCALE.x * treeTuning.scale,
          TREE_BASE_SCALE.y * treeTuning.scale,
          TREE_BASE_SCALE.z * treeTuning.scale,
        );
        // Physical ungrow on scroll (see UNGROW ORDER): one front sweeps
        // the tree from the outermost twigs down to the trunk base; the
        // shaders pinch and clip wood and flowers behind it. Nothing
        // fades — the loose falling petals (already translucent) are the
        // one exception, thinning out with the canopy they fell from.
        const hide = clamp01(sceneFx.treeGrow);
        if (tree.branchWindUniforms) {
          tree.branchWindUniforms.uUngrow.value = hide;
        }
        if (tree.petals) {
          const petalMat = tree.petals.meshes[0]
            ?.material as THREE.MeshStandardMaterial | undefined;
          if (petalMat) petalMat.opacity = 0.78 * (1 - smoothstep(0, 0.5, hide));
        }
        // Skip the draw calls once everything is behind the front.
        const treeGone = hide >= 0.999;
        if (tree.branchMesh) tree.branchMesh.visible = !treeGone;
        for (const mesh of [
          tree.blossomMesh,
          tree.lowBlossomMesh,
          tree.halfBlossomMesh,
          tree.budMesh,
        ]) {
          if (mesh) mesh.visible = !treeGone;
        }
        // Project the pointer ray onto the backdrop plane (z = -26) and map
        // the hit into the shader's aspect-corrected p-space, so the flame
        // field bends around where the cursor visually sits on the backdrop.
        if (tree.branchWindUniforms) {
          const rayDir = tree.branchWindUniforms.uPointerRayDir.value;
          if (rayDir.z < -1e-4) {
            const rayT = (-26 - camera.position.z) / rayDir.z;
            const hitX = camera.position.x + rayDir.x * rayT;
            const hitY = camera.position.y + rayDir.y * rayT;
            voidBackdropUniforms.uPointer.value.set(
              ((hitX - 2.6) / 110) * 1.774,
              (hitY - 5.4) / 62,
            );
          }
          // Presence, not velocity. pointerRustleStrength decays to zero
          // about a second after the mouse stops, so feeding it here made the
          // backdrop unwarp and slide back to its idle shape on every pause.
          // uPointer itself already holds its last value (pointerWorldTarget
          // is never reset, not even on pointerleave), so ramping this to 1
          // and leaving it there means the lean simply stays put.
          if (pointerRustleStrength > 0.02) backdropPointerEngaged = true;
          if (backdropPointerEngaged) {
            voidBackdropUniforms.uPointerForce.value = Math.min(
              1,
              voidBackdropUniforms.uPointerForce.value + dt * 1.2,
            );
          }
        }
        tree.petals?.update(
          dt,
          elapsed,
          tree.branchWindUniforms?.uWindStrength.value ?? 1,
        );

        if (prefersReducedMotion) resetPointerParallax();

        const springX = dampSpring(
          pointerParallaxSmooth.x,
          pointerParallaxTarget.x,
          pointerParallaxSmooth.vx,
          24,
          9,
          dt,
          springState,
        );
        pointerParallaxSmooth.x = THREE.MathUtils.clamp(springX.current, -1, 1);
        pointerParallaxSmooth.vx = springX.velocity;

        const springY = dampSpring(
          pointerParallaxSmooth.y,
          pointerParallaxTarget.y,
          pointerParallaxSmooth.vy,
          24,
          9,
          dt,
          springState,
        );
        pointerParallaxSmooth.y = THREE.MathUtils.clamp(springY.current, -1, 1);
        pointerParallaxSmooth.vy = springY.velocity;

        // Cursor-rustle envelope: rises in ~0.3s while the pointer keeps
        // moving over the canvas, decays to ~0 in about 1s once it goes
        // still (320ms grace + rate-4.5 exponential) or leaves.
        const rustleTarget =
          !prefersReducedMotion &&
          pointerRustleActive &&
          now - lastRustleMoveTime < 320
            ? 1
            : 0;
        pointerRustleStrength +=
          (rustleTarget - pointerRustleStrength) *
          Math.min(1, (rustleTarget > pointerRustleStrength ? 10 : 4.5) * dt);
        if (pointerRustleStrength < 0.001) pointerRustleStrength = 0;

        // Spring the rustle point after the target so the disturbance
        // sweeps smoothly across the canopy instead of teleporting.
        const springPX = dampSpring(
          pointerWorldSmooth.x,
          pointerWorldTarget.x,
          pointerWorldVel.x,
          42,
          11,
          dt,
          springState,
        );
        pointerWorldSmooth.x = springPX.current;
        pointerWorldVel.x = springPX.velocity;
        const springPY = dampSpring(
          pointerWorldSmooth.y,
          pointerWorldTarget.y,
          pointerWorldVel.y,
          42,
          11,
          dt,
          springState,
        );
        pointerWorldSmooth.y = springPY.current;
        pointerWorldVel.y = springPY.velocity;

        if (tree.branchWindUniforms) {
          tree.branchWindUniforms.uWindTime.value = elapsed;
          tree.branchWindUniforms.uPointerStrength.value =
            pointerRustleStrength;
          tree.branchWindUniforms.uPointerPos.value.copy(pointerWorldSmooth);
          // Spring velocity of the pointer point drives the brush direction:
          // branches move with the cursor's motion, and settle as the spring
          // does.
          tree.branchWindUniforms.uPointerVel.value.copy(pointerWorldVel);
          // Ray direction from the live camera through the smoothed pointer
          // point — the camera dollies and parallaxes, so this refreshes
          // every frame rather than only on pointer moves.
          tree.branchWindUniforms.uPointerRayDir.value
            .copy(pointerWorldSmooth)
            .sub(camera.position)
            .normalize();
        }

        if (!introComplete) {
          if (introActiveRef.current) {
            introElapsed = Math.min(introDuration, introElapsed + dt);
            const introProgress = easeOutCubic(introElapsed / introDuration);
            camera.position.lerpVectors(
              INTRO_CAMERA_POSITION,
              FINAL_CAMERA_POSITION,
              introProgress,
            );
            lookTarget.copy(HERO_CAMERA_TARGET);
            setCameraFov(HERO_CAMERA_FOV);
            if (introElapsed >= introDuration) {
              introComplete = true;
              camera.position.copy(FINAL_CAMERA_POSITION);
              reportIntroComplete();
            }
          } else {
            camera.position.copy(INTRO_CAMERA_POSITION);
            lookTarget.copy(HERO_CAMERA_TARGET);
            setCameraFov(HERO_CAMERA_FOV);
          }
        } else {
          reportIntroComplete();
          camera.position.copy(FINAL_CAMERA_POSITION);
          lookTarget.copy(HERO_CAMERA_TARGET);
          setCameraFov(HERO_CAMERA_FOV);
        }
        // Blossoms bloom out of their spur points during the intro dolly.
        // (The scroll ungrow is a separate front — uUngrow above — so the
        // two never fight.)
        tree.blossomGrowth.value =
          prefersReducedMotion || introComplete
            ? 1
            : smoothstep(0.04, 0.88, easeOutCubic(introElapsed / introDuration));
        if (!prefersReducedMotion) {
          // Pointer parallax belongs to the full-screen page. Once the view
          // is on the monitor, the same camera drift slides the whole
          // picture around inside a fixed bezel — the screen content looked
          // unanchored — so it eases out over the first half of the
          // pull-back.
          const parallaxGain = 1 - smoothstep(0, 0.5, clamp01(sceneFx.crtProgress));
          camera.position.x += pointerParallaxSmooth.x * 0.32 * parallaxGain;
          camera.position.y += pointerParallaxSmooth.y * 0.18 * parallaxGain;
          lookTarget.x += pointerParallaxSmooth.x * 0.16 * parallaxGain;
          lookTarget.y += pointerParallaxSmooth.y * 0.09 * parallaxGain;
        }
        camera.lookAt(lookTarget);
        renderComposite(elapsed);
        if (!reportedReady) {
          reportedReady = true;
          void reportSceneBuildProgress();
          window.requestAnimationFrame(() => {
            if (!disposed) onReadyRef.current?.();
          });
        }
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(frame);
        removeViewportResize();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("scroll", markInteraction);
        window.removeEventListener("pointerleave", onPointerLeave);
        window.removeEventListener("blur", onPointerLeave);
        finePointerQuery.removeEventListener(
          "change",
          onPointerCapabilityChange,
        );
        // The halftone pass lives outside the main scene graph, so the
        // traversal below never reaches it — dispose it explicitly.
        sceneTarget.dispose();
        displayTarget.dispose();
        crtScreenMaterial.dispose();
        crtScreenMesh.geometry.dispose();
        // The CRT scene holds GPU allocations of its own (GLB textures, the
        // PMREM environment, shadow map ground, gradient backdrop); walk and
        // free them like every other resource in this cleanup.
        scene.environment?.dispose();
        crtScene.environment?.dispose();
        crtScene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const mat of mats) {
            if (!mat) continue;
            const anyMat = mat as THREE.MeshStandardMaterial;
            anyMat.map?.dispose();
            anyMat.normalMap?.dispose();
            anyMat.metalnessMap?.dispose();
            anyMat.roughnessMap?.dispose();
            mat.dispose();
          }
        });
        halftoneGeometry.dispose();
        halftoneMaterial.dispose();
        renderer.dispose();
        const disposedTextures = new Set<THREE.Texture>();
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material as
            | THREE.Material
            | THREE.Material[]
            | undefined;
          if (Array.isArray(material)) {
            material.forEach((m) => {
              disposeMaterialTextures(m, disposedTextures);
              m.dispose();
            });
          } else if (material) {
            disposeMaterialTextures(material, disposedTextures);
            material.dispose();
          }
        });
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      };
    };

    void initializeScene();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "var(--arbor-screen-w, 100dvw)",
        height: "var(--arbor-screen-h, 100dvh)",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
