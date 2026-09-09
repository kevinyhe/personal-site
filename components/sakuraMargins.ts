"use client";

import * as THREE from "three";

import {
  Branch,
  createSakuraBlossomGeometry,
  getBranchWindVectors,
  getTwigWindAmplitude,
  getTwigWindFlutter,
} from "@/components/BareThreeCanvas";
import type {
  StageAnchor,
  StageBuildContext,
  StageElement,
  StageElementFactory,
  StageFrame,
} from "@/components/sakuraStage";

/**
 * MARGINS — twigs that creep in from the left and right edges as the reader
 * descends, so the column of text ends up framed by branch instead of by
 * black. It should be barely noticed and badly missed if removed.
 *
 * Three decisions worth knowing before reading the code:
 *
 * 1. The twigs are pinned to the VIEWPORT, not to the document. One viewport
 *    height is always STAGE_WORLD_HEIGHT = 12 world units at the focal plane,
 *    so a screen-pinned vertical layout is baked once and survives every
 *    resize without touching a vertex. Anchoring them to the page instead
 *    would make each twig's local y depend on the block height, which changes,
 *    and one merged geometry could no longer hold all of them.
 *
 * 2. Scroll is the only clock for the growth. Each twig has its own start
 *    point on frame.scrollProgress and extends over the next 0.3 of it, so
 *    scrolling back up retracts it exactly the way it came. No timer, no
 *    latch — the reader can scrub it.
 *
 * 3. Extension is done in the vertex shader, not by rebuilding geometry. Every
 *    vertex carries how far along its strand it sits (aGrow.y) and the
 *    centerline point of its ring (aCenter); anything past the twig's current
 *    growth is collapsed onto the centerline, where its triangles have zero
 *    area and draw nothing. One float per twig in a uniform array drives the
 *    whole thing, so all the twigs on one side stay a single draw call.
 *
 * The margins are narrow and on a phone there are none: under 768 CSS px every
 * growth value is forced to 0 and the group is hidden, between 768 and 1100
 * half the twigs are dropped and the rest stop at 55% of their length. The
 * reach is also clamped every frame against the live left edge of the reading
 * column, so a twig tip can never cross a glyph whatever the layout does.
 */

// Under this the page has no margins at all.
const HIDE_BELOW_PX = 768;
// Under this the margins exist but are thin: half the twigs, 55% extension.
const DIAL_BACK_BELOW_PX = 1100;
const DIAL_BACK_GROWTH = 0.55;

// Clear space between the furthest twig tip and the first glyph of the
// reading column. The wind can add ~10% of the reach on top of that, which is
// what the 0.82 budget below covers.
const COLUMN_GAP_PX = 14;
const WIND_HEADROOM = 0.82;
// Fallback column edge when [data-work-list] is missing: the sections' own
// px-6 / sm:px-16 padding.
const FALLBACK_COLUMN_LEFT_PX = 64;
const FALLBACK_COLUMN_LEFT_NARROW_PX = 24;

// Twigs sit a little behind the focal plane, which costs nothing and keeps
// them from reading as stickers pasted on the glass.
const TWIG_DEPTH = -1.1;

// Size of the growth uniform array. The shader indexes it dynamically, which
// GLSL ES 3.00 allows and three r178 is WebGL2-only, so this is safe.
const TWIG_SLOTS = 16;

// Vertical band the twigs are spread across, world units either side of the
// camera axis. The viewport is 12 units tall, so this leaves a little under
// half a unit clear at the top and bottom edges.
const TWIG_BAND_HALF_HEIGHT = 5.3;

// Scroll window each twig takes to extend, and how far into the block the
// last one starts.
const GROWTH_SPAN = 0.3;
const GROWTH_LAST_START = 0.62;

// The tube is drawn twice as thick as the radius the wind model is told
// about. Those radii (0.024 down to 0.004) are the hero's real depth 4-6
// numbers and getTwigWindAmplitude reads them to decide how hard a twig
// flutters — but the twigs are then scaled down by ~0.45 to fit a 50 px
// margin, and at that size an honest radius draws under one pixel and
// crawls with the halftone. Fat where it is drawn, thin where it is asked
// how much to move.
const DRAW_RADIUS_SCALE = 2.1;

const BRANCH_COLOR = 0xcfc9c4;
const TAU = Math.PI * 2;

type TwigStrand = {
  branch: Branch;
  alongStart: number;
  alongEnd: number;
};

type BlossomSlot = {
  matrix: THREE.Matrix4;
  wind1: [number, number, number, number];
  wind2: [number, number, number, number];
  along: number;
  bud: boolean;
  screenY: number;
};

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Wind.
//
// This is the hero's model, reached through its exported CPU half: a Branch
// carries the phase/amplitude/lag numbers, getBranchWindVectors collapses them
// into the two vec4s at a point, and the shader below turns those into the
// same displacement the hero's branch mesh gets. Twigs are the tier with the
// highest flutter amplitude in that model (getTwigWindAmplitude /
// getTwigWindFlutter, depths 4-6), which is exactly what these are.
//
// The GLSL is a copy of arborGust/arborWindOffset from WIND_SHADER_CHUNK in
// BareThreeCanvas, minus the cursor rustle (the stage exposes no pointer).
// It is a copy because that chunk is module-private there and this element
// may not edit that file. If the two ever drift, the margins will sway out of
// step with the rest of the stage — see the note in the return value.
// ---------------------------------------------------------------------------
const MARGIN_WIND_CHUNK = /* glsl */ `
  uniform float uWindTime;
  uniform float uWindStrength;

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

type MarginUniforms = {
  uWindTime: { value: number };
  uWindStrength: { value: number };
  uGrow: { value: Float32Array };
  /** The fit-to-margin scale on both side groups. See uScale in the shaders. */
  uScale: { value: number };
};

/**
 * Bark material. Flat colour, no bark maps: the hero bakes three canvas
 * textures for its trunk, and at the ~2 px width these twigs draw at, under a
 * 4.1 px halftone cell, none of that survives the dither.
 */
function createBranchMaterial(uniforms: MarginUniforms) {
  const material = new THREE.MeshStandardMaterial({
    color: BRANCH_COLOR,
    metalness: 0,
    roughness: 0.82,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uGrow = uniforms.uGrow;
    shader.uniforms.uScale = uniforms.uScale;
    shader.vertexShader =
      `
        attribute vec4 windParams1;
        attribute vec4 windParams2;
        attribute vec3 aCenter;
        attribute vec3 aGrow;
        uniform float uGrow[${TWIG_SLOTS}];
        uniform float uScale;
      ` +
      MARGIN_WIND_CHUNK +
      shader.vertexShader;
    // aGrow.x = twig slot, aGrow.y = distance along the strand (0 at the
    // margin edge, 1 at the last tip). Everything past the twig's current
    // growth is pulled onto the centerline, so its ring collapses to a line
    // and its triangles cover no pixels. The 0.16 fade makes the newest
    // stretch taper in rather than pop to full thickness.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float twigGrow = uGrow[int(aGrow.x + 0.5)];
      float grown = 1.0 - smoothstep(twigGrow - 0.16, twigGrow, aGrow.y);
      transformed = mix(aCenter, transformed, grown);
      transformed += arborWindOffset(windParams1, windParams2) * grown;
      // Where this twig sits down the screen. Divided by the group scale so
      // it survives it: the scale exists to fit the twig into a margin a few
      // dozen pixels wide, and applying it to the vertical layout as well
      // would bunch all sixteen twigs into the middle third of the screen.
      transformed.y += aGrow.z / uScale;
      `,
    );
  };
  material.customProgramCacheKey = () => "margin-twig-v1";
  return material;
}

/**
 * Blossom material. The hero's flower geometry, but shaded plainly: no petal
 * translucency, no baked canopy occlusion, no petal detail map. Those exist to
 * hold up a canopy of 2000 flowers filling half the screen; there are at most
 * 48 here and each is about 25 px across.
 */
function createBlossomMaterial(uniforms: MarginUniforms) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffa3d6,
    emissiveIntensity: 0.32,
    metalness: 0,
    roughness: 0.55,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uGrow = uniforms.uGrow;
    shader.uniforms.uScale = uniforms.uScale;
    shader.vertexShader =
      `
        attribute vec4 bWind1;
        attribute vec4 bWind2;
        attribute vec3 bGrow;
        uniform float uGrow[${TWIG_SLOTS}];
        uniform float uScale;
      ` +
      MARGIN_WIND_CHUNK +
      shader.vertexShader;
    // A flower scales in from its spur point once the twig has grown past it,
    // which is what turns the extension into a bloom instead of a stick
    // arriving with decorations already on it.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float twigGrow = uGrow[int(bGrow.x + 0.5)];
      transformed *= smoothstep(bGrow.y - 0.02, bGrow.y + 0.18, twigGrow);
      `,
    );
    // The anchor displacement goes on AFTER instanceMatrix, the same place the
    // hero applies it, so a flower moves with the twig point it grew from
    // instead of with its own local axes.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition.xyz += arborWindOffset(bWind1, bWind2);
      mvPosition.y += bGrow.z / uScale;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `,
    );
  };
  material.customProgramCacheKey = () => "margin-blossom-v1";
  return material;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Accumulates every strand of one side into a single indexed buffer. */
class TwigMeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private centers: number[] = [];
  private grow: number[] = [];
  private wind1: number[] = [];
  private wind2: number[] = [];
  private indices: number[] = [];
  maxReach = 0;

  private point = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private binormal = new THREE.Vector3();
  private offset = new THREE.Vector3();

  append(
    strand: TwigStrand,
    slot: number,
    tubular: number,
    radial: number,
    screenY: number,
  ) {
    const { branch, alongStart, alongEnd } = strand;
    const base = this.positions.length / 3;

    // Parallel transport down the curve: carry the previous ring's normal
    // forward and re-orthogonalize. A fresh cross product per ring twists the
    // tube wherever the tangent swings past the helper axis.
    this.normal.set(0, 0, 1);
    for (let i = 0; i <= tubular; i += 1) {
      const t = i / tubular;
      branch.getPoint(t, this.point);
      branch.getTangent(t, this.tangent);
      this.normal
        .addScaledVector(this.tangent, -this.normal.dot(this.tangent))
        .normalize();
      if (!Number.isFinite(this.normal.x) || this.normal.lengthSq() < 0.5) {
        this.normal.set(0, 1, 0).cross(this.tangent).normalize();
      }
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      const radius = branch.getRadius(t) * DRAW_RADIUS_SCALE;
      const wind = getBranchWindVectors(branch, t);
      const along = alongStart + (alongEnd - alongStart) * t;
      for (let j = 0; j < radial; j += 1) {
        const a = (j / radial) * TAU;
        this.offset
          .copy(this.normal)
          .multiplyScalar(Math.cos(a))
          .addScaledVector(this.binormal, Math.sin(a));
        this.positions.push(
          this.point.x + this.offset.x * radius,
          this.point.y + this.offset.y * radius,
          this.point.z + this.offset.z * radius,
        );
        this.normals.push(this.offset.x, this.offset.y, this.offset.z);
        this.centers.push(this.point.x, this.point.y, this.point.z);
        this.grow.push(slot, along, screenY);
        this.wind1.push(wind.wind1[0], wind.wind1[1], wind.wind1[2], wind.wind1[3]);
        this.wind2.push(wind.wind2[0], wind.wind2[1], wind.wind2[2], wind.wind2[3]);
      }
      this.maxReach = Math.max(
        this.maxReach,
        Math.abs(this.point.x) + radius,
      );
    }

    for (let i = 0; i < tubular; i += 1) {
      for (let j = 0; j < radial; j += 1) {
        const a = base + i * radial + j;
        const b = base + i * radial + ((j + 1) % radial);
        const c = a + radial;
        const d = b + radial;
        this.indices.push(a, c, b, b, c, d);
      }
    }
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
    geometry.setAttribute(
      "aCenter",
      new THREE.Float32BufferAttribute(this.centers, 3),
    );
    geometry.setAttribute(
      "aGrow",
      new THREE.Float32BufferAttribute(this.grow, 3),
    );
    geometry.setAttribute(
      "windParams1",
      new THREE.Float32BufferAttribute(this.wind1, 4),
    );
    geometry.setAttribute(
      "windParams2",
      new THREE.Float32BufferAttribute(this.wind2, 4),
    );
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }
}

/**
 * One twig family: a leader that reaches in from the margin edge plus two
 * side strands. `sign` is +1 for the left margin (growth runs toward +x, into
 * the page) and -1 for the right.
 *
 * Wind numbers follow the hero's inheritance rule: a strand's base values are
 * its parent's values frozen at the attach point, its local values are its own
 * contribution ramped along its length. The attach point of the leader has
 * amplitude 0, which is what keeps the twig looking anchored to something
 * solid just off the edge of the screen instead of floating.
 */
function makeTwigFamily(
  sign: number,
  slot: number,
  rand: () => number,
): TwigStrand[] {
  const familyPhase = rand() * TAU;
  const limbPhase = familyPhase * 0.7 + 1.1;
  const length = 0.78 + rand() * 0.42;
  const rise = -0.1 + rand() * 0.32;
  const droop = 0.16 + rand() * 0.38;
  const wobble = 0.06 + rand() * 0.1;
  const wobblePhase = rand() * TAU;

  const leaderPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const t = i / 4;
    leaderPoints.push(
      new THREE.Vector3(
        // The strand starts a little PAST the screen edge so the open end of
        // the tube is off-frame; at x = 0 exactly you get a two-pixel hole
        // where the backfaces are culled away.
        sign * (length * t - 0.11),
        rise * t - droop * t * t,
        Math.sin(t * 2.4 + wobblePhase) * wobble - wobble * Math.sin(wobblePhase),
      ),
    );
  }

  const leader = new Branch({
    id: slot * 10,
    parent: null,
    depth: 4,
    attachT: 0,
    curve: new THREE.CatmullRomCurve3(leaderPoints),
    baseRadius: 0.024,
    tipRadius: 0.008,
    lobeId: 0,
  });
  leader.windTwigPhase = familyPhase;
  leader.windTwigAmpLocal = getTwigWindAmplitude(leader);
  leader.windTwigLagLocal = 0.42;
  leader.windFlutterLocal = getTwigWindFlutter(leader);
  leader.windLimbPhase = limbPhase;
  leader.windLimbAmpLocal = 0.03;
  leader.windLimbLagLocal = 0.25;

  const strands: TwigStrand[] = [
    { alongEnd: 1, alongStart: 0, branch: leader },
  ];

  const attachTs = [0.4, 0.68];
  for (let c = 0; c < attachTs.length; c += 1) {
    const tA = attachTs[c] + rand() * 0.08;
    const origin = leader.getPoint(tA);
    const tangent = leader.getTangent(tA);
    const turn = (c === 0 ? 1 : -1) * (0.45 + rand() * 0.5);
    const childLength = length * (0.3 + rand() * 0.22);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 3; i += 1) {
      const t = i / 3;
      // Swing the leader's tangent in the screen plane, then sag: a side twig
      // leaves at an angle and then remembers it is a weeping cherry.
      const cos = Math.cos(turn * t);
      const sin = Math.sin(turn * t);
      points.push(
        new THREE.Vector3(
          origin.x + (tangent.x * cos - tangent.y * sin) * childLength * t,
          origin.y +
            (tangent.x * sin + tangent.y * cos) * childLength * t -
            0.22 * childLength * t * t,
          origin.z + tangent.z * childLength * t + (rand() - 0.5) * 0.05,
        ),
      );
    }
    const child = new Branch({
      id: slot * 10 + c + 1,
      parent: leader,
      depth: 5 + c,
      attachT: tA,
      curve: new THREE.CatmullRomCurve3(points),
      baseRadius: 0.011,
      tipRadius: 0.004,
      lobeId: 0,
    });
    const inherited = getBranchWindVectors(leader, tA);
    child.windLimbPhase = inherited.wind1[0];
    child.windLimbAmpBase = inherited.wind1[1];
    child.windLimbLagBase = inherited.wind1[2];
    child.windTwigPhase = inherited.wind1[3];
    child.windTwigAmpBase = inherited.wind2[0];
    child.windTwigLagBase = inherited.wind2[1];
    child.windFlutterBase = inherited.wind2[2];
    child.windLimbAmpLocal = 0.012;
    child.windLimbLagLocal = 0.1;
    child.windTwigAmpLocal = getTwigWindAmplitude(child);
    child.windTwigLagLocal = 0.3;
    child.windFlutterLocal = getTwigWindFlutter(child);
    strands.push({ alongEnd: Math.min(1, tA + 0.45), alongStart: tA, branch: child });
  }

  return strands;
}

const BLOSSOM_FORWARD = new THREE.Vector3(0, 0, 1);

/** Two flowers and a bud per family, on the outer half of the strands. */
function placeBlossoms(
  strands: TwigStrand[],
  rand: () => number,
  out: BlossomSlot[],
) {
  const spots: Array<{ strand: TwigStrand; t: number; bud: boolean }> = [
    { bud: false, strand: strands[1], t: 0.82 + rand() * 0.15 },
    { bud: false, strand: strands[2], t: 0.78 + rand() * 0.18 },
    { bud: true, strand: strands[0], t: 0.72 + rand() * 0.2 },
  ];
  const position = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let reach = 0;
  for (const spot of spots) {
    const { branch, alongStart, alongEnd } = spot.strand;
    branch.getPoint(spot.t, position);
    const wind = getBranchWindVectors(branch, spot.t);
    // Flowers face the camera, roughly: a sakura hangs off its pedicel and
    // turns to the light, and one seen edge-on is two pixels of nothing.
    dir
      .set((rand() - 0.5) * 0.9, (rand() - 0.5) * 0.8, 1)
      .normalize();
    quaternion.setFromUnitVectors(BLOSSOM_FORWARD, dir);
    roll.setFromAxisAngle(BLOSSOM_FORWARD, rand() * TAU);
    quaternion.multiply(roll);
    const s = spot.bud ? 0.26 + rand() * 0.1 : 0.34 + rand() * 0.16;
    scale.setScalar(s);
    // A flower reaches ~0.65 of its own scale past its spur point; the fit
    // below has to know about that or a petal ends up over a glyph.
    reach = Math.max(reach, Math.abs(position.x) + s * 0.65);
    out.push({
      along: Math.min(1, alongStart + (alongEnd - alongStart) * spot.t),
      bud: spot.bud,
      matrix: new THREE.Matrix4().compose(position, quaternion, scale),
      screenY: 0,
      wind1: wind.wind1,
      wind2: wind.wind2,
    });
  }
  return reach;
}

function buildBlossomMesh(
  base: THREE.BufferGeometry,
  material: THREE.Material,
  slots: Array<{ slot: number; blossom: BlossomSlot }>,
) {
  const count = slots.length;
  const geometry = base.clone();
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const wind1 = new Float32Array(count * 4);
  const wind2 = new Float32Array(count * 4);
  const grow = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const { blossom, slot } = slots[i];
    mesh.setMatrixAt(i, blossom.matrix);
    for (let k = 0; k < 4; k += 1) {
      wind1[i * 4 + k] = blossom.wind1[k];
      wind2[i * 4 + k] = blossom.wind2[k];
    }
    grow[i * 3] = slot;
    grow[i * 3 + 1] = blossom.along;
    grow[i * 3 + 2] = blossom.screenY;
  }
  geometry.setAttribute("bWind1", new THREE.InstancedBufferAttribute(wind1, 4));
  geometry.setAttribute("bWind2", new THREE.InstancedBufferAttribute(wind2, 4));
  geometry.setAttribute("bGrow", new THREE.InstancedBufferAttribute(grow, 3));
  mesh.instanceMatrix.needsUpdate = true;
  // The bounding sphere would have to cover the instances, the wind offset and
  // the growth collapse; these six objects are always within a viewport of the
  // camera when they are visible at all, so skip the culling test instead.
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// The element
// ---------------------------------------------------------------------------

const makeSakuraMargins: StageElementFactory = (): StageElement => {
  let root: THREE.Group | null = null;
  let leftGroup: THREE.Group | null = null;
  let rightGroup: THREE.Group | null = null;
  let columnAnchor: StageAnchor | null = null;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const uniforms: MarginUniforms = {
    uGrow: { value: new Float32Array(TWIG_SLOTS) },
    uScale: { value: 1 },
    uWindStrength: { value: 1 },
    uWindTime: { value: 0 },
  };

  // Baked per twig: which vertical slot it sits in and where on
  // scrollProgress it starts extending.
  const growthStart = new Float32Array(TWIG_SLOTS);
  let twigCount = 0;
  let maxReach = 1;
  const scratch = new THREE.Vector3();

  const buildSide = (
    sign: number,
    slots: number[],
    quality: string,
    flowerGeometry: THREE.BufferGeometry,
    budGeometry: THREE.BufferGeometry,
    branchMaterial: THREE.Material,
    blossomMaterial: THREE.Material,
  ) => {
    const group = new THREE.Group();
    const builder = new TwigMeshBuilder();
    const flowers: Array<{ slot: number; blossom: BlossomSlot }> = [];
    const buds: Array<{ slot: number; blossom: BlossomSlot }> = [];
    const tubular = quality === "low" ? 7 : 9;
    const radial = quality === "low" ? 3 : 4;

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const rand = makeRng(0x5a20a + slot * 977);
      // A twig sits at a fixed height on the SCREEN. The side is one draw
      // call, so that height is baked into the vertices rather than carried
      // on a per-twig object.
      const rank = i / Math.max(1, slots.length - 1);
      const y = TWIG_BAND_HALF_HEIGHT * (1 - 2 * rank) + (rand() - 0.5) * 0.55;
      const strands = makeTwigFamily(sign, slot, rand);
      for (const strand of strands) {
        builder.append(strand, slot, tubular, radial, y);
      }
      const placed: BlossomSlot[] = [];
      const blossomReach = placeBlossoms(strands, rand, placed);
      builder.maxReach = Math.max(builder.maxReach, blossomReach);
      for (const blossom of placed) {
        blossom.screenY = y;
        (blossom.bud ? buds : flowers).push({ blossom, slot });
      }
    }

    const branchGeometry = builder.build();
    geometries.push(branchGeometry);
    const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);
    branchMesh.frustumCulled = false;
    branchMesh.name = "Margin twigs";
    group.add(branchMesh);

    if (flowers.length > 0) {
      const mesh = buildBlossomMesh(flowerGeometry, blossomMaterial, flowers);
      geometries.push(mesh.geometry);
      group.add(mesh);
    }
    if (buds.length > 0) {
      const mesh = buildBlossomMesh(budGeometry, blossomMaterial, buds);
      geometries.push(mesh.geometry);
      group.add(mesh);
    }

    return { group, maxReach: builder.maxReach };
  };

  return {
    name: "margins",

    async build(ctx: StageBuildContext) {
      columnAnchor = ctx.anchor("[data-work-list]");

      twigCount =
        ctx.quality === "low" ? 8 : ctx.quality === "medium" ? 12 : TWIG_SLOTS;
      for (let i = 0; i < twigCount; i += 1) {
        growthStart[i] = (i / Math.max(1, twigCount - 1)) * GROWTH_LAST_START;
      }

      // lowDetail: 2x2 petal grids and no stamens. These flowers are ~25 CSS
      // px across under a 4.1 px halftone cell — 41 triangles each instead of
      // 193, and the dither eats the difference.
      const flowerGeometry = createSakuraBlossomGeometry(1, true);
      const budGeometry = createSakuraBlossomGeometry(0.35, true);
      geometries.push(flowerGeometry, budGeometry);
      await ctx.yield();
      if (ctx.aborted()) return null;

      const branchMaterial = createBranchMaterial(uniforms);
      const blossomMaterial = createBlossomMaterial(uniforms);
      materials.push(branchMaterial, blossomMaterial);

      const leftSlots: number[] = [];
      const rightSlots: number[] = [];
      for (let i = 0; i < twigCount; i += 1) {
        (i % 2 === 0 ? leftSlots : rightSlots).push(i);
      }

      const left = buildSide(
        1,
        leftSlots,
        ctx.quality,
        flowerGeometry,
        budGeometry,
        branchMaterial,
        blossomMaterial,
      );
      await ctx.yield();
      if (ctx.aborted()) return null;

      const right = buildSide(
        -1,
        rightSlots,
        ctx.quality,
        flowerGeometry,
        budGeometry,
        branchMaterial,
        blossomMaterial,
      );
      if (ctx.aborted()) return null;

      maxReach = Math.max(0.2, left.maxReach, right.maxReach);
      leftGroup = left.group;
      rightGroup = right.group;
      root = new THREE.Group();
      root.name = "Sakura margins";
      root.add(leftGroup, rightGroup);
      return root;
    },

    update(frame: StageFrame) {
      if (!root || !leftGroup || !rightGroup) return;

      const width = frame.viewport.width;
      const gate =
        width < HIDE_BELOW_PX
          ? 0
          : width < DIAL_BACK_BELOW_PX
            ? DIAL_BACK_GROWTH
            : 1;
      root.visible = gate > 0;
      if (!root.visible) return;

      // How much room there is between the screen edge and the first glyph.
      // Read live from the work list, so a layout change moves the twigs
      // instead of letting them wander onto the type.
      const columnLeft =
        columnAnchor && columnAnchor.found
          ? columnAnchor.left
          : width < 640
            ? FALLBACK_COLUMN_LEFT_NARROW_PX
            : FALLBACK_COLUMN_LEFT_PX;
      const bandWorld =
        Math.max(0, columnLeft - COLUMN_GAP_PX) *
        frame.worldUnitsPerPixel(TWIG_DEPTH) *
        WIND_HEADROOM;
      const scale = Math.min(1.35, bandWorld / maxReach);
      if (scale < 0.12) {
        // No usable margin at all (a layout with the column hard against the
        // edge). Draw nothing rather than a twig on top of the text.
        root.visible = false;
        return;
      }
      leftGroup.scale.setScalar(scale);
      rightGroup.scale.setScalar(scale);
      uniforms.uScale.value = scale;

      frame.screenToWorld(0, 0, TWIG_DEPTH, scratch);
      leftGroup.position.set(scratch.x, 0, TWIG_DEPTH);
      rightGroup.position.set(-scratch.x, 0, TWIG_DEPTH);

      const active =
        width < DIAL_BACK_BELOW_PX ? Math.ceil(twigCount / 2) : twigCount;
      const grow = uniforms.uGrow.value;
      const progress = frame.reducedMotion ? 1 : frame.scrollProgress;
      for (let i = 0; i < TWIG_SLOTS; i += 1) {
        grow[i] =
          i < active
            ? gate *
              smoothstep(growthStart[i], growthStart[i] + GROWTH_SPAN, progress)
            : 0;
      }
      uniforms.uWindTime.value = frame.reducedMotion ? 0 : frame.time;
    },

    dispose() {
      for (const geometry of geometries) geometry.dispose();
      geometries.length = 0;
      for (const material of materials) material.dispose();
      materials.length = 0;
      root = null;
      leftGroup = null;
      rightGroup = null;
      columnAnchor = null;
    },
  };
};

export default makeSakuraMargins;
