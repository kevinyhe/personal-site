import { textPlate } from "@/components/below/barPicture";
import { projects } from "@/components/profile";

/**
 * What concept 01 paints into its one dot field, scene by scene. Each
 * painter draws a grey picture at one pixel per cell (the field reads only
 * brightness, through the site's palette); the field turns it into
 * diamonds.
 *
 *   01  the fir tree swaying, lit up, with sakura petals falling past it
 *   02  clouds drifting slowly left to right over a faint haze
 *   03  the picture of the project you are on, filling the right side,
 *       cross-fading when you move to another
 *   04  the night peak with birds, as components/Ending.tsx paints it
 *
 * Pictures sit on the right on a wide screen and low down on a tall one,
 * because the words take the left (the top on a phone).
 *
 * `dissolve` is the change between scenes: cells drop out in a noisy sweep
 * as `f` rises to 1, and come back as it falls.
 */

const ASSETS = "/sonda";

type Pic = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export type Media = {
  tree: HTMLVideoElement;
  cloudA: HTMLVideoElement;
  cloudB: HTMLVideoElement;
  birds: HTMLVideoElement;
  /** One per entry in profile.projects, in that order. */
  work: (HTMLImageElement | HTMLCanvasElement)[];
};

/** Which videos each scene plays; the rest stay paused. */
export function sceneVideos(m: Media, scene: number): HTMLVideoElement[] {
  if (scene === 0) return [m.tree];
  if (scene === 1) return [m.cloudA, m.cloudB];
  if (scene === 3) return [m.birds];
  return [];
}

/** Loads everything. `onReady` fires each time something new can be drawn
 *  (a reduced-motion visitor gets one frame per arrival, not a loop). */
export function loadMedia(onReady: () => void): { media: Media; dispose(): void } {
  const videos: HTMLVideoElement[] = [];
  const video = (name: string, still: number): HTMLVideoElement => {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.addEventListener("loadeddata", () => {
      // Parked a little way in, so a paused video shows a full frame.
      if (v.paused && v.currentTime === 0) v.currentTime = still;
      onReady();
    });
    v.addEventListener("seeked", onReady);
    v.src = `${ASSETS}/${name}`;
    videos.push(v);
    return v;
  };
  const work: (HTMLImageElement | HTMLCanvasElement)[] = projects.map((p, i) => {
    if (!p.image) return textPlate("40,000+ users", { width: 1200, height: 800 });
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      // A light picture (The Actually Company's site, a cream page) would
      // fill the screen with pale diamonds; it is turned over instead, so
      // its ground draws nothing and its type is what lights up.
      const turned = turnOverIfLight(im);
      if (turned) work[i] = turned;
      onReady();
    };
    im.src = p.image;
    return im;
  });
  const media: Media = {
    tree: video("hero_tree-c.mp4", 1.5),
    cloudA: video("claudes_02.mp4", 2),
    cloudB: video("claudes_03.mp4", 4),
    birds: video("birds_04.mp4", 1),
    work,
  };
  return {
    media,
    dispose: () => {
      for (const v of videos) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
    },
  };
}

const ready = (p: Pic): boolean => {
  if (p instanceof HTMLVideoElement) return p.readyState >= 2;
  if (p instanceof HTMLImageElement) return p.complete && p.naturalWidth > 0;
  return true;
};

const dims = (p: Pic): [number, number] => {
  if (p instanceof HTMLVideoElement) return [p.videoWidth || 1, p.videoHeight || 1];
  if (p instanceof HTMLImageElement) return [p.naturalWidth || 1, p.naturalHeight || 1];
  return [p.width || 1, p.height || 1];
};

/** Seeded random, so the petals and the peak are the same every visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const rand = seeded(20261003);

// Petals: mostly round the tree (the right two thirds), each falling at its
// own speed with its own sway. Two cells wide now and then, so some read as
// a petal turning rather than a speck.
const PETALS = Array.from({ length: 110 }, () => ({
  x: 0.3 + rand() * 0.75,
  y: rand(),
  fall: 0.025 + rand() * 0.045,
  drift: 0.004 + rand() * 0.01,
  sway: 0.6 + rand() * 2.4,
  f: 0.4 + rand() * 1.1,
  ph: rand() * 6.28,
  v: 0.5 + rand() * 0.5,
  wide: rand() < 0.35,
}));

// Clouds: two clips, four placements, each drifting at its own pace.
// cx, cy are where it starts (share of the frame), w its width.
const CLOUDS = [
  { b: false, cx: 0.66, cy: 0.3, w: 0.56, speed: 0.008, a: 1 },
  { b: true, cx: 0.98, cy: 0.64, w: 0.46, speed: 0.013, a: 0.92 },
  { b: false, cx: 0.4, cy: 0.82, w: 0.3, speed: 0.019, a: 0.6 },
  { b: true, cx: 1.3, cy: 0.12, w: 0.28, speed: 0.006, a: 0.5 },
];

// The night: stars, the peak's outline and the light caught on it, as in
// components/Ending.tsx (measured off lanceyan's last page).
const STARS = Array.from({ length: 120 }, () => ({ x: rand(), y: rand() * 0.8, a: 0.35 + rand() * 0.65, f: 0.4 + rand() * 1.8 }));
const PEAK = (() => {
  const keys: [number, number][] = [
    [0, 0.93], [0.08, 0.91], [0.2, 0.87], [0.3, 0.8], [0.38, 0.76], [0.43, 0.7],
    [0.48, 0.68], [0.52, 0.645], [0.55, 0.66], [0.6, 0.73], [0.63, 0.82],
    [0.67, 0.85], [0.74, 0.84], [0.8, 0.9], [0.84, 1.02], [1, 1.1],
  ];
  const n = 256;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i / (n - 1);
    let k = 0;
    while (k < keys.length - 2 && x > keys[k + 1][0]) k += 1;
    const [x0, y0] = keys[k];
    const [x1, y1] = keys[k + 1];
    out[i] = y0 + (y1 - y0) * ((x - x0) / Math.max(1e-3, x1 - x0)) + (rand() - 0.5) * 0.012;
  }
  return out;
})();
const GLINTS = Array.from({ length: 900 }, () => ({ x: rand() * 0.84, d: Math.pow(rand(), 1.8) * 0.3, a: 0.3 + rand() * 0.7 }));

export type PaintState = {
  media: Media;
  /** Seconds since the page opened; 0 for reduced motion. */
  t: number;
  reduced: boolean;
  /** Project pictures on 03: from, to, and how far between (0..1). */
  from: number;
  to: number;
  mix: number;
};

/** A copy of `im` with its brightness turned over, if it is mostly light
 *  (mean over 0.6); otherwise null. */
function turnOverIfLight(im: HTMLImageElement): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x || !c.width || !c.height) return null;
  x.drawImage(im, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
  if (sum / (255 * (d.length / 4)) <= 0.6) return null;
  for (let k = 0; k < d.length; k += 4) {
    d[k] = 255 - d[k];
    d[k + 1] = 255 - d[k + 1];
    d[k + 2] = 255 - d[k + 2];
  }
  x.putImageData(img, 0, 0);
  return c;
}

type Ctx = CanvasRenderingContext2D;

/** Draws `p` to cover the box, scaled by `zoom` about its centre. */
function cover(x: Ctx, p: Pic, bx: number, by: number, bw: number, bh: number, zoom = 1): void {
  const [sw, sh] = dims(p);
  const s = Math.max(bw / sw, bh / sh) * zoom;
  const w = sw * s;
  const h = sh * s;
  x.save();
  x.beginPath();
  x.rect(bx, by, bw, bh);
  x.clip();
  x.drawImage(p, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
  x.restore();
}

function tree(x: Ctx, W: number, H: number, s: PaintState): void {
  const tall = W / H < 1;
  const th = tall ? H * 0.6 : H * 0.84;
  const tw = th * (600 / 862);
  const cx = tall ? W * 0.6 : W * 0.72;
  const top = tall ? H * 0.3 : H * 0.03;

  // A faint halo behind the crown, so a scatter of dim plum dots sits
  // round the tree the way the aurora sits behind the hero's.
  const halo = x.createRadialGradient(cx, top + th * 0.42, 0, cx, top + th * 0.42, th * 0.7);
  halo.addColorStop(0, "rgba(70,70,70,1)");
  halo.addColorStop(0.55, "rgba(34,34,34,1)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = halo;
  x.fillRect(0, 0, W, H);

  // The clip is a dark green tree on black: drawn twice, added, so it
  // reaches the blossom end of the palette instead of staying plum.
  if (ready(s.media.tree)) {
    x.globalCompositeOperation = "lighter";
    x.drawImage(s.media.tree, cx - tw / 2, top, tw, th);
    x.drawImage(s.media.tree, cx - tw / 2, top, tw, th);
    x.globalAlpha = 0.5;
    x.drawImage(s.media.tree, cx - tw / 2, top, tw, th);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  // Petals falling past it, drifting right.
  const t = s.t;
  for (const p of PETALS) {
    const y = (((p.y + p.fall * t) % 1.1) + 1.1) % 1.1 - 0.05;
    const px = (p.x + p.drift * t) % 1.1;
    const sx = Math.floor(px * W + p.sway * Math.sin(t * p.f + p.ph));
    const sy = Math.floor(y * H);
    const flick = s.reduced ? 1 : 0.75 + 0.25 * Math.sin(t * p.f * 2.3 + p.ph);
    const v = Math.round(255 * p.v * flick);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(sx, sy, p.wide && Math.sin(t * p.f + p.ph) > 0 ? 2 : 1, 1);
  }
}

function clouds(x: Ctx, W: number, H: number, s: PaintState): void {
  const tall = W / H < 1;
  // A haze low down, so the bottom of the frame holds a few dim dots.
  const haze = x.createLinearGradient(0, H, 0, H * 0.45);
  haze.addColorStop(0, "rgba(46,46,46,1)");
  haze.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = haze;
  x.fillRect(0, 0, W, H);

  x.globalCompositeOperation = "screen";
  for (const c of CLOUDS) {
    const v = c.b ? s.media.cloudB : s.media.cloudA;
    if (!ready(v)) continue;
    const w = W * c.w * (tall ? 1.7 : 1);
    const h = w * (768 / 1256);
    // From -0.35 to 1.35 of the width and round again.
    const along = (((c.cx + c.speed * s.t + 0.35) % 1.7) + 1.7) % 1.7 - 0.35;
    const cy = tall ? 0.42 + c.cy * 0.55 : c.cy;
    x.globalAlpha = c.a;
    x.drawImage(v, along * W - w / 2, cy * H - h / 2, w, h);
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
}

function work(x: Ctx, W: number, H: number, s: PaintState): void {
  const tall = W / H < 1;
  const bx = tall ? 0 : W * 0.36;
  const by = tall ? H * 0.42 : 0;
  const bw = W - bx;
  const bh = H - by;
  const zoom = s.reduced ? 1.04 : 1.05 + 0.03 * Math.sin(s.t * 0.18);
  const pics = s.media.work;
  // Grey and a little harder, so a photo reads as shapes in the palette.
  // (Browsers without canvas filters just skip this.)
  x.filter = "grayscale(1) contrast(1.25) brightness(1.08)";
  const draw = (i: number, a: number): void => {
    const p = pics[i];
    if (!p || a <= 0 || !ready(p)) return;
    x.globalAlpha = a;
    cover(x, p, bx, by, bw, bh, zoom);
  };
  if (s.mix < 1) draw(s.from, 1 - s.mix);
  draw(s.to, s.mix);
  x.globalAlpha = 1;
  x.filter = "none";

  // The edge nearest the words fades to black, so the picture comes out
  // of the dark rather than starting at a line.
  const edge = tall ? x.createLinearGradient(0, by, 0, by + bh * 0.4) : x.createLinearGradient(bx, 0, bx + bw * 0.4, 0);
  edge.addColorStop(0, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = edge;
  x.fillRect(bx, by, bw, bh);
}

function night(x: Ctx, W: number, H: number, s: PaintState): void {
  const t = s.t;
  const breathe = s.reduced ? 0 : 0.04 * Math.sin(t * 0.25);
  const band = x.createLinearGradient(0, 0, W, H);
  band.addColorStop(0, "rgba(0,0,0,1)");
  band.addColorStop(0.42, "rgba(40,40,40,1)");
  band.addColorStop(0.75, `rgba(${Math.round(150 + 60 * breathe)},150,150,1)`);
  band.addColorStop(1, "rgba(235,235,235,1)");
  x.fillStyle = band;
  x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W * 0.98, H * 0.86, 0, W * 0.98, H * 0.86, W * (0.55 + breathe));
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

  const drift = s.reduced ? 0 : t * 0.004;
  for (const st of STARS) {
    const sx = (st.x + drift) % 1;
    const sy = (st.y - drift * 0.5 + 1) % 1;
    const tw = s.reduced ? 1 : 0.6 + 0.4 * Math.sin(t * st.f + st.x * 40);
    const v = Math.round(255 * st.a * tw);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.floor(sx * W), Math.floor(sy * H), 1, 1);
  }

  // Birds cross now and then: one pass every 22 seconds, low over the peak.
  const birds = s.media.birds;
  if (ready(birds)) {
    const cyc = s.reduced ? 0.22 : (t % 22) / 22;
    if (cyc < 0.5) {
      const bw = W * 0.12;
      x.globalCompositeOperation = "screen";
      x.drawImage(birds, -bw + (W + bw) * (cyc / 0.5), H * 0.36, bw, bw);
      x.globalCompositeOperation = "source-over";
    }
  }

  x.fillStyle = "#000";
  x.beginPath();
  x.moveTo(0, H);
  for (let i = 0; i < PEAK.length; i += 1) x.lineTo((i / (PEAK.length - 1)) * W, PEAK[i] * H);
  x.lineTo(W, H);
  x.closePath();
  x.fill();
  for (const g of GLINTS) {
    const i = Math.min(PEAK.length - 1, Math.round(g.x * (PEAK.length - 1)));
    const v = Math.round(150 * g.a * (s.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.7 + g.x * 30)));
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.floor(g.x * W), Math.floor((PEAK[i] + 0.01 + g.d) * H), 1, 1);
  }
}

const PAINTERS = [tree, clouds, work, night];

export function paintScene(scene: number, x: Ctx, W: number, H: number, s: PaintState): void {
  PAINTERS[scene]?.(x, W, H, s);
}

/** Per-cell noise for the dissolve, mostly random with a slight left to
 *  right lean, so cells go in a ragged sweep rather than all at once. */
export function dissolveNoise(W: number, H: number): Float32Array {
  const r = seeded(W * 7919 + H);
  const n = new Float32Array(W * H);
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) n[j * W + i] = 0.72 * r() + 0.28 * (i / W);
  }
  return n;
}

/** Drops cells whose noise is under `f` and dims the rest a little. */
export function dissolve(x: Ctx, W: number, H: number, f: number, noise: Float32Array): void {
  if (f <= 0 || noise.length !== W * H) return;
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const keep = 1 - f * 0.55;
  const cut = f * 1.02;
  for (let i = 0; i < W * H; i += 1) {
    const k = i * 4;
    if (noise[i] < cut) {
      d[k] = 0;
      d[k + 1] = 0;
      d[k + 2] = 0;
    } else {
      d[k] *= keep;
      d[k + 1] *= keep;
      d[k + 2] *= keep;
    }
  }
  x.putImageData(img, 0, 0);
}
