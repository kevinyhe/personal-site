"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  addViewportChangeListener,
  getViewportMetrics,
  getViewportWidth,
} from "@/components/viewportMetrics";

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
  return srgbEncode(acesFilm(texture2D(uScene, uv).rgb * uExposure));
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
  vec2 cell = floor(fragPx / uCellSize);
  vec2 cellCenter = (cell + 0.5) * uCellSize;

  vec3 cellColor = displayColor(cellCenter / uResolution);
  vec3 smoothColor = displayColor(fragPx / uResolution);

  float luma = dot(cellColor, vec3(0.2126, 0.7152, 0.0722));
  // Bayer jitter staggers the tone step from cell to cell so gradients
  // break into dither texture instead of concentric rings.
  float tone = clamp(luma + (bayer8(cell) - 0.5) * 0.22, 0.0, 1.0);

  // Print-style sizing: dot area tracks tone, sqrt turns area into radius
  // (in cell units). Cells darker than the floor print nothing, so the
  // void stays clean black.
  float radius = tone < 0.05 ? 0.0 : sqrt(tone) * 0.57;
  float dist = length(fragPx - cellCenter) / uCellSize;
  float edge = 0.7 / uCellSize;
  float inDot = radius <= 0.0
    ? 0.0
    : 1.0 - smoothstep(max(radius - edge, 0.0), radius + edge, dist);

  // Ink quantized to 5 levels per channel, printed on the void color.
  vec3 ink = floor(cellColor * 4.0 + 0.5) * 0.25;
  vec3 voidInk = vec3(10.0 / 255.0); // #0a0a0a
  vec3 dotted = mix(voidInk, ink, inDot);

  gl_FragColor = vec4(mix(smoothColor, dotted, uStrength), 1.0);
}
`;

type BareThreeCanvasProps = {
  introActive?: boolean;
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
  color: THREE.Color;
  // Per-instance multiplier on the material's emissive lift, so clusters
  // glow unevenly instead of as one flat pink mass.
  emissive: number;
  phase: number;
  flutter: number;
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
  return 0.28 + 0.72 * smoothstep(-1.7, 1.9, n);
}

function getLimbWindAmplitude(branch: Branch) {
  const depthAmp =
    branch.depth === 1 ? 0.045 : branch.depth === 2 ? 0.07 : 0.09;
  const radiusFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(0.42, 0.03, branch.baseRadius),
    0.3,
    1,
  );
  return depthAmp * radiusFactor;
}

function getTwigWindAmplitude(branch: Branch) {
  const depthAmp =
    branch.depth === 4 ? 0.11 : branch.depth === 5 ? 0.14 : 0.16;
  const radiusFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.inverseLerp(0.06, 0.008, branch.baseRadius),
    0.4,
    1,
  );
  return depthAmp * radiusFactor;
}

function getTwigWindFlutter(branch: Branch) {
  const depthAmp =
    branch.depth === 4 ? 0.006 : branch.depth === 5 ? 0.009 : 0.012;
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

class BranchGeometryBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  windParams1: number[] = [];
  windParams2: number[] = [];
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
    float shake =
      sin(uWindTime * 16.0 + phase) +
      0.5 * sin(uWindTime * 23.0 + phase * 1.9);
    vec3 shakeDir = normalize(vec3(sin(phase * 3.7), 0.35, cos(phase * 2.9)));
    return (brush + shakeDir * (shake * 0.024)) * w;
  }

  float arborGust(float t, float phase) {
    float n =
      sin(t * 0.36 + phase * 0.1) +
      0.6 * sin(t * 0.83 + 1.7 + phase * 0.05) +
      0.35 * sin(t * 0.11 + 4.2);
    return 0.28 + 0.72 * smoothstep(-1.7, 1.9, n);
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

    float tl = uWindTime - limbLag;
    float limbSway =
      sin(tl * 2.0 + limbPhase) * 0.64 +
      sin(tl * 3.1 + limbPhase * 1.31 + 0.9) * 0.36;
    float tt = uWindTime - twigLag;
    float twigSway =
      sin(tt * 2.6 + twigPhase) * 0.6 +
      sin(tt * 3.7 + twigPhase * 1.7 + 1.4) * 0.4;
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
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uPointerPos = uniforms.uPointerPos;
    shader.uniforms.uPointerRayDir = uniforms.uPointerRayDir;
    shader.uniforms.uPointerVel = uniforms.uPointerVel;
    shader.uniforms.uPointerStrength = uniforms.uPointerStrength;
    shader.uniforms.uPointerRadius = uniforms.uPointerRadius;
    shader.vertexShader =
      `
        attribute vec4 windParams1;
        attribute vec4 windParams2;
      ` +
      WIND_SHADER_CHUNK +
      shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      transformed += arborWindOffset(windParams1, windParams2);
      transformed += arborPointerRustle(
        (modelMatrix * vec4(transformed, 1.0)).xyz,
        windParams1, windParams2);
      `,
    );
  };

  material.customProgramCacheKey = () => "branch-wind-v8";
  return uniforms;
}

function applyBlossomWind(
  material: THREE.MeshStandardMaterial,
  uniforms: BranchWindUniforms,
  growthUniform: { value: number },
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uPointerPos = uniforms.uPointerPos;
    shader.uniforms.uPointerRayDir = uniforms.uPointerRayDir;
    shader.uniforms.uPointerVel = uniforms.uPointerVel;
    shader.uniforms.uPointerStrength = uniforms.uPointerStrength;
    shader.uniforms.uPointerRadius = uniforms.uPointerRadius;
    shader.uniforms.uBlossomGrowth = growthUniform;
    shader.vertexShader =
      `
        attribute vec4 blossomWindParams1;
        attribute vec4 blossomWindParams2;
        attribute float blossomPhase;
        attribute float blossomFlutter;
        attribute float blossomRevealT;
        attribute float blossomEmissive;
        varying float vBlossomEmissive;
        uniform float uBlossomGrowth;
      ` +
      WIND_SHADER_CHUNK +
      shader.vertexShader;

    // Flower-local motion only; the anchor wind displacement is applied
    // after instanceMatrix (below) so it matches the branch mesh exactly.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vBlossomEmissive = blossomEmissive;
      // Intro grow reveal: each flower scales in from its spur point (the
      // geometry origin sits on the twig), staggered by blossomRevealT.
      float blossomReveal =
        smoothstep(blossomRevealT, blossomRevealT + 0.24, uBlossomGrowth);
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
      "varying float vBlossomEmissive;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vBlossomEmissive;
      `,
    );
  };

  material.customProgramCacheKey = () => "blossom-wind-v10";
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
  // ~27% larger than the old 0.26 x 0.10 card so each petal still reads as
  // a few halftone dots.
  const petalLength = 0.33;
  const maxHalfWidth = 0.125;
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

// Petal lifecycle: HELD (invisible at a blossom anchor, waiting for a gust
// to shake it loose) -> FALLING (drag-limited descent with falling-leaf
// side-slip and rocking; below the tree base the petal shrinks away into
// the void, then recycles to a new anchor). All per-petal parameters are
// precomputed at construction; update() allocates nothing.
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
const FLOW_LIFT_STRENGTH = 0.6; // vertical channel scale (u/s)
// Gust front that travels downwind across the canopy: modulates both petal
// release and field strength, so detachment and acceleration sweep through
// the tree as a moving wave instead of firing uniformly at random.
const GUST_WAVE_LENGTH = 7; // world units crest-to-crest
const GUST_WAVE_SPEED = 0.45; // crest travels at LENGTH*SPEED ~ 3.2 u/s
// Gentle helical swirl in the wake trailing downwind of the trunk.
const HELIX_STRENGTH = 0.22;

class FallingPetalSystem {
  // One InstancedMesh per loose-petal shape variant; petal i lives in
  // meshes[i % PETAL_VARIANT_COUNT] at slot (i / PETAL_VARIANT_COUNT) | 0.
  meshes: THREE.InstancedMesh[] = [];
  private rng: () => number;
  private lobes: CanopyLobe[];
  private anchors: THREE.Vector3[] | null;
  private positions: THREE.Vector3[] = [];
  private velocities: THREE.Vector3[] = [];
  private rotations: THREE.Euler[] = [];
  private states: Uint8Array;
  // HELD: remaining release delay (gust-scaled). SETTLED: remaining fade.
  private timers: Float32Array;
  private fallAges: Float32Array;
  private vTerms: Float32Array;
  private slipAmps: Float32Array;
  private slipFreqs: Float32Array;
  private slipPhases: Float32Array;
  private slipDirXs: Float32Array;
  private slipDirZs: Float32Array;
  private rockAmps: Float32Array;
  // Spiral-descent mode (~25% of petals): helical drift around the fall
  // axis. Radius 0 marks the ordinary gliding mode.
  private spiralRads: Float32Array;
  private spiralRates: Float32Array;
  private tumbleRates: Float32Array;
  private tiltX0s: Float32Array;
  private tiltZ0s: Float32Array;
  private yaw0s: Float32Array;
  private baseScales: Float32Array;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private tmp = new THREE.Vector3();
  private wind = new THREE.Vector3(0.16, 0, 0.05);
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
      this.meshes.push(mesh);
    }

    this.states = new Uint8Array(count);
    this.timers = new Float32Array(count);
    this.fallAges = new Float32Array(count);
    this.vTerms = new Float32Array(count);
    this.slipAmps = new Float32Array(count);
    this.slipFreqs = new Float32Array(count);
    this.slipPhases = new Float32Array(count);
    this.slipDirXs = new Float32Array(count);
    this.slipDirZs = new Float32Array(count);
    this.rockAmps = new Float32Array(count);
    this.spiralRads = new Float32Array(count);
    this.spiralRates = new Float32Array(count);
    this.tumbleRates = new Float32Array(count);
    this.tiltX0s = new Float32Array(count);
    this.tiltZ0s = new Float32Array(count);
    this.yaw0s = new Float32Array(count);
    this.baseScales = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      this.positions.push(new THREE.Vector3());
      this.velocities.push(new THREE.Vector3());
      this.rotations.push(new THREE.Euler());
      // Terminal fall speed: a low, tight band so the whole flock descends
      // at an unhurried, deliberate pace. Drag relaxes v.y toward this
      // instead of gravity accelerating without bound.
      this.vTerms[i] = this.rand(0.28, 0.55);
      // Falling-leaf side slip: long, slow lateral arcs perpendicular to
      // the descent (low frequency, larger amplitude), so the path reads
      // as gliding sweeps instead of jitter on top of the flow field.
      const slipAngle = this.rand(0, TAU);
      this.slipDirXs[i] = Math.cos(slipAngle);
      this.slipDirZs[i] = Math.sin(slipAngle);
      this.slipAmps[i] = this.rand(0.16, 0.3);
      this.slipFreqs[i] = this.rand(0.55, 1.1);
      this.slipPhases[i] = this.rand(0, TAU);
      this.rockAmps[i] = this.rand(0.55, 1.0);
      this.tumbleRates[i] = this.rand(0.25, 0.7) * (this.rng() < 0.5 ? -1 : 1);
      this.tiltX0s[i] = this.rand(-0.45, 0.45);
      this.tiltZ0s[i] = this.rand(-0.45, 0.45);
      this.yaw0s[i] = this.rand(0, TAU);
      // ~25% of petals descend in a slow helix around their fall axis; the
      // yaw follows the spiral rate so the petal faces along its arc, and
      // the plain side slip is damped so the helix stays clean.
      if (this.rng() < 0.25) {
        this.spiralRads[i] = this.rand(0.45, 0.95);
        this.spiralRates[i] =
          this.rand(0.7, 1.4) * (this.rng() < 0.5 ? -1 : 1);
        this.slipAmps[i] *= 0.35;
        this.tumbleRates[i] = this.spiralRates[i] * 0.9;
      } else {
        this.spiralRads[i] = 0;
        this.spiralRates[i] = 0;
      }
      this.baseScales[i] = this.rand(0.45, 0.95);
      // Same widened instance palette as the attached blossoms, so loose
      // petals match the canopy they fell from.
      sampleBlossomTint(this.rng, this.color);
      this.meshes[i % PETAL_VARIANT_COUNT].setColorAt(
        (i / PETAL_VARIANT_COUNT) | 0,
        this.color,
      );

      if (this.rng() < 0.6) {
        // Pre-seed part of the flock mid-fall so the scene is not empty at
        // load: drop each petal a random way down its own descent and shift
        // it downwind by the drift it would have accumulated.
        this.hold(i, 0);
        this.release(i);
        const p = this.positions[i];
        const drop =
          this.rng() * Math.max(0, p.y - PETAL_VOID_FADE_START - 0.2);
        const driftT = drop / this.vTerms[i];
        this.fallAges[i] = driftT;
        p.y -= drop;
        p.x += this.wind.x * this.rand(0.6, 1.6) * driftT;
        p.z += this.wind.z * this.rand(0.6, 1.6) * driftT;
        this.velocities[i].y = -this.vTerms[i] * this.rand(0.6, 1);
      } else {
        this.hold(i, this.rand(0.2, 6));
      }
    }

    for (const mesh of this.meshes) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      // Spawn from a real blossom cluster: nudged slightly outward from the
      // trunk axis and downward, like a petal separating from a corolla.
      const a = this.anchors[Math.floor(this.rng() * this.anchors.length)];
      const radial = Math.hypot(a.x, a.z) || 1;
      const out = this.rand(0.04, 0.2);
      p.set(
        a.x + (a.x / radial) * out + this.rand(-0.06, 0.06),
        a.y - this.rand(0.02, 0.16),
        a.z + (a.z / radial) * out + this.rand(-0.06, 0.06),
      );
    } else {
      const lobe = this.lobes[Math.floor(this.rng() * this.lobes.length)];
      const local = randomPointInUnitSphere(this.rng, this.tmp);
      local.multiplyScalar(0.75 + this.rng() * 0.35);
      p.set(
        lobe.center.x + local.x * lobe.radius.x,
        lobe.center.y + local.y * lobe.radius.y + this.rand(0.2, 0.8),
        lobe.center.z + local.z * lobe.radius.z,
      );
    }
    this.velocities[i].set(0, 0, 0);
    this.states[i] = PETAL_HELD;
    this.timers[i] = delay;
  }

  private release(i: number) {
    const p = this.positions[i];
    const v = this.velocities[i];
    // Gentle initial kick: outward from the trunk axis plus a slight drop.
    const radial = Math.hypot(p.x, p.z) || 1;
    const out = this.rand(0.02, 0.12);
    v.set(
      (p.x / radial) * out + this.rand(-0.03, 0.03),
      this.rand(-0.12, -0.02),
      (p.z / radial) * out + this.rand(-0.03, 0.03),
    );
    this.states[i] = PETAL_FALLING;
    this.fallAges[i] = 0;
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
    // Same gust envelope as the branch/blossom wind shaders, so airborne
    // petals drift harder exactly when the canopy leans.
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
      const r = this.rotations[i];
      const state = this.states[i];

      // 0..1 crest of the traveling front at this petal, squared to sharpen
      // the leading edge, folded with the global gust envelope.
      const wave =
        0.5 +
        0.5 *
          Math.sin(
            TAU * ((p.x * dirX + p.z * dirZ) * invWaveLen - wavePhaseT),
          );
      const gustHere = gust * (0.45 + 0.9 * wave * wave);

      if (state === PETAL_HELD) {
        // Detachment rides the front: held petals barely age while the crest
        // is elsewhere and shed in a sweep as it passes over their anchor.
        const releaseRate = 0.14 + Math.max(0, gustHere - 0.5) * 5.5;
        this.timers[i] -= dt * releaseRate;
        if (this.timers[i] <= 0) this.release(i);
      } else if (state === PETAL_FALLING) {
        const t = (this.fallAges[i] += dt);
        // One shared flow field for the whole flock: base wind stream plus
        // curl noise, both scaled by the local gust front.
        this.sampleFlow(p.x, p.z, windTime, gustHere);
        const airMul = 0.5 + gustHere * 3.4;
        let targetX = wind.x * airMul + this.flowX;
        let targetZ = wind.z * airMul + this.flowZ;
        let targetY = -this.vTerms[i] + this.flowY;

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
            targetY += Math.sin(helixPhase) * zone;
            targetX += dirZ * Math.cos(helixPhase) * zone;
            targetZ -= dirX * Math.cos(helixPhase) * zone;
          }
        }

        // Drag: relax toward the field velocity (same constants as before)
        // instead of integrating unbounded gravity.
        v.y += (targetY - v.y) * Math.min(1, 2.4 * dt);
        v.x += (targetX - v.x) * Math.min(1, 1.5 * dt);
        v.z += (targetZ - v.z) * Math.min(1, 1.5 * dt);
        p.addScaledVector(v, dt);

        // Falling-leaf side slip: long slow arcs perpendicular to the
        // descent. Spiral-mode petals add a helical drift around their
        // fall axis on top.
        const phase = this.slipFreqs[i] * t + this.slipPhases[i];
        const slipVel =
          this.slipAmps[i] * this.slipFreqs[i] * Math.cos(phase);
        let latVX = this.slipDirXs[i] * slipVel;
        let latVZ = this.slipDirZs[i] * slipVel;
        const spiralR = this.spiralRads[i];
        if (spiralR > 0) {
          const sPhase = this.spiralRates[i] * t + this.slipPhases[i];
          latVX += Math.cos(sPhase) * spiralR * this.spiralRates[i];
          latVZ -= Math.sin(sPhase) * spiralR * this.spiralRates[i];
        }
        p.x += latVX * dt;
        p.z += latVZ * dt;
        // Bank into the actual lateral velocity (flow drift + slip +
        // spiral): the card rolls about the axis perpendicular to where it
        // is really sliding, so rocking always matches the trajectory.
        const bank = this.rockAmps[i];
        r.set(
          this.tiltX0s[i] +
            THREE.MathUtils.clamp((v.z + latVZ) * bank, -0.85, 0.85),
          this.yaw0s[i] + this.tumbleRates[i] * t,
          this.tiltZ0s[i] -
            THREE.MathUtils.clamp((v.x + latVX) * bank, -0.85, 0.85),
          "XYZ",
        );

        // No ground: once a petal has fully dissolved below the tree base
        // (or drifted far out of frame), recycle it to a new anchor.
        if (
          Math.abs(p.x) > 11 ||
          Math.abs(p.z) > 9 ||
          p.y < PETAL_VOID_FADE_END
        ) {
          this.hold(i, this.rand(0.4, 4.5));
        }
      }

      // Fade in from zero over ~0.4s at release (so recycled petals never
      // pop into view), then a scale-out ramp as the petal sinks past the
      // tree base into the void.
      const stateNow = this.states[i];
      const voidFade = clamp01(
        (p.y - PETAL_VOID_FADE_END) /
          (PETAL_VOID_FADE_START - PETAL_VOID_FADE_END),
      );
      const s =
        stateNow === PETAL_FALLING
          ? this.baseScales[i] *
            smoothstep(0, 0.4, this.fallAges[i]) *
            voidFade
          : 0;

      this.quat.setFromEuler(r);
      this.scale.setScalar(s);
      this.matrix.compose(p, this.quat, this.scale);
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
    this.group.position.set(2.7, 0, 0);
    this.group.scale.set(0.92, 1.05, 0.84);
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
      branch.windLimbAmpLocal = 0;
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

        const flowerScale =
          this.rand(0.105, 0.155) *
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
          color,
          emissive: 1,
          phase: this.rand(0, TAU),
          flutter: this.rand(0.65, 1.35),
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
      applyBlossomWind(material, this.branchWindUniforms, this.blossomGrowth);
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
      const revealT = new Float32Array(count);
      const emissive = new Float32Array(count);

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
        revealT[i] = placement.revealT;
        emissive[i] = placement.emissive;
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
        "blossomRevealT",
        new THREE.InstancedBufferAttribute(revealT, 1),
      );
      geometry.setAttribute(
        "blossomEmissive",
        new THREE.InstancedBufferAttribute(emissive, 1),
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
}: BareThreeCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
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
      const sceneTarget = new THREE.WebGLRenderTarget(
        drawingBufferSize.x,
        drawingBufferSize.y,
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
      // All scene/camera/uniform objects above are preallocated once; the
      // per-frame path only issues the two render calls.
      const renderWithHalftone = () => {
        renderer.setRenderTarget(sceneTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(halftoneScene, halftoneCamera);
      };
      await reportSceneBuildProgress();

      // Stage lighting for the void: a dim, moody base so unlit bark never
      // clips to a pure-black mass, with the drama carried by three
      // directional accents below.
      const hemi = new THREE.HemisphereLight(0x2b2436, 0x0b0910, 0.5);
      scene.add(hemi);

      // Warm key from upper front-left: models the canopy and puts readable
      // highlights on the dark bark.
      const key = new THREE.DirectionalLight(0xffd9b4, 2.7);
      key.position.set(-6.5, 10.5, 7.5);
      scene.add(key);

      // Cool blue-violet rim from behind-right for silhouette separation
      // against the black backdrop.
      const rim = new THREE.DirectionalLight(0x8d84ff, 1.7);
      rim.position.set(6.5, 7.5, -9);
      scene.add(rim);

      // Low deep-rose glow from behind/below the canopy, echoing the
      // glowing-dark-canvas reference; it warms the underside of the
      // blossom clusters without lifting the void.
      const roseGlow = new THREE.PointLight(0xff4f8b, 18, 30, 2);
      roseGlow.position.set(2.7, 1.1, -4.5);
      scene.add(roseGlow);

      // Void backdrop: a smooth plum glow behind the tree. Kept smooth on
      // purpose — the halftone post-pass rasterizes the whole frame into
      // dots, so a dot grid baked into this texture would double-dither.
      // toneMapped stays false so the gradient's dark edge matches the clear
      // color exactly and the plane disappears into the void.
      const createVoidBackdrop = () => {
        const gradientCanvas = document.createElement("canvas");
        gradientCanvas.width = 256;
        gradientCanvas.height = 256;
        const gradientCtx = gradientCanvas.getContext("2d");
        if (!gradientCtx) return null;
        // Glow center matches where the canopy sits on the plane.
        const gradient = gradientCtx.createRadialGradient(
          128,
          112,
          8,
          128,
          112,
          158,
        );
        gradient.addColorStop(0, "#17101a");
        gradient.addColorStop(0.55, "#100c13");
        gradient.addColorStop(1, "#0a0a0a");
        gradientCtx.fillStyle = gradient;
        gradientCtx.fillRect(0, 0, 256, 256);
        const gradientTexture = new THREE.CanvasTexture(gradientCanvas);
        gradientTexture.colorSpace = THREE.SRGBColorSpace;
        const backdrop = new THREE.Mesh(
          new THREE.PlaneGeometry(110, 62),
          new THREE.MeshBasicMaterial({
            map: gradientTexture,
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
      const voidBackdrop = createVoidBackdrop();
      if (voidBackdrop) scene.add(voidBackdrop);
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
        const ndcX =
          ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ndcY =
          (0.5 - (event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
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
        sceneTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
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
        tree.blossomGrowth.value =
          prefersReducedMotion || introComplete
            ? 1
            : smoothstep(0.04, 0.88, easeOutCubic(introElapsed / introDuration));
        if (!prefersReducedMotion) {
          camera.position.x += pointerParallaxSmooth.x * 0.32;
          camera.position.y += pointerParallaxSmooth.y * 0.18;
          lookTarget.x += pointerParallaxSmooth.x * 0.16;
          lookTarget.y += pointerParallaxSmooth.y * 0.09;
        }
        camera.lookAt(lookTarget);
        renderWithHalftone();
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
        window.removeEventListener("pointerleave", onPointerLeave);
        window.removeEventListener("blur", onPointerLeave);
        finePointerQuery.removeEventListener(
          "change",
          onPointerCapabilityChange,
        );
        // The halftone pass lives outside the main scene graph, so the
        // traversal below never reaches it — dispose it explicitly.
        sceneTarget.dispose();
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
