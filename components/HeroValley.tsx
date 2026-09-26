"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { sceneFx } from "@/components/sceneFx";
import { createHutScene, type HutScene } from "@/components/valley/hutScene";

gsap.registerPlugin(ScrollTrigger);

/**
 * The hills the hero tree stands in.
 *
 * The same valley the standalone page opens on (/valley), built BARE:
 * components/valley/hutScene with `bare: true` draws the terrain and the two
 * ranges behind it and nothing else — no hut, no cherry trees of its own, no
 * path, no boulders, no fallen petals. The site's own cherry tree is the
 * tree in this picture, and a cabin and a second pair of trees behind it
 * would be a different one.
 *
 * It has no element in the page. It draws to an off-screen canvas, and that
 * canvas is handed to the hero's three.js scene through sceneFx, where the
 * backdrop shader lays it over the curtains it would otherwise draw
 * (BareThreeCanvas, uScene). Going through the backdrop rather than sitting
 * behind the hero's canvas is what makes it work at all: that canvas is
 * opaque and fills the screen, so anything behind it is invisible. As the
 * backdrop it is INSIDE the hero's scene — the tree stands in front of it,
 * the dot matrix falls over it, the television shows it while the page
 * loads, and the push-in through the glass lands in it.
 *
 * Its own camera pulls back with the page's (sceneFx.dolly), so the hills
 * recede as the hero shrinks into its framed picture instead of staying
 * painted on the glass.
 *
 * Renders nothing.
 */

/** Longest side of the off-screen buffer. The backdrop is behind a tree and
 *  under a dot matrix; past this the pixels do not survive either. */
const MAX_SIDE = 1280;
/** Below this the hero is a phone and the scene draws one still frame. */
const DESKTOP = 1024;
/**
 * Where the valley's own camera starts and ends. Its p runs BACKWARD — 1 is
 * 44 m back and 9.6 m up, 0 is standing 22.5 m into the clearing, and -1 is
 * on past the clearing altogether (hutScene's CAM_PAST). So a forward dolly
 * runs from a high p down through zero and out the other side: about 47 m of
 * travel, from the wide valley shot to past where the trees stand.
 *
 * That last stretch is the one that matters. Parallax goes as the inverse of
 * distance, so almost all of it is in the final few metres — stopping at 0,
 * as this did, spent the whole scroll in the half of the path where nothing
 * appears to move.
 */
const DOLLY_FROM = 1;
const DOLLY_TO = -1;
/** Where a still frame stands. */
const STILL_AT = 0.3;

export default function HeroValley() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.innerWidth >= DESKTOP;
    const stillFrame = reduced || !desktop;

    const canvas = document.createElement("canvas");
    const sizeTo = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(1, MAX_SIDE / Math.max(w, h));
      return { w: Math.max(2, Math.round(w * s)), h: Math.max(2, Math.round(h * s)) };
    };
    let box = sizeTo();
    canvas.width = box.w;
    canvas.height = box.h;

    let scene: HutScene | null = null;
    try {
      scene = createHutScene(canvas, {
        quality: desktop ? "medium" : "low",
        seed: 4114,
        reducedMotion: stillFrame,
        bare: true,
      });
    } catch (error) {
      console.warn("[HeroValley] the hills could not be built", error);
      return undefined;
    }

    let disposed = false;
    let built = false;
    let fade: gsap.core.Tween | null = null;
    // The canvas has no layout, so hutScene's own clientWidth read is no use:
    // it is told its size directly, and told again when the window changes.
    scene.resize(box.w, box.h);
    const fit = () => {
      box = sizeTo();
      canvas.width = box.w;
      canvas.height = box.h;
      scene?.resize(box.w, box.h);
      // Resizing a drawing buffer clears it, and a still frame has no loop
      // to paint it again.
      if (built && stillFrame) scene?.renderOnce();
    };
    window.addEventListener("resize", fit);

    // A second WebGL context with its own render loop: once the page has
    // scrolled past the hero nothing is sampling it, so it stops with the
    // stage it lives in.
    const stage = document.querySelector("[data-hero-stage]");
    let onScreen = true;
    const io = stage
      ? new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((e) => e.isIntersecting);
            if (!built || stillFrame) return;
            if (onScreen) scene?.start();
            else scene?.stop();
          },
          { threshold: 0.01 },
        )
      : null;
    if (stage) io?.observe(stage);

    // The valley's own camera rides sceneFx.dolly, which ValleyTransition
    // scrubs over the shrink: the hills pull back with the hero's camera
    // rather than staying put behind a shrinking frame.
    let lastDolly = -1;
    const follow = () => {
      if (disposed || stillFrame) return;
      const d = sceneFx.dolly;
      if (Math.abs(d - lastDolly) < 0.002) return;
      lastDolly = d;
      scene?.setProgress(DOLLY_FROM + (DOLLY_TO - DOLLY_FROM) * d);
    };
    gsap.ticker.add(follow);

    scene.ready.then(() => {
      if (disposed) return;
      built = true;
      sceneFx.backdropScene = canvas;
      if (stillFrame) {
        scene?.setProgress(STILL_AT);
        scene?.renderOnce();
      } else {
        scene?.setProgress(DOLLY_FROM);
        if (onScreen) scene?.start();
      }
      // Up over half a second rather than switched on: on a fast machine the
      // hills land while the television is still warming up, and a backdrop
      // that appears between two frames reads as a glitch on the tube.
      // No overwrite: HeroIntro's reveal is tweening other fields of this
      // same object and overwrite would kill the whole television run.
      fade = gsap.to(sceneFx, {
        backdropSceneMix: 1,
        duration: reduced ? 0 : 0.5,
        ease: "power2.out",
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", fit);
      io?.disconnect();
      gsap.ticker.remove(follow);
      fade?.kill();
      sceneFx.backdropSceneMix = 0;
      sceneFx.backdropScene = null;
      scene?.dispose();
    };
  }, []);

  return null;
}
