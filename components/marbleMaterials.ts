import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The marble, as two materials shared by every chunk of a figure: the
 * outer stone and the cut faces. One program and one set of uniforms
 * across all the draw calls, and a whole-figure fade is two writes.
 *
 * Nothing here marks the cuts. Glue seams along them were drawn for a
 * while (a hairline darkening from a per-vertex distance to the nearest
 * cut) and taken out again: the figure reads better as clean stone that
 * simply comes apart, and the seam pass cost ~110 ms on the frame the
 * chunks arrived.
 *
 * Why there is a grain here at all. The chunks' surface normals are NOT the
 * problem — they come from the source model's own NORMAL accessor and
 * survive the bake: 14.0 degrees of mean spread between the three vertex
 * normals of a surface triangle, 7.2 degrees between a face normal and its
 * vertex average, and only 2.5% of surface triangles flat. The int8 packing
 * costs 0.17 degrees mean / 0.375 degrees worst, far too little to band.
 * The source is not low-poly either, at 51k triangles.
 *
 * The shading was flat because a roughness-0.88 dielectric under four hard
 * lights and 0.01 of ambient has nothing to say about a large smooth area:
 * the thigh, the back and the shoulder came out as one featureless
 * off-white, and everything facing away from the key went to true black —
 * 34.3% of the panel below luminance 26 at hero fraction 0.62. So: a
 * procedural grain that perturbs the normal and breaks the roughness up,
 * and (in ThinkerStage's rig) a hemisphere light so the turn away from the
 * key lands somewhere other than zero.
 *
 * A PMREM'd equirect dome was tried here for that second job and taken out
 * again: it looked much the same as the hemisphere light and was part of
 * the 8.3 -> 12.0 ms a frame that the first version of this cost.
 */

/** Deterministic RNG, so the grain is the same picture on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAIN_SIZE = 256;

/**
 * Tileable Perlin fbm on a GRAIN_SIZE square. Each octave's gradient
 * lattice wraps at its own period, which is what makes the whole thing tile
 * — the shader samples it on three axis planes at once, so a seam anywhere
 * would show up as a line across the stone.
 *
 * Perlin and not value noise: value noise on an axis-aligned lattice came
 * out as a visible quilt at bump strengths high enough to see at all.
 */
function tileableFbm(periods: number[], weights: number[], seed: number) {
  const random = mulberry32(seed);
  const out = new Float32Array(GRAIN_SIZE * GRAIN_SIZE);
  const total = weights.reduce((a, b) => a + b, 0);

  periods.forEach((period, octave) => {
    const weight = weights[octave] / total;
    const gradX = new Float32Array(period * period);
    const gradY = new Float32Array(period * period);
    for (let i = 0; i < gradX.length; i += 1) {
      const angle = random() * Math.PI * 2;
      gradX[i] = Math.cos(angle);
      gradY[i] = Math.sin(angle);
    }

    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

    for (let y = 0; y < GRAIN_SIZE; y += 1) {
      const fy = (y * period) / GRAIN_SIZE;
      const y0 = Math.floor(fy) % period;
      const y1 = (y0 + 1) % period;
      const ry = fy - Math.floor(fy);
      const vy = fade(ry);

      for (let x = 0; x < GRAIN_SIZE; x += 1) {
        const fx = (x * period) / GRAIN_SIZE;
        const x0 = Math.floor(fx) % period;
        const x1 = (x0 + 1) % period;
        const rx = fx - Math.floor(fx);
        const vx = fade(rx);

        const d00 = gradX[y0 * period + x0] * rx + gradY[y0 * period + x0] * ry;
        const d10 = gradX[y0 * period + x1] * (rx - 1) + gradY[y0 * period + x1] * ry;
        const d01 = gradX[y1 * period + x0] * rx + gradY[y1 * period + x0] * (ry - 1);
        const d11 = gradX[y1 * period + x1] * (rx - 1) + gradY[y1 * period + x1] * (ry - 1);

        const top = d00 + (d10 - d00) * vx;
        const bottom = d01 + (d11 - d01) * vx;
        // Perlin is signed about zero; shift to 0..1 so the blotch channel
        // can be stored straight into a byte.
        out[y * GRAIN_SIZE + x] += weight * ((top + (bottom - top) * vy) * 0.7 + 0.5);
      }
    }
  });

  return out;
}

/**
 * The grain: R,G carry the gradient of a fine height field (the bump), B a
 * much coarser field (the roughness blotching). Storing the gradient rather
 * than the height is what keeps this to one texture fetch per axis — a
 * height would need three fetches an axis to difference, nine in all for
 * the triplanar, and the whole point is that this is cheap.
 *
 * 256 square, mipmapped: 256 KB on the card, and 25 ms of CPU to generate.
 * That 25 ms is a one-off and it is spent in the useMemo below, which runs
 * while the television is still holding and the panel has not opened, so it
 * never lands on a live frame. It is not per-frame cost.
 */
function makeGrainTexture() {
  const height = tileableFbm([23, 47, 91], [0.3, 0.35, 0.35], 0x51a7);
  const blotch = tileableFbm([3, 7, 13], [0.6, 0.28, 0.12], 0x2c19);

  // Central differences, wrapping, then scaled so the stored gradient uses
  // the whole byte range; the shader's uGrainBump is what sets the depth.
  const gx = new Float32Array(GRAIN_SIZE * GRAIN_SIZE);
  const gy = new Float32Array(GRAIN_SIZE * GRAIN_SIZE);
  let peak = 1e-6;
  for (let y = 0; y < GRAIN_SIZE; y += 1) {
    const up = ((y - 1 + GRAIN_SIZE) % GRAIN_SIZE) * GRAIN_SIZE;
    const down = ((y + 1) % GRAIN_SIZE) * GRAIN_SIZE;
    const row = y * GRAIN_SIZE;
    for (let x = 0; x < GRAIN_SIZE; x += 1) {
      const left = (x - 1 + GRAIN_SIZE) % GRAIN_SIZE;
      const right = (x + 1) % GRAIN_SIZE;
      const dx = (height[row + right] - height[row + left]) * 0.5;
      const dy = (height[down + x] - height[up + x]) * 0.5;
      gx[row + x] = dx;
      gy[row + x] = dy;
      peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
    }
  }

  const data = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE * 4);
  for (let i = 0; i < GRAIN_SIZE * GRAIN_SIZE; i += 1) {
    data[i * 4] = Math.round(((gx[i] / peak) * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round(((gy[i] / peak) * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, blotch[i])) * 255);
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, GRAIN_SIZE, GRAIN_SIZE, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  // Gradients and a roughness weight, not colour: must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return texture;
}

/**
 * The grain, wired into a standard material's program.
 *
 * Triplanar in the chunk's OWN space, not the world's: the geometry is
 * centred on its chunk, so the grain is nailed to the stone and rides every
 * piece through its flight instead of swimming past it. The price is that
 * the pattern's phase jumps across a cut while the figure is still whole —
 * invisible, because either side of the jump is the same isotropic noise.
 *
 * The normal is perturbed by the surface-gradient trick (project the height
 * gradient onto the tangent plane and lean the normal away from it) rather
 * than by a tangent-space normal map: the chunk geometries carry position
 * and normal only, and computing tangents for 398 pieces at load would cost
 * far more than this saves.
 */
function applyGrain(
  material: THREE.MeshStandardMaterial,
  grain: THREE.Texture,
  { bump, scale, roughVary }: { bump: number; roughVary: number; scale: number },
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = { value: grain };
    shader.uniforms.uGrainScale = { value: scale };
    shader.uniforms.uGrainBump = { value: bump };
    shader.uniforms.uGrainRough = { value: roughVary };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vGrainPos;
varying vec3 vGrainNrm;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
vGrainNrm = objectNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vGrainPos = transformed;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
// Declared here on purpose: three's fragment prefix does not carry it, but
// the renderer sets whatever uniform of this name a program exposes.
uniform mat3 normalMatrix;
uniform sampler2D uGrain;
uniform float uGrainScale;
uniform float uGrainBump;
uniform float uGrainRough;
varying vec3 vGrainPos;
varying vec3 vGrainNrm;

vec3 grainSample(out float blotch) {
  vec3 p = vGrainPos * uGrainScale;
  vec3 axis = abs(normalize(vGrainNrm));
  vec3 w = axis * axis * axis;
  w /= max(w.x + w.y + w.z, 1e-4);
  vec4 sx = texture2D(uGrain, p.yz);
  vec4 sy = texture2D(uGrain, p.zx);
  vec4 sz = texture2D(uGrain, p.xy);
  blotch = sx.b * w.x + sy.b * w.y + sz.b * w.z;
  vec2 gx = sx.rg * 2.0 - 1.0;
  vec2 gy = sy.rg * 2.0 - 1.0;
  vec2 gz = sz.rg * 2.0 - 1.0;
  // Each plane's 2D gradient put back on the two axes it was sampled from.
  return vec3(0.0, gx.x, gx.y) * w.x
       + vec3(gy.y, 0.0, gy.x) * w.y
       + vec3(gz.x, gz.y, 0.0) * w.z;
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float grainBlotch;
vec3 grainGrad = grainSample(grainBlotch);
roughnessFactor = clamp(roughnessFactor + (grainBlotch - 0.5) * uGrainRough, 0.04, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
{
  // normalMatrix is inverse-transpose, so it carries 1/scale; dividing by
  // its own scale keeps the grain the same depth on a chunk whose group has
  // been scaled and on one that has not.
  float invScale = length(normalMatrix[0]);
  vec3 g = (normalMatrix * grainGrad) / max(invScale, 1e-5);
  g -= normal * dot(normal, g);
  normal = normalize(normal - uGrainBump * g);
}`,
      );
  };
  // Two materials with different injected code must not share a compiled
  // program; three keys the cache on this.
  material.customProgramCacheKey = () => `marble-grain-${bump}-${scale}-${roughVary}`;
}

/** The outer stone. */
function makeSurfaceMaterial(grain: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    color: "#f1f1eb",
    emissive: "#ffffff",
    emissiveIntensity: 0.02,
    metalness: 0,
    // 0.88 before. That much roughness under these lights gave no specular
    // shape at all, so the big smooth areas read as one flat tone; 0.68 with
    // the grain swinging it +/-0.1 puts a broad soft highlight back on the
    // shoulder and the thigh. 0.6 went too far the other way and washed the
    // contrast out.
    roughness: 0.68,
    side: THREE.FrontSide,
  });
  // scale 9 puts ~28 tiles across the figure's ~3.1 units of height: fine
  // enough to read as stone at the 0.70 framing (where the statue fills the
  // panel) and not so fine that it aliases into noise as the pieces fly out.
  // bump 0.17 and roughVary 0.24 rather than the 0.13/0.2 first tried: with
  // the env map gone there is no specular sheen amplifying the perturbed
  // normal, and at 0.13 the grain had stopped reading on the broad thigh.
  // Both are free — the fetch count does not change with them.
  applyGrain(material, grain, { bump: 0.17, roughVary: 0.24, scale: 9 });

  return material;
}

/** The cut faces: a little greyer and duller than the polished outside. */
function makeInteriorMaterial() {
  // No grain on the cut faces, deliberately, and it is the single biggest
  // reason this change fits the frame budget. These are DoubleSide and there
  // are ~400 of them nested inside the whole figure, so while the statue is
  // intact they are the page's heaviest overdraw: the triplanar's three
  // texture fetches were being paid several times over per pixel. Dropping
  // them here is most of why this change is free: with the grain and an
  // env map on both materials the page went 8.3 -> 12.0 ms a frame (p50,
  // RTX 5060, 1280x800, vsync off), and with them off only the surface
  // keeps the grain and it measures 8.7 ms — inside the run-to-run noise.
  // Costs nothing to look at, either: a roughness-0.94 matte face barely
  // showed the grain anyway.
  return new THREE.MeshStandardMaterial({
    color: "#d8d8d0",
    emissive: "#ffffff",
    emissiveIntensity: 0.018,
    metalness: 0,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
}

/**
 * One surface and one cut-face material for a figure, made once and
 * disposed when the figure leaves.
 */
export function useMarbleMaterials() {
  const materials = useMemo(() => {
    const grain = makeGrainTexture();

    return {
      grain,
      interior: makeInteriorMaterial(),
      surface: makeSurfaceMaterial(grain),
    };
  }, []);
  // Disposed on the real unmount only, not whenever a dependency changes.
  // (React's development double-mount still runs this once against live
  // materials; three then rebuilds their program on the next draw, the
  // same as it does for the geometries disposed the same way.)
  const liveRef = useRef(materials);
  liveRef.current = materials;
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      live.interior.dispose();
      live.surface.dispose();
      live.grain.dispose();
    };
  }, []);

  return materials;
}
