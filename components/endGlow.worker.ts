/**
 * Paints the light over the end page's mountain (endGlowField.ts) off the
 * main thread, into the canvas endGlow.ts hands it, one frame for each
 * time it is sent, and says when each is done.
 */
import { createGlowField, type GlowRequest } from "@/components/endGlowField";

const paint = createGlowField();
let g: OffscreenCanvasRenderingContext2D | null = null;
let img: ImageData | null = null;

self.onmessage = ({ data: request }: MessageEvent<GlowRequest>) => {
  if (request.kind === "start") {
    g = request.canvas.getContext("2d");
    if (!g) throw new Error("The end page's light has no 2D canvas to paint in");
    return;
  }
  if (!g) throw new Error("The end page's light was sent work before its canvas");
  if (request.kind === "size") {
    g.canvas.width = request.cols;
    g.canvas.height = request.rows;
    img = g.createImageData(request.cols, request.rows);
    return;
  }
  if (!img) throw new Error("The end page's light was asked to paint before its size");
  paint(img, request.time);
  g.putImageData(img, 0, 0);
  (self as unknown as Worker).postMessage("painted");
};
