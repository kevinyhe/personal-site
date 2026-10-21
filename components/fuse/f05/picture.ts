/**
 * The right panel's picture for concept 05: one dotField canvas (the
 * site's diamond grid, components/dotField.ts) showing one of seven
 * pictures, each painted fresh every frame at one pixel per cell:
 *
 *   tree    the hero's fir (hero_tree-c.mp4) on a dotted halo, petals falling
 *   clouds  two clouds (claudes_02/03.mp4) drifting over the far hills
 *   p0..p4  a project's picture in a card, Luke's PREVIEW card
 *   peak    the night peak from components/Ending.tsx, birds crossing
 *
 * Changing picture is a dissolve through the dot threshold: every cell has
 * a fixed random number, and as the change runs the old picture dims cell
 * by cell in that order while the new one brightens in the opposite order.
 * A dimmed cell falls under the threshold and its diamond goes out, so the
 * old picture comes apart into scattered diamonds and the new one fills in
 * through the gaps.
 *
 * The loop runs at 30 fps (lanceyan's cap) while the tab is visible. With
 * reduced motion it draws once per change: still frames, no dissolve.
 */

import { projectSource } from "@/components/below/barPicture";
import { createDotField, type DotField } from "@/components/dotField";
import { projects } from "@/components/profile";

/** Where a project's card sits, as shares of the panel. The labels and
 *  corner marks in index.tsx are placed from the same numbers. */
export const CARD = { x: 0.1, y: 0.14, w: 0.8, h: 0.46 };

export type PictureKey = "tree" | "clouds" | "peak" | `p${number}`;

export type Picture = {
  show(key: PictureKey): void;
  dispose(): void;
};

type Paint = (x: CanvasRenderingContext2D, W: number, H: number, t: number) => void;
type Scene = { videos: HTMLVideoElement[]; paint: Paint };

const FPS = 30;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Is the frame there to draw? */
const ready = (v: HTMLVideoElement): boolean => v.readyState >= 2 && v.videoWidth > 0;

/** Draws a picture on black additively, `times` over, so a dark picture
 *  (the fir is deep green) climbs into the palette's bright end. */
function lighten(x: CanvasRenderingContext2D, im: CanvasImageSource, dx: number, dy: number, dw: number, dh: number, times: number): void {
  x.globalCompositeOperation = "lighter";
  for (let i = 0; i < times; i += 1) x.drawImage(im, dx, dy, dw, dh);
  x.globalCompositeOperation = "source-over";
}

function treeScene(tree: HTMLVideoElement): Scene {
  const rand = seeded(1105);
  const petals = Array.from({ length: 44 }, () => ({ x: rand(), y: rand(), v: 0.018 + rand() * 0.03, f: 0.4 + rand(), ph: rand() * 6.28, a: 0.55 + rand() * 0.45 }));
  return {
    videos: [tree],
    paint: (x, W, H, t) => {
      // A dotted halo behind the tree, like the light behind lanceyan's pictures.
      const g = x.createRadialGradient(W * 0.5, H * 0.34, 0, W * 0.5, H * 0.34, W * 0.5);
      g.addColorStop(0, "rgba(255,255,255,0.34)");
      g.addColorStop(0.5, "rgba(255,255,255,0.13)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      if (ready(tree)) {
        const h = H * 0.58;
        const w = (h * tree.videoWidth) / tree.videoHeight;
        lighten(x, tree, W * 0.5 - w / 2, H * 0.64 - h, w, h, 3);
      }
      // Sakura petals, one cell each, falling and swaying left.
      for (const p of petals) {
        const y = (p.y + t * p.v) % 1;
        const px = (p.x - t * 0.006 + 0.025 * Math.sin(t * p.f + p.ph) + 2) % 1;
        const v = Math.round(255 * p.a);
        x.fillStyle = `rgb(${v},${Math.round(v * 0.86)},${Math.round(v * 0.93)})`;
        x.fillRect(Math.floor(px * W), Math.floor(y * H * 0.7), 1, 1);
      }
    },
  };
}

function cloudScene(far: HTMLVideoElement, near: HTMLVideoElement, hills: { img: HTMLImageElement | null }): Scene {
  return {
    videos: [far, near],
    paint: (x, W, H, t) => {
      // The sky: dark at the top, lit at the horizon behind the hills.
      const sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "rgba(0,0,0,1)");
      sky.addColorStop(0.62, "rgba(46,46,46,1)");
      sky.addColorStop(0.7, "rgba(10,10,10,1)");
      sky.addColorStop(1, "rgba(0,0,0,1)");
      x.fillStyle = sky;
      x.fillRect(0, 0, W, H);
      const im = hills.img;
      if (im) {
        const w = W * 1.1;
        const h = (w * im.naturalHeight) / im.naturalWidth;
        lighten(x, im, -W * 0.05, H * 0.7 - h, w, h, 2);
      }
      if (ready(far)) {
        const w = W * 1.05;
        const h = (w * far.videoHeight) / far.videoWidth;
        x.globalAlpha = 0.9;
        lighten(x, far, -W * 0.12 + W * 0.1 * Math.sin(t * 0.045), -H * 0.02, w, h, 1);
        x.globalAlpha = 1;
      }
      if (ready(near)) {
        const w = W * 0.8;
        const h = (w * near.videoHeight) / near.videoWidth;
        lighten(x, near, W * 0.3 + W * 0.09 * Math.sin(t * 0.038 + 2), H * 0.24, w, h, 1);
      }
    },
  };
}

function projectScene(src: { img: CanvasImageSource | null; w: number; h: number; invert: boolean }): Scene {
  return {
    videos: [],
    paint: (x, W, H, t) => {
      const cx = CARD.x * W;
      const cy = CARD.y * H;
      const cw = CARD.w * W;
      const ch = CARD.h * H;
      // The card's ground: just over the threshold, a faint dotted plate.
      x.fillStyle = "rgb(40,40,40)";
      x.fillRect(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));
      if (!src.img) return;
      // Cover-fit, breathing very slightly.
      const s = 1.03 + 0.02 * Math.sin(t * 0.25);
      const k = Math.max(cw / src.w, ch / src.h) * s;
      const dw = src.w * k;
      const dh = src.h * k;
      x.save();
      x.beginPath();
      x.rect(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));
      x.clip();
      x.drawImage(src.img, cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
      if (src.invert) {
        // A light picture (the Actually page) turned over, so its pale
        // ground draws nothing and its type draws the diamonds.
        x.globalCompositeOperation = "difference";
        x.fillStyle = "#fff";
        x.fillRect(cx, cy, cw, ch);
        x.globalCompositeOperation = "source-over";
      }
      x.restore();
    },
  };
}

/** The peak's outline: Ending.tsx's ridge, lifted so the summit clears
 *  the name across the foot of the panel. */
function ridge(n: number, rand: () => number): Float32Array {
  const keys: [number, number][] = [
    [0, 0.93], [0.08, 0.91], [0.2, 0.87], [0.3, 0.8], [0.38, 0.76], [0.43, 0.7],
    [0.48, 0.68], [0.52, 0.645], [0.55, 0.66], [0.6, 0.73], [0.63, 0.82],
    [0.67, 0.85], [0.74, 0.84], [0.8, 0.9], [0.84, 1.02], [1, 1.1],
  ];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const xx = i / (n - 1);
    let k = 0;
    while (k < keys.length - 2 && xx > keys[k + 1][0]) k += 1;
    const [x0, y0] = keys[k];
    const [x1, y1] = keys[k + 1];
    const tt = (xx - x0) / Math.max(1e-3, x1 - x0);
    out[i] = y0 + (y1 - y0) * tt + (rand() - 0.5) * 0.012 - 0.1;
  }
  return out;
}

function peakScene(birds: HTMLVideoElement, still: boolean): Scene {
  const rand = seeded(20261002);
  const stars = Array.from({ length: 90 }, () => ({ x: rand(), y: rand() * 0.7, a: 0.35 + rand() * 0.65, f: 0.4 + rand() * 1.8 }));
  const peak = ridge(200, rand);
  const glints = Array.from({ length: 600 }, () => ({ x: rand() * 0.84, d: Math.pow(rand(), 1.8) * 0.3, a: 0.3 + rand() * 0.7 }));
  return {
    videos: [birds],
    paint: (x, W, H, t) => {
      const breathe = still ? 0 : 0.04 * Math.sin(t * 0.25);
      const band = x.createLinearGradient(0, 0, W, H);
      band.addColorStop(0, "rgba(0,0,0,1)");
      band.addColorStop(0.42, "rgba(40,40,40,1)");
      band.addColorStop(0.75, `rgba(${Math.round(150 + 60 * breathe)},150,150,1)`);
      band.addColorStop(1, "rgba(235,235,235,1)");
      x.fillStyle = band;
      x.fillRect(0, 0, W, H);
      const glow = x.createRadialGradient(W * 0.98, H * 0.76, 0, W * 0.98, H * 0.76, W * (0.55 + breathe));
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.35, "rgba(200,200,200,0.55)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = glow;
      x.fillRect(0, 0, W, H);
      const shade = x.createRadialGradient(0, 0, 0, 0, 0, W * 0.55);
      shade.addColorStop(0, "rgba(0,0,0,0.9)");
      shade.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = shade;
      x.fillRect(0, 0, W, H);

      const drift = still ? 0 : t * 0.004;
      for (const s of stars) {
        const sx = (s.x + drift) % 1;
        const sy = (s.y - drift * 0.5 + 1) % 1;
        const tw = still ? 1 : 0.6 + 0.4 * Math.sin(t * s.f + s.x * 40);
        const v = Math.round(255 * s.a * tw);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.floor(sx * W), Math.floor(sy * H), 1, 1);
      }
      // One pass of the birds every 22 seconds, low over the peak.
      if (ready(birds)) {
        const cyc = still ? 0.3 : (t % 22) / 22;
        if (cyc < 0.5) {
          const bw = W * 0.14;
          x.globalCompositeOperation = "screen";
          x.drawImage(birds, -bw + (W + bw) * (cyc / 0.5), H * 0.24, bw, bw);
          x.globalCompositeOperation = "source-over";
        }
      }
      x.fillStyle = "#000";
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i < peak.length; i += 1) x.lineTo((i / (peak.length - 1)) * W, peak[i] * H);
      x.lineTo(W, H);
      x.closePath();
      x.fill();
      for (const g of glints) {
        const i = Math.min(peak.length - 1, Math.round(g.x * (peak.length - 1)));
        const v = Math.round(150 * g.a * (still ? 1 : 0.85 + 0.15 * Math.sin(t * 0.7 + g.x * 30)));
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.floor(g.x * W), Math.floor((peak[i] + 0.01 + g.d) * H), 1, 1);
      }
    },
  };
}

function makeVideo(file: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.src = `/sonda/${file}`;
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = "auto";
  return v;
}

/** Starts the picture on `canvas`, or returns null when WebGL will not start. */
export function createPicture(canvas: HTMLCanvasElement, reduced: boolean, phone: boolean): Picture | null {
  let field: DotField | null = null;
  try {
    field = createDotField(canvas, {
      cols: phone ? 120 : 170,
      threshold: 0.13,
      brightness: 1,
      size: 0.85,
      hue: 0,
      ground: "#0c0408",
      ramp: [
        [0, "#2a0d1e"],
        [0.3, "#6a1d44"],
        [0.5, "#b8174f"],
        [0.72, "#f9b9dc"],
        [1, "#fffafc"],
      ],
    });
  } catch {
    field = null;
  }
  if (!field) return null;
  const dots = field;
  let gone = false;

  const tree = makeVideo("hero_tree-c.mp4");
  const far = makeVideo("claudes_03.mp4");
  const near = makeVideo("claudes_02.mp4");
  const birds = makeVideo("birds_04.mp4");
  const allVideos = [tree, far, near, birds];

  const hills: { img: HTMLImageElement | null } = { img: null };
  const hillImg = new Image();
  hillImg.onload = () => {
    hills.img = hillImg;
    redraw();
  };
  hillImg.src = "/sonda/hero_mountain_bg.png";

  const scenes = new Map<PictureKey, Scene>();
  scenes.set("tree", treeScene(tree));
  scenes.set("clouds", cloudScene(far, near, hills));
  scenes.set("peak", peakScene(birds, reduced));
  projects.forEach((p, i) => {
    const src: { img: CanvasImageSource | null; w: number; h: number; invert: boolean } = { img: null, w: 1, h: 1, invert: false };
    const s = projectSource(p);
    if (typeof s === "string") {
      if (s) {
        const im = new Image();
        im.onload = () => {
          src.img = im;
          src.w = im.naturalWidth;
          src.h = im.naturalHeight;
          src.invert = meanOf(im) > 0.6;
          redraw();
        };
        im.src = s;
      }
    } else {
      src.img = s;
      src.w = s.width;
      src.h = s.height;
    }
    scenes.set(`p${i}`, projectScene(src));
  });

  /** Mean brightness of a picture, to tell a light one that needs turning over. */
  function meanOf(im: CanvasImageSource): number {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return 0;
    x.drawImage(im, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let s = 0;
    for (let k = 0; k < d.length; k += 4) s += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
    return s / (255 * 576);
  }

  // Two working canvases at the grid's size: the old picture and the new.
  const offA = document.createElement("canvas");
  const offB = document.createElement("canvas");
  const ctxA = offA.getContext("2d", { willReadFrequently: true });
  const ctxB = offB.getContext("2d", { willReadFrequently: true });
  let noise = new Float32Array(0);

  let cur: PictureKey = "tree";
  let next: PictureKey | null = null;
  let want: PictureKey = "tree";
  let from = 0;
  let dur = 1;
  const epoch = performance.now();

  const sceneTime = (now: number): number => (reduced ? 1 : (now - epoch) / 1000);

  /** Plays the videos the shown pictures need and pauses the rest. */
  const syncVideos = (): void => {
    const need = new Set<HTMLVideoElement>([...(scenes.get(cur)?.videos ?? []), ...(next ? scenes.get(next)?.videos ?? [] : [])]);
    for (const v of allVideos) {
      if (need.has(v) && !reduced && !document.hidden) void v.play().catch(() => {});
      else v.pause();
    }
  };

  const begin = (key: PictureKey, now: number): void => {
    if (reduced) {
      cur = key;
      next = null;
    } else {
      next = key;
      from = now;
      // A swap between two projects is a quick one: it follows the pointer.
      dur = cur.startsWith("p") && key.startsWith("p") ? 650 : 1150;
    }
    syncVideos();
  };

  const paintInto = (x: CanvasRenderingContext2D, key: PictureKey, W: number, H: number, t: number): void => {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
    x.fillStyle = "#000";
    x.fillRect(0, 0, W, H);
    scenes.get(key)?.paint(x, W, H, t);
  };

  const frame = (now: number): void => {
    if (next && now - from >= dur) {
      cur = next;
      next = null;
      if (want !== cur) begin(want, now);
      else syncVideos();
    }
    const t = sceneTime(now);
    const raw = next ? clamp01((now - from) / dur) : 0;
    const p = raw * raw * (3 - 2 * raw);
    const nextKey = next;
    dots.render((ctx, W, H) => {
      if (!ctxA || !ctxB) return;
      if (offA.width !== W || offA.height !== H) {
        offA.width = W;
        offA.height = H;
        offB.width = W;
        offB.height = H;
        const rand = seeded(W * 7919 + H);
        noise = new Float32Array(W * H);
        for (let i = 0; i < noise.length; i += 1) noise[i] = rand();
      }
      if (!nextKey) {
        paintInto(ctx, cur, W, H, t);
        return;
      }
      paintInto(ctxA, cur, W, H, t);
      paintInto(ctxB, nextKey, W, H, t);
      const a = ctxA.getImageData(0, 0, W, H);
      const b = ctxB.getImageData(0, 0, W, H).data;
      const d = a.data;
      for (let i = 0, k = 0; i < noise.length; i += 1, k += 4) {
        const r = noise[i];
        const la = clamp01((r + 1 - 2 * p) * 3);
        const lb = clamp01((2 * p - r) * 3);
        d[k] = Math.min(255, d[k] * la + b[k] * lb);
        d[k + 1] = Math.min(255, d[k + 1] * la + b[k + 1] * lb);
        d[k + 2] = Math.min(255, d[k + 2] * la + b[k + 2] * lb);
      }
      ctx.putImageData(a, 0, 0);
    });
  };

  // The loop: 30 fps while the panel is on screen and the tab is visible.
  let raf = 0;
  let onScreen = true;
  let lastFrame = -1;
  const tick = (now: number): void => {
    raf = 0;
    if (gone || !onScreen || document.hidden) return;
    const f = Math.floor((now - epoch) / (1000 / FPS));
    if (f !== lastFrame) {
      lastFrame = f;
      frame(now);
    }
    raf = requestAnimationFrame(tick);
  };
  const wake = (): void => {
    if (!reduced && !raf && !gone && onScreen && !document.hidden) raf = requestAnimationFrame(tick);
  };
  /** One frame now: for reduced motion, a resize, or something loading. */
  function redraw(): void {
    if (gone) return;
    if (reduced) frame(performance.now());
  }

  // With reduced motion the videos never play: each is parked one second
  // in and drawn as a still once that frame is there.
  if (reduced) {
    for (const v of allVideos) {
      v.addEventListener("loadeddata", () => {
        v.currentTime = 1;
      });
      v.addEventListener("seeked", redraw);
    }
  }

  const seen = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen) {
      syncVideos();
      wake();
    } else {
      for (const v of allVideos) v.pause();
    }
  });
  seen.observe(canvas);
  const onVisibility = (): void => {
    syncVideos();
    wake();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const sized = new ResizeObserver(() => {
    dots.resize();
    frame(performance.now());
  });
  sized.observe(canvas);

  syncVideos();
  frame(performance.now());
  wake();

  return {
    show: (key) => {
      if (gone || key === want) return;
      want = key;
      if (!next && key !== cur) begin(key, performance.now());
      redraw();
    },
    dispose: () => {
      gone = true;
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const v of allVideos) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      dots.dispose();
    },
  };
}
