import * as THREE from "three";
import type { CanvasSource } from "@/components/valley/barShader";
import { createLanternPair, createShrine, createToriiGate } from "@/components/valley/sources/shrine";

/**
 * The valley's own shrine renders, as cards that stand on the island.
 *
 * Each builder draws a small lit 3D picture in greys on black for the
 * valley's bar layers. It is drawn once here, read back, and turned
 * over for this scene's grade: in the valley a dark grey is a wide bar,
 * here a bright one is, so the roofs and the torii, which the builders
 * draw darkest, come out brightest. Black stays empty. Then the builder
 * is let go, which frees the WebGL context it holds.
 *
 * The cards turn to face the camera as the island turns, so the precinct
 * is always seen from its good side.
 */

export type Card = { texture: THREE.CanvasTexture; aspect: number };

function recode(source: CanvasSource): Card | null {
  const src = source.canvas;
  const w = src.width;
  const h = src.height;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx || w < 4 || h < 4) return null;
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // The black ground, and the dark fringe where an edge blends into it.
      if (l < 16) continue;
      const tone = Math.max(0.14, Math.min(0.95, 1.08 - (l / 255) * 1.0));
      out.data[i] = Math.round(tone * 255);
      out.data[i + 3] = 255;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  // Cropped to the drawing, so the card's bottom edge is its foot.
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  full.getContext("2d")?.putImageData(out, 0, 0);
  const crop = document.createElement("canvas");
  crop.width = cw;
  crop.height = ch;
  crop.getContext("2d")?.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
  full.width = 1;
  full.height = 1;
  const texture = new THREE.CanvasTexture(crop);
  // Data, not colour: three must not move these numbers.
  texture.colorSpace = THREE.NoColorSpace;
  return { texture, aspect: cw / ch };
}

function take(make: () => CanvasSource): Card | null {
  let source: CanvasSource | null = null;
  try {
    source = make();
    return recode(source);
  } catch {
    return null;
  } finally {
    source?.dispose?.();
  }
}

export type Cards = { shrine: Card | null; torii: Card | null; lanterns: Card | null };

export function makeCards(): Cards {
  return {
    shrine: take(() => createShrine({ seed: 21, width: 720, height: 540 })),
    torii: take(() => createToriiGate({ seed: 21, width: 320, height: 360 })),
    lanterns: take(() => createLanternPair({ seed: 21, width: 420, height: 300 })),
  };
}
