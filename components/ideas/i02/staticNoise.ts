/** TV static drawn on a 2D canvas: random grain in the site's pink greys, with a brighter band rolling through it. */

function paintStatic(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Static: no 2D context");
  const { width, height } = canvas;
  const image = context.createImageData(width, height);
  const pixels = new Uint32Array(image.data.buffer);
  let seed = (Math.random() * 0xffffffff) >>> 0 || 1;
  const bandCentre = Math.random() * height;
  const bandHalfHeight = height * 0.12;
  for (let y = 0; y < height; y += 1) {
    const inBand = Math.max(0, 1 - Math.abs(y - bandCentre) / bandHalfHeight);
    const rowGain = 0.55 + 0.25 * Math.random() + 0.5 * inBand;
    for (let x = 0; x < width; x += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const grey = Math.min(255, (seed & 255) * rowGain);
      const red = grey;
      const green = grey * 0.8;
      const blue = grey * 0.88;
      pixels[y * width + x] = 0xff000000 | (blue << 16) | (green << 8) | red;
    }
  }
  context.putImageData(image, 0, 0);
}

/**
 * Sizes the canvas to its box at `grain` CSS px per cell, then repaints the
 * static every frame for `duration` ms with the canvas' opacity set from
 * `opacityAt(t)`, t going 0 to 1. Resolves when the time is up.
 */
export function runStatic(
  canvas: HTMLCanvasElement,
  duration: number,
  grain: number,
  opacityAt: (t: number) => number,
): Promise<void> {
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.ceil(box.width / grain));
  canvas.height = Math.max(1, Math.ceil(box.height / grain));
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      paintStatic(canvas);
      canvas.style.opacity = String(opacityAt(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}
