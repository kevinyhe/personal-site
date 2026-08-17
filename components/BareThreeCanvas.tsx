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
const TREE_BASE_X = 2.7;
const TREE_BASE_Z = 0;
const GROUND_RADIUS = 15;
const MOUND_HEIGHT = 1.78;
const MOUND_DOWNSLOPE_DEPTH = 1.25;
// Hero composition: the tree is the centerpiece. The camera target sits on
// the tree axis (world x ~2.6) so the canopy reads near-centered with a
// little headroom above the crown; the mossy ground stays in the lower
// quarter of the frame so the name across the bottom ~22% of the viewport
// reads over calm ground rather than moving canopy.
const FINAL_CAMERA_POSITION = new THREE.Vector3(2.9, 6.6, 16.4);
const INTRO_CAMERA_POSITION = new THREE.Vector3(10.4, 11.6, 18.0);
const HERO_CAMERA_TARGET = new THREE.Vector3(2.55, 4.95, 0);
const HERO_CAMERA_FOV = 42;
const PETAL_SURFACE_NORMAL = new THREE.Vector3(0, 0, 1);
const TREE_SHADOW_DIRECTION = new THREE.Vector2(1, -0.28).normalize();

type BareThreeCanvasProps = {
  introActive?: boolean;
  onIntroComplete?: () => void;
  onReady?: () => void;
  onProgress?: (progress: { loaded: number; total: number }) => void;
};

export const SCENE_BUILD_MILESTONE_TOTAL = 11;

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

function getGroundRadiusAtAngle(angle: number) {
  return (
    GROUND_RADIUS *
    (1 +
      Math.sin(angle * 2.0 + 0.4) * 0.075 +
      Math.cos(angle * 3.0 - 0.9) * 0.055 +
      Math.sin(angle * 5.0 + 1.7) * 0.035)
  );
}

function getGroundHeight(x: number, z: number) {
  const dx = x - TREE_BASE_X;
  const dz = z - TREE_BASE_Z;
  const r = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const angleNoise =
    fbm2(Math.cos(angle) * 1.8 + 4.4, Math.sin(angle) * 1.8 - 6.8, 3) - 0.5;
  const directionalWarp = Math.max(
    0.74,
    Math.min(
      1.32,
      1 +
        Math.sin(angle * 2.0 + 0.72) * 0.18 +
        Math.cos(angle * 3.4 - 0.6) * 0.12 +
        angleNoise * 0.22,
    ),
  );
  const edgeRadius = getGroundRadiusAtAngle(angle);
  const shapedR = r * directionalWarp;
  const mound = MOUND_HEIGHT * (1 - smoothstep(0.32, 11.8, shapedR));
  const shoulder =
    smoothstep(2.2, 7.4, shapedR) *
    (1 - smoothstep(edgeRadius * 0.52, edgeRadius * 0.96, shapedR)) *
    0.18;
  const noiseMask =
    smoothstep(1.15, 5.8, r) *
    (1 - smoothstep(edgeRadius * 0.72, edgeRadius * 0.98, r));
  const broadRoll =
    (fbm2(x * 0.06 + 20.4, z * 0.06 - 4.1) - 0.5) * 0.18 * noiseMask;
  const fineRoll =
    (fbm2(x * 0.2 - 3.7, z * 0.2 + 8.2) - 0.5) * 0.055 * noiseMask;
  // Fine surface detail: soft micro-relief plus small hummocks, so the mound
  // reads as packed soil under moss instead of a smooth dome. Total added
  // amplitude stays under +-0.05 so twig strands (clamped to ground + 0.34)
  // can never be submerged between clamp samples.
  const microRelief =
    (fbm2(x * 0.52 + 14.2, z * 0.52 - 7.3, 3) - 0.5) * 0.06 * noiseMask;
  const hummocks =
    (valueNoise2(x * 0.95 + 3.3, z * 0.95 + 6.1) - 0.5) * 0.026 * noiseMask;
  const ridgeVariation =
    (Math.sin(angle * 3.1 + r * 0.44) * 0.11 +
      Math.cos(angle * 5.2 - r * 0.23) * 0.07 +
      (fbm2(x * 0.13 - 9.1, z * 0.13 + 2.6, 4) - 0.5) * 0.2) *
    noiseMask;
  const rateVariation = Math.max(
    0.72,
    Math.min(
      1.34,
      1 +
        Math.sin(angle * 2.7 - 0.35) * 0.18 +
        Math.cos(angle * 4.6 + 1.1) * 0.1 +
        (fbm2(x * 0.08 + 1.7, z * 0.08 - 12.0, 3) - 0.5) * 0.32,
    ),
  );
  const downslope =
    smoothstep(1.2, edgeRadius * 0.88, shapedR) *
    MOUND_DOWNSLOPE_DEPTH *
    rateVariation;
  const edgeSettle = smoothstep(edgeRadius * 0.82, edgeRadius, r) * 0.22;
  return (
    mound +
    shoulder +
    broadRoll +
    fineRoll +
    microRelief +
    hummocks +
    ridgeVariation -
    downslope -
    edgeSettle -
    0.02
  );
}

function getGroundNormal(x: number, z: number, target = new THREE.Vector3()) {
  const step = 0.22;
  const left = getGroundHeight(x - step, z);
  const right = getGroundHeight(x + step, z);
  const back = getGroundHeight(x, z - step);
  const front = getGroundHeight(x, z + step);
  return target.set(left - right, step * 2, back - front).normalize();
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

        const heightTone = smoothstep(0.2, 6.6, this.point.y);
        const grooveTone = smoothstep(-0.06, 0.08, -ridge);
        this.barkColor.setHSL(
          0.055 + Math.sin(this.point.x * 3.1 + this.point.z * 2.7) * 0.008,
          THREE.MathUtils.clamp(0.29 - depthFactor * 0.1, 0.12, 0.32),
          THREE.MathUtils.clamp(
            0.055 + heightTone * 0.07 + depthFactor * 0.04 - grooveTone * 0.035,
            0.035,
            0.18,
          ),
        );
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
      const capLightness = depth === 0 && t === 0 ? 0.085 : 0.07;
      this.barkColor.setHSL(0.055, 0.25, capLightness + depthFactor * 0.035);
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
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
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
      `,
    );
  };

  material.customProgramCacheKey = () => "branch-wind-v7";
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
    shader.uniforms.uBlossomGrowth = growthUniform;
    shader.vertexShader =
      `
        attribute vec4 blossomWindParams1;
        attribute vec4 blossomWindParams2;
        attribute float blossomPhase;
        attribute float blossomFlutter;
        attribute float blossomRevealT;
        uniform float uBlossomGrowth;
      ` +
      WIND_SHADER_CHUNK +
      shader.vertexShader;

    // Flower-local motion only; the anchor wind displacement is applied
    // after instanceMatrix (below) so it matches the branch mesh exactly.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
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
          0.45 * sin(uWindTime * 4.3 + blossomPhase * 1.7));
      float swingB =
        swing * 0.7 * sin(uWindTime * 3.4 + blossomPhase * 2.3 + 1.1);
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
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `,
    );
  };

  material.customProgramCacheKey = () => "blossom-wind-v8";
}

// Sakura palette shared by attached blossoms, falling petals and the carpet:
// near-white petal edges, soft pink mid petal, deeper pink base, and a
// magenta-crimson flower center / calyx.
const PETAL_EDGE_COLOR = new THREE.Color("#fdeef2");
const PETAL_MID_COLOR = new THREE.Color("#f7cdd8");
const PETAL_BASE_COLOR = new THREE.Color("#e88fa8");
const BLOSSOM_CENTER_COLOR = new THREE.Color("#c22e63");
const BLOSSOM_CALYX_COLOR = new THREE.Color("#a13d5d");
const PEDICEL_BASE_COLOR = new THREE.Color("#6f7b4c");
const PEDICEL_TIP_COLOR = new THREE.Color("#7d5560");
const STAMEN_FILAMENT_COLOR = new THREE.Color("#f6dce4");
const STAMEN_ANTHER_COLOR = new THREE.Color("#edd28c");

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
function createSakuraBlossomGeometry() {
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

  // Five petals, each a 4x4-quad grid: cupped toward the flower center,
  // gently ruffled, wide enough to overlap neighbours, alternating z-tilt
  // so the overlaps layer instead of z-fighting.
  const petalRows = 4;
  const petalCols = 4;
  const petalLength = 0.5;
  const petalRootRadius = 0.055;
  const petalMaxHalfWidth = 0.27;
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
        const cupLength = 0.11 * vv * vv;
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
    const spokes = 6;
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
  // pale filaments with soft yellow anther tips.
  for (let s = 0; s < 5; s += 1) {
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

function createBarkTextures() {
  const width = 256;
  const height = 512;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  bumpCanvas.width = width;
  bumpCanvas.height = height;

  const colorContext = colorCanvas.getContext("2d");
  const bumpContext = bumpCanvas.getContext("2d");
  if (!colorContext || !bumpContext) {
    // Canvas 2D unavailable: hand back a 1x1 mid-bark texture so the
    // branches still render dark bark instead of the bare (near-white)
    // material color.
    const fallback = new THREE.DataTexture(new Uint8Array([84, 68, 60, 255]));
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.needsUpdate = true;
    return { colorMap: fallback, bumpMap: null };
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
  const lenticelRng = makeRng(0xba7c11);
  const lenticels: {
    vCenter: number;
    uCenter: number;
    uHalfLength: number;
    vSigma: number;
    strength: number;
  }[] = [];
  for (let i = 0; i < 15; i += 1) {
    lenticels.push({
      vCenter: lenticelRng(),
      uCenter: lenticelRng(),
      uHalfLength: 0.13 + lenticelRng() * 0.2,
      vSigma: 0.005 + lenticelRng() * 0.005,
      strength: 0.7 + lenticelRng() * 0.3,
    });
  }

  // Bark color ramp stops (sRGB bytes): purple-brown shadow, warm
  // gray-brown mid, slightly desaturated highlight. The mid stop is shared
  // by both halves of the ramp so the transition stays continuous.
  const rampShadow = [48, 35, 41];
  const rampMid = [108, 88, 76];
  const rampHighlight = [154, 140, 128];

  const colorImage = colorContext.createImageData(width, height);
  const bumpImage = bumpContext.createImageData(width, height);
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
      const vertical = clamp01((verticalRaw - 0.5) * 1.55 + 0.5);
      const fineGrain = fbmWrapU(u, 96.0, -6.8, v * 32.0 + 2.4, 3);
      const fissure =
        smoothstep(0.58, 0.88, vertical) *
        (0.65 + smoothstep(0.55, 0.82, fineGrain) * 0.35);
      const knot =
        Math.exp(
          -(
            Math.pow((u - 0.34 - Math.sin(v * 3.0) * 0.08) / 0.095, 2) +
            Math.pow((v - 0.38) / 0.052, 2)
          ),
        ) *
          0.45 +
        Math.exp(
          -(
            Math.pow((u - 0.72 + Math.sin(v * 2.7) * 0.05) / 0.12, 2) +
            Math.pow((v - 0.68) / 0.07, 2)
          ),
        ) *
          0.34;
      const ridge = clamp01(
        0.42 + vertical * 0.45 + fineGrain * 0.18 - fissure * 0.32,
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

      const bump = clamp01(
        0.42 +
          ridge * 0.42 -
          fissure * 0.46 +
          knot * 0.18 +
          lenticelCore * 0.3 -
          lenticelRim * 0.08,
      );

      // Horizontal peeling bands (slow in u, fast in v), a cherry-bark cue.
      const peelBand = fbmWrapU(u, 1.6, 7.7, v * 26.0, 2) - 0.5;
      // Crevice occlusion baked into the color so fissures still read
      // where bump nuance is lost (distance, software rendering). The
      // coefficients here are tuned as a pair with the bump mix above:
      // retune both together or the albedo shading drifts from the relief.
      const shade =
        clamp01(
          0.5 + ridge * 0.5 - fissure * 0.48 + knot * 0.13 + peelBand * 0.2,
        ) *
        (0.5 + 0.5 * bump);

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

      // Faint algae in the damp crevices.
      const algae =
        smoothstep(0.55, 0.8, fbmWrapU(u, 2.2, -4.3, v * 1.6 + 11.0, 2)) *
        smoothstep(0.25, 0.7, fissure) *
        0.45;
      r = lerp(r, 72, algae);
      g = lerp(g, 92, algae);
      b = lerp(b, 56, algae);

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
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  // Integer u repeat: the map is periodic in u, and a whole number of
  // repeats keeps that periodicity intact across the tube seam.
  colorMap.repeat.set(3, 1.9);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.copy(colorMap.repeat);
  return { colorMap, bumpMap };
}

// A single loose petal (falling + ground carpet): same obcordate outline
// with the tip notch and the same base->edge color gradient as the petals
// on the attached flowers. Lies in the xy plane along +y, normal +z.
function createFallingPetalGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lengthSegments = 4;
  const widthSegments = 4;
  const petalLength = 0.26;
  const maxHalfWidth = 0.1;
  const color = new THREE.Color();

  for (let i = 0; i <= lengthSegments; i += 1) {
    const vv = i / lengthSegments;
    for (let j = 0; j <= widthSegments; j += 1) {
      const uu = j / widthSegments;
      const outline = sakuraPetalOutline(uu, vv);
      const x = outline.lateral * maxHalfWidth;
      const y = (outline.radial - 0.5) * petalLength;
      // Slightly deeper lengthwise cup + lateral curl than a flat card, so a
      // tumbling petal reads as a 3D shell as it rocks through the light.
      const z =
        Math.sin(Math.PI * vv) * 0.028 +
        outline.xu * outline.xu * 0.022 * (0.3 + vv * 0.7);
      positions.push(x, y, z);
      uvs.push(uu, vv);
      getPetalVertexColor(color, outline.xu, vv);
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
// side-slip and rocking) -> SETTLED (landed on the mound, brief fade, then
// recycled to a new anchor). All per-petal parameters are precomputed at
// construction; update() allocates nothing.
const PETAL_HELD = 0;
const PETAL_FALLING = 1;
const PETAL_SETTLED = 2;

class FallingPetalSystem {
  mesh: THREE.InstancedMesh;
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
  private tumbleRates: Float32Array;
  private tiltX0s: Float32Array;
  private tiltZ0s: Float32Array;
  private yaw0s: Float32Array;
  private fadeDurs: Float32Array;
  private baseScales: Float32Array;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private tmp = new THREE.Vector3();
  private wind = new THREE.Vector3(0.16, 0, 0.05);

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
    this.mesh = new THREE.InstancedMesh(
      createFallingPetalGeometry(),
      material,
      count,
    );
    this.mesh.frustumCulled = false;

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
    this.tumbleRates = new Float32Array(count);
    this.tiltX0s = new Float32Array(count);
    this.tiltZ0s = new Float32Array(count);
    this.yaw0s = new Float32Array(count);
    this.fadeDurs = new Float32Array(count);
    this.baseScales = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      this.positions.push(new THREE.Vector3());
      this.velocities.push(new THREE.Vector3());
      this.rotations.push(new THREE.Euler());
      // Terminal fall speed: light petals drift down slowly, heavier ones
      // a little faster. Drag relaxes v.y toward this instead of gravity
      // accelerating without bound.
      this.vTerms[i] = this.rand(0.35, 0.75);
      // Falling-leaf side slip: lateral oscillation perpendicular to the
      // descent, with its own direction, amplitude, and tempo per petal.
      const slipAngle = this.rand(0, TAU);
      this.slipDirXs[i] = Math.cos(slipAngle);
      this.slipDirZs[i] = Math.sin(slipAngle);
      this.slipAmps[i] = this.rand(0.12, 0.34);
      this.slipFreqs[i] = this.rand(1.2, 2.6);
      this.slipPhases[i] = this.rand(0, TAU);
      this.rockAmps[i] = this.rand(0.35, 0.8);
      this.tumbleRates[i] = this.rand(0.4, 1.3) * (this.rng() < 0.5 ? -1 : 1);
      this.tiltX0s[i] = this.rand(-0.7, 0.7);
      this.tiltZ0s[i] = this.rand(-0.7, 0.7);
      this.yaw0s[i] = this.rand(0, TAU);
      this.fadeDurs[i] = this.rand(0.8, 1.6);
      // Trimmed to stay size-coherent with the smaller ground carpet.
      this.baseScales[i] = this.rand(0.45, 0.95);
      this.color.set(this.pickColor());
      this.mesh.setColorAt(i, this.color);

      if (this.rng() < 0.6) {
        // Pre-seed part of the flock mid-fall so the scene is not empty at
        // load: drop each petal a random way down its own descent and shift
        // it downwind by the drift it would have accumulated.
        this.hold(i, 0);
        this.release(i);
        const p = this.positions[i];
        const groundY = this.groundLocalY(p);
        const drop = this.rng() * Math.max(0, p.y - groundY - 0.2);
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

    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.update(0);
  }

  private rand(min: number, max: number) {
    return min + (max - min) * this.rng();
  }

  private pickColor() {
    const colors = ["#fff7fa", "#ffe8f0", "#ffd6e5", "#f7b8cc", "#ffffff"];
    return colors[Math.floor(this.rng() * colors.length)];
  }

  // Petal positions are tree-group-local. The group is placed at (2.7, 0, 0)
  // with scale (0.92, 1.05, 0.84) in generate() -- keep these in sync -- and
  // getGroundHeight() works in world space, so convert both ways.
  private groundLocalY(p: THREE.Vector3) {
    return getGroundHeight(2.7 + p.x * 0.92, p.z * 0.84) / 1.05;
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

  private settle(i: number, groundY: number) {
    this.positions[i].y = groundY + 0.015;
    this.velocities[i].set(0, 0, 0);
    // Lie roughly flat on the mound (geometry normal is +z; x-rotation of
    // -90deg turns it up) with a random resting tilt and heading. YXZ order
    // applies the flatten before the heading spin -- with the default XYZ
    // the full-circle y component would tip the petal onto its edge.
    this.rotations[i].set(
      -Math.PI / 2 + this.rand(-0.35, 0.35),
      this.rand(0, TAU),
      this.rand(-0.25, 0.25),
      "YXZ",
    );
    this.states[i] = PETAL_SETTLED;
    this.timers[i] = this.fadeDurs[i];
  }

  update(dt: number, windTime = 0, windStrength = 1) {
    const wind = this.wind;
    const count = this.positions.length;
    // Same gust envelope as the branch/blossom wind shaders, so airborne
    // petals drift harder exactly when the canopy leans.
    const gust = arborGustEnvelope(windTime, 0) * windStrength;
    // Detachment clusters into gusts: held petals barely age while the air
    // is calm and shed in bursts when the envelope peaks.
    const releaseRate = 0.22 + Math.max(0, gust - 0.55) * 4.5;
    // Gust-coupled drift target the horizontal velocity relaxes toward
    // (bounded, unlike raw acceleration).
    const airX = wind.x * (0.5 + gust * 3.4);
    const airZ = wind.z * (0.5 + gust * 3.4);

    for (let i = 0; i < count; i += 1) {
      const p = this.positions[i];
      const v = this.velocities[i];
      const r = this.rotations[i];
      const state = this.states[i];

      if (state === PETAL_HELD) {
        this.timers[i] -= dt * releaseRate;
        if (this.timers[i] <= 0) this.release(i);
      } else if (state === PETAL_FALLING) {
        const t = (this.fallAges[i] += dt);
        // Drag: relax toward this petal's terminal velocity and the gusty
        // air stream (plus a small per-petal flutter) instead of integrating
        // unbounded gravity.
        v.y += (-this.vTerms[i] - v.y) * Math.min(1, 2.4 * dt);
        const targetX = airX + Math.sin(windTime * 0.4 + i * 0.73) * 0.07;
        const targetZ = airZ + Math.cos(windTime * 0.5 + i * 0.49) * 0.05;
        v.x += (targetX - v.x) * Math.min(1, 1.5 * dt);
        v.z += (targetZ - v.z) * Math.min(1, 1.5 * dt);
        p.addScaledVector(v, dt);

        // Falling-leaf side slip perpendicular to the descent, with the
        // rocking rotation phase-locked to the slip velocity and one slow
        // tumble axis on top.
        const phase = this.slipFreqs[i] * t + this.slipPhases[i];
        const slipVel =
          this.slipAmps[i] * this.slipFreqs[i] * Math.cos(phase);
        p.x += this.slipDirXs[i] * slipVel * dt;
        p.z += this.slipDirZs[i] * slipVel * dt;
        const rock = this.rockAmps[i] * Math.cos(phase);
        // Explicit order: Euler.set keeps the previous order otherwise, and
        // settle() switches this euler to YXZ.
        r.set(
          this.tiltX0s[i] + rock * this.slipDirZs[i],
          this.yaw0s[i] + this.tumbleRates[i] * t,
          this.tiltZ0s[i] - rock * this.slipDirXs[i],
          "XYZ",
        );

        // Ground contact. The mound crests near y=2 world, so the height
        // field only needs sampling once a petal is low enough to matter.
        if (p.y < 2.2) {
          const groundY = this.groundLocalY(p);
          if (p.y <= groundY + 0.02) this.settle(i, groundY);
        }
        if (
          this.states[i] === PETAL_FALLING &&
          (Math.abs(p.x) > 11 || Math.abs(p.z) > 9 || p.y < -2.5)
        ) {
          this.hold(i, this.rand(0.4, 4.5));
        }
      } else {
        // Settled: brief fade (scale shrink), then recycle to a new anchor.
        this.timers[i] -= dt;
        if (this.timers[i] <= 0) this.hold(i, this.rand(0.4, 4.5));
      }

      const stateNow = this.states[i];
      const s =
        stateNow === PETAL_FALLING
          ? this.baseScales[i] *
            Math.min(1, 0.15 + this.fallAges[i] * 3)
          : stateNow === PETAL_SETTLED
            ? this.baseScales[i] *
              Math.max(0, this.timers[i] / this.fadeDurs[i])
            : 0;

      this.quat.setFromEuler(r);
      this.scale.setScalar(s);
      this.matrix.compose(p, this.quat, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class WeepingCherryGenerator {
  group = new THREE.Group();
  branchMesh: THREE.Mesh | null = null;
  blossomMesh: THREE.InstancedMesh | null = null;
  budMesh: THREE.InstancedMesh | null = null;
  petals: FallingPetalSystem | null = null;
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
    this.keepStrandsAboveGround();
    this.computeWindChains(trunk);
    this.buildBranchMesh();
    this.buildBlossomMeshes();
    this.buildPetals();

    if (this.options.showDebugLobes) this.addDebugLobes();
    return {
      group: this.group,
      branchMesh: this.branchMesh,
      blossomMesh: this.blossomMesh,
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

  // Safety net for the lengthened weeping strands: no drooping twig point
  // may dip below the ground + petal carpet, regardless of how far droop and
  // sagging pushed it. Runs before wind chains and blossom placement so
  // spurs inherit the corrected curves. Works in world space because the
  // tree group is translated and non-uniformly scaled.
  private keepStrandsAboveGround() {
    const groupPosition = this.group.position;
    const groupScale = this.group.scale;
    const clearance = 0.34;
    for (const branch of this.branches) {
      if (branch.depth < 4) continue;
      let changed = false;
      for (const point of branch.curve.points) {
        const worldX = groupPosition.x + point.x * groupScale.x;
        const worldZ = groupPosition.z + point.z * groupScale.z;
        const floorLocal =
          (getGroundHeight(worldX, worldZ) + clearance - groupPosition.y) /
          groupScale.y;
        if (point.y < floorLocal) {
          point.y = floorLocal;
          changed = true;
        }
      }
      if (changed) branch.curve.updateArcLengths();
    }
  }

  private buildBranchMesh() {
    const builder = new BranchGeometryBuilder();
    for (const branch of this.branches) builder.append(branch);
    const geometry = builder.build();
    const textures = createBarkTextures();
    const material = new THREE.MeshStandardMaterial({
      bumpMap: textures.bumpMap ?? undefined,
      bumpScale: 0.12,
      color: 0xcfc9c4,
      map: textures.colorMap ?? undefined,
      metalness: 0,
      roughness: 0.86,
    });
    this.branchWindUniforms = applyBranchWind(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Attached cherry branch structure";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.branchMesh = mesh;
    this.group.add(mesh);
  }

  // Every blossom sits ON a twig: spur points are sampled along terminal
  // twig curves (tip-biased, cherry style), and each spur carries a cluster
  // of 3-6 flowers/buds whose geometry pedicels start exactly at the spur.
  // No canopy-lobe scatter — the lobes only steered branch growth.
  private createBlossomPlacements() {
    const flowers: BlossomPlacement[] = [];
    const buds: BlossomPlacement[] = [];
    const terminals = this.branches.filter(
      (branch) => branch.terminal && branch.lobeId >= 0,
    );
    if (terminals.length === 0) return { flowers, buds };

    const totalOverride = this.options.blossomCount;
    const flowerTarget =
      totalOverride != null
        ? Math.max(1, Math.round(totalOverride * 0.7))
        : this.quality === "low"
          ? 5400
          : this.quality === "medium"
            ? 10400
            : 17200;
    const budTarget =
      totalOverride != null
        ? Math.max(0, totalOverride - flowerTarget)
        : this.quality === "low"
          ? 2200
          : this.quality === "medium"
            ? 4100
            : 6800;

    // Weight twigs by length so spurs land evenly along the fine strands,
    // with a mild bias toward the finest drooping orders.
    const cumulative: number[] = [];
    let totalWeight = 0;
    for (const branch of terminals) {
      const lobe = this.lobes[branch.lobeId];
      const depthBias =
        branch.depth >= 6 ? 1.5 : branch.depth === 5 ? 1.3 : 1;
      totalWeight += branch.curve.getLength() * lobe.density * depthBias;
      cumulative.push(totalWeight);
    }

    const pickTerminal = () => {
      const roll = this.rng() * totalWeight;
      let low = 0;
      let high = cumulative.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (roll <= cumulative[mid]) high = mid;
        else low = mid + 1;
      }
      return terminals[low];
    };

    const zAxis = new THREE.Vector3(0, 0, 1);
    const outward = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const roll = new THREE.Quaternion();
    const budFraction = budTarget / Math.max(1, budTarget + flowerTarget);

    // Places one spur cluster (3-6 flowers/buds) on `branch` at curve
    // parameter t. Shared by the per-strand guarantee pass and the
    // tip-biased weighted fill below; both respect the flower/bud budgets.
    const placeCluster = (branch: Branch, t: number) => {
      const frame = getBranchFrame(branch, t);
      const wind = getBranchWindVectors(branch, t);
      const lobe = this.lobes[branch.lobeId];
      const clusterSize = this.int(3, 6);
      const baseAzimuth = this.rand(0, TAU);

      for (let k = 0; k < clusterSize; k += 1) {
        const wantBud =
          buds.length < budTarget &&
          (flowers.length >= flowerTarget || this.rng() < budFraction);
        if (!wantBud && flowers.length >= flowerTarget) continue;

        const azimuth =
          baseAzimuth + (k / clusterSize) * TAU + this.rand(-0.55, 0.55);
        outward
          .copy(frame.normal)
          .multiplyScalar(Math.cos(azimuth))
          .addScaledVector(frame.binormal, Math.sin(azimuth));
        // Cherry blossoms hang: mostly outward, clearly downward, jittered.
        dir
          .copy(outward)
          .multiplyScalar(this.rand(0.5, 0.9))
          .addScaledVector(DOWN, this.rand(0.45, 1.15))
          .addScaledVector(frame.tangent, this.rand(-0.12, 0.3))
          .addScaledVector(this.randomVector(0.6), 0.12)
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
          position: frame.point
            .clone()
            .addScaledVector(outward, frame.radius * 0.7),
          quaternion,
          scale: flowerScale,
          wind1: wind.wind1,
          wind2: wind.wind2,
          revealT: clamp01(t * 0.5 + this.rand(0, 0.4)) * 0.7,
          color,
          phase: this.rand(0, TAU),
          flutter: this.rand(0.65, 1.35),
        };

        if (wantBud) {
          placement.scale = flowerScale * this.rand(0.52, 0.72);
          color
            .set("#e2679c")
            .lerp(new THREE.Color("#c94a7f"), this.rng())
            .offsetHSL(this.rand(-0.01, 0.01), 0, this.rand(-0.04, 0.04));
          buds.push(placement);
        } else {
          const tintRoll = this.rng();
          const tint =
            tintRoll < 0.08 + lobe.colorBias * 0.5
              ? "#f2b3cb"
              : tintRoll < 0.4
                ? "#ffdfe9"
                : "#ffffff";
          color
            .set(tint)
            .lerp(new THREE.Color("#ffffff"), this.rand(0, 0.35))
            .offsetHSL(this.rand(-0.008, 0.008), 0, this.rand(-0.02, 0.03));
          flowers.push(placement);
        }
      }
    };

    // Guarantee pass: every terminal strand gets one mid-strand cluster
    // before the tip-biased fill, so short interior strands never read as
    // bare wires with 2-3 blossoms at the tip. Shuffled and budget-capped so
    // lower quality tiers thin uniformly and the dense outer clusters donate
    // the budget.
    const shuffledTerminals = [...terminals];
    for (let i = shuffledTerminals.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffledTerminals[i], shuffledTerminals[j]] = [
        shuffledTerminals[j],
        shuffledTerminals[i],
      ];
    }
    const guaranteeCap = Math.floor((flowerTarget + budTarget) * 0.6);
    for (const branch of shuffledTerminals) {
      if (flowers.length + buds.length >= guaranteeCap) break;
      placeCluster(branch, this.rand(0.3, 0.9));
    }

    let guard = (flowerTarget + budTarget) * 30;
    while (
      (flowers.length < flowerTarget || buds.length < budTarget) &&
      guard-- > 0
    ) {
      // Spur position along the twig, concentrated toward the tip.
      placeCluster(pickTerminal(), 1 - Math.pow(this.rng(), 1.55) * 0.88);
    }

    return { flowers, buds };
  }

  // Two InstancedMeshes (open flowers + closed buds) sharing one material.
  // Per-instance wind: each blossom bakes the branch wind vec4 pair
  // evaluated at its spur t (see getBranchWindVectors), so the shader
  // reproduces the exact displacement of the twig point it grows from.
  private buildBlossomMeshes() {
    const { flowers, buds } = this.createBlossomPlacements();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffc9d9,
      emissiveIntensity: 0.12,
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
      color: 0xffe3ed,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      roughness: 0.65,
      vertexColors: true,
    });
    // Detachment anchors sampled from the real blossom instances (group-local
    // positions), so loose petals materialize at actual cluster points and
    // automatically track any change in blossom density. Lobes remain the
    // fallback when no blossoms were built.
    const anchors: THREE.Vector3[] = [];
    const blossoms = this.blossomMesh;
    if (blossoms && blossoms.count > 0) {
      const anchorMatrix = new THREE.Matrix4();
      const sampleCount = Math.min(blossoms.count, count * 2);
      for (let i = 0; i < sampleCount; i += 1) {
        const index = Math.floor(this.rng() * blossoms.count);
        blossoms.getMatrixAt(index, anchorMatrix);
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
    this.group.add(this.petals.mesh);
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

function createMossTextures() {
  const size = 256;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;

  const colorContext = colorCanvas.getContext("2d");
  const bumpContext = bumpCanvas.getContext("2d");
  if (!colorContext || !bumpContext) {
    return { colorMap: null, bumpMap: null };
  }

  const colorImage = colorContext.createImageData(size, size);
  const bumpImage = bumpContext.createImageData(size, size);
  const colors = {
    dark: [22, 48, 31],
    lush: [62, 100, 48],
    yellowGreen: [104, 118, 46], // hue ~0.23, sunlit dry moss
    blueGreen: [36, 82, 64], // hue ~0.34, shaded damp moss
    gold: [112, 126, 55],
    earth: [58, 48, 33],
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      // Multi-scale clumping: a low-frequency mask separates lush moss
      // tufts from earthy gaps; medium-frequency patches drift the hue
      // between yellow-green and blue-green; fiber and speckle keep the
      // fine filament detail. The mask is kept subtle here because this
      // texture tiles 7.5x across the mound — the strong non-repeating
      // clump variation lives in the mound's vertex colors instead.
      const clump = fbm2(u * 4.6 + 9.3, v * 4.6 - 5.6, 4);
      const clumpMask = smoothstep(0.34, 0.62, clump);
      const broad = fbm2(u * 5.4 + 6.7, v * 5.4 - 3.1, 5);
      const patch = fbm2(u * 12.0 - 2.3, v * 12.0 + 8.9, 4);
      const huePatch = fbm2(u * 7.2 + 3.3, v * 7.2 - 12.1, 4);
      const fiber = fbm2(u * 42.0 + 4.1, v * 42.0 - 7.8, 3);
      const speckle = valueNoise2(u * 118.0, v * 118.0);
      const wet = fbm2(u * 8.0 + 11.4, v * 8.0 + 1.6, 4);
      const yellowMix = smoothstep(0.56, 0.8, huePatch) * 0.5;
      const blueMix = (1 - smoothstep(0.3, 0.52, huePatch)) * 0.46;
      const goldMix = smoothstep(0.6, 0.86, patch) * 0.22;
      const earthMix = clamp01(
        (1 - clumpMask) * 0.3 + smoothstep(0.68, 0.92, wet) * 0.36,
      );
      const shade =
        (0.77 + fiber * 0.34 + speckle * 0.12) * (0.94 + clumpMask * 0.09);
      const index = (y * size + x) * 4;
      let red = lerp(colors.dark[0], colors.lush[0], broad);
      let green = lerp(colors.dark[1], colors.lush[1], broad);
      let blue = lerp(colors.dark[2], colors.lush[2], broad);
      red = lerp(red, colors.yellowGreen[0], yellowMix);
      green = lerp(green, colors.yellowGreen[1], yellowMix);
      blue = lerp(blue, colors.yellowGreen[2], yellowMix);
      red = lerp(red, colors.blueGreen[0], blueMix);
      green = lerp(green, colors.blueGreen[1], blueMix);
      blue = lerp(blue, colors.blueGreen[2], blueMix);
      red = lerp(red, colors.gold[0], goldMix);
      green = lerp(green, colors.gold[1], goldMix);
      blue = lerp(blue, colors.gold[2], goldMix);
      red = lerp(red, colors.earth[0], earthMix);
      green = lerp(green, colors.earth[1], earthMix);
      blue = lerp(blue, colors.earth[2], earthMix);
      colorImage.data[index] = Math.min(255, red * shade);
      colorImage.data[index + 1] = Math.min(255, green * shade);
      colorImage.data[index + 2] = Math.min(255, blue * shade);
      colorImage.data[index + 3] = 255;

      // Tufts stand proud of the earthy gaps; extra contrast around the
      // midpoint keeps the fibers crisp.
      const rawHeight =
        fiber * 0.4 + patch * 0.2 + speckle * 0.14 + clumpMask * 0.26;
      const height = Math.floor(
        255 * clamp01((rawHeight - 0.5) * 1.35 + 0.5),
      );
      bumpImage.data[index] = height;
      bumpImage.data[index + 1] = height;
      bumpImage.data[index + 2] = height;
      bumpImage.data[index + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(7.5, 7.5);
  colorMap.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(12, 12);
  bumpMap.needsUpdate = true;

  return { colorMap, bumpMap };
}

function createMossCardAlphaTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const centered = Math.abs(u - 0.5) * (1.35 + v * 1.2);
      const sideFray = valueNoise2(u * 18.0 + 2.1, v * 18.0 - 4.2) * 0.18;
      const blade = 1 - smoothstep(0.22 + sideFray, 0.52, centered);
      const vertical =
        smoothstep(0.02, 0.26, v) * (1 - smoothstep(0.78, 1.0, v));
      const value = Math.floor(255 * clamp01(blade * vertical));
      const index = (y * size + x) * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createMossBladeGeometry() {
  // Two crossed cards, each with a mid row so the blade bows out of its
  // plane instead of standing perfectly flat.
  const midBend = 0.07;
  const tipBend = 0.19;
  const positions = new Float32Array([
    // card A (spans x, bends toward +z)
    -0.5, 0, 0, 0.5, 0, 0, -0.5, 0.55, midBend, 0.5, 0.55, midBend, -0.5, 1,
    tipBend, 0.5, 1, tipBend,
    // card B (spans z, bends toward +x)
    0, 0, -0.5, 0, 0, 0.5, midBend, 0.55, -0.5, midBend, 0.55, 0.5, tipBend, 1,
    -0.5, tipBend, 1, 0.5,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 0, 0.55, 1, 0.55, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0.55, 1, 0.55, 0,
    1, 1, 1,
  ]);
  const indices = [
    0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 6, 7, 9, 6, 9, 8, 8, 9, 11, 8, 11, 10,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createMossFoliage(quality: Exclude<Quality, "auto">) {
  const count = quality === "low" ? 0 : quality === "medium" ? 1400 : 2200;
  if (count === 0) {
    const group = new THREE.Group();
    group.name = "Skipped moss micro foliage";
    return group;
  }

  const rng = makeRng(20260706);
  const alphaMap = createMossCardAlphaTexture();
  const geometry = createMossBladeGeometry();
  const material = new THREE.MeshStandardMaterial({
    alphaMap: alphaMap ?? undefined,
    alphaTest: 0.28,
    color: 0xffffff,
    depthWrite: false,
    metalness: 0,
    opacity: 0.82,
    roughness: 0.94,
    side: THREE.DoubleSide,
    transparent: true,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "Procedural moss micro foliage";
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;

  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const align = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  let accepted = 0;
  let attempts = 0;

  // Blades grow in clumps: pick a clump center, then scatter 5-12 blades
  // around it sharing one hue family, instead of a uniform sprinkle.
  while (accepted < count && attempts < count * 4) {
    attempts += 1;
    const clumpAngle = rng() * TAU;
    const clumpEdge = getGroundRadiusAtAngle(clumpAngle);
    const clumpRadius = Math.sqrt(rng()) * (clumpEdge - 0.9);
    const cx = TREE_BASE_X + Math.cos(clumpAngle) * clumpRadius;
    const cz = TREE_BASE_Z + Math.sin(clumpAngle) * clumpRadius;
    const edgeFade =
      1 - smoothstep(clumpEdge * 0.78, clumpEdge - 0.25, clumpRadius);
    // Bare ring near the trunk widened to clear the worn dirt ring.
    const trunkGap = smoothstep(1.35, 2.2, clumpRadius);
    const moundBias = 0.32 + (1 - smoothstep(3.8, 13.2, clumpRadius)) * 0.68;
    const clumpNoise = fbm2(cx * 0.34 + 5.4, cz * 0.34 - 3.2, 4);
    const density = clamp01(
      edgeFade *
        trunkGap *
        moundBias *
        (0.3 + smoothstep(0.4, 0.62, clumpNoise) * 0.85),
    );
    if (rng() > density) continue;

    const clumpHue = lerp(0.23, 0.34, rng());
    const clumpSaturation = lerp(0.36, 0.56, rng());
    const clumpBlades = 5 + Math.floor(rng() * 8);
    const clumpSpread = lerp(0.14, 0.48, rng());
    for (let blade = 0; blade < clumpBlades && accepted < count; blade += 1) {
      const bladeAngle = rng() * TAU;
      const bladeDistance = Math.sqrt(rng()) * clumpSpread;
      const x = cx + Math.cos(bladeAngle) * bladeDistance;
      const z = cz + Math.sin(bladeAngle) * bladeDistance;
      const bladeRadius = Math.hypot(x - TREE_BASE_X, z - TREE_BASE_Z);
      const bladeEdge = getGroundRadiusAtAngle(
        Math.atan2(z - TREE_BASE_Z, x - TREE_BASE_X),
      );
      if (bladeRadius < 1.3 || bladeRadius > bladeEdge - 0.6) continue;

      const height = getGroundHeight(x, z);
      // Blades stretch taller in dips where moisture gathers.
      const sampleStep = 0.5;
      const dip =
        (getGroundHeight(x + sampleStep, z) +
          getGroundHeight(x - sampleStep, z) +
          getGroundHeight(x, z + sampleStep) +
          getGroundHeight(x, z - sampleStep)) *
          0.25 -
        height;
      const dipBoost = 1 + clamp01(dip * 9) * 0.55;

      getGroundNormal(x, z, normal);
      position.set(x, height + 0.012, z);
      align.setFromUnitVectors(UP, normal);
      yaw.setFromAxisAngle(UP, rng() * TAU);
      quaternion.copy(align).multiply(yaw);
      const h =
        lerp(0.055, 0.18, rng()) * lerp(0.76, 1.16, moundBias) * dipBoost;
      const w = h * lerp(0.36, 0.72, rng());
      scale.set(w, h, w);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(accepted, matrix);

      const hue = clamp01(clumpHue + (rng() - 0.5) * 0.025);
      const saturation = clamp01(clumpSaturation + (rng() - 0.5) * 0.09);
      const lightness = lerp(0.19, 0.34, rng()) + height * 0.08;
      color.setHSL(hue, saturation, clamp01(lightness));
      mesh.setColorAt(accepted, color);
      accepted += 1;
    }
  }

  mesh.count = accepted;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function createFallenPetals(quality: Exclude<Quality, "auto">) {
  const count = quality === "low" ? 520 : quality === "medium" ? 960 : 1520;
  const rng = makeRng(20260708);
  const geometry = createFallingPetalGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd9e7,
    emissive: 0xffb5c9,
    emissiveIntensity: 0.012,
    metalness: 0,
    roughness: 0.82,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "Fallen cherry blossom carpet";
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const align = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  const brightTint = new THREE.Color(0xffffff);
  const dampTint = new THREE.Color(0xcfa39e);
  const shadowDir = TREE_SHADOW_DIRECTION.clone();
  const sideDir = new THREE.Vector2(-shadowDir.y, shadowDir.x);

  let accepted = 0;
  let attempts = 0;
  while (accepted < count && attempts < count * 18) {
    attempts += 1;

    let x: number;
    let z: number;
    const roll = rng();
    if (roll < 0.46) {
      const along = lerp(1.1, 8.3, Math.pow(rng(), 0.76));
      const spread = lerp(0.26, 2.75, rng()) * (rng() < 0.5 ? -1 : 1);
      x =
        TREE_BASE_X +
        shadowDir.x * along +
        sideDir.x * spread +
        (rng() - 0.5) * 0.28;
      z =
        TREE_BASE_Z +
        shadowDir.y * along +
        sideDir.y * spread +
        (rng() - 0.5) * 0.28;
    } else if (roll < 0.74) {
      const angle = rng() * TAU;
      const radius = lerp(0.72, 2.7, Math.pow(rng(), 0.45));
      x = TREE_BASE_X + Math.cos(angle) * radius;
      z = TREE_BASE_Z + Math.sin(angle) * radius;
    } else {
      const angle = rng() * TAU;
      const edgeRadius = getGroundRadiusAtAngle(angle);
      const radius = Math.pow(rng(), 0.64) * edgeRadius * 0.72;
      x = TREE_BASE_X + Math.cos(angle) * radius;
      z = TREE_BASE_Z + Math.sin(angle) * radius;
    }

    const dx = x - TREE_BASE_X;
    const dz = z - TREE_BASE_Z;
    const radius = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const edgeRadius = getGroundRadiusAtAngle(angle);
    if (radius < 0.52 || radius > edgeRadius - 0.42) continue;

    const sideAmount =
      (dx * shadowDir.x + dz * shadowDir.y) / Math.max(0.001, radius);
    const edgeFade =
      1 - smoothstep(edgeRadius * 0.66, edgeRadius - 0.32, radius);
    const centerFade = smoothstep(0.62, 1.18, radius);
    // The hero name is difference-blended over the ground right of the
    // trunk; keep that side of the carpet sparser so the large glyphs read
    // cleanly over it instead of going mottled.
    const rightBias = lerp(0.6, 0.42, smoothstep(-0.15, 0.85, sideAmount));
    const clumpNoise = fbm2(x * 0.92 + 8.1, z * 0.92 - 1.7, 3);
    // Drift accumulation: petals collect in ground dips, blow slightly to
    // the downwind (+x) side, and pile up in clumps near the trunk ring.
    const groundY = getGroundHeight(x, z);
    const sampleStep = 0.6;
    const dip =
      (getGroundHeight(x + sampleStep, z) +
        getGroundHeight(x - sampleStep, z) +
        getGroundHeight(x, z + sampleStep) +
        getGroundHeight(x, z - sampleStep)) *
        0.25 -
      groundY;
    const dipBoost = 1 + clamp01(dip * 7) * 0.85;
    const downwind = lerp(0.86, 1.16, smoothstep(-3.4, 4.6, dx));
    const pileNoise = fbm2(x * 1.55 - 4.9, z * 1.55 + 10.3, 3);
    const nearRing = 1 - smoothstep(1.9, 3.4, radius);
    const pileBoost =
      lerp(0.78, 1.0, smoothstep(0.4, 0.68, pileNoise)) +
      nearRing * smoothstep(0.4, 0.68, pileNoise) * 0.5;
    const density = clamp01(
      edgeFade *
        centerFade *
        rightBias *
        dipBoost *
        downwind *
        pileBoost *
        (0.56 + clumpNoise * 0.58),
    );
    if (rng() > density) continue;

    getGroundNormal(x, z, normal);
    position.set(x, groundY + 0.045 + rng() * 0.012, z);
    align.setFromUnitVectors(PETAL_SURFACE_NORMAL, normal);
    yaw.setFromAxisAngle(normal, rng() * TAU);
    quaternion.copy(yaw).multiply(align);

    // ~35-40% smaller than before, skewed toward the small end with the
    // occasional larger petal, so the carpet reads as loose single petals
    // at the scale of the on-tree corollas and the shrine.
    const petalScale =
      lerp(0.24, 0.66, Math.pow(rng(), 1.35)) * lerp(0.86, 1.14, clumpNoise);
    scale.set(
      petalScale * lerp(0.76, 1.3, rng()),
      petalScale * lerp(0.72, 1.18, rng()),
      petalScale,
    );
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(accepted, matrix);

    color.setHSL(
      lerp(0.94, 0.985, rng()),
      lerp(0.45, 0.74, rng()),
      lerp(0.63, 0.82, rng()),
    );
    if (rng() < 0.12) {
      color.lerp(brightTint, lerp(0.12, 0.35, rng()));
    }
    // Petals sitting in damp dips or in the piles at the trunk ring pick up
    // a faded, slightly bruised tint.
    const settle = clamp01(dip * 7) * 0.45 + nearRing * 0.2;
    if (rng() < settle) {
      color.lerp(dampTint, lerp(0.12, 0.32, rng()));
    }
    mesh.setColorAt(accepted, color);
    accepted += 1;
  }

  mesh.count = accepted;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function createSoftTreeShadow(quality: Exclude<Quality, "auto">) {
  const widthSegments = quality === "low" ? 18 : quality === "medium" ? 28 : 42;
  const heightSegments = quality === "low" ? 10 : quality === "medium" ? 14 : 20;
  const shadowWidth = 9.4;
  const shadowLength = 5.1;
  const center = new THREE.Vector2(
    TREE_BASE_X + TREE_SHADOW_DIRECTION.x * 3.75,
    TREE_BASE_Z + TREE_SHADOW_DIRECTION.y * 3.75,
  );
  const along = TREE_SHADOW_DIRECTION.clone();
  const side = new THREE.Vector2(-along.y, along.x);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const localY = (v - 0.5) * shadowLength;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const localX = (u - 0.5) * shadowWidth;
      const worldX = center.x + along.x * localX + side.x * localY;
      const worldZ = center.y + along.y * localX + side.y * localY;
      positions.push(worldX, getGroundHeight(worldX, worldZ) + 0.032, worldZ);
      uvs.push(u, v);
    }
  }

  const row = widthSegments + 1;
  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.filter = "blur(22px)";
    context.fillStyle = "rgba(15, 22, 15, 0.52)";
    context.beginPath();
    context.ellipse(254, 128, 204, 58, -0.08, 0, TAU);
    context.fill();
    context.fillStyle = "rgba(15, 22, 15, 0.3)";
    const lobes = [
      [154, 108, 86, 30, -0.18],
      [244, 144, 126, 42, 0.04],
      [356, 112, 110, 35, 0.16],
      [410, 146, 72, 28, -0.1],
    ];
    for (const lobe of lobes) {
      context.beginPath();
      context.ellipse(
        lobe[0],
        lobe[1],
        lobe[2],
        lobe[3],
        lobe[4],
        0,
        TAU,
      );
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({
    color: 0x172016,
    map: texture,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Soft right-falling tree shadow";
  mesh.renderOrder = 1;
  return mesh;
}

function createTrunkBaseBlend() {
  const radialSegments = 72;
  const rings = 9;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  // Blend from the warm gray-brown bark base, through packed worn dirt
  // matching the ground's dirt ring, feathering into moss at the rim.
  const bark = new THREE.Color(0x453729);
  const dirt = new THREE.Color(0x3b2e20);
  const moss = new THREE.Color(0x2c3a24);

  positions.push(
    TREE_BASE_X,
    getGroundHeight(TREE_BASE_X, TREE_BASE_Z) + 0.038,
    TREE_BASE_Z,
  );
  normals.push(0, 1, 0);
  color.copy(bark).offsetHSL(0, 0, -0.03);
  colors.push(color.r, color.g, color.b);

  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings;
    const baseRadius = lerp(0.16, 1.28, Math.pow(t, 0.92));
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * TAU;
      const irregularity =
        1 +
        Math.sin(angle * 3.0 + 0.4) * 0.08 +
        Math.cos(angle * 5.0 - 1.1) * 0.05 +
        (fbm2(Math.cos(angle) * 2.4 + 3.1, Math.sin(angle) * 2.4 - 5.2, 3) -
          0.5) *
          0.12;
      const radius = baseRadius * irregularity;
      const x = TREE_BASE_X + Math.cos(angle) * radius;
      const z = TREE_BASE_Z + Math.sin(angle) * radius;
      positions.push(x, getGroundHeight(x, z) + 0.034 + (1 - t) * 0.014, z);
      normals.push(0, 1, 0);
      color
        .copy(bark)
        .lerp(dirt, smoothstep(0.12, 0.52, t))
        .lerp(moss, smoothstep(0.66, 1.0, t) * 0.45);
      const fleck = fbm2(x * 2.2 + 1.7, z * 2.2 - 9.4, 3);
      color.offsetHSL(0, 0, (fleck - 0.5) * 0.09);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(0, 1 + segment, 1 + next);
  }

  for (let ring = 1; ring < rings; ring += 1) {
    const row = 1 + (ring - 1) * radialSegments;
    const nextRow = 1 + ring * radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = row + segment;
      const b = row + next;
      const c = nextRow + segment;
      const d = nextRow + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Trunk base moss and earth blend";
  mesh.receiveShadow = true;
  return mesh;
}

function createReferenceHouseAndRocks() {
  const group = new THREE.Group();
  group.name = "Reference house and rocks";

  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x171414,
    metalness: 0,
    roughness: 0.8,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x242938,
    metalness: 0,
    roughness: 0.72,
  });
  const house = new THREE.Group();
  house.name = "Reference house";
  const postGeometry = new THREE.BoxGeometry(0.08, 0.78, 0.08);

  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.2, 0.24]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x, 0.39, z);
      post.castShadow = true;
      house.add(post);
    }
  }

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.08, 0.62),
    postMaterial,
  );
  floor.name = "Reference house removable floor";
  floor.position.y = 0.06;
  house.add(floor);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.56, 0.055),
    postMaterial,
  );
  backWall.position.set(0, 0.36, -0.24);
  house.add(backWall);

  const leftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.08, 0.86),
    roofMaterial,
  );
  leftRoof.position.set(-0.22, 0.87, 0.02);
  leftRoof.rotation.z = 0.38;
  house.add(leftRoof);

  const rightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.08, 0.86),
    roofMaterial,
  );
  rightRoof.position.set(0.22, 0.87, 0.02);
  rightRoof.rotation.z = -0.38;
  house.add(rightRoof);

  const ridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.88, 8),
    roofMaterial,
  );
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, 0.99, 0.02);
  house.add(ridge);

  for (let i = 0; i < 7; i += 1) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.035, 0.84),
      roofMaterial,
    );
    tile.position.set(-0.39 + i * 0.13, 0.91 - Math.abs(i - 3) * 0.025, 0.02);
    tile.rotation.z = i < 3 ? 0.38 : i > 3 ? -0.38 : 0;
    house.add(tile);
  }

  house.position.set(1.32, getGroundHeight(1.32, 0.82) + 0.02, 0.82);
  house.rotation.y = -0.38;
  house.scale.setScalar(0.82);
  group.add(house);

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x696e69,
    metalness: 0,
    roughness: 0.9,
  });
  const stones = [
    {
      radius: 0.12786901553161442,
      rotation: [5.277079709700181, 2.359463522543521, 0.8454589790457842],
      scaleY: 0.8064226673659869,
      x: 0.5625481634680182,
      z: 0.5251295206602663,
    },
    {
      radius: 0.12921561203664167,
      rotation: [2.8730883460162033, 1.7463725333229305, 4.241033376886112],
      scaleY: 1.1983504419308155,
      x: 0.691508929557167,
      z: 0.5788182338885963,
    },
    {
      radius: 0.12510388655122368,
      rotation: [4.273765734423046, 0.4034871472478137, 6.249547059565838],
      scaleY: 0.92957790348446,
      x: 0.9793763056769966,
      z: 0.4226786406431347,
    },
    {
      radius: 0.09800860824296251,
      rotation: [3.6057545944263025, 1.8981250253033417, 3.4420278370868185],
      scaleY: 1.126443377430551,
      x: 1.2179586843075232,
      z: 0.5172905759513379,
    },
  ];

  for (const entry of stones) {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(entry.radius, 0),
      stoneMaterial,
    );
    stone.position.set(
      entry.x,
      getGroundHeight(entry.x, entry.z) + 0.07,
      entry.z,
    );
    stone.rotation.set(entry.rotation[0], entry.rotation[1], entry.rotation[2]);
    stone.scale.y = entry.scaleY;
    stone.castShadow = true;
    group.add(stone);
  }

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return group;
}

function createMoundGeometry(quality: Exclude<Quality, "auto">) {
  const radialSegments = quality === "low" ? 40 : 72;
  const angularSegments = quality === "low" ? 64 : 128;
  const skirtDepth = 1.35;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const topIndex = (ring: number, segment: number) =>
    ring * angularSegments + (segment % angularSegments);

  // Per-vertex tint multiplied over the tiling moss map: a worn dirt ring at
  // the trunk, moisture darkening in concavities, and a slow warm/cool hue
  // drift plus lightness patches across the mound so no tiling repeat shows.
  const pushGroundColor = (x: number, z: number, radius: number, y: number) => {
    const sampleStep = 0.55;
    const dip =
      (getGroundHeight(x + sampleStep, z) +
        getGroundHeight(x - sampleStep, z) +
        getGroundHeight(x, z + sampleStep) +
        getGroundHeight(x, z - sampleStep)) *
        0.25 -
      y;
    const moisture = clamp01(dip * 7.5) * 0.6;
    const wearNoise = fbm2(x * 0.9 + 7.7, z * 0.9 - 3.9, 3);
    const ringEdge = 1.55 + (wearNoise - 0.5) * 0.7;
    const dirtAmount = 1 - smoothstep(ringEdge * 0.5, ringEdge, radius);
    const drift = fbm2(x * 0.05 + 21.3, z * 0.05 - 8.8, 3) - 0.5;
    const patchLight =
      (fbm2(x * 0.085 + 4.4, z * 0.085 - 14.6, 4) - 0.5) * 0.18;
    // World-space lush/gap clumping: this is what keeps the tiling moss
    // texture from reading as a repeat — earthy worn patches drift across
    // the mound at 2-4 unit scale, uncorrelated with the texture tiles.
    const gapNoise = fbm2(x * 0.31 + 6.2, z * 0.31 - 9.4, 4);
    const gap = (1 - smoothstep(0.4, 0.58, gapNoise)) * 0.55;
    let red = (1 + drift * 0.14) * (1 + patchLight);
    let green = (1 + drift * 0.03) * (1 + patchLight);
    let blue = (1 - drift * 0.12) * (1 + patchLight);
    red = lerp(red, red * 1.14, gap);
    green = lerp(green, green * 0.82, gap);
    blue = lerp(blue, blue * 0.62, gap);
    // Multiplied over the green-dominant moss map, so the tint has to pull
    // red well above green before the ring reads as brown dirt.
    red = lerp(red, 1.28, dirtAmount);
    green = lerp(green, 0.66, dirtAmount);
    blue = lerp(blue, 0.42, dirtAmount);
    red *= 1 - moisture * 0.34;
    green *= 1 - moisture * 0.28;
    blue *= 1 - moisture * 0.2;
    colors.push(
      Math.min(1.35, Math.max(0, red)),
      Math.min(1.35, Math.max(0, green)),
      Math.min(1.35, Math.max(0, blue)),
    );
  };

  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments;
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const angle = (segment / angularSegments) * TAU;
      const radius = Math.pow(t, 1.34) * getGroundRadiusAtAngle(angle);
      const x = TREE_BASE_X + Math.cos(angle) * radius;
      const z = TREE_BASE_Z + Math.sin(angle) * radius;
      const y = getGroundHeight(x, z);
      positions.push(x, y, z);
      uvs.push(
        (x - TREE_BASE_X) / (GROUND_RADIUS * 2) + 0.5,
        (z - TREE_BASE_Z) / (GROUND_RADIUS * 2) + 0.5,
      );
      pushGroundColor(x, z, radius, y);
    }
  }

  for (let ring = 0; ring < radialSegments; ring += 1) {
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const next = (segment + 1) % angularSegments;
      const a = topIndex(ring, segment);
      const b = topIndex(ring + 1, segment);
      const c = topIndex(ring + 1, next);
      const d = topIndex(ring, next);
      indices.push(a, d, b, b, d, c);
    }
  }

  const skirtStart = positions.length / 3;
  for (let segment = 0; segment < angularSegments; segment += 1) {
    const angle = (segment / angularSegments) * TAU;
    const radius = getGroundRadiusAtAngle(angle);
    const x = TREE_BASE_X + Math.cos(angle) * radius;
    const z = TREE_BASE_Z + Math.sin(angle) * radius;
    positions.push(x, getGroundHeight(x, z) - skirtDepth, z);
    uvs.push(
      (x - TREE_BASE_X) / (GROUND_RADIUS * 2) + 0.5,
      (z - TREE_BASE_Z) / (GROUND_RADIUS * 2) + 0.5,
    );
    // The skirt reads as cut soil at the mound rim: dark warm earth.
    const crumb = fbm2(x * 1.4 + 2.2, z * 1.4 - 6.5, 3);
    colors.push(
      0.46 + (crumb - 0.5) * 0.1,
      0.38 + (crumb - 0.5) * 0.08,
      0.3 + (crumb - 0.5) * 0.06,
    );
  }

  for (let segment = 0; segment < angularSegments; segment += 1) {
    const next = (segment + 1) % angularSegments;
    const topA = topIndex(radialSegments, segment);
    const topB = topIndex(radialSegments, next);
    const bottomA = skirtStart + segment;
    const bottomB = skirtStart + next;
    indices.push(topA, topB, bottomA, bottomA, topB, bottomB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGround(quality: Exclude<Quality, "auto">) {
  const geometry = createMoundGeometry(quality);
  const textures = createMossTextures();
  const material = new THREE.MeshStandardMaterial({
    bumpMap: textures.bumpMap ?? undefined,
    bumpScale: 0.085,
    color: 0xffffff,
    map: textures.colorMap ?? undefined,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Procedural moss mound ground";
  mesh.receiveShadow = true;
  return mesh;
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
      const skyColor = new THREE.Color(0xdfeaf1);
      const scene = new THREE.Scene();
      scene.background = null;
      // Fog starts behind the trunk (camera-to-trunk is ~18 world units) so
      // limbs a few meters back keep bark color instead of flattening to
      // gray; the far ground edge still dissolves softly into the sky.
      scene.fog = new THREE.Fog(skyColor, 18.5, 36);

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
      renderer.setClearColor(skyColor, 1);
      renderer.setSize(width, height);
      renderer.setPixelRatio(getRenderPixelRatio());
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = sceneQuality !== "low";
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
      mount.appendChild(renderer.domElement);
      await reportSceneBuildProgress();

      // Sky half matches the dome zenith blue; ground half bounces grass
      // green back up into the underside of the canopy.
      const hemi = new THREE.HemisphereLight(0xbdd3ea, 0x31502c, 1.95);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xffe9c4, 3.2);
      sun.position.set(-7.2, 10.4, 3.1);
      sun.castShadow = sceneQuality !== "low";
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 35;
      sun.shadow.camera.left = -12;
      sun.shadow.camera.right = 12;
      sun.shadow.camera.top = 12;
      sun.shadow.camera.bottom = -12;
      sun.shadow.bias = -0.00008;
      sun.shadow.normalBias = 0.045;
      sun.shadow.radius = 4;
      scene.add(sun);

      const fill = new THREE.DirectionalLight(0xbfd7ff, 0.65);
      fill.position.set(6, 4, -6);
      scene.add(fill);

      // Cool rim from back-left so the canopy edge separates from the
      // brighter sun-side sky. No shadows; purely a highlight.
      const rim = new THREE.DirectionalLight(0xd6e4ff, 0.4);
      rim.position.set(-4.5, 6, -8.5);
      scene.add(rim);

      // Sky dome: vertex-color gradient from skyColor at the horizon (kept
      // identical to the fog color so the mound's far edge dissolves into it
      // with no junction line) up to a deeper blue zenith, with a subtle warm
      // bias toward the sun azimuth and faint procedural cloud wisps.
      const createSkyDome = () => {
        const sky = new THREE.Group();
        sky.name = "Sky dome";
        const smoothRamp = (edge0: number, edge1: number, v: number) => {
          const k = clamp01((v - edge0) / (edge1 - edge0));
          return k * k * (3 - 2 * k);
        };
        // Deep enough that the blue survives ACES tone mapping, which
        // desaturates pale colors near the shoulder into gray.
        const zenithColor = new THREE.Color(0x6f9dcc);
        const warmColor = new THREE.Color(0xf9ead2);
        const sunAzimuth = new THREE.Vector2(-7.2, 3.1).normalize();
        // Camera far is 80 and the camera sits up to ~24 units from the
        // origin, so keep radius + camera offset under the far plane or the
        // dome gets clipped mid-frame.
        const domeRadius = 52;
        const domeGeometry = new THREE.SphereGeometry(domeRadius, 48, 32);
        const domePositions = domeGeometry.attributes.position;
        const domeColors = new Float32Array(domePositions.count * 3);
        const vertexColor = new THREE.Color();
        const vertexAzimuth = new THREE.Vector2();
        for (let i = 0; i < domePositions.count; i += 1) {
          const up = domePositions.getY(i) / domeRadius;
          // Everything at or below the horizon stays exactly skyColor.
          const zenithMix = Math.pow(clamp01((up - 0.02) / 0.7), 1.15);
          vertexColor.copy(skyColor).lerp(zenithColor, zenithMix);
          vertexAzimuth.set(domePositions.getX(i), domePositions.getZ(i));
          if (vertexAzimuth.lengthSq() > 1e-6) {
            const facing = clamp01(vertexAzimuth.normalize().dot(sunAzimuth));
            const warmBand =
              smoothRamp(0.03, 0.14, up) * (1 - smoothRamp(0.32, 0.72, up));
            vertexColor.lerp(warmColor, facing * facing * warmBand * 0.16);
          }
          domeColors[i * 3] = vertexColor.r;
          domeColors[i * 3 + 1] = vertexColor.g;
          domeColors[i * 3 + 2] = vertexColor.b;
        }
        domeGeometry.setAttribute(
          "color",
          new THREE.BufferAttribute(domeColors, 3),
        );
        const domeMesh = new THREE.Mesh(
          domeGeometry,
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false,
          }),
        );
        domeMesh.renderOrder = -2;
        sky.add(domeMesh);

        // Faint cloud wisps: one canvas of u-elongated value-noise fbm
        // streaks, alpha-blended into the upper sky band only.
        const cloudCanvas = document.createElement("canvas");
        cloudCanvas.width = 512;
        cloudCanvas.height = 256;
        const cloudCtx = cloudCanvas.getContext("2d");
        if (cloudCtx) {
          const rng = makeRng(0x5cae1);
          const latticeSize = 64;
          const lattice = new Float32Array(latticeSize * latticeSize);
          for (let i = 0; i < lattice.length; i += 1) lattice[i] = rng();
          // periodX makes the noise wrap horizontally so the dome seam at
          // u = 0/1 is invisible.
          const latticeAt = (ix: number, iy: number, periodX: number) => {
            const wx = ((ix % periodX) + periodX) % periodX;
            const wy = ((iy % latticeSize) + latticeSize) % latticeSize;
            return lattice[wy * latticeSize + (wx % latticeSize)];
          };
          const valueNoise = (x: number, y: number, periodX: number) => {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            const fx = x - ix;
            const fy = y - iy;
            const sx = fx * fx * (3 - 2 * fx);
            const sy = fy * fy * (3 - 2 * fy);
            const a = latticeAt(ix, iy, periodX);
            const b = latticeAt(ix + 1, iy, periodX);
            const c = latticeAt(ix, iy + 1, periodX);
            const d = latticeAt(ix + 1, iy + 1, periodX);
            return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
          };
          const cloudImage = cloudCtx.createImageData(512, 256);
          const cloudData = cloudImage.data;
          for (let py = 0; py < 256; py += 1) {
            // py = 0 is the zenith (sphere uv.y = 1 with flipY canvas).
            const v = (py + 0.5) / 256;
            const band =
              smoothRamp(0.08, 0.18, v) * (1 - smoothRamp(0.28, 0.4, v));
            for (let px = 0; px < 512; px += 1) {
              const u = (px + 0.5) / 512;
              let fbm = 0;
              fbm += valueNoise(u * 6, v * 24, 6) * 0.55;
              fbm += valueNoise(u * 12, v * 48 + 17.3, 12) * 0.3;
              fbm += valueNoise(u * 24, v * 96 + 41.7, 24) * 0.15;
              const wisp = smoothRamp(0.52, 0.74, fbm) * band;
              const o = (py * 512 + px) * 4;
              cloudData[o] = 255;
              cloudData[o + 1] = 251;
              cloudData[o + 2] = 246;
              cloudData[o + 3] = Math.round(wisp * 96);
            }
          }
          cloudCtx.putImageData(cloudImage, 0, 0);
          const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
          cloudTexture.colorSpace = THREE.SRGBColorSpace;
          cloudTexture.wrapS = THREE.RepeatWrapping;
          const cloudMesh = new THREE.Mesh(
            new THREE.SphereGeometry(domeRadius - 1, 32, 16),
            new THREE.MeshBasicMaterial({
              map: cloudTexture,
              transparent: true,
              side: THREE.BackSide,
              fog: false,
              depthWrite: false,
            }),
          );
          cloudMesh.renderOrder = -1;
          sky.add(cloudMesh);
        }
        return sky;
      };
      // Added to the scene (not worldGroup) so the sky never inherits any
      // world transform.
      scene.add(createSkyDome());
      await reportSceneBuildProgress();

      const groundMesh = createGround(sceneQuality);
      worldGroup.add(groundMesh);
      await reportSceneBuildProgress();

      worldGroup.add(createSoftTreeShadow(sceneQuality));
      await reportSceneBuildProgress();

      worldGroup.add(createTrunkBaseBlend());
      await reportSceneBuildProgress();

      worldGroup.add(createMossFoliage(sceneQuality));
      await reportSceneBuildProgress();

      worldGroup.add(createFallenPetals(sceneQuality));
      await reportSceneBuildProgress();

      worldGroup.add(createReferenceHouseAndRocks());
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
          !reportedReady || !introComplete || parallaxMoving || recentlyActive;

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

        if (tree.branchWindUniforms) {
          tree.branchWindUniforms.uWindTime.value = elapsed;
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
        renderer.render(scene, camera);
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
