/** Works out the bark's pixels (barkPixels.ts) off the main thread and
 *  hands them back, the buffers moved, not copied. */
import { barkPixels } from "@/components/barkPixels";

self.onmessage = (e: MessageEvent<{ width: number; height: number }>) => {
  const px = barkPixels(e.data.width, e.data.height);
  (self as unknown as Worker).postMessage(px, [px.color.buffer, px.bump.buffer, px.rough.buffer]);
};
