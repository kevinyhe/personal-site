"use client";

import * as THREE from "three";

import {
  BLOSSOM_TINT_BRIGHT,
  BLOSSOM_TINT_PALE,
  BLOSSOM_TINT_ROSE,
  BLOSSOM_TINT_SOFT,
  createSakuraBlossomGeometry,
} from "@/components/BareThreeCanvas";
import { clamp01 } from "@/components/sakuraStage";
import type {
  StageAnchor,
  StageBuildContext,
  StageElement,
  StageElementFactory,
  StageFrame,
  StageQuality,
} from "@/components/sakuraStage";

/**
 * Blossom marks: real five-petal sakura flowers standing at the page's own
 * landmarks, each a bud that opens as it climbs the screen.
 *
 * The opening is geometry, not a scale-up. createSakuraBlossomGeometry(openness)
 * builds a shorter, narrower, cupped-inward corolla below openness 1 — a
 * half-open flower with the petals actually folded over the stamens. Building
 * it at 0.15 and at 1 gives two vertex arrays with the same topology (same
 * seed, same petal grid, same index list), so the shader can mix between them
 * per instance and every frame in between is a correct half-open flower.
 *
 * ONE InstancedMesh, one draw call, one shared material. Thirteen flowers as
 * thirteen meshes would be thirteen draw calls for ~2.5k triangles, and the
 * only thing that varies per flower is a matrix, a tint and one float.
 */

/** Geometry at this openness is the bud end of the mix. */
const BUD_OPENNESS = 0.15;

/**
 * Where the marks stand. Every selector here is a landmark that already
 * exists in HomeSections.tsx — the dated list, the "Selected work" heading,
 * the work rows, the approach to the Contact flip. A blossom on a heading is
 * worth ten scattered in the margin, so there are four groups and not forty.
 *
 * Contact itself gets NO mark. That section is opaque cream at z-[1] and the
 * stage canvas is z-0 behind it, so a flower placed over the flip is simply
 * painted out. The group keyed to "#contact" sits ABOVE its top edge instead,
 * on the black, where the reader meets the flip.
 */
type MarkGroup = {
  selector: string;
  /** Fraction of the box width, 0 = left edge. */
  x: number;
  /** Fraction of the box height. Negative reaches above the box. */
  y: number;
  /** World z. More negative is further away and smaller on screen. */
  depth: number;
  /** On-screen width of the open flower, CSS px. */
  sizePx: number;
};

const MARK_GROUPS: MarkGroup[] = [
  // The dated list. One flower in each outer margin, level with the rows.
  { selector: "[data-sections] > section:first-of-type", x: 0.035, y: 0.24, depth: -2.4, sizePx: 62 },
  { selector: "[data-sections] > section:first-of-type", x: 0.955, y: 0.62, depth: -4.2, sizePx: 44 },
  { selector: "[data-sections] > section:first-of-type", x: 0.13, y: 0.95, depth: -5.5, sizePx: 34 },

  // "Selected work". The heading sits low in its section's box, so these ride
  // the top of it where the words are.
  { selector: "#work", x: 0.9, y: 0.045, depth: -1.6, sizePx: 78 },
  { selector: "#work", x: 0.055, y: 0.11, depth: -3.6, sizePx: 48 },
  { selector: "#work", x: 0.78, y: 0.16, depth: -5.2, sizePx: 36 },

  // Down the right margin of the work rows, one every few entries.
  { selector: "[data-work-list]", x: 0.965, y: 0.16, depth: -2.9, sizePx: 54 },
  { selector: "[data-work-list]", x: 0.02, y: 0.44, depth: -4.6, sizePx: 40 },
  { selector: "[data-work-list]", x: 0.94, y: 0.72, depth: -3.4, sizePx: 50 },
  { selector: "[data-work-list]", x: 0.09, y: 0.93, depth: -5.8, sizePx: 32 },

  // The approach to the flip: three flowers in the dark just above the cream
  // edge, so the last thing before the page turns over is a bloom.
  { selector: "#contact", x: 0.16, y: -0.055, depth: -2.2, sizePx: 66 },
  { selector: "#contact", x: 0.5, y: -0.1, depth: -4.4, sizePx: 42 },
  { selector: "#contact", x: 0.85, y: -0.03, depth: -3.1, sizePx: 56 },
];

/** On "low" only the first N groups are built. */
const LOW_QUALITY_MARKS = 7;

type Mark = {
  anchor: StageAnchor;
  group: MarkGroup;
  /** Per-mark scatter so no two share a size, tilt, spin or phase. */
  sizeScale: number;
  tiltX: number;
  tiltY: number;
  spin: number;
  spinPhase: number;
  windPhase: number;
  windRate: number;
  windAmp: number;
  /** Screen-space float, CSS px, so the flower sits in air not on glass. */
  floatPx: number;
  floatRate: number;
  /** Shifts this mark's own opening window up or down the screen. */
  openOffset: number;
};

/** Small deterministic RNG so a rebuild after context loss looks identical. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * The hero's four tint colours, drawn from with this file's own numbers.
 *
 * Deliberately NOT the hero's sampleBlossomTint (BareThreeCanvas.tsx:1735) —
 * that one is module-private, and these thirteen flowers are large and sparse
 * where the canopy's are small and massed, so they are biased brighter: a
 * 22% pale-white share against the canopy's 8%, and a wider lightness spread.
 * The colours are the hero's; the distribution is not.
 */
function sampleTint(rng: () => number, target: THREE.Color) {
  const t = Math.pow(rng(), 1.15);
  if (t < 0.5) target.lerpColors(BLOSSOM_TINT_PALE, BLOSSOM_TINT_SOFT, t * 2);
  else target.lerpColors(BLOSSOM_TINT_SOFT, BLOSSOM_TINT_ROSE, (t - 0.5) * 2);
  if (rng() < 0.22) target.lerp(BLOSSOM_TINT_BRIGHT, 0.5);
  target.offsetHSL((rng() * 2 - 1) * 0.01, -0.04 + rng() * 0.1, -0.03 + rng() * 0.06);
  return target;
}

/**
 * Build the bud-end position/normal arrays that pair with the open geometry.
 *
 * The two geometries agree vertex for vertex up to the stamens, which the
 * generator only emits above openness 0.75 — so the bud array is 20 vertices
 * (five quads) short of the open one at full detail, and exactly the same
 * length at low detail where stamens are dropped from both. The missing
 * vertices collapse onto the flower's own centre point, which is what a bud
 * does: the stamens are inside it and come out as it opens.
 */
function buildBudArrays(
  open: THREE.BufferGeometry,
  bud: THREE.BufferGeometry,
  centreShiftZ: number,
) {
  const openPos = open.getAttribute("position") as THREE.BufferAttribute;
  const openNrm = open.getAttribute("normal") as THREE.BufferAttribute;
  const budPos = bud.getAttribute("position") as THREE.BufferAttribute;
  const budNrm = bud.getAttribute("normal") as THREE.BufferAttribute;
  const total = openPos.count;
  const shared = Math.min(total, budPos.count);

  // The bud's centre: the vertex on its own axis with the greatest z. That is
  // the crown of the centre disc, found by geometry rather than by copying a
  // private constant out of BareThreeCanvas.
  let cx = 0;
  let cy = 0;
  let cz = -Infinity;
  for (let i = 0; i < budPos.count; i += 1) {
    const x = budPos.getX(i);
    const y = budPos.getY(i);
    if (Math.abs(x) > 1e-5 || Math.abs(y) > 1e-5) continue;
    const z = budPos.getZ(i);
    if (z > cz) {
      cx = x;
      cy = y;
      cz = z;
    }
  }
  if (cz === -Infinity) cz = 0;

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  for (let i = 0; i < shared; i += 1) {
    positions[i * 3] = budPos.getX(i);
    positions[i * 3 + 1] = budPos.getY(i);
    positions[i * 3 + 2] = budPos.getZ(i) - centreShiftZ;
    normals[i * 3] = budNrm.getX(i);
    normals[i * 3 + 1] = budNrm.getY(i);
    normals[i * 3 + 2] = budNrm.getZ(i);
  }
  for (let i = shared; i < total; i += 1) {
    positions[i * 3] = cx;
    positions[i * 3 + 1] = cy;
    positions[i * 3 + 2] = cz - centreShiftZ;
    // Keep the open normal on the collapsed vertices: they are degenerate at
    // the bud end anyway and a zero normal would blow up the lighting halfway
    // through the mix.
    normals[i * 3] = openNrm.getX(i);
    normals[i * 3 + 1] = openNrm.getY(i);
    normals[i * 3 + 2] = openNrm.getZ(i);
  }
  return { normals, positions };
}

const makeSakuraBlossomMarks: StageElementFactory = () => {
  let mesh: THREE.InstancedMesh | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let openAttr: THREE.InstancedBufferAttribute | null = null;
  let marks: Mark[] = [];
  /** World units across the open flower, for turning sizePx into a scale. */
  let span = 1;

  // Preallocated: update() runs every frame and allocates nothing.
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();
  const tmpQuat = new THREE.Quaternion();
  const tmpMatrix = new THREE.Matrix4();
  const hiddenScale = new THREE.Vector3(0, 0, 0);

  const build = (ctx: StageBuildContext) => {
    const quality: StageQuality = ctx.quality;
    const lowDetail = quality === "low";
    const groups = lowDetail ? MARK_GROUPS.slice(0, LOW_QUALITY_MARKS) : MARK_GROUPS;

    const openGeometry = createSakuraBlossomGeometry(1, lowDetail);
    const budGeometry = createSakuraBlossomGeometry(BUD_OPENNESS, lowDetail);

    // Recentre on the corolla rather than on the pedicel base, so a mark's
    // screen position is the middle of the flower and not the stem it hangs
    // from. Taken from the bounding box, so no constant is copied over.
    openGeometry.computeBoundingBox();
    const box = openGeometry.boundingBox;
    const centreShiftZ = box ? (box.min.z + box.max.z) / 2 : 0;
    span = box ? Math.max(box.max.x - box.min.x, box.max.y - box.min.y) : 1;
    openGeometry.translate(0, 0, -centreShiftZ);

    const bud = buildBudArrays(openGeometry, budGeometry, centreShiftZ);
    budGeometry.dispose();

    openGeometry.setAttribute(
      "budPosition",
      new THREE.BufferAttribute(bud.positions, 3),
    );
    openGeometry.setAttribute(
      "budNormal",
      new THREE.BufferAttribute(bud.normals, 3),
    );
    geometry = openGeometry;

    material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      // The same lift the hero's canopy carries: against pure black these
      // would otherwise read as grey until a light happened to catch them.
      emissive: 0xffa3d6,
      emissiveIntensity: 0.3,
      metalness: 0,
      roughness: 0.55,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    // The whole opening animation is these three lines: mix the bud vertex
    // into the open vertex by one float per instance. No morph targets, no
    // per-frame geometry rebuild, no second draw call.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           attribute vec3 budPosition;
           attribute vec3 budNormal;
           attribute float blossomOpen;`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          "vec3 objectNormal = normalize(mix(budNormal, normal, blossomOpen));",
        )
        .replace(
          "#include <begin_vertex>",
          "vec3 transformed = mix(budPosition, position, blossomOpen);",
        );
    };
    material.customProgramCacheKey = () => "sakura-blossom-mark-v1";

    const count = groups.length;
    const openValues = new Float32Array(count);
    openAttr = new THREE.InstancedBufferAttribute(openValues, 1);
    openAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("blossomOpen", openAttr);

    const instanced = new THREE.InstancedMesh(geometry, material, count);
    instanced.name = "Sakura blossom marks";
    // Every instance is repositioned per frame from a live anchor, so the
    // bounding sphere three would cull against is stale by definition.
    instanced.frustumCulled = false;
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const rng = makeRng(0x51a7c);
    const tint = new THREE.Color();
    marks = groups.map((group, i) => {
      instanced.setColorAt(i, sampleTint(rng, tint));
      // Everything below is scatter: no two marks the same size, tilt, spin
      // rate or opening moment.
      return {
        anchor: ctx.anchor(group.selector),
        floatPx: 4 + rng() * 7,
        floatRate: 0.22 + rng() * 0.3,
        group,
        openOffset: (rng() * 2 - 1) * 0.16,
        sizeScale: 0.86 + rng() * 0.3,
        spin: (rng() < 0.5 ? -1 : 1) * (0.06 + rng() * 0.13),
        spinPhase: rng() * Math.PI * 2,
        tiltX: (rng() * 2 - 1) * 0.42,
        tiltY: (rng() * 2 - 1) * 0.5,
        windAmp: 0.07 + rng() * 0.07,
        windPhase: rng() * Math.PI * 2,
        windRate: 0.5 + rng() * 0.5,
      };
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;

    mesh = instanced;
    return instanced;
  };

  const update = (frame: StageFrame) => {
    const instanced = mesh;
    const open = openAttr;
    if (!instanced || !open) return;

    const viewportHeight = frame.viewport.height;
    const time = frame.reducedMotion ? 0 : frame.time;
    // A push in the direction of travel, capped so a flung scroll does not
    // lay the flowers flat. 2000 px/s of scroll is worth about 0.2 rad.
    const lean = frame.reducedMotion
      ? 0
      : Math.max(-0.2, Math.min(0.2, frame.scrollVelocity * 0.0001));

    for (let i = 0; i < marks.length; i += 1) {
      const mark = marks[i];
      const anchor = mark.anchor;
      if (!anchor.found) {
        instanced.setMatrixAt(i, tmpMatrix.identity().scale(hiddenScale));
        continue;
      }

      const drift = mark.floatPx * Math.sin(time * mark.floatRate + mark.windPhase);
      const px = anchor.left + anchor.width * mark.group.x + drift * 0.6;
      const py = anchor.top + anchor.height * mark.group.y + drift;

      // Off screen: park the instance at zero scale rather than letting it
      // draw. Cheaper than a per-mark visibility flag and it costs one matrix.
      if (py < -0.2 * viewportHeight || py > 1.2 * viewportHeight) {
        instanced.setMatrixAt(i, tmpMatrix.identity().scale(hiddenScale));
        open.setX(i, 1);
        continue;
      }

      /*
       * The mark's OWN progress, not its section's: how far it has climbed
       * the screen. It opens across the lower half of the viewport and is
       * fully out by the time it reaches the middle. This is a pure function
       * of the current screen position, so scrolling back down closes it
       * again exactly the way it opened — there is no latch and no state
       * carried between frames.
       */
      const climb = clamp01(
        (viewportHeight * (0.94 + mark.openOffset * 0.25) - py) /
          Math.max(1, viewportHeight * 0.5),
      );
      const openness = frame.reducedMotion ? 1 : smoothstep(0, 1, climb);
      open.setX(i, openness);

      const worldPerPx = frame.worldUnitsPerPixel(mark.group.depth);
      // A bud is a smaller object than the flower it becomes, on top of the
      // geometry already being shorter and narrower.
      const scale =
        ((mark.group.sizePx * mark.sizeScale * worldPerPx) / span) *
        (0.66 + 0.34 * openness);

      frame.screenToWorld(px, py, mark.group.depth, tmpPos);
      tmpEuler.set(
        mark.tiltX + lean + Math.sin(time * mark.windRate + mark.windPhase) * mark.windAmp,
        mark.tiltY + Math.cos(time * mark.windRate * 0.79 + mark.windPhase) * mark.windAmp * 1.3,
        mark.spinPhase + time * mark.spin,
      );
      tmpQuat.setFromEuler(tmpEuler);
      tmpScale.setScalar(scale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      instanced.setMatrixAt(i, tmpMatrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    open.needsUpdate = true;
  };

  const dispose = () => {
    geometry?.dispose();
    material?.dispose();
    geometry = null;
    material = null;
    openAttr = null;
    mesh = null;
    marks = [];
  };

  const element: StageElement = {
    build,
    dispose,
    name: "sakura-blossom-marks",
    update,
  };
  return element;
};

export default makeSakuraBlossomMarks;
