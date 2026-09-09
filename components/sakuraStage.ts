import * as THREE from "three";

import type { Quality } from "@/components/BareThreeCanvas";

/**
 * Types and geometry for the one WebGL stage that runs below the hero.
 *
 * This file is pure: no React, no DOM, no side effects. SakuraStage.tsx owns
 * the renderer and the loop; element authors import from here, and the two
 * halves only ever meet through the types below.
 */

/** What the stage resolved "auto" to. Elements build cheaper on "low". */
export type StageQuality = Exclude<Quality, "auto">;

/**
 * The camera is a PERSPECTIVE camera with the hero's own field of view, and
 * that is a decision, not an accident.
 *
 * An orthographic camera would make screen placement trivial, but every piece
 * of geometry these elements will reuse — the branch tubes, the blossoms, the
 * wind amplitudes in WIND_SHADER_CHUNK — was authored and tuned under the
 * hero's 42-degree perspective at ~15.7 world units of distance. Under ortho a
 * branch reads as a flat sticker: no foreshortening down its length, no
 * separation between the near and far side of a canopy, and a twig's wind sway
 * (an amplitude in world units) looks identical whether it is at the front of
 * the tree or the back. Matching the hero's framing costs one division and
 * keeps all of that tuning valid.
 *
 * The hero frames HERO_CAMERA_FOV = 42 degrees from (2.9, 8.35, 15.6) at a
 * target 15.67 units away, so a viewport height there spans
 * 2 * 15.67 * tan(21 deg) = 12.03 world units. This stage rounds that to 12
 * and puts the camera on the +Z axis looking at the origin, so one viewport
 * height is always STAGE_WORLD_HEIGHT units at the focal plane (z = 0),
 * whatever size the window is. A tree built for the hero drops into this
 * stage at the same apparent scale it had above the fold.
 */
export const STAGE_FOV = 42;
/** World units spanned by the viewport HEIGHT at the focal plane (z = 0). */
export const STAGE_WORLD_HEIGHT = 12;
/** Camera sits at (0, 0, STAGE_CAMERA_DISTANCE) looking at the origin. */
export const STAGE_CAMERA_DISTANCE =
  STAGE_WORLD_HEIGHT / 2 / Math.tan((STAGE_FOV * Math.PI) / 360);

/**
 * Longest frame the stage will integrate, seconds. A backgrounded tab, or a
 * long build step on the main thread, hands back a multi-second dt; anything
 * integrating that lands its petals a screen away in one step.
 */
export const STAGE_MAX_DT = 0.05;

/**
 * Low-pass on scroll velocity, per frame — about a 60 ms constant, the same
 * smoothing PetalDrift settled on. Raw frame-to-frame velocity is noisy
 * enough to make anything driven by it jitter.
 */
export const STAGE_SCROLL_SMOOTH = 0.25;

export function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * How far a box has travelled up the screen. 0 while its top edge is still at
 * or below the bottom of the viewport, 1 once its bottom edge has passed the
 * top. Total travel is (viewport height + box height), which is what makes a
 * short box and a tall box both take the whole of their own passage to go
 * from 0 to 1.
 */
export function anchorProgress(top: number, height: number, viewportHeight: number) {
  const travel = viewportHeight + height;
  if (travel <= 0) return 0;
  return clamp01((viewportHeight - top) / travel);
}

/** The stage's live viewport numbers. Mutated in place; hold the reference. */
export type StageViewport = {
  /** CSS pixels. */
  width: number;
  height: number;
  aspect: number;
  /** Device pixel ratio the renderer is actually using (capped). */
  pixelRatio: number;
  /** World units across the viewport at the focal plane, z = 0. */
  worldWidth: number;
  /** Always STAGE_WORLD_HEIGHT. Here so elements do not have to import it. */
  worldHeight: number;
  /** World units per CSS pixel at the focal plane. */
  unitsPerPixel: number;
};

/**
 * A DOM box the stage is tracking for you, in viewport coordinates (CSS px,
 * origin top-left — the same numbers getBoundingClientRect returns).
 *
 * The object is live: the stage rewrites its fields at most once per frame and
 * you keep the reference. Never store `anchor.top` across frames expecting it
 * to stay put, and never call getBoundingClientRect yourself — the whole point
 * of this record is that the layout read happens on resize only, and scroll
 * just subtracts a number.
 */
export type StageAnchor = {
  selector: string | null;
  /** False when the selector matched nothing. Every field then reads 0/false. */
  found: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  /** anchorProgress() of this box: 0 before it enters, 1 after it leaves. */
  progress: number;
  /** Any part of the box within the viewport. */
  visible: boolean;
};

/** Turns a screen position into a world position. See StageBuildContext. */
export type ScreenToWorld = (
  xPx: number,
  yPx: number,
  depth?: number,
  out?: THREE.Vector3,
) => THREE.Vector3;

export type StagePlacement = {
  /**
   * World position that lands exactly on the given viewport pixel (CSS px,
   * origin top-left, the coordinates an anchor reports).
   *
   * `depth` is the world z of the plane you want to sit on: 0 is the focal
   * plane, negative is further away and therefore smaller on screen. The
   * mapping is exact for that plane — a point placed there projects to that
   * pixel — and only that plane, because this is a perspective camera.
   *
   * Without `out` the returned vector is a single scratch instance reused by
   * every call, so copy what you need out of it before the next call. Pass
   * your own vector if you want to keep it.
   */
  screenToWorld: ScreenToWorld;
  /** World units per CSS pixel on the plane at `depth` (default 0). */
  worldUnitsPerPixel: (depth?: number) => number;
};

/** The three lights the stage puts in the scene. See SakuraStage.tsx. */
export type StageLights = {
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
};

export type StageBuildContext = StagePlacement & {
  quality: StageQuality;
  reducedMotion: boolean;
  camera: THREE.PerspectiveCamera;
  /** Live object; the stage mutates it on resize. */
  viewport: StageViewport;
  renderer: THREE.WebGLRenderer;
  /** The stage's scene. Read it if you must; add your group by RETURNING it. */
  scene: THREE.Scene;
  lights: StageLights;
  /** Track a DOM box. Same selector twice returns the same record. */
  anchor: (selector: string) => StageAnchor;
  /**
   * Hand the main thread a frame. Await this between heavy steps, and pass it
   * straight into WeepingCherryGenerator.generate(ctx.yield) — that generator
   * is phased and awaits its onPhase callback between builds.
   */
  yield: () => Promise<void>;
  /**
   * True once the stage has been torn down. Check it after every await and
   * return early; the stage will dispose whatever you have already built.
   */
  aborted: () => boolean;
};

export type StageResizeContext = StagePlacement & {
  quality: StageQuality;
  reducedMotion: boolean;
  camera: THREE.PerspectiveCamera;
  viewport: StageViewport;
};

export type StageFrame = StagePlacement & {
  /** Seconds of RUNNING time since the loop started. Frozen while off screen. */
  time: number;
  /** Seconds since the last frame, clamped to STAGE_MAX_DT. 0 on a settle frame. */
  dt: number;
  frameIndex: number;
  /** 0..1 through the whole sections block. */
  scrollProgress: number;
  /** CSS px/s, positive scrolling down, smoothed by STAGE_SCROLL_SMOOTH. */
  scrollVelocity: number;
  /** This element's own anchor progress, or scrollProgress if it declared none. */
  elementProgress: number;
  /** This element's own anchor, or the sections block's when it declared none. */
  anchor: StageAnchor;
  quality: StageQuality;
  /**
   * True when the visitor asked for less motion. You get exactly ONE update
   * with this set (and another after each resize), then the loop stops. Put
   * yourself in the settled state: blossoms open, branches at rest, petals
   * wherever they would have come to rest. Do not read `time` or `dt`, and do
   * not lean on scroll progress — nothing will call you again.
   */
  reducedMotion: boolean;
  camera: THREE.PerspectiveCamera;
  viewport: StageViewport;
};

/**
 * One thing in the stage: a tree, a bough, a drift of blossoms.
 *
 * The element OWNS its object. build() returns a THREE.Object3D (a Group in
 * practice) that the stage adds to the scene and removes on teardown; the
 * element never touches scene.add itself. Units are the world units described
 * at STAGE_FOV: y is up, the camera looks down -z, and one viewport height is
 * STAGE_WORLD_HEIGHT units at z = 0.
 */
export type StageElement = {
  /** For logging and for keying anchors. Keep it short and unique. */
  name: string;
  /**
   * CSS selector for the DOM box that drives this element's own progress. The
   * frame's elementProgress and anchor follow it. Omit to follow the whole
   * sections block, which is what scrollProgress already is.
   */
  anchorSelector?: string;
  /**
   * Build the geometry. May be async and SHOULD be, if it is expensive: await
   * ctx.yield() between steps so the page keeps painting. Return the object to
   * add, or null to add nothing. Throwing is caught and logged; the rest of
   * the stage still runs.
   */
  build: (
    ctx: StageBuildContext,
  ) => Promise<THREE.Object3D | null> | THREE.Object3D | null;
  /** Called once per rendered frame, after the stage has refreshed anchors. */
  update: (frame: StageFrame) => void;
  /** Viewport changed. Re-place anything pinned to a screen position here. */
  resize?: (ctx: StageResizeContext) => void;
  /**
   * Release GPU memory: every geometry, material and texture you created. The
   * stage removes and disposes the object you returned from build() as a
   * backstop, but it cannot know about anything you kept off the graph.
   */
  dispose: () => void;
};

/** Elements are registered as factories so the stage can build them lazily. */
export type StageElementFactory = () => StageElement;

/**
 * The screen-to-world mapping, split out so both the build context and the
 * frame can hand out the same two functions without allocating per frame.
 */
export function createPlacement(viewport: StageViewport): StagePlacement {
  const scratch = new THREE.Vector3();
  const unitsPerPixel = (depth = 0) => {
    // Distance from the camera to the plane the caller asked for, times the
    // tangent of the half-angle, is half the visible height there.
    const distance = STAGE_CAMERA_DISTANCE - depth;
    const visibleHeight = 2 * distance * Math.tan((STAGE_FOV * Math.PI) / 360);
    return visibleHeight / Math.max(1, viewport.height);
  };
  return {
    worldUnitsPerPixel: unitsPerPixel,
    screenToWorld: (xPx, yPx, depth = 0, out) => {
      const scale = unitsPerPixel(depth);
      const target = out ?? scratch;
      return target.set(
        (xPx - viewport.width / 2) * scale,
        (viewport.height / 2 - yPx) * scale,
        depth,
      );
    },
  };
}
