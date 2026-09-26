import type { CanvasSource } from "@/components/valley/barShader";

/**
 * A plate with everything brighter than `cut` painted black.
 *
 * The bar shader discards a black cell outright, so this is how one
 * photograph becomes two layers: the plate as it is, and the plate with
 * only its darkest tones left — the near ridge and the foreground of the
 * landscape, which are what a building stands behind. Drawn after the
 * buildings, this copy covers them where the front hill is and is nothing
 * at all where it is not.
 *
 * It is a copy of the PIXELS, not a `threshold` on the layer. The shader's
 * threshold sends a bright cell to the ground colour rather than discarding
 * it, so hiding the light hills that way meant bgOpacity 0 — and then every
 * cell of the dark hill was a bar over a transparent gap, and the buildings
 * showed through the gaps as ghost outlines. A cell here is opaque or
 * absent.
 *
 * `cut` is in source grey, not graded brightness, so it does not move with
 * the scroll tween. Same-origin image, so the pixels can be read back.
 */
export function createFrontMass(src: string, cut: number): CanvasSource {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ready = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve();
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if ((d[i] + d[i + 1] + d[i + 2]) / 3 > cut) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
        }
      }
      ctx.putImageData(data, 0, 0);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
  return {
    canvas,
    animated: false,
    ready,
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
