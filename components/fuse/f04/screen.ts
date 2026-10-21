/**
 * The television's picture for concept F04: one dotField canvas behind the
 * glass, repainted 30 times a second.
 *
 * Each frame a channel's scene is painted on a small canvas, one pixel per
 * dot cell. That canvas is then read back and copied into dotField's own
 * source canvas through three changes:
 *
 *   1. Barrel warp. Every output pixel takes its colour from a point a
 *      little further out from the middle (u * (1 + 0.07 * r^2)), the way
 *      CRT shaders do it. Straight lines bow out and the corners go dark.
 *   2. Vignette and the picture knob. Brightness falls off towards the
 *      edges, and the whole picture is scaled by the knob's level.
 *   3. Static. While the channel changes, random noise is mixed in. Every
 *      noise value sits at or above the dot threshold, so every cell draws
 *      a dot: the field at threshold 0, in the site's palette.
 *
 * The four scenes, one per channel:
 *   01  the poppy from the prologue (sondaven's prolog-r-c.mp4) opening on
 *       the right, with petals falling across the glass;
 *   02  sondaven's two clouds drifting over a faint horizon;
 *   03  the project you are pointing at (public/work/*.jpg), crossfading;
 *   04  the night peak from components/Ending, with the birds crossing.
 *
 * The text sits on the left of the glass (on top, when the glass is taller
 * than wide), so each scene keeps its subject to the other side and that
 * side is shaded.
 */

import { createDotField, type DotField } from "@/components/dotField";
import { projectSource } from "@/components/below/barPicture";
import type { Project } from "@/components/profile";

const ASSETS = "/sonda";
const FPS = 30;

/** Channel change timing, in ms from the click. Shared with index.tsx. */
export const SWAP_AT = 160;
export const STATIC_FULL_UNTIL = 250;
export const SWITCH_MS = 350;

/** Under this brightness (0..1) dotField draws nothing. */
const THRESHOLD = 0.1;

export type Screen = {
  /** Starts a channel change: static, and the new scene from SWAP_AT on. */
  switchTo(channel: number): void;
  /** Changes channel with no static (reduced motion). */
  setChannel(channel: number): void;
  /** The project shown on channel 03. */
  setProject(p: Project): void;
  /** The picture knob, as a brightness multiplier. */
  setLevel(level: number): void;
  /** Starts loading these projects' pictures. */
  preload(ps: Project[]): void;
  dispose(): void;
};

type Rect = { x: number; y: number; w: number; h: number };
type Picture = HTMLImageElement | HTMLCanvasElement;

/** Seeded random, so the stars and petals are the same every visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The peak's outline from components/Ending: heights (share of the
 *  frame from the top) at evenly spaced x. */
function ridge(n: number, rand: () => number): Float32Array {
  const keys: [number, number][] = [
    [0, 0.93], [0.08, 0.91], [0.2, 0.87], [0.3, 0.8], [0.38, 0.76], [0.43, 0.7],
    [0.48, 0.68], [0.52, 0.645], [0.55, 0.66], [0.6, 0.73], [0.63, 0.82],
    [0.67, 0.85], [0.74, 0.84], [0.8, 0.9], [0.84, 1.02], [1, 1.1],
  ];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i / (n - 1);
    let k = 0;
    while (k < keys.length - 2 && x > keys[k + 1][0]) k += 1;
    const [x0, y0] = keys[k];
    const [x1, y1] = keys[k + 1];
    const t = (x - x0) / Math.max(1e-3, x1 - x0);
    out[i] = y0 + (y1 - y0) * t + (rand() - 0.5) * 0.012;
  }
  return out;
}

const pictureSize = (p: Picture): [number, number] =>
  p instanceof HTMLImageElement ? [p.naturalWidth, p.naturalHeight] : [p.width, p.height];

/** Draws a picture to fill a rectangle, cropping what spills over. */
function cover(x: CanvasRenderingContext2D, p: Picture, r: Rect, zoom: number): void {
  const [iw, ih] = pictureSize(p);
  if (!iw || !ih) return;
  const s = Math.max(r.w / iw, r.h / ih) * zoom;
  const w = iw * s;
  const h = ih * s;
  x.save();
  x.beginPath();
  x.rect(r.x, r.y, r.w, r.h);
  x.clip();
  x.drawImage(p, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  x.restore();
}

export function createScreen(canvas: HTMLCanvasElement, opts: { reduced: boolean; channel: number }): Screen | null {
  const { reduced } = opts;
  // A dot cell about 4.4 px across on a desktop glass, 3.2 on a phone's.
  const width = Math.max(1, canvas.clientWidth);
  const cell = width < 520 ? 3.2 : 4.4;
  const cols = Math.max(90, Math.min(220, Math.round(width / cell)));

  let field: DotField | null = null;
  try {
    field = createDotField(canvas, {
      cols,
      threshold: THRESHOLD,
      brightness: 1,
      size: 0.85,
      hue: 0.12,
      ground: "#0b0308",
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

  // The scene is painted here first, then copied into dotField's canvas.
  const work = document.createElement("canvas");
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) {
    dots.dispose();
    return null;
  }

  let channel = opts.channel;
  let pending = -1;
  let switchStart = -1e9;
  let level = 1;
  let dirty = true;

  // ---- sources ------------------------------------------------------------

  const videos: HTMLVideoElement[] = [];
  const video = (name: string, loop: boolean): HTMLVideoElement => {
    const v = document.createElement("video");
    v.src = `${ASSETS}/${name}`;
    v.muted = true;
    v.loop = loop;
    v.playsInline = true;
    v.preload = "auto";
    v.addEventListener("loadeddata", () => {
      dirty = true;
    });
    v.addEventListener("seeked", () => {
      dirty = true;
    });
    videos.push(v);
    return v;
  };
  const flower = video("prolog-r-c.mp4", false);
  const cloudNear = video("claudes_02.mp4", true);
  const cloudFar = video("claudes_03.mp4", true);
  const birds = video("birds_04.mp4", true);
  const byChannel: HTMLVideoElement[][] = [[flower], [cloudNear, cloudFar], [], [birds]];

  /** With reduced motion each video is shown as one still frame. */
  const stillAt = new Map<HTMLVideoElement, number>([
    [flower, 4.9],
    [cloudNear, 3],
    [cloudFar, 6],
    [birds, 1.5],
  ]);

  const seekStill = (v: HTMLVideoElement): void => {
    const at = stillAt.get(v) ?? 0;
    const go = (): void => {
      v.currentTime = Math.min(at, Math.max(0, (v.duration || at) - 0.05));
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
  };

  const enter = (ch: number): void => {
    byChannel.forEach((vs, i) => {
      for (const v of vs) {
        if (i !== ch) {
          v.pause();
          continue;
        }
        if (reduced) {
          seekStill(v);
          continue;
        }
        // The poppy opens again each time you tune in.
        if (v === flower) v.currentTime = 0;
        void v.play().catch(() => {});
      }
    });
    dirty = true;
  };

  const pictures = new Map<string, Picture | null>();
  let project: Project | null = null;
  let previous: Project | null = null;
  let projectAt = -1e9;
  const pictureFor = (p: Project | null): Picture | null => {
    if (!p) return null;
    if (pictures.has(p.title)) return pictures.get(p.title) ?? null;
    pictures.set(p.title, null);
    const src = projectSource(p);
    if (typeof src !== "string") {
      pictures.set(p.title, src);
      return src;
    }
    if (!src) return null;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      pictures.set(p.title, im);
      dirty = true;
    };
    im.src = src;
    return null;
  };

  // ---- scenery ------------------------------------------------------------

  const rand = seeded(20261003);
  const stars = Array.from({ length: 110 }, () => ({ x: rand(), y: rand() * 0.8, a: 0.35 + rand() * 0.65, f: 0.4 + rand() * 1.8 }));
  const petals = Array.from({ length: 46 }, () => ({ x: rand(), y: rand(), v: 0.02 + rand() * 0.035, f: 0.6 + rand() * 1.4, p: rand() * 6.28, a: 0.45 + rand() * 0.55, big: rand() < 0.3 }));
  const peak = ridge(256, rand);
  const glints = Array.from({ length: 700 }, () => ({ x: rand() * 0.84, d: Math.pow(rand(), 1.8) * 0.3, a: 0.3 + rand() * 0.7 }));

  /** Where a scene's subject goes: away from the words. */
  const subject = (W: number, H: number): { land: boolean; s: Rect } => {
    const land = W / H > 1.05;
    return { land, s: land ? { x: W * 0.42, y: 0, w: W * 0.58, h: H } : { x: 0, y: H * 0.44, w: W, h: H * 0.56 } };
  };

  const paintBloom = (x: CanvasRenderingContext2D, W: number, H: number, t: number): void => {
    const { s } = subject(W, H);
    const cx = s.x + s.w * 0.56;
    const halo = x.createRadialGradient(cx, s.y + s.h * 0.55, 0, cx, s.y + s.h * 0.55, Math.max(s.w, s.h) * 0.6);
    halo.addColorStop(0, "rgba(255,255,255,0.22)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = halo;
    x.fillRect(0, 0, W, H);
    if (flower.readyState >= 2) {
      let h = s.h * 0.94;
      let w = h * (594 / 872);
      if (w > s.w * 0.9) {
        w = s.w * 0.9;
        h = w * (872 / 594);
      }
      x.drawImage(flower, cx - w / 2, s.y + s.h - h, w, h);
    }
    // Petals drift down and to the left across the whole glass.
    for (const p of petals) {
      const yy = ((p.y + t * p.v) % 1.08) - 0.04;
      const xx = (((p.x - t * p.v * 0.45 + 0.025 * Math.sin(t * p.f + p.p)) % 1) + 1) % 1;
      x.fillStyle = `rgba(255,${p.big ? 205 : 185},${p.big ? 228 : 215},${p.a})`;
      x.fillRect(Math.floor(xx * W), Math.floor(yy * H), p.big ? 2 : 1, 1);
    }
  };

  const paintClouds = (x: CanvasRenderingContext2D, W: number, H: number, t: number): void => {
    const { land, s } = subject(W, H);
    for (const st of stars) {
      if (st.y > 0.6) continue;
      const tw = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * st.f + st.x * 40);
      const v = Math.round(200 * st.a * tw);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(Math.floor(st.x * W), Math.floor(st.y * H), 1, 1);
    }
    const horizon = x.createLinearGradient(0, H * 0.62, 0, H);
    horizon.addColorStop(0, "rgba(255,255,255,0)");
    horizon.addColorStop(1, "rgba(255,255,255,0.28)");
    x.fillStyle = horizon;
    x.fillRect(0, H * 0.62, W, H * 0.38);
    x.globalCompositeOperation = "screen";
    if (cloudFar.readyState >= 2) {
      const w = (land ? W * 0.5 : W * 0.85) * 1;
      const h = w * (768 / 1256);
      const dx = Math.sin(t * 0.045 + 1.3) * W * 0.05;
      x.globalAlpha = 0.75;
      x.drawImage(cloudFar, s.x + s.w * 0.62 - w / 2 + dx, s.y + s.h * 0.16 - h / 2, w, h);
    }
    if (cloudNear.readyState >= 2) {
      const w = land ? W * 0.78 : W * 1.25;
      const h = w * (768 / 1256);
      const dx = Math.sin(t * 0.06) * W * 0.06;
      x.globalAlpha = 1;
      x.drawImage(cloudNear, s.x + s.w * 0.5 - w / 2 + dx, s.y + s.h * 0.55 - h / 2, w, h);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  };

  const paintWork = (x: CanvasRenderingContext2D, W: number, H: number, t: number, now: number): void => {
    const { land, s } = subject(W, H);
    const fade = reduced ? 1 : Math.min(1, (now - projectAt) / 320);
    const zoom = 1.04 + (reduced ? 0 : 0.025 * Math.sin(t * 0.22));
    const r: Rect = land ? { x: s.x + s.w * 0.04, y: H * 0.1, w: s.w * 0.92, h: H * 0.8 } : { x: W * 0.06, y: s.y + s.h * 0.06, w: W * 0.88, h: s.h * 0.86 };
    const prev = pictureFor(previous);
    const cur = pictureFor(project);
    if (prev && fade < 1) {
      x.globalAlpha = 1 - fade;
      cover(x, prev, r, zoom);
    }
    if (cur) {
      x.globalAlpha = fade;
      cover(x, cur, r, zoom);
    }
    x.globalAlpha = 1;
    // Feather the edge that faces the words.
    const g = land ? x.createLinearGradient(r.x, 0, r.x + r.w * 0.3, 0) : x.createLinearGradient(0, r.y, 0, r.y + r.h * 0.3);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(r.x, r.y, r.w, r.h);
  };

  const paintNight = (x: CanvasRenderingContext2D, W: number, H: number, t: number): void => {
    const breathe = reduced ? 0 : 0.04 * Math.sin(t * 0.25);
    const band = x.createLinearGradient(0, 0, W, H);
    band.addColorStop(0, "rgba(0,0,0,1)");
    band.addColorStop(0.42, "rgba(36,36,36,1)");
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
    const drift = reduced ? 0 : t * 0.004;
    for (const st of stars) {
      const sx = (st.x + drift) % 1;
      const sy = (st.y - drift * 0.5 + 1) % 1;
      const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * st.f + st.x * 40);
      const v = Math.round(255 * st.a * tw);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(Math.floor(sx * W), Math.floor(sy * H), 1, 1);
    }
    // Birds cross once every 18 seconds, low over the peak.
    if (birds.readyState >= 2) {
      const cyc = reduced ? 0.3 : (t % 18) / 18;
      if (cyc < 0.55) {
        const bw = W * 0.16;
        x.globalCompositeOperation = "screen";
        x.drawImage(birds, -bw + (W + bw) * (cyc / 0.55), H * 0.34, bw, bw);
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
      const v = Math.round(150 * g.a * (reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.7 + g.x * 30)));
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(Math.floor(g.x * W), Math.floor((peak[i] + 0.01 + g.d) * H), 1, 1);
    }
  };

  /** Darkens the side the words are on. */
  const shade = (x: CanvasRenderingContext2D, W: number, H: number): void => {
    const { land } = subject(W, H);
    const g = land ? x.createLinearGradient(0, 0, W * 0.64, 0) : x.createLinearGradient(0, 0, 0, H * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0.86)");
    g.addColorStop(0.6, "rgba(0,0,0,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  };

  // ---- the copy into dotField: warp, vignette, level, static --------------

  let mapW = 0;
  let mapH = 0;
  let map = new Int32Array(0);
  let vig = new Float32Array(0);
  let out: ImageData | null = null;
  const buildMap = (W: number, H: number): void => {
    mapW = W;
    mapH = H;
    map = new Int32Array(W * H);
    vig = new Float32Array(W * H);
    const k = 0.07;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const u = ((x + 0.5) / W) * 2 - 1;
        const v = ((y + 0.5) / H) * 2 - 1;
        const r2 = u * u + v * v;
        const su = u * (1 + k * r2);
        const sv = v * (1 + k * r2);
        const i = y * W + x;
        if (Math.abs(su) >= 1 || Math.abs(sv) >= 1) {
          map[i] = -1;
          vig[i] = 0;
          continue;
        }
        const sx = Math.min(W - 1, Math.floor(((su + 1) / 2) * W));
        const sy = Math.min(H - 1, Math.floor(((sv + 1) / 2) * H));
        map[i] = sy * W + sx;
        const edge = Math.min(1 - Math.abs(su), 1 - Math.abs(sv));
        const e = Math.min(1, edge / 0.05);
        vig[i] = Math.max(0, 1 - 0.3 * Math.pow(r2 / 2, 1.2)) * e * e * (3 - 2 * e);
      }
    }
  };

  /** How much static is mixed in, 0..1, at time `now`. */
  const staticAmount = (now: number): number => {
    const d = now - switchStart;
    if (d < SWAP_AT || d > SWITCH_MS) return 0;
    if (d < STATIC_FULL_UNTIL) return 1;
    return 1 - (d - STATIC_FULL_UNTIL) / (SWITCH_MS - STATIC_FULL_UNTIL);
  };

  let seed = 1;
  const noise = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const frame = (now: number, t: number) => (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (pending >= 0 && now - switchStart >= SWAP_AT) {
      channel = pending;
      pending = -1;
      enter(channel);
    }
    if (work.width !== W || work.height !== H) {
      work.width = W;
      work.height = H;
    }
    if (mapW !== W || mapH !== H) buildMap(W, H);
    if (!out || out.width !== W || out.height !== H) out = ctx.createImageData(W, H);

    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.globalCompositeOperation = "source-over";
    wctx.globalAlpha = 1;
    wctx.fillStyle = "#000";
    wctx.fillRect(0, 0, W, H);
    if (channel === 0) paintBloom(wctx, W, H, t);
    else if (channel === 1) paintClouds(wctx, W, H, t);
    else if (channel === 2) paintWork(wctx, W, H, t, now);
    else paintNight(wctx, W, H, t);
    shade(wctx, W, H);

    const src = wctx.getImageData(0, 0, W, H).data;
    const dst = out.data;
    const a = staticAmount(now);
    const floor = THRESHOLD * 255 + 2;
    for (let y = 0; y < H; y += 1) {
      // Rows of static run brighter and darker together, as on a set.
      const rowGain = a > 0 ? 0.55 + 0.45 * Math.sin(y * 0.9 + now * 0.05) * Math.sin(y * 0.13 - now * 0.011) : 0;
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        const o = i * 4;
        const m = map[i];
        let r = 0;
        let g = 0;
        let b = 0;
        if (m >= 0) {
          const f = vig[i] * level;
          const s = m * 4;
          r = src[s] * f;
          g = src[s + 1] * f;
          b = src[s + 2] * f;
        }
        if (a > 0) {
          // Never under the threshold: every cell lights.
          const n = floor + Math.pow(noise(), 1.7) * (255 - floor) * (0.6 + 0.4 * rowGain);
          r = r * (1 - a) + n * a;
          g = g * (1 - a) + n * a;
          b = b * (1 - a) + n * a;
        }
        dst[o] = r > 255 ? 255 : r;
        dst[o + 1] = g > 255 ? 255 : g;
        dst[o + 2] = b > 255 ? 255 : b;
        dst[o + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  };

  // ---- the loop -----------------------------------------------------------

  let raf = 0;
  let last = -1;
  const start = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const busy = now - switchStart <= SWITCH_MS + 40;
    if (reduced && !dirty && !busy) return;
    const f = Math.floor((now - start) / (1000 / FPS));
    if (f === last && !dirty) return;
    last = f;
    dirty = false;
    dots.render(frame(now, reduced ? 0 : (now - start) / 1000));
  };
  raf = requestAnimationFrame(tick);

  const sized = new ResizeObserver(() => {
    dots.resize();
    dirty = true;
  });
  sized.observe(canvas);
  enter(channel);

  return {
    switchTo(ch) {
      pending = ch;
      switchStart = performance.now();
      dirty = true;
    },
    setChannel(ch) {
      pending = -1;
      channel = ch;
      enter(ch);
    },
    setProject(p) {
      if (project && p.title === project.title) return;
      previous = project;
      project = p;
      projectAt = performance.now();
      pictureFor(p);
      dirty = true;
    },
    setLevel(l) {
      level = l;
      dirty = true;
    },
    preload(ps) {
      for (const p of ps) pictureFor(p);
    },
    dispose() {
      cancelAnimationFrame(raf);
      sized.disconnect();
      for (const v of videos) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      dots.dispose();
      work.width = 1;
      work.height = 1;
    },
  };
}
