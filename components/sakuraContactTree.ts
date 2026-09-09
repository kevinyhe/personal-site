"use client";

import * as THREE from "three";

import { WeepingCherryGenerator } from "@/components/BareThreeCanvas";
import type {
  ScreenToWorld,
  StageBuildContext,
  StageElement,
  StageElementFactory,
  StageFrame,
  StageResizeContext,
  StageViewport,
} from "@/components/sakuraStage";

/**
 * The tree at the contact panel.
 *
 * WHERE IT ENDED UP, AND WHY IT IS NOT INSIDE THE CREAM.
 *
 * The brief was a tree standing IN the cream panel, dark against #f4ece1.
 * That cannot be drawn from this stage, for two independent reasons, either
 * of which alone kills it:
 *
 *   1. Occlusion. The stage mounts at z-0 inside the sections block and the
 *      contact section is z-[1] with an opaque `bg-[#f4ece1]`. Every pixel of
 *      the panel is painted over the canvas. Nothing this element draws
 *      inside that rectangle reaches the screen at all.
 *   2. The blend. The stage wrapper is mix-blend-lighten — max(page, stage)
 *      per channel, chosen so an empty frame cannot paint out HalftoneField's
 *      grain. `lighten` can only ADD light. Cream is (244,236,225); a dark
 *      silhouette over it composites to exactly the cream it started on. Even
 *      with the panel made transparent, the requested "dark tree on cream" is
 *      the one image this compositing mode is incapable of.
 *
 * So the tree grows in the black band directly ABOVE the panel, rooted behind
 * the cream edge: trunk and lower canopy hidden by the panel, the top of the
 * canopy leaning out over the last of the dark page, petals coming loose and
 * sinking back down until the cream edge takes them. It is the same picture
 * from the other side — a tree behind a wall — and it is timed to the panel,
 * so the reader still gets "the contact panel arrives and brings a tree".
 *
 * VALUES. Because the placement moved off the cream, the inversion the brief
 * asked for would be wrong: this half of the page is #0a0a0a and the hero's
 * own light-on-dark palette is correct here. Two adjustments, both because
 * the tree sits against a large bright cream block that lifts the reader's
 * local adaptation: the bark drops from 0xcfc9c4 (a pale grey that read as
 * bone next to the panel) to 0x6b6360, and the blossom emissive lift goes
 * 0.32 -> 0.42 so the canopy stays the light source in the frame. Blossoms
 * bright, wood ink — the reverse of the requested cream treatment, and the
 * right way round for the ground it actually lands on.
 *
 * CONTRAST. This element writes zero pixels inside any text box, by
 * construction rather than by hope: the canopy top is clamped to sit at least
 * CANOPY_CLEARANCE_PX below the bottom of the #work box, and everything below
 * the cream edge is occluded by the panel. See the numbers in place().
 */

const CONTACT_SELECTOR = "#contact";
const WORK_SELECTOR = "#work";

/**
 * Behind the focal plane, so the tree reads as further off than the type and
 * loses a little size to perspective. Deep enough to separate, shallow enough
 * that the hero's wind amplitudes still have visible throw.
 */
const TREE_DEPTH = -2.2;

/**
 * Clearance between the bottom of the #work box and the highest twig, CSS px.
 * The wind moves a tip about 0.4 local units and the tree scales to roughly
 * 50 px per local unit here, so a gust is worth ~20 px of overshoot; 40 px
 * covers that plus the halftone cell bleeding one dot past the silhouette.
 */
const CANOPY_CLEARANCE_PX = 40;

/** Below this much dark air the tree would crowd the work list. Hide it. */
const MIN_BAND_PX = 96;
/** Above this it stops being a glimpse over a wall and becomes the page. */
const MAX_BAND_PX = 460;

/** How much trunk stays hidden behind the cream, CSS px. */
const ROOT_HIDDEN_MIN_PX = 210;

/** Extra sink while the panel is still arriving, CSS px. */
const RISE_PX = 96;

/** Horizontal centre of the trunk as a fraction of viewport width. */
const CENTER_FRAC = 0.46;

/** Fallback if the branch mesh has no bounding box: local units, base at 0. */
const MODEL_HEIGHT_FALLBACK = 8.6;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function blossomBudget(quality: "low" | "medium" | "high") {
  // A quarter of the hero's counts (7400/14200/23500 flowers), and the reason
  // is that most of this tree is behind the cream: every blossom below the
  // panel edge is built, skinned and rasterized into pixels that are then
  // painted over. Nothing here can cull them, so the lever is the budget.
  // 6400 total at high is roughly 6400 * ~120 tris = 0.77M, against the
  // hero's ~2.4M, and this stage also carries three other elements.
  if (quality === "low") return 1800;
  if (quality === "medium") return 3800;
  return 6400;
}

function petalBudget(quality: "low" | "medium" | "high") {
  if (quality === "low") return 36;
  if (quality === "medium") return 64;
  return 96;
}

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

/**
 * The module default IS the factory the stage registers:
 *   <SakuraStage elements={[makeContactTree, ...]} />
 */
const makeContactTree: StageElementFactory = () => {
  // Every piece of GPU state lives in these locals, assigned inside build(),
  // because build() runs again from scratch after a context restore.
  let group: THREE.Group | null = null;
  let tree: Awaited<ReturnType<WeepingCherryGenerator["generate"]>> | null =
    null;
  let modelHeight = MODEL_HEIGHT_FALLBACK;
  let contact: ReturnType<StageBuildContext["anchor"]> | null = null;
  let work: ReturnType<StageBuildContext["anchor"]> | null = null;
  // Held across frames so resize() can re-place at the growth the last
  // frame left off at instead of snapping the tree back into the panel.
  let arrival = 0;
  const scratch = new THREE.Vector3();

  /**
   * Pin the tree to the cream edge.
   *
   * Two DOM boxes bound it. The bottom of #work is the lowest text on the
   * dark half of the page ("The rest is on GitHub"); the top of #contact is
   * where the cream starts and everything below is painted over. The band
   * between them is the only air this element may draw in, so the canopy
   * top goes at its top and the trunk base goes BELOW the cream edge, out
   * of sight. The tree is whole; the page only shows the last 40% of it.
   */
  const place = (
    viewport: StageViewport,
    screenToWorld: ScreenToWorld,
    worldUnitsPerPixel: (depth?: number) => number,
  ) => {
    if (!group || !contact) return;
    const creamTop = contact.found ? contact.top : viewport.height;
    const workBottom = work?.found
      ? work.top + work.height
      : creamTop - viewport.height * 0.3;
    const bandTop = workBottom + CANOPY_CLEARANCE_PX;
    const band = creamTop - bandTop;

    // Not enough dark air to stand in without touching the work list. A
    // short viewport with the two sections nearly abutting hits this.
    if (band < MIN_BAND_PX) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const visible = Math.min(band, MAX_BAND_PX);
    const hidden = Math.max(ROOT_HIDDEN_MIN_PX, visible * 0.95);
    const treeHeightPx = visible + hidden;

    const unitsPerPixel = worldUnitsPerPixel(TREE_DEPTH);
    group.scale.setScalar((treeHeightPx * unitsPerPixel) / modelHeight);

    // Canopy top parks at the top of the band, so the base lands one tree
    // height down from there — deep behind the cream — and slides a little
    // further down while the panel is still on its way in.
    const baseY = creamTop + hidden + (1 - arrival) * RISE_PX;
    screenToWorld(viewport.width * CENTER_FRAC, baseY, TREE_DEPTH, scratch);
    group.position.copy(scratch);
  };

  return {
    name: "contact-tree",
    anchorSelector: CONTACT_SELECTOR,

    async build(ctx: StageBuildContext) {
      contact = ctx.anchor(CONTACT_SELECTOR);
      work = ctx.anchor(WORK_SELECTOR);

      const wrapper = new THREE.Group();
      wrapper.name = "Contact weeping cherry";
      wrapper.visible = false;

      const generator = new WeepingCherryGenerator({
        seed: 90214,
        quality: ctx.quality,
        blossomCount: blossomBudget(ctx.quality),
        petalCount: petalBudget(ctx.quality),
      });
      const built = await generator.generate(ctx.yield);
      if (ctx.aborted()) {
        // Nothing was returned, so the stage will never see this subtree.
        disposeSubtree(built.group);
        return null;
      }
      tree = built;

      // generate() bakes in the HERO's frozen placement (a lift, a shove
      // toward the camera and a 0.7/0.8/0.64 squash, tuned for the statue
      // shot). None of it applies here: this tree is pinned to a DOM box.
      // Reset to a clean origin-rooted model and drive the transform from
      // place() instead. The yaw is the one part worth keeping — it turns
      // the canopy's heaviest lobe toward the reader.
      built.group.position.set(0, 0, 0);
      built.group.rotation.set(0, -0.34, 0);
      built.group.scale.set(1, 1, 1);
      wrapper.add(built.group);

      // Measure rather than guess: the trunk starts at local y = 0 and the
      // canopy tops out wherever the lobes put it, which moves with seed.
      const branchGeometry = built.branchMesh?.geometry;
      if (branchGeometry) {
        branchGeometry.computeBoundingBox();
        const maxY = branchGeometry.boundingBox?.max.y ?? 0;
        if (maxY > 1) modelHeight = maxY;
      }

      // Inverted values, in the direction the ground actually demands. See
      // the header: the wood goes to ink so the canopy is the only light in
      // a frame that also contains a very bright cream block.
      const bark = built.branchMesh?.material;
      if (bark instanceof THREE.MeshStandardMaterial) {
        bark.color.setHex(0x6b6360);
      }
      const petalMaterial = built.blossomMesh?.material;
      if (petalMaterial instanceof THREE.MeshStandardMaterial) {
        petalMaterial.emissiveIntensity = 0.42;
      }

      // Buds closed, blossoms hidden at their spur points: the tree arrives
      // with the panel rather than being already in flower behind it.
      built.blossomGrowth.value = 0;
      if (built.branchWindUniforms) {
        built.branchWindUniforms.uWindTime.value = 0;
        built.branchWindUniforms.uWindStrength.value = 0;
      }
      // One zero-length step so every held petal gets its scale-0 matrix.
      // InstancedMesh ships with an all-zero instanceMatrix and the system
      // only writes matrices from update(), so without this the first real
      // frame is the first frame anything is correct.
      built.petals?.update(0, 0, 0);

      group = wrapper;
      place(ctx.viewport, ctx.screenToWorld, ctx.worldUnitsPerPixel);
      return wrapper;
    },

    update(frame: StageFrame) {
      if (!group || !tree) return;

      if (frame.reducedMotion) {
        // One call, then silence. Settled state: fully in flower, wind at
        // rest, no petals in the air, sitting at its arrived position.
        arrival = 1;
        tree.blossomGrowth.value = 1;
        if (tree.branchWindUniforms) {
          tree.branchWindUniforms.uWindTime.value = 0;
          tree.branchWindUniforms.uWindStrength.value = 0;
        }
        place(frame.viewport, frame.screenToWorld, frame.worldUnitsPerPixel);
        return;
      }

      // elementProgress is the #contact box: 0 while the panel is still
      // below the fold, ~0.5 by the time its top edge reaches the top of
      // the screen. Flowering finishes at 0.40 so the tree is in full bloom
      // for the whole of the panel's own passage, not still opening.
      arrival = smoothstep(0.02, 0.4, frame.elementProgress);
      tree.blossomGrowth.value = arrival;

      place(frame.viewport, frame.screenToWorld, frame.worldUnitsPerPixel);
      if (!group.visible) return;

      // Wind builds with the bloom, and leans into a scroll: 1400 px/s is
      // about a fast flick, and it is worth a fifth of the gust on top.
      const scrollLean =
        0.18 * Math.min(1, Math.abs(frame.scrollVelocity) / 1400);
      const strength = 0.5 + 0.36 * arrival + scrollLean;
      if (tree.branchWindUniforms) {
        tree.branchWindUniforms.uWindTime.value = frame.time;
        tree.branchWindUniforms.uWindStrength.value = strength;
      }

      // Petals only once there is something to shed. They detach at the
      // blossoms, fall, and dissolve as they pass the tree's own base —
      // which is parked behind the cream edge, so what the page sees is a
      // petal sinking to the panel and being taken by it. That is the
      // settle: nothing falls off the bottom of the frame forever.
      if (arrival > 0.05) {
        tree.petals?.update(frame.dt, frame.time, strength);
      }
    },

    resize(ctx: StageResizeContext) {
      place(ctx.viewport, ctx.screenToWorld, ctx.worldUnitsPerPixel);
    },

    dispose() {
      if (group) disposeSubtree(group);
      group = null;
      tree = null;
      contact = null;
      work = null;
      arrival = 0;
    },
  } satisfies StageElement;
};

export default makeContactTree;
