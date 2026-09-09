"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  HALFTONE_CELL_CSS_PX,
  HALFTONE_FRAGMENT_SHADER,
  HALFTONE_STRENGTH,
  HALFTONE_VERTEX_SHADER,
  resolveSceneQuality,
} from "@/components/BareThreeCanvas";
import {
  anchorProgress,
  createPlacement,
  STAGE_CAMERA_DISTANCE,
  STAGE_FOV,
  STAGE_MAX_DT,
  STAGE_SCROLL_SMOOTH,
  STAGE_WORLD_HEIGHT,
  type StageAnchor,
  type StageBuildContext,
  type StageElement,
  type StageElementFactory,
  type StageFrame,
  type StageLights,
  type StageQuality,
  type StageResizeContext,
  type StageViewport,
} from "@/components/sakuraStage";
import { getViewportMetrics } from "@/components/viewportMetrics";

/**
 * The one WebGL stage below the hero.
 *
 * Above the fold the site is a cherry tree rendered through a halftone
 * dither. Below it the page had the dither (HalftoneField) and loose petals
 * (PetalDrift) but no tree, so the petals fell from nowhere. This is the host
 * that puts real geometry back down there: one fixed full-viewport canvas, one
 * renderer, one scene, one camera, one rAF loop, and a registry that elements
 * plug into. It ships with nothing registered — it is the stage, not the play.
 *
 * Why one context and not four. The hero already owns a WebGL context and
 * this page also runs two 2D canvases. A second context is affordable; a
 * fifth is not, and four separate contexts could not share a depth buffer, a
 * camera or a clock even if they were free. Everything below the fold is four
 * things in ONE scene.
 *
 * Lazy on purpose: nothing is allocated until the sections block is within a
 * viewport of the fold. A visitor who never scrolls never pays for it.
 *
 * The frame goes: scene -> half-float render target -> fullscreen triangle
 * running the hero's HALFTONE_FRAGMENT_SHADER -> canvas. Same shader, same
 * cell size, same strength and the same render pixel ratio as the hero, so
 * the dot lattice below the fold is the same lattice as above it.
 */

type LenisLike = { scroll?: number };

/** Device pixel ratio for the render. See the note at applySize(). */
const RENDER_PIXEL_RATIO = 1;

/**
 * Stage lights, copied by value from the hero's key and rim (their positions
 * are private to BareThreeCanvas, so these are the numbers, not an import).
 * Directional rather than point: this stage's world is a few units across and
 * a point light's falloff over that distance was never part of the hero's
 * look — the hero's lights sit far outside its tree.
 *
 * Elements that bring the hero's own shader materials light themselves and can
 * ignore these; elements using MeshStandardMaterial should expect a warm key
 * from the upper left, a cool rim from behind right, and very little fill.
 */
const KEY_LIGHT_POSITION = new THREE.Vector3(-6.5, 10.5, 7.5);
const KEY_LIGHT_COLOR = 0xffd9b4;
const KEY_LIGHT_INTENSITY = 2.7;
const RIM_LIGHT_POSITION = new THREE.Vector3(6.5, 7.5, -9);
const RIM_LIGHT_COLOR = 0xf7c4e0;
const RIM_LIGHT_INTENSITY = 0.9;
const AMBIENT_COLOR = 0x241a20;
const AMBIENT_INTENSITY = 0.6;

/**
 * The clear colour, and it is PURE BLACK rather than the page's #0a0a0a.
 *
 * The halftone pass tone-maps and sRGB-encodes whatever is in the target, so a
 * #0a0a0a clear does not come out as #0a0a0a: it lands around 0.09 luma, above
 * the shader's 0.05 print floor, and the empty stage paints a full-screen
 * lattice of #242424 dots over a #0a0a0a page. Measured exactly that: 36 on a
 * 26 ground. Clearing to black keeps every empty cell under the floor, the
 * shader's own #0a0a0a void ink stays at or below the page ground, and the
 * lighten blend leaves the page untouched where the stage has nothing to draw.
 */
const CLEAR_COLOR = 0x000000;

export type SakuraStageProps = {
  /**
   * The block the stage lives in and takes its global scroll progress from.
   * Also the lazy-boot trigger and the on-screen gate.
   */
  gateSelector?: string;
  /** Elements to build, in order. Each is built after the previous resolves. */
  elements?: StageElementFactory[];
};

type AnchorRecord = {
  anchor: StageAnchor;
  el: HTMLElement | null;
  /** Distance from the top of the DOCUMENT, CSS px. See measureLayout(). */
  docTop: number;
  docLeft: number;
};

/** Frees the GPU side of everything under `root`, including the textures. */
function disposeObject(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    const materials = Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    for (const entry of materials) {
      for (const value of Object.values(entry as unknown as Record<string, unknown>)) {
        const texture = value as Partial<THREE.Texture> | null;
        if (texture && texture.isTexture && texture.dispose) texture.dispose();
      }
      entry.dispose();
    }
  });
}

export default function SakuraStage({
  gateSelector = "[data-sections]",
  elements,
}: SakuraStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<StageElementFactory[] | undefined>(elements);
  elementsRef.current = elements;
  // The effect must not restart because a parent re-rendered and handed it a
  // fresh array literal. Identity of the factories is what matters, so the
  // dependency is their names.
  const elementsKey = useMemo(
    () => (elements ?? []).map((factory, i) => `${i}:${factory.name}`).join("|"),
    [elements],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const factories = elementsRef.current ?? [];

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const quality: StageQuality = resolveSceneQuality("auto");

    // ---- viewport, anchors, scroll ------------------------------------
    // Every layout read on this page happens in measureLayout(), and only
    // from resize, a ResizeObserver, or the first frame after boot. Frames
    // never read layout: an anchor's document offset is measured once and a
    // frame subtracts the current scroll from it. PetalDrift was caught doing
    // 120 forced layouts a second before it cached the same way.
    const viewport: StageViewport = {
      width: 1,
      height: 1,
      aspect: 1,
      pixelRatio: RENDER_PIXEL_RATIO,
      worldWidth: STAGE_WORLD_HEIGHT,
      worldHeight: STAGE_WORLD_HEIGHT,
      unitsPerPixel: STAGE_WORLD_HEIGHT,
    };
    const placement = createPlacement(viewport);

    let layoutStale = true;
    let viewportStale = true;

    const anchors = new Map<string, AnchorRecord>();
    const anchorFor = (selector: string): StageAnchor => {
      const existing = anchors.get(selector);
      if (existing) return existing.anchor;
      const record: AnchorRecord = {
        anchor: {
          selector,
          found: false,
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          centerX: 0,
          centerY: 0,
          progress: 0,
          visible: false,
        },
        el: null,
        docTop: 0,
        docLeft: 0,
      };
      anchors.set(selector, record);
      layoutStale = true;
      return record.anchor;
    };
    // The gate block is itself an anchor, so global scroll progress and
    // per-element progress are the same computation on different boxes.
    const gateAnchor = anchorFor(gateSelector);
    const gateEl = document.querySelector<HTMLElement>(gateSelector);

    /**
     * Scroll position in CSS px. Lenis eases the window's own scroll (see
     * SmoothScroll.tsx), so `__lenis.scroll` is the sub-pixel value the page
     * is actually at this frame; window.scrollY is its rounded shadow and the
     * fallback when smooth scrolling is off. Measurement and playback both go
     * through here so they can never disagree by a frame of easing.
     */
    const readScroll = () => {
      const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
      const eased = lenis?.scroll;
      return typeof eased === "number" && Number.isFinite(eased)
        ? eased
        : window.scrollY;
    };

    const measureLayout = () => {
      layoutStale = false;
      const scroll = readScroll();
      for (const record of anchors.values()) {
        if (!record.el && record.anchor.selector) {
          record.el = document.querySelector<HTMLElement>(record.anchor.selector);
        }
        const el = record.el;
        if (!el) {
          record.anchor.found = false;
          continue;
        }
        const box = el.getBoundingClientRect();
        record.docTop = box.top + scroll;
        record.docLeft = box.left;
        record.anchor.width = box.width;
        record.anchor.height = box.height;
        record.anchor.found = true;
      }
    };

    /**
     * Per-frame anchor refresh. No layout reads: the page does not scroll
     * horizontally, so only `top` moves, and it moves by exactly the scroll.
     */
    const refreshAnchors = () => {
      if (layoutStale) measureLayout();
      const scroll = readScroll();
      for (const record of anchors.values()) {
        const anchor = record.anchor;
        if (!anchor.found) continue;
        anchor.top = record.docTop - scroll;
        anchor.left = record.docLeft;
        anchor.centerX = anchor.left + anchor.width / 2;
        anchor.centerY = anchor.top + anchor.height / 2;
        anchor.progress = anchorProgress(anchor.top, anchor.height, viewport.height);
        anchor.visible = anchor.top < viewport.height && anchor.top + anchor.height > 0;
      }
    };

    // ---- GPU side ------------------------------------------------------
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let lights: StageLights | null = null;
    let sceneTarget: THREE.WebGLRenderTarget | null = null;
    let halftoneScene: THREE.Scene | null = null;
    let halftoneCamera: THREE.OrthographicCamera | null = null;
    let halftoneMaterial: THREE.RawShaderMaterial | null = null;
    let halftoneGeometry: THREE.BufferGeometry | null = null;
    let halftoneUniforms: {
      uScene: { value: THREE.Texture | null };
      uResolution: { value: THREE.Vector2 };
      uCellSize: { value: number };
      uStrength: { value: number };
      uExposure: { value: number };
      uSceneRemap: { value: THREE.Vector2 };
      uSceneOffset: { value: THREE.Vector2 };
      uGridOffset: { value: THREE.Vector2 };
    } | null = null;

    const built: { element: StageElement; object: THREE.Object3D | null }[] = [];

    let disposed = false;
    let booting = false;
    let ready = false;
    let contextLost = false;
    let onScreen = false;
    let frame = 0;
    let settleFrame = 0;
    let lastTimestamp = 0;
    let elapsed = 0;
    let frameIndex = 0;
    let lastScroll = 0;
    let scrollVelocity = 0;

    const yieldFrame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

    const applySize = () => {
      if (!renderer || !camera || !sceneTarget || !halftoneUniforms) return;
      const metrics = getViewportMetrics();
      viewport.width = Math.max(1, Math.round(metrics.width));
      viewport.height = Math.max(1, Math.round(metrics.height));
      viewport.aspect = viewport.width / viewport.height;
      // The hero renders at min(dpr, 1) — one render pixel per CSS pixel on
      // every display — because the halftone cell is measured in CSS px and a
      // retina render would put the dots at half the size the design wants.
      // The stage matches it, which is also why the two lattices line up.
      viewport.pixelRatio = RENDER_PIXEL_RATIO;
      viewport.unitsPerPixel = STAGE_WORLD_HEIGHT / viewport.height;
      viewport.worldWidth = STAGE_WORLD_HEIGHT * viewport.aspect;

      renderer.setPixelRatio(viewport.pixelRatio);
      renderer.setSize(viewport.width, viewport.height, false);
      camera.aspect = viewport.aspect;
      camera.updateProjectionMatrix();

      const buffer = new THREE.Vector2();
      renderer.getDrawingBufferSize(buffer);
      sceneTarget.setSize(buffer.x, buffer.y);
      halftoneUniforms.uScene.value = sceneTarget.texture;
      halftoneUniforms.uResolution.value.set(buffer.x, buffer.y);
      halftoneUniforms.uCellSize.value =
        (quality === "low" ? HALFTONE_CELL_CSS_PX + 1 : HALFTONE_CELL_CSS_PX) *
        viewport.pixelRatio;

      const resizeContext: StageResizeContext = {
        ...placement,
        quality,
        reducedMotion,
        camera,
        viewport,
      };
      for (const entry of built) {
        try {
          entry.element.resize?.(resizeContext);
        } catch (error) {
          console.error(`SakuraStage: ${entry.element.name} resize failed`, error);
        }
      }
      viewportStale = false;
      layoutStale = true;
    };

    // One frame object, rewritten in place. Elements get the same reference
    // every frame; nothing here allocates once the loop is running.
    const frameState: StageFrame = {
      ...placement,
      time: 0,
      dt: 0,
      frameIndex: 0,
      scrollProgress: 0,
      scrollVelocity: 0,
      elementProgress: 0,
      anchor: gateAnchor,
      quality,
      reducedMotion,
      camera: null as unknown as THREE.PerspectiveCamera,
      viewport,
    };

    const renderFrame = (dt: number) => {
      if (!renderer || !scene || !camera || !sceneTarget || !halftoneScene || !halftoneCamera) {
        return;
      }
      if (viewportStale) applySize();
      refreshAnchors();

      frameState.time = elapsed;
      frameState.dt = dt;
      frameState.frameIndex = frameIndex;
      frameState.scrollProgress = gateAnchor.progress;
      frameState.scrollVelocity = scrollVelocity;
      frameState.camera = camera;
      frameIndex += 1;

      for (const entry of built) {
        const selector = entry.element.anchorSelector;
        const anchor = selector ? anchorFor(selector) : gateAnchor;
        frameState.anchor = anchor;
        frameState.elementProgress = selector ? anchor.progress : gateAnchor.progress;
        try {
          entry.element.update(frameState);
        } catch (error) {
          console.error(`SakuraStage: ${entry.element.name} update failed`, error);
        }
      }

      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(halftoneScene, halftoneCamera);
    };

    const tick = (timestamp: number) => {
      const raw = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
      lastTimestamp = timestamp;
      const dt = Math.min(STAGE_MAX_DT, Math.max(0, raw));
      elapsed += dt;

      const scroll = readScroll();
      if (dt > 0) {
        const instant = (scroll - lastScroll) / dt;
        scrollVelocity += (instant - scrollVelocity) * STAGE_SCROLL_SMOOTH;
      }
      lastScroll = scroll;

      renderFrame(dt);
      frame =
        onScreen && !document.hidden && !contextLost
          ? requestAnimationFrame(tick)
          : 0;
    };

    const run = () => {
      if (frame || disposed || !ready || contextLost) return;
      if (!onScreen || document.hidden) return;
      // Reduced motion never gets a loop. It gets one repaint instead, so
      // that coming back on screen (or back to the tab) draws at the scroll
      // position the page is at now rather than leaving the last frame from
      // before it went away.
      if (reducedMotion) {
        scheduleSettle();
        return;
      }
      lastTimestamp = 0;
      lastScroll = readScroll();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (settleFrame) {
        cancelAnimationFrame(settleFrame);
        settleFrame = 0;
      }
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    /**
     * The resting state under prefers-reduced-motion: a frame drawn with dt 0
     * and reducedMotion true. A blank canvas is not a resting state — a still
     * tree with its blossoms open is.
     *
     * It is redrawn when the window resizes and when the page scrolls, and
     * for the same reason both times: the elements are pinned to boxes in the
     * document, so a stale frame is a tree hanging in the wrong place. Time,
     * wind and dt stay at zero through all of it, so nothing here animates —
     * the tree just stays where its sections are.
     */
    const renderSettled = () => {
      settleFrame = 0;
      if (disposed || !ready || contextLost) return;
      lastScroll = readScroll();
      scrollVelocity = 0;
      renderFrame(0);
    };
    /**
     * One settle repaint per animation frame at most. A window resize fires
     * the resize event AND the ResizeObserver, and both want the still frame
     * repainted; without this they each draw one.
     */
    const scheduleSettle = () => {
      if (settleFrame || frame || disposed || !ready || contextLost) return;
      settleFrame = requestAnimationFrame(renderSettled);
    };

    // ---- boot ----------------------------------------------------------
    const buildGpu = () => {
      const canvasScene = new THREE.Scene();
      canvasScene.background = null;
      scene = canvasScene;

      const perspective = new THREE.PerspectiveCamera(
        STAGE_FOV,
        viewport.aspect,
        0.1,
        STAGE_CAMERA_DISTANCE * 4,
      );
      perspective.position.set(0, 0, STAGE_CAMERA_DISTANCE);
      perspective.lookAt(0, 0, 0);
      camera = perspective;

      const key = new THREE.DirectionalLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY);
      key.position.copy(KEY_LIGHT_POSITION);
      const rim = new THREE.DirectionalLight(RIM_LIGHT_COLOR, RIM_LIGHT_INTENSITY);
      rim.position.copy(RIM_LIGHT_POSITION);
      const ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);
      canvasScene.add(key, rim, ambient);
      lights = { key, rim, ambient };

      const gl = new THREE.WebGLRenderer({
        // The scene is rendered into a plain non-MSAA target and then
        // redrawn as dots, so multisampling on the default framebuffer would
        // cost fill for pixels the halftone throws away.
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      });
      gl.setClearColor(CLEAR_COLOR, 1);
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.15;
      gl.shadowMap.enabled = false;
      renderer = gl;

      const canvas = gl.domElement;
      canvas.style.position = "absolute";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);
      mount.appendChild(canvas);

      // HalfFloat, matching the hero, and for the same reason: the target
      // holds the LINEAR frame and the halftone pass tone-maps and sRGB-encodes
      // it afterwards. At 8 bits the dark end — which is where this whole site
      // lives — arrives at the pass already broken into flat plateaus.
      sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });

      halftoneUniforms = {
        uScene: { value: sceneTarget.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCellSize: { value: HALFTONE_CELL_CSS_PX },
        uStrength: { value: HALFTONE_STRENGTH },
        uExposure: { value: gl.toneMappingExposure },
        // No CRT tube down here: the pass samples the whole target 1:1 and the
        // dot lattice starts at the bottom-left corner, which is what the
        // hero's flat path does too.
        uSceneRemap: { value: new THREE.Vector2(1, 1) },
        uSceneOffset: { value: new THREE.Vector2(0, 0) },
        uGridOffset: { value: new THREE.Vector2(0, 0) },
      };
      halftoneMaterial = new THREE.RawShaderMaterial({
        uniforms: halftoneUniforms,
        vertexShader: HALFTONE_VERTEX_SHADER,
        fragmentShader: HALFTONE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      halftoneGeometry = new THREE.BufferGeometry();
      halftoneGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
          3,
        ),
      );
      const quad = new THREE.Mesh(halftoneGeometry, halftoneMaterial);
      quad.frustumCulled = false;
      halftoneScene = new THREE.Scene();
      halftoneScene.add(quad);
      halftoneCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      applySize();
      measureLayout();
      refreshAnchors();
    };

    const boot = async () => {
      if (disposed || booting || renderer) return;
      booting = true;
      buildGpu();
      if (!renderer || !scene || !camera || !lights) {
        booting = false;
        return;
      }

      const buildContext: StageBuildContext = {
        ...placement,
        quality,
        reducedMotion,
        camera,
        viewport,
        renderer,
        scene,
        lights,
        anchor: anchorFor,
        yield: yieldFrame,
        aborted: () => disposed,
      };

      for (const factory of factories) {
        if (disposed) break;
        let element: StageElement;
        try {
          element = factory();
        } catch (error) {
          console.error("SakuraStage: element factory failed", error);
          continue;
        }
        const entry: { element: StageElement; object: THREE.Object3D | null } = {
          element,
          object: null,
        };
        built.push(entry);
        // Register the element's anchor now rather than on its first update,
        // so the box is already measured when that frame arrives.
        if (element.anchorSelector) anchorFor(element.anchorSelector);
        try {
          const object = await element.build(buildContext);
          if (disposed) break;
          if (object) {
            entry.object = object;
            scene.add(object);
          }
        } catch (error) {
          console.error(`SakuraStage: ${element.name} build failed`, error);
        }
        // Between elements, hand the page a frame back. Long builds must not
        // be one uninterrupted block of main thread.
        await yieldFrame();
      }
      if (disposed) return;

      booting = false;
      ready = true;
      layoutStale = true;
      run();
    };

    // ---- context loss --------------------------------------------------
    // Two contexts on one page makes this real: the browser drops the older
    // one when it needs the memory back, and everything on the GPU side is
    // invalid afterwards. Rebuild from scratch rather than trying to revive
    // objects whose handles are gone.
    function onContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stop();
    }
    function onContextRestored() {
      if (disposed) return;
      contextLost = false;
      teardownGpu();
      void boot();
    }

    const teardownGpu = () => {
      stop();
      for (const entry of built) {
        try {
          entry.element.dispose();
        } catch (error) {
          console.error(`SakuraStage: ${entry.element.name} dispose failed`, error);
        }
        if (entry.object) {
          entry.object.removeFromParent();
          disposeObject(entry.object);
        }
      }
      built.length = 0;

      halftoneGeometry?.dispose();
      halftoneMaterial?.dispose();
      sceneTarget?.dispose();
      if (scene) disposeObject(scene);
      const canvas = renderer?.domElement;
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
        canvas.remove();
      }
      renderer?.dispose();
      // Hands the context back now instead of waiting for the GC to notice.
      // The page keeps the hero's context alive the whole time, and browsers
      // cap how many a document may hold.
      renderer?.forceContextLoss();

      renderer = null;
      scene = null;
      camera = null;
      lights = null;
      sceneTarget = null;
      halftoneScene = null;
      halftoneCamera = null;
      halftoneMaterial = null;
      halftoneGeometry = null;
      halftoneUniforms = null;
      ready = false;
      booting = false;
      frameIndex = 0;
      elapsed = 0;
    };

    // ---- gates ---------------------------------------------------------
    const observed = gateEl ?? mount;

    /**
     * The canvas is hidden outright whenever the block is off screen, and
     * this is not an optimisation — without it the hero goes black.
     *
     * The halftone pass writes an OPAQUE frame, and `lighten` only leaves the
     * page alone because the sections block paints #0a0a0a behind this div.
     * The blend is isolated to that block (its wrapper is `relative z-10`, a
     * stacking context), and the wrapper's background is painted only inside
     * its own box — from 7332px down the document on a 1440x900 screen. This
     * div is `fixed`, so it covers the viewport at EVERY scroll position once
     * the stage has booted, including the whole of the hero. Up there the
     * group's backdrop is transparent, lighten has nothing to keep, and the
     * near-black frame is what lands.
     *
     * Measured: scroll into the sections and back to the top and the hero was
     * a flat field with a maximum luma of 9 out of 255 — no tree, no name, no
     * navigation. Hiding this one div at the top brought it back to a mean of
     * 73. `visibility` rather than `display` so nothing about the box changes.
     */
    const setMountVisible = (visible: boolean) => {
      mount.style.visibility = visible ? "" : "hidden";
    };
    setMountVisible(false);

    // Boot one viewport early so the first frame the block is actually on
    // screen is not the frame that compiles the shaders.
    const bootObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        bootObserver.disconnect();
        void boot();
      },
      { rootMargin: "100% 0px 100% 0px", threshold: 0 },
    );
    bootObserver.observe(observed);

    // Two separate facts, deliberately not one flag: whether the block is on
    // screen, and whether the tab is showing. An observer callback can arrive
    // while the tab is hidden, and folding them together loses the state that
    // coming back to the tab needs to restore.
    const runObserver = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        layoutStale = true;
        setMountVisible(onScreen);
        if (onScreen) run();
        else stop();
      },
      { threshold: 0 },
    );
    runObserver.observe(observed);

    const onVisibility = () => {
      if (document.hidden) stop();
      else run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onResize = () => {
      viewportStale = true;
      layoutStale = true;
      // Repaint the still frame the loop is not drawing. Under reduced motion
      // this is the ONLY way the canvas ever changes.
      scheduleSettle();
    };
    window.addEventListener("resize", onResize);

    // No scroll listener while the loop is running: every frame reads the
    // scroll position itself (readScroll), so one would be pure overhead.
    //
    // Under reduced motion there IS one, and it is passive and does nothing
    // but ask for a repaint. Without it the single settled frame is drawn
    // one viewport before the block arrives and then never again, which
    // leaves every anchor-placed element frozen at the screen position its
    // section had at boot — a bough stuck across the bottom edge and
    // thirteen flowers hanging in mid-air while the page scrolls under
    // them. That is dirt on the screen, not a resting state. Repainting on
    // scroll keeps things where their sections are; it adds no motion of
    // its own, because dt stays 0 and every element ignores time under this
    // flag. The listener is registered only in this mode, so the normal
    // path is unchanged.
    const onReducedScroll = () => {
      if (onScreen && !document.hidden) scheduleSettle();
    };
    if (reducedMotion) {
      window.addEventListener("scroll", onReducedScroll, { passive: true });
    }

    // Catches the things a resize event does not: a font swap, a section
    // revealing, an image settling — anything that moves the boxes under us.
    const resizeObserver = new ResizeObserver(() => {
      layoutStale = true;
      scheduleSettle();
    });
    resizeObserver.observe(observed);

    return () => {
      disposed = true;
      bootObserver.disconnect();
      runObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onReducedScroll);
      teardownGpu();
      anchors.clear();
    };
  }, [elementsKey, gateSelector]);

  return (
    // Fixed, so it costs one viewport of drawing however tall the page gets,
    // and the elements sit in the air the page moves through rather than being
    // glued to a point in the document.
    //
    // z-0 inside the sections block's own stacking context: above
    // HalftoneField (also z-0, earlier in the DOM) and BEHIND every section,
    // which are z-[1]. Behind the type is not negotiable — body copy here runs
    // to 45-55% white on #0a0a0a, which is already at the 4.5:1 floor before
    // anything is laid over it.
    //
    // mix-blend-lighten, not source-over. The halftone shader writes an OPAQUE
    // frame, so a plain canvas over the sections block would paint out
    // HalftoneField's grain everywhere the stage has nothing to draw — the
    // empty frame measured (0,0,0) over a #1a1a1a ground in the probe, i.e. it
    // erased it. `lighten` takes max(page, stage) per channel: an empty stage
    // pixel leaves the page exactly as it was, and anything the stage lights up
    // wins. Same measurement afterwards: the ground came back at 26.
    //
    // The blend belongs on THIS div, not on the canvas. z-0 makes this div a
    // stacking context, which isolates its children's blending: with
    // mix-blend-mode on the canvas the backdrop is this empty div rather than
    // the page, and the blend silently does nothing.
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 mix-blend-lighten"
      ref={mountRef}
    />
  );
}
