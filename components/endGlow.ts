import { COLS, type GlowRequest } from "@/components/endGlowField";

/**
 * The light over the end page's mountain (endGlowField.ts), painted by a
 * worker (endGlow.worker.ts) into a canvas made here, in `host`, which is
 * laid over the mountain with mix-blend-mode: screen (Ending.tsx).
 *
 * Made here, not in the page: a canvas goes to a worker once, and React
 * runs an effect twice in development.
 *
 * One frame is painted at a time. A time sent while one is being painted
 * waits, and only the latest is kept.
 */
export type Glow = {
  /** Draws the field `time` seconds in. */
  draw(time: number): void;
  /** Re-reads the host's size. */
  resize(): void;
  dispose(): void;
};

export function createGlow(host: HTMLElement): Glow {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.append(canvas);
  const worker = new Worker(new URL("./endGlow.worker.ts", import.meta.url));
  const tell = (request: GlowRequest, moved: Transferable[] = []): void => worker.postMessage(request, moved);
  const offscreen = canvas.transferControlToOffscreen();
  tell({ kind: "start", canvas: offscreen }, [offscreen]);

  let painting = false;
  let waiting: number | null = null;
  const draw = (time: number): void => {
    if (painting) {
      waiting = time;
      return;
    }
    painting = true;
    tell({ kind: "draw", time });
  };
  worker.onmessage = () => {
    painting = false;
    if (waiting === null) return;
    const time = waiting;
    waiting = null;
    draw(time);
  };
  const resize = (): void => {
    const r = host.getBoundingClientRect();
    tell({ kind: "size", cols: COLS, rows: Math.max(1, Math.round((COLS * Math.max(1, r.height)) / Math.max(1, r.width))) });
  };
  resize();

  return {
    draw,
    resize,
    dispose: () => {
      worker.terminate();
      canvas.remove();
    },
  };
}
