"use client";

import * as THREE from "three";

import { SPAWN_POINT_COUNT, boughSpawn } from "@/components/boughSpawn";
import {
  WeepingCherryGenerator,
  type Branch,
} from "@/components/BareThreeCanvas";
import type {
  StageBuildContext,
  StageElement,
  StageElementFactory,
  StageFrame,
  StageQuality,
  StageResizeContext,
  StageViewport,
} from "@/components/sakuraStage";
import { INTRO_TREE_SEED } from "@/components/treeTuning";

/**
 * The intro's tree, standing behind a block of scrolling text — the
 * narration that runs over the black after the statue.
 *
 * The page had ONE limb of a cherry hung over the work sections
 * (sakuraBough), a real bough but one bough, which read as a prop rather
 * than as the tree the reader had just been under. This is the whole
 * tree: the same generator, the same seed, so it is the intro's tree to
 * the twig — its bark, its blossoms, its wind — standing to the right of
 * the reading column with its canopy spread over the width of the screen.
 * It was first put behind the work sections and then moved up to the
 * narration, which is where the reader is still reading rather than
 * scanning a list; the bough went back under the work.
 *
 * It arrives with the block and drifts up at a fraction of the page's
 * speed, so it stays behind the text for a few screens and then goes,
 * and it publishes its lowest twig tips to the 2D petal field the way the
 * bough did (components/boughSpawn.ts), so the petals over the text fall
 * out of it.
 *
 * The cost is the whole tree's triangles every frame in a second WebGL
 * context, on top of the hero's — which is what the bough was avoiding.
 * The blossom budget below is the lever: a third of the hero's counts is
 * still a tree in full flower from this distance.
 */

/** How far behind the focal plane the tree stands: smaller, softer in the dither. */
const TREE_DEPTH = -6.5;
const TREE_DEPTH_LOW = -8.5;
/** The tree's height as a share of the viewport's, at that depth. */
const TREE_HEIGHT = 1.35;
/** Where the trunk stands across the screen: right of the reading column. */
const TRUNK_X = 0.66;
/**
 * The tree rises at this share of the page's scroll. Measured at 0.55 its
 * canopy was above the top of the screen before the block's own top had
 * reached it, and one screen later only the foot of the trunk was left;
 * at 0.3 the canopy was gone two screens in. At 0.2 with the base starting
 * BASE_BELOW_FOLD down, the canopy fills the screen as the block's top
 * arrives and its upper half is still overhead three screens later.
 */
const TREE_PARALLAX = 0.2;
/**
 * Where the base sits as the block arrives, below the fold by this share
 * of the viewport, so the canopy is what comes in first and the trunk
 * follows.
 */
const BASE_BELOW_FOLD = 0.45;
/** The canopy's heaviest lobe turned toward the reader, as the contact tree had it. */
const TREE_YAW = -0.34;
const MODEL_HEIGHT_FALLBACK = 8.6;

/**
 * Two thirds of the hero's blossom counts (7400 / 14200 / 23500). It was
 * a third; doubled when more flowers on the twig tips were asked for.
 */
const BLOSSOM_BUDGET: Record<StageQuality, number> = {
  low: 4800,
  medium: 9400,
  high: 15600,
};
const PETAL_BUDGET: Record<StageQuality, number> = { low: 36, medium: 64, high: 96 };

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Free every geometry, material and texture hanging off a subtree. */
function disposeSubtree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const withGeometry = object as Partial<THREE.Mesh>;
    withGeometry.geometry?.dispose();
    const material = (object as Partial<THREE.Mesh>).material;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const entry of list) {
      if (materials.has(entry)) continue;
      materials.add(entry);
      const maps = entry as unknown as Record<string, unknown>;
      for (const key of ["map", "bumpMap", "roughnessMap", "emissiveMap"]) {
        const value = maps[key];
        if (value instanceof THREE.Texture && !textures.has(value)) {
          textures.add(value);
          value.dispose();
        }
      }
      entry.dispose();
    }
  });
}

export function makeSakuraTree(blockSelector = "[data-sections]"): StageElement {
  let group: THREE.Group | null = null;
  let tree: Awaited<ReturnType<WeepingCherryGenerator["generate"]>> | null = null;
  let modelHeight = MODEL_HEIGHT_FALLBACK;
  /** Lowest twig tips in the tree's local space, for the petal field. */
  let tipPoints = new Float32Array(0);
  const scratch = new THREE.Vector3();
  let bloom = 0;

  const depthFor = (quality: StageQuality) =>
    quality === "low" ? TREE_DEPTH_LOW : TREE_DEPTH;

  /**
   * Stand the tree: base below the fold as the block arrives, rising at
   * TREE_PARALLAX of the scroll, trunk at TRUNK_X. Never above the block's
   * own top edge plus the tree's height — the stage canvas is full-viewport
   * and anything above that line paints over the hero.
   */
  const place = (
    viewport: StageViewport,
    quality: StageQuality,
    blockTop: number,
    screenToWorld: StageFrame["screenToWorld"],
    worldUnitsPerPixel: StageFrame["worldUnitsPerPixel"],
  ) => {
    if (!group) return;
    const depth = depthFor(quality);
    const heightPx = viewport.height * TREE_HEIGHT;
    group.scale.setScalar((heightPx * worldUnitsPerPixel(depth)) / modelHeight);
    const risen = Math.max(0, viewport.height - blockTop);
    const baseY = viewport.height * (1 + BASE_BELOW_FOLD) - risen * TREE_PARALLAX;
    // The whole tree stays under the block's top: its canopy top is
    // baseY - heightPx, which must not pass above blockTop.
    const floorY = blockTop + heightPx;
    screenToWorld(viewport.width * TRUNK_X, Math.max(baseY, floorY), depth, scratch);
    group.position.copy(scratch);
  };

  const build = async (ctx: StageBuildContext) => {
    const wrapper = new THREE.Group();
    wrapper.name = "Sections weeping cherry";

    const generator = new WeepingCherryGenerator({
      seed: INTRO_TREE_SEED,
      quality: ctx.quality,
      blossomCount: BLOSSOM_BUDGET[ctx.quality],
      petalCount: PETAL_BUDGET[ctx.quality],
    });
    const built = await generator.generate(ctx.yield);
    if (ctx.aborted()) {
      disposeSubtree(built.group);
      return null;
    }
    tree = built;

    // generate() bakes in the hero's frozen placement (a lift, a shove
    // toward its camera, a 0.7/0.8/0.64 squash). This tree is pinned to
    // the page instead: reset to an origin-rooted model and drive the
    // transform from place().
    built.group.position.set(0, 0, 0);
    built.group.rotation.set(0, TREE_YAW, 0);
    built.group.scale.set(1, 1, 1);
    wrapper.add(built.group);

    const branchGeometry = built.branchMesh?.geometry;
    if (branchGeometry) {
      branchGeometry.computeBoundingBox();
      const maxY = branchGeometry.boundingBox?.max.y ?? 0;
      if (maxY > 1) modelHeight = maxY;
    }

    // Buds closed until the block arrives; wind at rest; petals parked.
    built.blossomGrowth.value = 0;
    if (built.branchWindUniforms) {
      built.branchWindUniforms.uWindTime.value = 0;
      built.branchWindUniforms.uWindStrength.value = 0;
    }
    built.petals?.update(0, 0, 0);

    // Petal spawn points: the lowest two fifths of the twig tips, strided
    // across the canopy's width so the field does not rain out of one spot.
    const terminals = built.branches.filter((branch: Branch) => branch.terminal);
    const tips = terminals.map((branch: Branch) => branch.getEnd(new THREE.Vector3()));
    tips.sort((a, b) => a.y - b.y);
    const hanging = tips.slice(0, Math.max(1, Math.ceil(tips.length * 0.4)));
    hanging.sort((a, b) => a.x - b.x);
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

    group = wrapper;
    const block = ctx.anchor(blockSelector);
    place(
      ctx.viewport,
      ctx.quality,
      block.found ? block.top : ctx.viewport.height,
      ctx.screenToWorld,
      ctx.worldUnitsPerPixel,
    );
    return wrapper;
  };

  const update = (frame: StageFrame) => {
    if (!group || !tree) return;
    const { anchor, viewport } = frame;
    const blockTop = anchor.found ? anchor.top : viewport.height;
    const risen = Math.max(0, viewport.height - blockTop);

    if (frame.reducedMotion) {
      bloom = 1;
      tree.blossomGrowth.value = 1;
      if (tree.branchWindUniforms) {
        tree.branchWindUniforms.uWindTime.value = 0;
        tree.branchWindUniforms.uWindStrength.value = 0;
      }
      place(viewport, frame.quality, blockTop, frame.screenToWorld, frame.worldUnitsPerPixel);
      boughSpawn.count = 0;
      boughSpawn.frame = frame.frameIndex;
      return;
    }

    // The bloom: closed while the block is still coming up, fully open
    // about nine tenths of a screen later, so the tree flowers as the
    // reader comes down into the page.
    bloom = clamp01(risen / (viewport.height * 0.9));
    tree.blossomGrowth.value = bloom;
    place(viewport, frame.quality, blockTop, frame.screenToWorld, frame.worldUnitsPerPixel);

    // Wind builds with the bloom, and leans into a fast scroll.
    const scrollLean = 0.18 * Math.min(1, Math.abs(frame.scrollVelocity) / 1400);
    const strength = 0.5 + 0.36 * bloom + scrollLean;
    if (tree.branchWindUniforms) {
      tree.branchWindUniforms.uWindTime.value = frame.time;
      tree.branchWindUniforms.uWindStrength.value = strength;
    }
    if (bloom > 0.05) tree.petals?.update(frame.dt, frame.time, strength);

    // Twig tips into viewport pixels for the petal field.
    const tipCount = tipPoints.length / 3;
    if (tipCount === 0 || bloom < 0.15) {
      boughSpawn.count = 0;
      boughSpawn.frame = frame.frameIndex;
      return;
    }
    group.updateMatrixWorld(true);
    const inner = tree.group;
    const points = boughSpawn.points;
    let usable = 0;
    for (let i = 0; i < tipCount; i += 1) {
      scratch.set(tipPoints[i * 3], tipPoints[i * 3 + 1], tipPoints[i * 3 + 2]);
      inner.localToWorld(scratch);
      scratch.project(frame.camera);
      if (scratch.z > 1) continue;
      const x = (scratch.x * 0.5 + 0.5) * viewport.width;
      const y = (0.5 - scratch.y * 0.5) * viewport.height;
      if (y < 0 || y > viewport.height) continue;
      points[usable * 2] = x;
      points[usable * 2 + 1] = y;
      usable += 1;
    }
    boughSpawn.count = usable;
    boughSpawn.frame = frame.frameIndex;
  };

  const resize = (ctx: StageResizeContext) => {
    // The block's top is not known here; the next frame re-places anyway.
    place(ctx.viewport, ctx.quality, ctx.viewport.height, ctx.screenToWorld, ctx.worldUnitsPerPixel);
  };

  const dispose = () => {
    boughSpawn.count = 0;
    boughSpawn.points = new Float32Array(0);
    tipPoints = new Float32Array(0);
    if (group) disposeSubtree(group);
    group = null;
    tree = null;
    bloom = 0;
  };

  return { name: "sakura-tree", anchorSelector: blockSelector, build, update, resize, dispose };
}

/** The factory the narration's stage registers. */
export const makeNarrationTree: StageElementFactory = () => makeSakuraTree("#info");

const makeSakuraTreeFactory: StageElementFactory = () => makeSakuraTree();

export default makeSakuraTreeFactory;
