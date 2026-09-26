"use client";

/**
 * The bough the petals fall from.
 *
 * Below the hero the page had petals but no tree, so they read as confetti.
 * This hangs a real cherry branch across the top of the sections block: the
 * hero's own branch tubes, the hero's own blossoms, the hero's own wind, and
 * a list of its twig tips published in screen pixels so the 2D petal field
 * can drop its petals from under the branch instead of off the top edge.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE BRANCH IS
 * ---------------------------------------------------------------------------
 * One spray, grown for this page: a long stem coming in from the right and
 * bowing across the frame, a row of short flowering sprigs standing off it,
 * spurs of blossom against the wood between them. That is the shape of the
 * orchid stem lanceyan.com hangs behind its third page, and it is what the
 * contact page is laid out after (see HomeSections). The generator grows it
 * directly — WeepingCherryGenerator.generateSpray — out of the same parts
 * as the hero's tree: the same bark builder, the same blossom pass, the same
 * wind chains, so the branch down here IS the tree up there, seen close.
 *
 * It used to be cut out of a whole generated tree: grow the canopy, keep
 * the fullest primary limb, throw the rest away, and turn the limb across
 * the page. That paid a whole tree's build for a sixth of it, needed a
 * replay of the geometry builder's vertex arithmetic to find the limb in
 * the buffer, and — the part that mattered — gave a piece of a weeping
 * canopy turned on its side, twigs all hanging one way, kinked where the
 * canopy had pulled it. Not a branch of its own.
 *
 * ---------------------------------------------------------------------------
 * WHERE IT SITS
 * ---------------------------------------------------------------------------
 * The stage canvas is fixed and full-viewport, inside the sections block, so
 * anything drawn above the block's top edge paints over the hero. The bough is
 * therefore hung FROM the block's top edge and everything about it lives below
 * that line: the stem comes in off the RIGHT edge (BOUGH_ROOT_X, and see the
 * contrast measurement there), the sprigs stand up and lean left along it.
 * It rides up at BOUGH_PARALLAX of the page's speed, so it stays overhead for
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
// -4.4, from -5.2: the bough now hangs over the Contact page, whose type
// is a 34rem column on the left, so it can come closer and read as the
// branch in the reference (lanceyan.com's third scene) rather than as a
// distant tree.
const BOUGH_DEPTH = -4.4;
const BOUGH_DEPTH_LOW = -7;

/** Fraction of the viewport width the bough spans, tip to cut end. */
const BOUGH_SPAN = 0.66;
const BOUGH_SPAN_LOW = 0.56;

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
 *  viewport height: the point it HANGS FROM, with the sprigs below it.
 *  A third of the way down keeps the stem in the upper band and the tips
 *  around the middle, rather than the whole bough sitting over the running
 *  text as the block arrives. */
const BOUGH_HANG_Y = 0.4;

/** Direction the stem's chord runs after alignment: leftward off the right
 *  edge, nearly level, a touch towards the camera. The bow is in the stem
 *  itself (generateSpray grows it rising then dropping), so the chord only
 *  needs to be level for the tip to hang below the cut end. The rotation
 *  onto this is the minimal one, so up stays up and the sprigs stand. */
const BOUGH_AIM = new THREE.Vector3(-1, -0.12, 0.06).normalize();

/** The bark, lifted so a thin stem reads at this depth: see build(). */
const BARK_COLOR = 0xe6ddd6;
const BARK_EMISSIVE = 0x8a7d76;
const BARK_EMISSIVE_INTENSITY = 0.55;

/** Blossom budget handed to the generator. The whole spray is kept, so
 *  this is what is drawn. Small on purpose: the generator's spray mode
 *  spaces clusters a cluster's width apart along about eighteen units of
 *  sprig, which is room for some forty bunches of two to five. Handing
 *  it more only packs the bunches into sleeves and hides the wood. */
const BLOSSOM_BUDGET: Record<StageQuality, number> = {
  high: 260,
  low: 140,
  medium: 200,
};

// The petal field's end of the deal lives in components/boughSpawn.ts, which
// has no three import: PetalDrift is a 2D canvas and must not drag this file
// (and BareThreeCanvas behind it) into its bundle to read two numbers.
export { boughSpawn, sampleBoughSpawn, type BoughSpawnField } from "@/components/boughSpawn";

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
  /** A multiplier on the blossom budget. 1 when left out. */
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
  // This element's OWN spawn buffer. boughSpawn is a singleton that the
  // narration's tree (sakuraTree) writes too, and for the screen where the
  // narration hands off to the sections both are live. Each producer keeps
  // its own array and publishes it by reference together with its count, so
  // a reader never sees one element's count against the other's points —
  // which is a read past the end, and NaN petals. It also means a producer
  // only ever resets the record it published: the old dispose() replaced
  // boughSpawn.points with an empty array whether or not the other element
  // was still writing into it.
  let spawnPoints = new Float32Array(0);
  const publishSpawn = (count: number, frameIndex: number) => {
    boughSpawn.points = spawnPoints;
    boughSpawn.count = count;
    boughSpawn.frame = frameIndex;
  };
  const owningSpawn = () => boughSpawn.points === spawnPoints;

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
    // its top edge is at the root's y. Right edge because the stem runs
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
    // Profiling hook beside window.__sprayBuildTimings (which the generator
    // writes for its phases): what this element does on top of it, in ms
    // of main thread, not counting the frames yielded between steps.
    const timings: Record<string, number> = {};
    let stepStart = performance.now();
    const step = (name: string) => {
      timings[name] = Math.round(performance.now() - stepStart);
      stepStart = performance.now();
    };
    const generator = new WeepingCherryGenerator({
      blossomCount: Math.round(BLOSSOM_BUDGET[ctx.quality] * (options.blossoms ?? 1)),
      // The 2D field below the fold is the loose-petal system down here, so
      // the generator's own WebGL petals are switched off entirely.
      petalCount: 0,
      quality: ctx.quality,
      seed: 71104,
    });
    const generateStart = performance.now();
    const tree = await generator.generateSpray(ctx.yield);
    timings.generateWall = Math.round(performance.now() - generateStart);
    stepStart = performance.now();
    if (ctx.aborted()) {
      disposeTree(generator.group);
      return null;
    }

    const branchMesh = tree.branchMesh;
    if (!branchMesh || tree.branches.length === 0) {
      disposeTree(generator.group);
      return null;
    }

    // The whole spray is the bough: the wood and every blossom on it move
    // from the generator's group into this element's, as they are.
    branchMesh.removeFromParent();
    branchMesh.name = "Cherry bough";
    local.add(branchMesh);
    // The wood has to read as a line for the shape to read at all, and
    // under the stage's two lights a tube this thin, this far back, comes
    // out near black (measured ~35/255 against a 10/255 ground): most of a
    // thin tube faces away from the key. A little emissive on the bark
    // lifts the whole stem to a visible grey whichever way it faces; the
    // texture still carries the fissures. Local to this element — the
    // hero's tree is lit properly and keeps its own bark.
    const bark = branchMesh.material as THREE.MeshStandardMaterial;
    bark.color.setHex(BARK_COLOR);
    bark.emissive.setHex(BARK_EMISSIVE);
    bark.emissiveIntensity = BARK_EMISSIVE_INTENSITY;
    const blossomMeshes = [
      tree.blossomMesh,
      tree.lowBlossomMesh,
      tree.halfBlossomMesh,
      tree.budMesh,
    ];
    let keptBlossoms = 0;
    for (const mesh of blossomMeshes) {
      if (!mesh) continue;
      mesh.removeFromParent();
      // A variant with no instances keeps its geometry off the graph. Only
      // the geometry: the four meshes SHARE one material, so disposing this
      // one's material would take the other three's with it.
      if (mesh.count > 0) {
        local.add(mesh);
        keptBlossoms += mesh.count;
      } else {
        mesh.geometry.dispose();
      }
    }
    timings.blossoms = keptBlossoms;
    // Anything the generator built and we did not take.
    disposeTree(generator.group);
    step("adopt");
    await ctx.yield();
    stepStart = performance.now();
    if (ctx.aborted()) {
      disposeTree(root);
      return null;
    }

    wind = tree.branchWindUniforms;
    growth = tree.blossomGrowth;
    growth.value = 0;

    // Lay the stem's chord along BOUGH_AIM with the minimal rotation, so the
    // sprigs stay standing, and drop the cut end on the origin.
    const stem = tree.stem;
    const rootPoint = stem.getPoint(0, new THREE.Vector3());
    const tipPoint = stem.getEnd(new THREE.Vector3());
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
    branchMesh.geometry.computeBoundingBox();
    const bounds = branchMesh.geometry.boundingBox;
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

    // Petal spawn points: the lowest-hanging twig tips, spread across the
    // bough's length so the field does not rain out of one spot. Stored in
    // `local` space and projected every frame.
    const terminals = tree.branches.filter((branch) => branch.terminal);
    const tips = terminals.map((branch) => branch.getEnd(new THREE.Vector3()));
    tips.sort((a, b) => a.y - b.y);
    const hanging = tips.slice(0, Math.max(1, Math.ceil(tips.length * 0.4)));
    // Sorted along the stem, then evenly strided: the spread is across the
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
    spawnPoints = new Float32Array(wanted * 2);

    place(ctx.viewport.width, ctx.quality, ctx.worldUnitsPerPixel);
    step("placeAndTips");
    (window as unknown as Record<string, unknown>).__boughBuildTimings = timings;
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
      // Nothing to offer. Say so only if the record is ours: while the
      // block is still coming up the narration's tree may be publishing
      // real tips into the same record, and a zero from here would take
      // them away from the petals still falling out of it.
      if (owningSpawn()) publishSpawn(0, frame.frameIndex);
      return;
    }
    root.updateMatrixWorld(true);
    const camera = frame.camera;
    const points = spawnPoints;
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
    publishSpawn(usable, frame.frameIndex);
  };

  const resize = (ctx: StageResizeContext) => {
    place(ctx.viewport.width, ctx.quality, ctx.worldUnitsPerPixel);
  };

  const dispose = () => {
    ready = false;
    if (owningSpawn()) {
      boughSpawn.count = 0;
      boughSpawn.points = new Float32Array(0);
    }
    spawnPoints = new Float32Array(0);
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

export default makeSakuraBoughFactory;
