/**
 * The long picture the strip pans across, painted fresh each frame into
 * dotField's small source canvas (one pixel per diamond), only the part
 * in view.
 *
 * The picture is six screens wide. Measured in screens from its left end:
 *
 *   0 to 1   a tall tree (sondaven's hero_tree clip)
 *   1 to 2   two flowers that open when you reach them (prolog clips)
 *   2 to 4   clouds over the far hills (claudes clips, intro_mountain)
 *   4 to 5   sheep on the near ground (hero_sheeps clip)
 *   5 to 6   birds, then the night peak from the site's Ending, with stars
 *
 * Far hills move at half speed, so the picture has depth as it pans.
 * Petals drift across all of it. Every clip is a light subject on black;
 * black draws no diamonds, so each subject comes through as its own shape.
 *
 * `o` is how far the view has travelled, in screens (0 to 5).
 */

export const WORLD_SCREENS = 6;
export const TRAVEL = WORLD_SCREENS - 1;

const ASSETS = "/sonda";

const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Seeded random, so the stars and petals are the same every visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The night peak's outline from components/Ending.tsx: heights as a share
 *  of the frame, at x from 0 to 1 across its own screen. */
const PEAK_KEYS: [number, number][] = [
  [0, 0.93], [0.08, 0.91], [0.2, 0.87], [0.3, 0.8], [0.38, 0.76], [0.43, 0.7],
  [0.48, 0.68], [0.52, 0.645], [0.55, 0.66], [0.6, 0.73], [0.63, 0.82],
  [0.67, 0.85], [0.74, 0.84], [0.8, 0.9], [0.84, 1.02], [1, 1.1],
];
const PEAK_AT = 5; // the peak's screen starts here

function peakHeights(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i / (n - 1);
    let k = 0;
    while (k < PEAK_KEYS.length - 2 && x > PEAK_KEYS[k + 1][0]) k += 1;
    const [x0, y0] = PEAK_KEYS[k];
    const [x1, y1] = PEAK_KEYS[k + 1];
    out[i] = y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-3, x1 - x0) + (rand() - 0.5) * 0.012;
  }
  return out;
}

/** The far hills, as a share of the frame from the top, at far-layer x. */
const farY = (s: number): number => 0.62 + 0.05 * Math.sin(s * 4.1 + 0.6) + 0.03 * Math.sin(s * 9.7 + 2.1) + 0.012 * Math.sin(s * 23 + 0.3);
/** The near ground the tree, flowers and sheep stand on. */
const groundY = (s: number): number => 0.9 + 0.022 * Math.sin(s * 5.1) + 0.012 * Math.sin(s * 11.3 + 1);
const FAR = 0.5; // the far hills move at half the view's speed

type Clip = { v: HTMLVideoElement; from: number; to: number; once?: boolean };

export type Panorama = {
  /** Paints the view at offset `o` (screens) and time `t` (seconds). */
  paint(x: CanvasRenderingContext2D, W: number, H: number, o: number, t: number): void;
  /** Plays the clips near the view and pauses the rest. */
  sync(o: number): void;
  dispose(): void;
};

export function createPanorama(opts: { still: boolean; onFrame?: () => void }): Panorama {
  const { still } = opts;
  const clip = (name: string, loop = true): HTMLVideoElement => {
    const v = document.createElement("video");
    v.src = `${ASSETS}/${name}.mp4`;
    v.muted = true;
    v.loop = loop;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("aria-hidden", "true");
    if (still) {
      // No playback with reduced motion: hold one frame of each clip, the
      // flowers already open.
      v.addEventListener("loadedmetadata", () => {
        v.currentTime = loop ? Math.min(1, v.duration / 2) : Math.max(0, v.duration - 0.05);
      });
      if (opts.onFrame) v.addEventListener("seeked", opts.onFrame);
    }
    return v;
  };
  const tree = clip("hero_tree-c");
  const flowerL = clip("prolog-l-c", false);
  const flowerR = clip("prolog-r-c", false);
  const cloudA = clip("claudes_02");
  const cloudB = clip("claudes_03");
  const sheep = clip("hero_sheeps-c");
  const birds = clip("birds_04");
  const clips: Clip[] = [
    { v: tree, from: 0.4, to: 1.05 },
    { v: flowerL, from: 1.45, to: 2.1, once: true },
    { v: flowerR, from: 1.45, to: 2.1, once: true },
    { v: cloudA, from: 2.2, to: 4.3 },
    { v: cloudB, from: 2.9, to: 3.7 },
    { v: sheep, from: 4.35, to: 5 },
    { v: birds, from: 5.5, to: 5.9 },
  ];

  const range = new Image();
  range.src = `${ASSETS}/intro_mountain.png`;

  const rand = seeded(20261003);
  const peak = peakHeights(256, rand);
  const glints = Array.from({ length: 700 }, () => ({ x: rand() * 0.84, d: Math.pow(rand(), 1.8) * 0.3, a: 0.3 + rand() * 0.7 }));
  const stars = Array.from({ length: 150 }, () => ({ s: 4.5 + rand() * 1.5, y: rand() * 0.62, a: 0.35 + rand() * 0.65, f: 0.4 + rand() * 1.8 }));
  const petals = Array.from({ length: 34 }, () => ({ x: rand(), y: rand(), v: 0.5 + rand(), b: 140 + rand() * 80, w: rand() < 0.3 ? 2 : 1 }));

  const ready = (v: HTMLVideoElement): boolean => v.readyState >= 2;

  /** Draws a clip with its bottom edge at `base` (cells), centred on world x `s`. */
  const stand = (x: CanvasRenderingContext2D, v: HTMLVideoElement, W: number, o: number, s: number, h: number, base: number, aspect: number, foot = 1): void => {
    if (!ready(v)) return;
    const w = h * aspect;
    const cx = (s - o) * W;
    if (cx + w / 2 < 0 || cx - w / 2 > W) return;
    x.drawImage(v, cx - w / 2, base - h * foot, w, h);
  };

  return {
    paint: (x, W, H, o, t) => {
      const time = still ? 0 : t;

      // Sky: dark overhead, a faint band of light along the horizon that
      // is warmest over the clouds and goes out towards the night.
      const day = smooth(1, 2.4, o) * (1 - smooth(3.8, 4.9, o));
      const night = smooth(4.2, 5, o);
      const band = Math.round(36 + 22 * day - 10 * night);
      const sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#000");
      sky.addColorStop(0.45, `rgb(${Math.round(8 + 10 * day)},0,0)`);
      sky.addColorStop(0.7, `rgb(${band},${band},${band})`);
      sky.addColorStop(1, "#000");
      x.fillStyle = sky;
      x.fillRect(0, 0, W, H);

      // A low sun behind the flowers.
      const sunX = (1.78 - o) * W;
      if (sunX > -W && sunX < 2 * W) {
        const g = x.createRadialGradient(sunX, H * 0.74, 0, sunX, H * 0.74, W * 0.42);
        g.addColorStop(0, "rgba(150,150,150,0.75)");
        g.addColorStop(0.4, "rgba(80,80,80,0.4)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
      }

      // Stars, coming out towards the end.
      for (const st of stars) {
        const sx = (st.s - o) * W;
        if (sx < 0 || sx >= W) continue;
        const tw = still ? 1 : 0.6 + 0.4 * Math.sin(time * st.f + st.s * 40);
        const v = Math.round(255 * st.a * tw * smooth(4.5, 5.3, st.s));
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.floor(sx), Math.floor(st.y * H), 1, 1);
      }

      // The night glow from the Ending, low on the far right.
      const glowX = (5.98 - o) * W;
      if (glowX > -0.6 * W && glowX < 1.6 * W) {
        const g = x.createRadialGradient(glowX, H * 0.86, 0, glowX, H * 0.86, W * 0.55);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.35, "rgba(190,190,190,0.5)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
      }

      // The snowy range far off behind the clouds, at the far hills' speed.
      if (range.complete && range.naturalWidth) {
        const rs = 1.5; // far-layer x of its left edge
        const rx = (rs - o * FAR) * W;
        const rw = 1.15 * W;
        if (rx < W && rx + rw > 0) {
          x.globalAlpha = 0.55;
          x.drawImage(range, 0, 0, range.naturalWidth, range.naturalHeight * 0.42, rx, H * 0.3, rw, (rw * range.naturalHeight * 0.42) / range.naturalWidth);
          x.globalAlpha = 1;
        }
      }

      // Clouds, high up, drifting a little against the pan.
      const drift = still ? 0 : Math.sin(time * 0.05) * 0.03;
      if (ready(cloudA)) {
        for (const [s, y, w] of [[2.55, 0.0, 0.62], [3.95, 0.08, 0.42]] as const) {
          const cx = (s + drift - o) * W;
          const cw = w * W;
          if (cx + cw / 2 > 0 && cx - cw / 2 < W) x.drawImage(cloudA, cx - cw / 2, y * H, cw, (cw * 768) / 1256);
        }
      }
      if (ready(cloudB)) {
        const cx = (3.25 - drift - o) * W;
        const cw = 0.55 * W;
        if (cx + cw / 2 > 0 && cx - cw / 2 < W) x.drawImage(cloudB, cx - cw / 2, 0.14 * H, cw, (cw * 768) / 1256);
      }

      // Far hills: a thin lit rim, dark below, so the sky dims behind them.
      x.fillStyle = "rgba(0,0,0,0.72)";
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i <= W; i += 1) x.lineTo(i, farY(o * FAR + i / W) * H);
      x.lineTo(W, H);
      x.closePath();
      x.fill();
      x.fillStyle = "rgb(78,78,78)";
      for (let i = 0; i < W; i += 1) x.fillRect(i, Math.floor(farY(o * FAR + i / W) * H), 1, 1);

      // Near ground, black with a brighter rim, up to the peak.
      x.fillStyle = "#000";
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i <= W; i += 1) x.lineTo(i, groundY(o + i / W) * H);
      x.lineTo(W, H);
      x.closePath();
      x.fill();
      x.fillStyle = "rgb(96,96,96)";
      for (let i = 0; i < W; i += 1) {
        const s = o + i / W;
        if (s > PEAK_AT + 0.05) break;
        x.fillRect(i, Math.floor(groundY(s) * H), 1, 1);
      }

      // The tree, the flowers and the sheep, standing on the ground.
      stand(x, tree, W, o, 0.74, H * 0.96, groundY(0.74) * H + 2, 600 / 862);
      stand(x, flowerL, W, o, 1.66, H * 0.78, groundY(1.66) * H + 3, 594 / 872);
      stand(x, flowerR, W, o, 1.86, H * 0.66, groundY(1.86) * H + 3, 594 / 872);
      stand(x, sheep, W, o, 4.66, W * 0.25, groundY(4.66) * H + 1, 2, 0.8);

      // Birds crossing before the peak, rising slowly.
      if (ready(birds)) {
        const bw = 0.3 * W;
        const lift = still ? 0 : ((time * 0.02) % 1) * 0.12;
        const bx = (5.56 - o) * W;
        if (bx + bw > 0 && bx < W) {
          x.globalCompositeOperation = "screen";
          x.drawImage(birds, bx, (0.2 - lift) * H, bw, bw);
          x.globalCompositeOperation = "source-over";
        }
      }

      // The peak: black rock with a little light caught on it.
      const px0 = (PEAK_AT - o) * W;
      if (px0 < W) {
        x.fillStyle = "#000";
        x.beginPath();
        x.moveTo(px0, H);
        x.lineTo(px0, groundY(PEAK_AT) * H);
        for (let i = 0; i < peak.length; i += 1) x.lineTo(px0 + (i / (peak.length - 1)) * W, peak[i] * H);
        x.lineTo(px0 + W, H);
        x.closePath();
        x.fill();
        for (const g of glints) {
          const gx = px0 + g.x * W;
          if (gx < 0 || gx >= W) continue;
          const i = Math.min(peak.length - 1, Math.round(g.x * (peak.length - 1)));
          const v = Math.round(150 * g.a * (still ? 1 : 0.85 + 0.15 * Math.sin(time * 0.7 + g.x * 30)));
          x.fillStyle = `rgb(${v},${v},${v})`;
          x.fillRect(Math.floor(gx), Math.floor((peak[i] + 0.01 + g.d) * H), 1, 1);
        }
      }

      // Petals drifting down and left over everything, the site's sakura.
      for (const p of petals) {
        const px = (((p.x - time * 0.01 * p.v - o * 0.3) % 1) + 1) % 1;
        const py = (p.y + time * 0.018 * p.v) % 1;
        const v = Math.round(p.b);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.floor(px * W), Math.floor(py * H), p.w, 1);
      }
    },
    sync: (o) => {
      if (still) return;
      for (const c of clips) {
        const near = c.to > o - 0.15 && c.from < o + 1.15;
        if (c.once) {
          // The flowers open once you reach them, stay open, and close
          // again only when you have gone back to the tree.
          if (o < 0.3 && c.v.currentTime > 0) {
            c.v.pause();
            c.v.currentTime = 0;
          } else if (o > 0.72 && c.v.paused && !c.v.ended && near) {
            void c.v.play().catch(() => {});
          }
          continue;
        }
        if (near && c.v.paused) void c.v.play().catch(() => {});
        else if (!near && !c.v.paused) c.v.pause();
      }
    },
    dispose: () => {
      for (const c of clips) {
        c.v.pause();
        c.v.removeAttribute("src");
        c.v.load();
      }
    },
  };
}
