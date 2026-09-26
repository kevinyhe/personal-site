"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

/**
 * The aurora is what the field actually is now; the CSS blobs below are the
 * ground it paints over and the picture if WebGL cannot start. Split out of
 * the first load because nothing about the first paint depends on it — the
 * page is readable on the flat field while its chunk arrives.
 */
const AuroraBackground = dynamic(() => import("@/components/AuroraBackground"), {
  ssr: false,
});

/**
 * The site's background colour field: the aurora — the same four backlit
 * curtains the hero scene hangs behind its tree (AuroraBackground) — over a
 * pair of pre-blurred blobs that are the ground it paints on and the picture
 * if WebGL cannot start.
 *
 * This is the page background, not the WebGL backdrop inside the hero canvas.
 * The canvas only mounts on the home route, so /work, /info and /contact were
 * rendering on flat #0a0a0a with nothing behind the type.
 *
 * Pure CSS on purpose. It sits behind every page including the home hero, and
 * a second WebGL context (or a full-screen 2D canvas repainting every frame)
 * would compete with the tree scene for the GPU on the one route where the
 * budget is already spent. The blobs are two pre-blurred WebP textures
 * (public/bg, baked by scripts/bake-site-bg.mjs) translated by a CSS
 * animation, so after the first paint each frame is two textured quads. They
 * were live `filter: blur(90px)` gradients; app/globals.css says why not.
 *
 * Structure: .site-bg paints the base, its ::before and ::after each carry a
 * texture drifting on its own long loop (64s and 87s, so they never settle
 * into a repeating pattern), and .site-bg-vignette crushes the corners back
 * to black so the field reads as light in a dark room rather than as
 * wallpaper.
 *
 * The only script here pauses the drift while the tab is hidden. Browsers
 * stop painting a hidden tab, but the animation clock and its style
 * recalculation do not all stop everywhere, and there is nobody to see it.
 */
export default function SiteBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const sync = () => {
      if (document.hidden) el.dataset.paused = "";
      else delete el.dataset.paused;
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div aria-hidden="true" className="site-bg" ref={ref}>
      <AuroraBackground />
      <div className="site-bg-vignette" />
      <div className="site-bg-grain" />
    </div>
  );
}
