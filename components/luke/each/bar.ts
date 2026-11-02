import { useEffect, useState } from "react";

import { css, ink, onPalette } from "@/components/cloudPalette";
import { GROUND } from "@/components/luke/theme";
import { type BarCanvas, type BarLayer, createBarCanvas, hexToRgb, type Rgb } from "@/components/valley/barShader";

/**
 * A bar canvas in the sentence section's colours: its bars in the type's
 * colour, which follows the cloud palette (or in `fill`, fixed), on
 * nothing (the ground shows through). One WebGL context; the home page
 * has room for one. Null where there is no WebGL.
 */
export function mountBar(canvas: HTMLCanvasElement, layers: BarLayer[], fps = 60, fill?: Rgb): { bar: BarCanvas; dispose: () => void } | null {
  const bar = createBarCanvas(canvas, layers, {
    colors: () => ({ bg: hexToRgb(GROUND), fill: fill ?? ink(0) }),
    defaults: { bgOpacity: 0 },
    fps,
  });
  if (!bar) return null;
  const off = onPalette((t) => bar.setColors(hexToRgb(GROUND), fill ?? ink(t)));
  return {
    bar,
    dispose: () => {
      off();
      bar.destroy();
    },
  };
}

/** The type's colour as CSS, following the cloud palette, for a picture
 *  drawn in 2D bars (barPicture) beside the sentence. theme.ts's INK is
 *  the pink: on the pink ground it drew the gallery and the moon pink on
 *  pink, and nothing showed. */
export function useInk(): string {
  const [c, setC] = useState(css(ink(1)));
  useEffect(() => onPalette((t) => setC(css(ink(t)))), []);
  return c;
}

/** The grade for a source drawn as light shapes on black: a bright grey
 *  draws a wide bar, black none. */
export const LIGHT_ON_BLACK = { blackPoint: 200, whitePoint: 25, threshold: 255 } as const;
