"use client";

/**
 * The bough the petals fall from.
 *
 * Below the hero the page had petals but no tree, so they read as confetti.
 * This hangs a real cherry bough across the top of the sections block: the
 * hero's own branch tubes, the hero's own blossoms, the hero's own wind, and
 * a list of its twig tips published in screen pixels so the 2D petal field
 * can drop its petals from under the branch instead of off the top edge.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE GEOMETRY COMES FROM, AND WHY IT IS NOT DRAWN BY HAND
 * ---------------------------------------------------------------------------
 * BareThreeCanvas exports exactly one thing that can build a cherry branch:
 * WeepingCherryGenerator. Branch, getBranchWindVectors and the palette are
 * exported too, but BranchGeometryBuilder, applyBranchWind, WIND_SHADER_CHUNK,
 * createBarkTextures, applyBlossomWind and createSakuraBudGeometry are all
 * module-private. Building a bough "from scratch" out of the exported pieces
 * would mean copying ~200 lines of GLSL and the bark texture generator into
 * this file, where they would drift away from the hero's copy the first time
 * anybody retunes the tree.
 *
 * So: grow the whole tree, then keep ONE limb of it and throw the rest away
 * before anything reaches the GPU.
 *
 *   1. generate() hands back `branches` in exactly the order buildBranchMesh
 *      appended them (`for (const branch of this.branches) builder.append`),
 *      and every branch's vertex/index count is a pure function of its depth,
 *      its baseRadius and its terminal flag. Replaying that arithmetic gives
 *      the exact vertex and index range of every branch inside the one big
 *      branch geometry. The replay is checked against the real vertex count
 *      before anything is copied; if the tables below ever fall out of step
 *      with BranchGeometryBuilder the element builds nothing rather than
 *      slicing the buffer at the wrong offsets (see SEGMENT TABLES).
 *   2. The chosen primary's subtree is copied out into a compacted geometry —
 *      positions, normals, uvs, vertex colours and BOTH wind attribute sets,
 *      so the limb keeps the wind it was grown with. The original whole-tree
 *      geometry is disposed on the spot.
 *   3. The four blossom InstancedMeshes are filtered the same way: a blossom
 *      stays if the branch sample nearest its spur point belongs to the kept
 *      subtree. Every per-instance attribute travels with it, including
 *      blossomWindParams1/2 — which is what makes a blossom move WITH its
 *      twig instead of swimming next to it (BareThreeCanvas.tsx:673-677).
 *
 * What this costs: the generator still grows and blossoms a whole tree and we
 * discard about five sixths of it. That is roughly 1-2 s of phased build time
 * (yielded a frame at a time, so the page keeps painting) for a bough that
 * draws about a sixth of a tree's triangles every frame. The alternative —
 * showing the whole tree and pushing five sixths of it off screen — pays the
 * same build and then pays the vertex cost of the whole tree, forever, on top
 * of the hero's tree. This way the frame cost is the bough only.
 *
 * ---------------------------------------------------------------------------
 * WHERE IT SITS
 * ---------------------------------------------------------------------------
 * The stage canvas is fixed and full-viewport, inside the sections block, so
 * anything drawn above the block's top edge paints over the hero. The bough is
 * therefore hung FROM the block's top edge and everything about it lives below
 * that line: the limb comes in off the RIGHT edge (BOUGH_ROOT_X, and see the
 * contrast measurement there), the twigs weep down and to the left. It
 * rides up at BOUGH_PARALLAX of the page's speed, so it stays overhead for
 * about two screens and then leaves, and the petal field goes back to spawning
 * off the top edge on its own (see components/boughSpawn.ts).
 *
 * It paints behind the type (the stage canvas is z-0 under sections at z-[1])
 * and sits BOUGH_DEPTH world units behind the focal plane, which both shrinks
 * it and thins it in the halftone. Those two constants are the knobs if the
 * blossoms ever read as ink over the words rather than as ground.
 */

import { SPAWN_POINT_COUNT, boughSpawn } from "@/components/boughSpawn";
import {
  WeepingCherryGenerator,
  type Branch,
  type BranchWindUniforms,
} from "@/components/BareThreeCanvas";
import type {
  StageBuildContext,
  StageElement,
  StageElementFactory,
  StageFrame,
  StageQuality,
  StageResizeContext,
} from "@/components/sakuraStage";
import { clamp01 } from "@/components/sakuraStage";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** World z the bough hangs on. Negative is further from the camera: smaller
 *  on screen, and fewer halftone cells across a blossom, which is what keeps
 *  it reading as ground behind the type. */
const BOUGH_DEPTH = -5.2;
const BOUGH_DEPTH_LOW = -8;

/** Fraction of the viewport width the bough spans, tip to cut end. */
const BOUGH_SPAN = 0.56;
const BOUGH_SPAN_LOW = 0.5;

/** Screen x of the bough's cut end, as a fraction of the viewport width. Off
 *  the RIGHT edge, for two reasons. A limb that starts inside the frame reads
 *  as a stick; one that starts outside it reads as part of a tree. And the
 *  right half of this page is empty — every heading and every line of body
 *  copy is left-aligned inside 40rem — so a canopy hung on the right crosses
 *  no words. Hung on the left it crossed the work rows, and measured there
 *  the blossom mass took "President. 56 members, a $140,000 budget" from
 *  6.5:1 to about 1.2:1: the type is 60% white, so a bright ground behind it
 *  bleeds through the glyphs and the text does not survive it. Behind the
 *  type is not a contrast argument when the type is translucent. */
const BOUGH_ROOT_X = 1.06;

/** How much slower than the page the bough travels. 1 would pin it to the
 *  document (gone after one screen), 0 would pin it to the viewport (it would
 *  never leave, and would follow you into the Contact panel). */
const BOUGH_PARALLAX = 0.55;

/** Where the bough settles once it is fully on screen, as a fraction of the
 *  viewport height: the point it HANGS FROM, with the twigs weeping below it.
 *  A third of the way down keeps the limb in the upper band and the tips
 *  around the middle, rather than the whole bough sitting over the running
 *  text as the block arrives. */
const BOUGH_HANG_Y = 0.34;

/** Direction the limb runs after alignment: leftward off the right edge,
 *  tipping down into the frame. The rotation onto this is the minimal one, so
 *  the twigs' droop stays a droop. */
const BOUGH_AIM = new THREE.Vector3(-1, -0.3, 0.08).normalize();

/** Blossom budget handed to the generator. About a sixth survives the cut. */
const BLOSSOM_BUDGET: Record<StageQuality, number> = {
  high: 14000,
  low: 3000,
  medium: 9000,
};

// The petal field's end of the deal lives in components/boughSpawn.ts, which
// has no three import: PetalDrift is a 2D canvas and must not drag this file
// (and BareThreeCanvas behind it) into its bundle to read two numbers.
export { boughSpawn, sampleBoughSpawn, type BoughSpawnField } from "@/components/boughSpawn";

// ---------------------------------------------------------------------------
// SEGMENT TABLES
// ---------------------------------------------------------------------------
// Copies of BranchGeometryBuilder.getTubularSegments / getRadialSegments
// (BareThreeCanvas.tsx:855-882), which are private. They are copied rather
// than guessed, and the copy is VERIFIED: measureBranchRanges() sums the
// counts these produce and the caller compares that sum against the real
// geometry's vertex and index counts. A mismatch means the builder changed
// and this file's arithmetic is stale, and the element gives up instead of
// cutting the buffer at wrong offsets.

function tubularSegmentsFor(branch: Branch) {
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

function radialSegmentsFor(branch: Branch) {
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

type BranchRange = {
  branch: Branch;
  vertexStart: number;
  vertexCount: number;
  indexStart: number;
  indexCount: number;
};

function measureBranchRanges(branches: Branch[]) {
  const ranges: BranchRange[] = [];
  let vertexStart = 0;
  let indexStart = 0;
  for (const branch of branches) {
    const tubular = tubularSegmentsFor(branch);
    const radial = radialSegmentsFor(branch);
    const caps = (branch.depth === 0 ? 1 : 0) + (branch.terminal ? 1 : 0);
    const vertexCount = (tubular + 1) * radial + caps * (1 + radial);
    const indexCount = tubular * radial * 6 + caps * radial * 3;
    ranges.push({ branch, indexCount, indexStart, vertexCount, vertexStart });
    vertexStart += vertexCount;
    indexStart += indexCount;
  }
  return ranges;
}

// ---------------------------------------------------------------------------
// Cutting one limb out of the tree
// ---------------------------------------------------------------------------

function collectSubtree(root: Branch, out: Branch[]) {
  out.push(root);
  for (const child of root.children) collectSubtree(child, out);
}

const BRANCH_ATTRIBUTES = [
  "position",
  "normal",
  "uv",
  "color",
  "windParams1",
  "windParams2",
] as const;

/**
 * Copies the kept branches' vertices and triangles into a geometry of their
 * own. Every branch's triangles only ever index its own vertices (the builder
 * writes them with a per-branch baseIndex), so a range copy plus a constant
 * index shift is all it takes.
 *
 * Returns null if the range arithmetic does not agree with the source.
 */
function cutBranchGeometry(
  source: THREE.BufferGeometry,
  ranges: BranchRange[],
  keep: Set<number>,
) {
  const sourceIndex = source.getIndex();
  if (!sourceIndex) return null;
  const last = ranges[ranges.length - 1];
  const totalVertices = last.vertexStart + last.vertexCount;
  const totalIndices = last.indexStart + last.indexCount;
  if (
    totalVertices !== source.getAttribute("position").count ||
    totalIndices !== sourceIndex.count
  ) {
    return null;
  }

  let vertexCount = 0;
  let indexCount = 0;
  for (const range of ranges) {
    if (!keep.has(range.branch.id)) continue;
    vertexCount += range.vertexCount;
    indexCount += range.indexCount;
  }
  if (vertexCount === 0 || indexCount === 0) return null;

  const geometry = new THREE.BufferGeometry();
  for (const name of BRANCH_ATTRIBUTES) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const itemSize = attribute.itemSize;
    const src = attribute.array as Float32Array;
    const dst = new Float32Array(vertexCount * itemSize);
    let write = 0;
    for (const range of ranges) {
      if (!keep.has(range.branch.id)) continue;
      dst.set(
        src.subarray(
          range.vertexStart * itemSize,
          (range.vertexStart + range.vertexCount) * itemSize,
        ),
        write,
      );
      write += range.vertexCount * itemSize;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(dst, itemSize));
  }

  const src = sourceIndex.array as ArrayLike<number>;
  const dst = new Uint32Array(indexCount);
  let write = 0;
  let vertexWrite = 0;
  for (const range of ranges) {
    if (!keep.has(range.branch.id)) continue;
    const shift = vertexWrite - range.vertexStart;
    for (let i = 0; i < range.indexCount; i += 1) {
      dst[write + i] = src[range.indexStart + i] + shift;
    }
    write += range.indexCount;
    vertexWrite += range.vertexCount;
  }
  geometry.setIndex(new THREE.BufferAttribute(dst, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Nearest-branch lookup over a dense sampling of every branch curve.
 *
 * A blossom's spur point sits ON a branch curve, pushed out by at most the
 * branch radius plus 0.07 (BareThreeCanvas.tsx:5014-5019), so "which branch is
 * this flower on" is a nearest-sample query with a small radius. Doing it
 * against ALL branches rather than only the kept ones is what stops flowers
 * from a neighbouring limb being kept as floaters: a blossom survives only if
 * the sample nearest it belongs to the bough.
 */
class BranchSamples {
  private static readonly CELL = 0.3;
  private xs: Float32Array;
  private ys: Float32Array;
  private zs: Float32Array;
  private ids: Int32Array;
  private cells = new Map<number, number[]>();
  private count = 0;

  constructor(branches: Branch[], spacing = 0.08) {
    let total = 0;
    const lengths: number[] = [];
    for (const branch of branches) {
      const steps = Math.max(2, Math.ceil(branch.curve.getLength() / spacing));
      lengths.push(steps);
      total += steps + 1;
    }
    this.xs = new Float32Array(total);
    this.ys = new Float32Array(total);
    this.zs = new Float32Array(total);
    this.ids = new Int32Array(total);
    const point = new THREE.Vector3();
    for (let b = 0; b < branches.length; b += 1) {
      const branch = branches[b];
      const steps = lengths[b];
      for (let i = 0; i <= steps; i += 1) {
        branch.curve.getPointAt(i / steps, point);
        this.push(point.x, point.y, point.z, branch.id);
      }
    }
  }

  private key(ix: number, iy: number, iz: number) {
    // Numeric hash: a template-string key allocates on every one of the tens
    // of thousands of inserts and lookups this does. Collisions merge two
    // cells' lists, which only ever adds candidates — the caller measures a
    // real distance to each, so the answer stays correct.
    return (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
  }

  private push(x: number, y: number, z: number, id: number) {
    const i = this.count;
    this.xs[i] = x;
    this.ys[i] = y;
    this.zs[i] = z;
    this.ids[i] = id;
    this.count = i + 1;
    const cell = BranchSamples.CELL;
    const k = this.key(
      Math.floor(x / cell),
      Math.floor(y / cell),
      Math.floor(z / cell),
    );
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(i);
    else this.cells.set(k, [i]);
  }

  /** Branch id of the sample nearest (x, y, z), or -1 if none is within 0.3. */
  nearest(x: number, y: number, z: number) {
    const cell = BranchSamples.CELL;
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    const iz = Math.floor(z / cell);
    let best = cell * cell;
    let bestId = -1;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = this.cells.get(this.key(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;
          for (let n = 0; n < bucket.length; n += 1) {
            const i = bucket[n];
            const ex = this.xs[i] - x;
            const ey = this.ys[i] - y;
            const ez = this.zs[i] - z;
            const d = ex * ex + ey * ey + ez * ez;
            if (d < best) {
              best = d;
              bestId = this.ids[i];
            }
          }
        }
      }
    }
    return bestId;
  }
}

const BLOSSOM_ATTRIBUTES: [string, number][] = [
  ["blossomWindParams1", 4],
  ["blossomWindParams2", 4],
  ["blossomPhase", 1],
  ["blossomFlutter", 1],
  ["blossomRevealT", 1],
  ["blossomEmissive", 1],
  ["blossomShade", 4],
];

/**
 * Drops every instance whose spur point is not on the bough, rewriting the
 * instance matrix, the instance colours and all seven per-instance attributes.
 *
 * Safe to do by replacing the attributes outright because nothing has been
 * rendered yet — the meshes only reach the scene when build() returns them, so
 * no GL buffer exists for the arrays being thrown away.
 */
function filterBlossoms(
  mesh: THREE.InstancedMesh,
  samples: BranchSamples,
  keep: Set<number>,
) {
  const source = mesh.count;
  if (source === 0) return 0;
  const matrix = mesh.instanceMatrix.array as Float32Array;
  const kept: number[] = [];
  for (let i = 0; i < source; i += 1) {
    const o = i * 16;
    const id = samples.nearest(matrix[o + 12], matrix[o + 13], matrix[o + 14]);
    if (id >= 0 && keep.has(id)) kept.push(i);
  }
  const count = kept.length;

  const nextMatrix = new Float32Array(count * 16);
  for (let k = 0; k < count; k += 1) {
    nextMatrix.set(matrix.subarray(kept[k] * 16, kept[k] * 16 + 16), k * 16);
  }
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(nextMatrix, 16);
  mesh.instanceMatrix.needsUpdate = true;

  if (mesh.instanceColor) {
    const colors = mesh.instanceColor.array as Float32Array;
    const nextColors = new Float32Array(count * 3);
    for (let k = 0; k < count; k += 1) {
      nextColors.set(colors.subarray(kept[k] * 3, kept[k] * 3 + 3), k * 3);
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(nextColors, 3);
    mesh.instanceColor.needsUpdate = true;
  }

  for (const [name, itemSize] of BLOSSOM_ATTRIBUTES) {
    const attribute = mesh.geometry.getAttribute(name);
    if (!attribute) continue;
    const src = attribute.array as Float32Array;
    const dst = new Float32Array(count * itemSize);
    for (let k = 0; k < count; k += 1) {
      dst.set(
        src.subarray(kept[k] * itemSize, kept[k] * itemSize + itemSize),
        k * itemSize,
      );
    }
    mesh.geometry.setAttribute(
      name,
      new THREE.InstancedBufferAttribute(dst, itemSize),
    );
  }

  mesh.count = count;
  return count;
}

// ---------------------------------------------------------------------------
// The element
// ---------------------------------------------------------------------------

function disposeTree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as
      | (THREE.Material & { map?: THREE.Texture | null })
      | THREE.Material[]
      | undefined;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const entry of list) {
      const maps = entry as THREE.Material & {
        bumpMap?: THREE.Texture | null;
        map?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
      };
      for (const texture of [maps.map, maps.bumpMap, maps.roughnessMap]) {
        if (texture && !textures.has(texture)) {
          texture.dispose();
          textures.add(texture);
        }
      }
      entry.dispose();
    }
  });
}

export type SakuraBoughOptions = {
  /**
   * A multiplier on the blossom budget. The narration's bough carries
   * twice the flowers of the work sections' (asked for as "more blossoms
   * on the edges of the twigs"); everything else about the two is the same.
   */
  blossoms?: number;
};

export function makeSakuraBough(options: SakuraBoughOptions = {}): StageElement {
  // Everything below is per-build state. It lives in the closure of the
  // element, not the module, so a context-restore rebuild starts clean.
  const root = new THREE.Group();
  root.name = "Sakura bough";
  const pivot = new THREE.Group();
  const local = new THREE.Group();
  pivot.add(local);
  root.add(pivot);

  let wind: BranchWindUniforms | null = null;
  let growth: { value: number } | null = null;
  let boughWidth = 1;
  let alignedBox: THREE.Box3 | null = null;
  let ready = false;

  // Twig tips in `local` space, and the scratch the projection runs through.
  let tipPoints = new Float32Array(0);
  const scratch = new THREE.Vector3();

  const place = (
    viewportWidth: number,
    quality: StageQuality,
    unitsPerPixel: (depth?: number) => number,
  ) => {
    if (!alignedBox) return;
    const depth = quality === "low" ? BOUGH_DEPTH_LOW : BOUGH_DEPTH;
    const span = quality === "low" ? BOUGH_SPAN_LOW : BOUGH_SPAN;
    const targetWorld = viewportWidth * span * unitsPerPixel(depth);
    const scale = targetWorld / Math.max(1e-4, boughWidth);
    pivot.scale.setScalar(scale);
    // The aligned box, scaled, hung so its RIGHT edge is at the root's x and
    // its top edge is at the root's y. Right edge because the limb runs
    // leftward (BOUGH_AIM): the cut end is the box's max x, and pinning that
    // just off the right of the screen is what puts the whole bough inside
    // the frame instead of past it. Top edge because everything the bough
    // owns must stay below the line the root sits on — that line is the
    // sections block's top edge, and the stage canvas paints over the hero
    // above it.
    pivot.position.set(
      -alignedBox.max.x * scale,
      -alignedBox.max.y * scale,
      0,
    );
  };

  const build = async (ctx: StageBuildContext) => {
    const generator = new WeepingCherryGenerator({
      blossomCount: Math.round(BLOSSOM_BUDGET[ctx.quality] * (options.blossoms ?? 1)),
      // The 2D field below the fold is the loose-petal system down here, so
      // the generator's own WebGL petals are switched off entirely.
      petalCount: 0,
      quality: ctx.quality,
      seed: 71104,
    });
    const tree = await generator.generate(ctx.yield);
    if (ctx.aborted()) {
      disposeTree(generator.group);
      return null;
    }

    const branchMesh = tree.branchMesh;
    if (!branchMesh || tree.branches.length === 0) {
      disposeTree(generator.group);
      return null;
    }

    // The fullest primary: the one carrying the most geometry is the one with
    // the most twigs and therefore the most blossoms, which is what a bough
    // hanging over a page wants to be.
    const ranges = measureBranchRanges(tree.branches);
    const sizeById = new Map<number, number>();
    for (const range of ranges) sizeById.set(range.branch.id, range.vertexCount);
    let chosen: Branch | null = null;
    let chosenSubtree: Branch[] = [];
    let chosenSize = -1;
    for (const branch of tree.branches) {
      if (branch.depth !== 1) continue;
      const subtree: Branch[] = [];
      collectSubtree(branch, subtree);
      let size = 0;
      for (const member of subtree) size += sizeById.get(member.id) ?? 0;
      if (size > chosenSize) {
        chosen = branch;
        chosenSize = size;
        chosenSubtree = subtree;
      }
    }
    if (!chosen) {
      disposeTree(generator.group);
      return null;
    }

    const keep = new Set<number>();
    for (const member of chosenSubtree) keep.add(member.id);

    const geometry = cutBranchGeometry(branchMesh.geometry, ranges, keep);
    if (!geometry) {
      // The segment tables no longer match BranchGeometryBuilder. Draw
      // nothing rather than slice the buffer at the wrong offsets.
      console.warn(
        "[sakuraBough] branch range replay disagreed with the built geometry; skipping the bough",
      );
      disposeTree(generator.group);
      return null;
    }
    await ctx.yield();
    if (ctx.aborted()) {
      geometry.dispose();
      disposeTree(generator.group);
      return null;
    }

    const boughMesh = new THREE.Mesh(geometry, branchMesh.material);
    boughMesh.name = "Cherry bough";
    branchMesh.geometry.dispose();
    branchMesh.removeFromParent();
    local.add(boughMesh);

    // Blossoms. One sampling of every branch curve, four filters against it.
    const samples = new BranchSamples(tree.branches);
    await ctx.yield();
    if (ctx.aborted()) {
      geometry.dispose();
      disposeTree(generator.group);
      disposeTree(root);
      return null;
    }
    const blossomMeshes = [
      tree.blossomMesh,
      tree.lowBlossomMesh,
      tree.halfBlossomMesh,
      tree.budMesh,
    ];
    for (const mesh of blossomMeshes) {
      if (!mesh) continue;
      const count = filterBlossoms(mesh, samples, keep);
      mesh.removeFromParent();
      // A variant that lost every instance keeps its geometry off the graph.
      // Only the geometry: the four meshes SHARE one material, so disposing
      // this one's material would take the other three's with it.
      if (count > 0) local.add(mesh);
      else mesh.geometry.dispose();
      await ctx.yield();
      if (ctx.aborted()) {
        disposeTree(generator.group);
        disposeTree(root);
        return null;
      }
    }
    // Anything the generator built and we did not take.
    disposeTree(generator.group);

    wind = tree.branchWindUniforms;
    growth = tree.blossomGrowth;
    growth.value = 0;

    // Lay the limb along BOUGH_AIM with the minimal rotation, so the weeping
    // twigs stay pointed down, and drop the limb's cut end on the origin.
    const rootPoint = chosen.getPoint(0, new THREE.Vector3());
    const tipPoint = chosen.getEnd(new THREE.Vector3());
    const axis = tipPoint.sub(rootPoint).normalize();
    local.position.copy(rootPoint).multiplyScalar(-1);
    pivot.quaternion.setFromUnitVectors(axis, BOUGH_AIM);

    // The bough's extent AFTER that rotation, which is what the screen sees
    // and therefore what the placement scales and hangs.
    local.updateMatrix();
    pivot.updateMatrix();
    const boxMatrix = new THREE.Matrix4().multiplyMatrices(
      pivot.matrix,
      local.matrix,
    );
    alignedBox = new THREE.Box3();
    const bounds = geometry.boundingBox;
    if (bounds) {
      alignedBox.copy(bounds).applyMatrix4(boxMatrix);
    }
    for (const mesh of blossomMeshes) {
      if (!mesh || mesh.count === 0) continue;
      mesh.computeBoundingBox();
      if (mesh.boundingBox) {
        alignedBox.union(mesh.boundingBox.clone().applyMatrix4(boxMatrix));
      }
    }
    boughWidth = Math.max(1e-4, alignedBox.max.x - alignedBox.min.x);

    // Petal spawn points: the lowest-hanging kept twig tips, spread across the
    // bough's length so the field does not rain out of one spot. Stored in
    // `local` space and projected every frame.
    const terminals = chosenSubtree.filter((branch) => branch.terminal);
    const tips = terminals.map((branch) => branch.getEnd(new THREE.Vector3()));
    tips.sort((a, b) => a.y - b.y);
    const hanging = tips.slice(0, Math.max(1, Math.ceil(tips.length * 0.4)));
    // Sorted along the limb, then evenly strided: the spread is across the
    // branch, not across whichever twigs happen to droop lowest.
    hanging.sort((a, b) => a.dot(axis) - b.dot(axis));
    const wanted = Math.min(SPAWN_POINT_COUNT, hanging.length);
    tipPoints = new Float32Array(wanted * 3);
    for (let i = 0; i < wanted; i += 1) {
      const point = hanging[Math.floor((i * hanging.length) / wanted)];
      tipPoints[i * 3] = point.x;
      tipPoints[i * 3 + 1] = point.y;
      tipPoints[i * 3 + 2] = point.z;
    }
    boughSpawn.points = new Float32Array(wanted * 2);
    boughSpawn.count = 0;

    place(ctx.viewport.width, ctx.quality, ctx.worldUnitsPerPixel);
    ready = true;
    return root;
  };

  const update = (frame: StageFrame) => {
    if (!ready) return;
    const { anchor, viewport } = frame;
    const depth =
      frame.quality === "low" ? BOUGH_DEPTH_LOW : BOUGH_DEPTH;

    // How far the sections block has risen, in CSS px, and where the bough
    // hangs from as a result. Never above the block's own top edge: the stage
    // canvas is full-viewport, so anything drawn above that line paints over
    // the hero.
    const top = anchor.found ? anchor.top : viewport.height;
    const risen = Math.max(0, viewport.height - top);
    // Three terms, in order: the parallax drift, a ceiling so the bough
    // settles in the upper band instead of hanging over the middle of the
    // page, and a floor at the block's own top edge — the stage canvas is
    // full-viewport, so a pin above that line would paint the bough over the
    // hero. The floor is what hides it on the way in.
    const pinY = Math.max(
      top,
      Math.min(top + risen * BOUGH_PARALLAX, viewport.height * BOUGH_HANG_Y),
    );
    frame.screenToWorld(
      viewport.width * BOUGH_ROOT_X,
      pinY,
      depth,
      root.position,
    );

    // The bloom. The blossoms are closed while the block is still coming up
    // and fully open about nine tenths of a screen later, so the bough
    // flowers as the reader comes down into the page.
    const bloom = clamp01(risen / (viewport.height * 0.9));
    if (growth) growth.value = frame.reducedMotion ? 1 : bloom;
    if (wind) {
      wind.uWindTime.value = frame.reducedMotion ? 0 : frame.time;
      // No pointer down here: the stage canvas takes no pointer events, so
      // the rustle term stays switched off and the wind is wind.
      wind.uPointerStrength.value = 0;
    }

    // Twig tips into viewport pixels for the petal field. Reduced motion
    // publishes nothing: PetalDrift paints nothing in that state either.
    const tipCount = tipPoints.length / 3;
    if (tipCount === 0 || frame.reducedMotion || bloom < 0.15) {
      boughSpawn.count = 0;
      boughSpawn.frame = frame.frameIndex;
      return;
    }
    root.updateMatrixWorld(true);
    const camera = frame.camera;
    const points = boughSpawn.points;
    let usable = 0;
    for (let i = 0; i < tipCount; i += 1) {
      scratch.set(tipPoints[i * 3], tipPoints[i * 3 + 1], tipPoints[i * 3 + 2]);
      local.localToWorld(scratch);
      scratch.project(camera);
      if (scratch.z > 1) continue;
      const x = (scratch.x * 0.5 + 0.5) * viewport.width;
      const y = (0.5 - scratch.y * 0.5) * viewport.height;
      // Off the sides is fine — the wind carries petals sideways anyway — but
      // a tip above the top edge or below the fold is not a place a petal can
      // be seen to come from.
      if (y < 0 || y > viewport.height) continue;
      points[usable * 2] = x;
      points[usable * 2 + 1] = y;
      usable += 1;
    }
    boughSpawn.count = usable;
    boughSpawn.frame = frame.frameIndex;
  };

  const resize = (ctx: StageResizeContext) => {
    place(ctx.viewport.width, ctx.quality, ctx.worldUnitsPerPixel);
  };

  const dispose = () => {
    ready = false;
    boughSpawn.count = 0;
    boughSpawn.points = new Float32Array(0);
    tipPoints = new Float32Array(0);
    disposeTree(root);
    root.clear();
    pivot.clear();
    local.clear();
    pivot.add(local);
    root.add(pivot);
    wind = null;
    growth = null;
    alignedBox = null;
  };

  return { build, dispose, name: "sakura-bough", resize, update };
}

const makeSakuraBoughFactory: StageElementFactory = () => makeSakuraBough();

/** The narration's bough: the same limb with twice the blossom. */
export const makeNarrationBough: StageElementFactory = () => makeSakuraBough({ blossoms: 2 });

export default makeSakuraBoughFactory;
