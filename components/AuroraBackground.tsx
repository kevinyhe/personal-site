"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import {
  VOID_BACKDROP_FRAGMENT_SHADER,
  VOID_BACKDROP_VERTEX_SHADER,
} from "@/components/BareThreeCanvas";

/**
 * The aurora, as the page's own background.
 *
 * It is the hero scene's backdrop shader — the four backlit curtains hanging
 * from the top of the frame, swaying on their own phases, that the tree
 * stands in front of — run on a full-screen quad instead of on a billboard
 * inside the hero's three.js scene. Same file, same constants, same motion,
 * so the field behind the page and the field behind the tree are one thing
 * rather than two that nearly match.
 *
 * It replaces a pair of pre-blurred WebP blobs drifting on a CSS animation
 * (SiteBackground, which still paints underneath and is what shows if this
 * cannot start).
 *
 * WHAT IT COSTS, and why that is affordable. The shader is about four
 * gaussians and a hue blend per pixel — no textures, no geometry, one
 * triangle. Three things keep it small:
 *
 *   half resolution   the output is smooth gradients with nothing in it
 *                     finer than a hundred pixels, so a buffer at 0.5 dpr
 *                     upscaled by the compositor is indistinguishable and
 *                     costs a quarter of the fragments.
 *   30 frames         the curtains cross the frame in 10-25 seconds. Sixty
 *                     frames a second draws the same picture twice.
 *   asleep when idle  nothing is drawn while the tab is hidden, and under
 *                     prefers-reduced-motion it draws one frame and stops.
 *
 * `uFrame` is what makes it match the hero: the shader's constants are tuned
 * in the units of the plane it hangs on there, and a full-screen quad sees
 * the rectangle the hero's camera would have seen of it, worked out from the
 * same fov, distance and plane size.
 */

/** The hero's own figures: fov 42 at 41.6 units on a plane 100 units tall,
 *  whose p coordinate runs -0.806..0.806. Half the visible height in p. */
const FRAME_HALF_H = (Math.tan((42 * Math.PI) / 360) * 41.6) / (100 / 1.6129);
/** Frames a second. The curtains do not move fast enough to want more. */
const FPS = 30;
/** Drawing-buffer scale. */
const RENDER_SCALE = 0.5;

export default function AuroraBackground() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      // No WebGL: the CSS field underneath is the picture.
      return undefined;
    }
    if (!renderer) return undefined;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x0a0a0a, 1);

    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0.1) },
      uPointerForce: { value: 0 },
      uLevel: { value: 1 },
      uIridescence: { value: 0 },
      // The hero's own ramp is a rose-MAROON shadow through a red-leaning
      // core to a salmon highlight — it was written to be seen on a tube, in
      // a dark room, under a dot matrix. Behind the page it read as red. This
      // is the same ramp walked onto the site's blossom pinks: a mauve-plum
      // shadow, a blossom core and a pale sakura highlight, with the warm
      // tint leaning magenta instead of orange so the hue spread never turns
      // the field ginger. The core is then held at a BLOSSOM rather than a
      // vivid pink: the site's own --sakura-mid is a pale blush, and a
      // saturated magenta behind it made every pink on the page look like a
      // different pink. The hero keeps its own (BareThreeCanvas); on the home
      // page its curtains are covered by the valley anyway, and /crt is the
      // room they were tuned for.
      uBase: { value: new THREE.Color(0x0b080d) },
      uDeep: { value: new THREE.Color(0x58304f) },
      uCore: { value: new THREE.Color(0xe3a8ce) },
      uHot: { value: new THREE.Color(0xfbe6f2) },
      uViolet: { value: new THREE.Color(0x6a4a9c) },
      uWarmTint: { value: new THREE.Vector3(1.06, 0.94, 1.0) },
      uCoolTint: { value: new THREE.Vector3(0.88, 0.9, 1.15) },
      uScene: { value: null as THREE.Texture | null },
      uSceneMix: { value: 0 },
      uSceneFit: { value: new THREE.Vector2(1, 1) },
      uSceneGain: { value: 1 },
      uFrame: { value: new THREE.Vector2(1, 1) },
    };
    // The sampler is never read (uSceneMix is 0) but must be bound: some
    // drivers draw undefined from an unbound one rather than nothing.
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    uniforms.uScene.value = blank;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VOID_BACKDROP_VERTEX_SHADER,
        fragmentShader: VOID_BACKDROP_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        // The shader writes linear values; three runs ACES and the sRGB
        // encode on the way out, exactly as the hero's halftone pass does.
        toneMapped: true,
      }),
    );
    scene.add(quad);

    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer!.setPixelRatio(RENDER_SCALE);
      renderer!.setSize(w, h, false);
      renderer!.domElement.style.width = "100%";
      renderer!.domElement.style.height = "100%";
      uniforms.uFrame.value.set(
        FRAME_HALF_H * 2 * (w / Math.max(1, h)),
        FRAME_HALF_H * 2,
      );
    };
    fit();
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);
    window.addEventListener("resize", fit);

    const clock = new THREE.Clock();
    let raf = 0;
    let last = -Infinity;
    const gap = 1000 / FPS;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < gap) return;
      last = now;
      uniforms.uTime.value = clock.getElapsedTime() * 3;
      renderer!.render(scene, camera);
    };

    const running = { on: false };
    const start = () => {
      if (running.on || reduced) return;
      running.on = true;
      last = -Infinity;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running.on = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => (document.hidden ? stop() : start());

    if (reduced) renderer.render(scene, camera);
    else start();
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", fit);
      quad.geometry.dispose();
      (quad.material as THREE.Material).dispose();
      blank.dispose();
      renderer!.domElement.remove();
      renderer!.dispose();
    };
  }, []);

  return <div aria-hidden="true" className="site-bg-aurora" ref={hostRef} />;
}
