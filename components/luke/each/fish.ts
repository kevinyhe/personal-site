import type { CanvasSource } from "@/components/valley/barShader";

/**
 * One koi swimming a long shallow wave across a canvas, for the bar
 * shader: the fish photograph (public/work/koi.png, as in koi.ts) drawn as
 * thin slices from head to tail, each placed a little further back along
 * the wave and turned to it, so the fish bends with the water. Where it is
 * on the wave is set from outside (setT), by the scroll; the tail beats
 * with how fast it is moved.
 */
export type Fish = { source: CanvasSource; setT(t: number): void; dispose(): void };

const SLICES = 40;
const SAMPLES = 1200;

export function createFish(img: HTMLImageElement, width: number, height: number, length: number): Fish {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const IW = img.naturalWidth;
  const IH = img.naturalHeight;
  // The wave: across the canvas and a little past each side, two shallow
  // bends, with a straight run on each end so the whole fish can be off.
  const px = new Float32Array(SAMPLES + 1);
  const py = new Float32Array(SAMPLES + 1);
  const along = new Float32Array(SAMPLES + 1);
  for (let i = 0; i <= SAMPLES; i += 1) {
    const u = i / SAMPLES;
    px[i] = -length * 1.2 + u * (width + length * 2.4);
    // Under the waterline (the top half is the sentence's).
    py[i] = height * 0.73 + Math.sin(u * Math.PI * 2 - 0.6) * height * 0.13;
    along[i] = i === 0 ? 0 : along[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  }
  const total = along[SAMPLES];
  const at = (s: number): { x: number; y: number; a: number } => {
    const d = Math.max(0, Math.min(total, s));
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (along[mid] < d) lo = mid;
      else hi = mid;
    }
    const seg = along[hi] - along[lo] || 1;
    const f = (d - along[lo]) / seg;
    return { x: px[lo] + (px[hi] - px[lo]) * f, y: py[lo] + (py[hi] - py[lo]) * f, a: Math.atan2(py[hi] - py[lo], px[hi] - px[lo]) };
  };

  let head = 0;
  let want = 0;
  let beat = 0;
  let speed = 0;
  let dirty = true;

  const draw = (): void => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const tall = (length * IH) / IW;
    const sw = IW / SLICES;
    const step = length / SLICES;
    const drive = 0.3 + 0.55 * Math.min(1, speed / 1.8);
    for (let k = 0; k < SLICES; k += 1) {
      const u = (k + 0.5) / SLICES;
      const env = 0.015 + 0.11 * Math.pow(u, 2.2);
      const ph = beat - u * Math.PI * 2 * 0.95;
      const wave = Math.sin(ph) * env * length * drive;
      const slope = Math.cos(ph) * env * Math.PI * 2 * 0.95 * drive;
      const q = at(head - u * length);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(q.x - Math.sin(q.a) * wave, q.y + Math.cos(q.a) * wave);
      ctx.rotate(q.a + slope);
      ctx.drawImage(img, IW - (k + 1) * sw, 0, sw, IH, -step / 2 - 1, -tall / 2, step + 2, tall);
    }
  };
  draw();

  return {
    source: {
      canvas,
      animated: true,
      update: (_time: number, dt: number) => {
        const stepT = Math.min(0.1, Math.max(0, dt));
        // Eases toward where the scroll put it, as the koi do.
        const next = head + (want - head) * (1 - Math.exp(-6 * stepT));
        const moved = next - head;
        head = next;
        if (stepT > 0) speed += (Math.abs(moved) / length / stepT - speed) * (1 - Math.exp(-9.75 * stepT));
        if (Math.abs(moved) < 0.01 && speed < 6e-3) speed = 0;
        beat += (moved / (1.5 * length)) * Math.PI * 2;
        if (!dirty && Math.abs(moved) < 0.01 && speed === 0) return false;
        dirty = speed !== 0 || Math.abs(moved) >= 0.01;
        draw();
        return true;
      },
    },
    setT: (t) => {
      want = total * Math.max(0, Math.min(1, t));
      dirty = true;
    },
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
