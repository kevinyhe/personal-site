import { preload } from "react-dom";

/** The television model and its textures. */
const CRT_ASSETS: { href: string; as: "fetch" | "image" }[] = [
  { href: "/models/crt.glb", as: "fetch" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-basecolor.webp", as: "image" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-normal.webp", as: "image" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-metallic.webp", as: "image" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-roughness.webp", as: "image" },
];

/**
 * Sends the television's assets out with the HTML, not after the bundle has
 * parsed and the canvas has mounted: the page loads AS the television shot,
 * so these are the first things it needs. Call from a page's render.
 */
export function preloadCrtAssets(): void {
  for (const asset of CRT_ASSETS) {
    preload(asset.href, {
      as: asset.as,
      ...(asset.as === "fetch" ? { crossOrigin: "anonymous" } : {}),
    });
  }
}
