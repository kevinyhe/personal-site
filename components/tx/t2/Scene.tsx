"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { createKoiPair } from "@/components/luke/koi";
import { GROUND, INK } from "@/components/luke/theme";
import {
  createBarCanvas,
  hexToRgb,
  type BarCanvas,
  type BarLayerConfig,
  type CanvasSource,
} from "@/components/valley/barShader";

import Work from "./Work";

gsap.registerPlugin(ScrollTrigger);

/**
 * Transition 2: the flower becomes the koi.
 *
 * Reference: sondaven.com's prologue, where the flower is a field of
 * upright bars that open and close with the scroll, and the particle morphs
 * of Awwwards Sites of the Day like Lusion (lusion.co), where one shape's
 * points come apart, drift, and settle into the next shape.
 *
 * Here the morph is done with the bars themselves. When the reader has
 * held on the sentence, the flower's bars are read off the frame it is
 * showing (the same grid and grade the shader uses), and the shader's
 * flower is swapped for those same bars drawn one by one, so the swap
 * cannot be seen. Then they come loose, top of the flower first: each one
 * tilts and stretches into a petal, the whole drift swings round the pond
 * like petals on slow water, and each lands on one cell of the koi's own
 * bar grid. When they are all down the koi's shader takes over at the same
 * cells, and from there the koi swim on with the scroll as in Work.
 *
 * The band's ground darkens to the pond over the drift.
 *
 * One screen layer holds the petals and the koi, sticky over the whole
 * stretch (band and Work), so nothing jumps between sections.
 *
 * Scroll, in screens from the top of this stretch:
 *   0.0 - 0.5   the flower opens, the sentence writes in;
 *   0.5 - 0.75  held;
 *   0.75 - 2.5  the petals: loose, drifting, gathering; the text goes;
 *   2.5 -       the koi swim on, as the page scrolls.
 *
 * Reduced motion: the flower stays, and the koi fade in where they are.
 * Below 1024 px: no flower (as on the home page), the koi just swim.
 */

const LINE_ROWS = ["I build systems", "that bring ideas", "to life."];
const LINE = "I build systems that bring ideas to life.";

const BAND = GROUND;
/** The pond: the band's ground with most of the red taken out. */
const POND = "#0a0409";
const NARROW = 1024;

const FRAMES = 64;
const SHEET_COLS = 8;
const FRAME_W = 200;
const FRAME_H = 356;
const BLOOM_TO = 0.8;

/** The flower's layer, as on the band: box and grid. */
const FLOWER = { x: -0.025, y: 0.02, w: 0.5, h: 1, cols: 150, rows: 190, black: 200, white: 25 };
/** The koi grade (WorkIndex). */
const KOI_BLACK = 215;
const KOI_WHITE = 40;

/** Where things happen, in screens of scroll from the stretch's top. */
const OPEN_END = 0.5;
const LOOSE = 0.75;
const LANDED = 2.5;

const INTRO =
  "font-sans text-[1.75rem] font-light leading-[1.6] tracking-[0.01em] opacity-0 lg:text-[min(2.2vh,0.93vw)]";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The shader's bar width, in cells, for a 0..255 brightness. */
function barWidth(lum: number, black: number, white: number): number {
  const br = clamp01((lum - black) / (white - black));
  return Math.max(0, Math.min(1, (1 - br) * 1.04 - 0.02));
}

type Bars = { x: Float32Array; y: Float32Array; w: Float32Array; n: number };

/** The bars a shader layer would draw for `data` (w x h px) over a screen box. */
function readBars(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  box: { x: number; y: number; w: number; h: number },
  cols: number,
  rows: number,
  black: number,
  white: number,
): Bars {
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  const cw = box.w / cols;
  for (let r = 0; r < rows; r += 1) {
    const v = (r + 0.5) / rows;
    const py = Math.min(h - 1, Math.floor(v * h));
    for (let c = 0; c < cols; c += 1) {
      const u = (c + 0.5) / cols;
      const px = Math.min(w - 1, Math.floor(u * w));
      const i = (py * w + px) * 4;
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];
      if (R < 3 && G < 3 && B < 3) continue;
      const bw = barWidth((R + G + B) / 3, black, white);
      if (bw < 0.08) continue;
      xs.push(box.x + u * box.w);
      ys.push(box.y + v * box.h);
      ws.push(bw * cw);
    }
  }
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), w: Float32Array.from(ws), n: xs.length };
}

export default function Scene(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const flowerRef = useRef<HTMLCanvasElement | null>(null);
  const petalRef = useRef<HTMLCanvasElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const flowerCanvas = flowerRef.current;
    const petalCanvas = petalRef.current;
    const koiCanvas = koiRef.current;
    const text = textRef.current;
    if (!root || !flowerCanvas || !petalCanvas || !koiCanvas || !text) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.innerWidth < NARROW;
    const intro = Array.from(root.querySelectorAll<HTMLElement>("[data-intro]"));
    let gone = false;
    const cleanups: (() => void)[] = [];

    // ---- The flower (StatementSection's, without the wall) ----------------
    const frame = document.createElement("canvas");
    frame.width = FRAME_W;
    frame.height = FRAME_H;
    const fctx = frame.getContext("2d", { willReadFrequently: true });
    const flowerCfg: BarLayerConfig = {
      x: `${FLOWER.x * 100}%`, y: `${FLOWER.y * 100}%`, width: `${FLOWER.w * 100}%`, height: `${FLOWER.h * 100}%`,
      blackPoint: FLOWER.black, whitePoint: FLOWER.white, threshold: 255,
      xSquares: FLOWER.cols, ySquares: FLOWER.rows, bgOpacity: 0, fillOpacity: 0,
    };
    let want = 0;
    let flowerBar: BarCanvas | null = null;
    if (!narrow && fctx) {
      const video = document.createElement("video");
      video.src = "/sonda/prolog-r-c.mp4";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const sheet = document.createElement("canvas");
      sheet.width = SHEET_COLS * FRAME_W;
      sheet.height = Math.ceil(FRAMES / SHEET_COLS) * FRAME_H;
      const sctx = sheet.getContext("2d");
      let captured = 0;
      let stopped = false;
      let shown = -1;
      const slotTime = (i: number) => ((BLOOM_TO * i) / (FRAMES - 1)) * video.duration;
      type WithRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      const rvfc = (video as WithRvfc).requestVideoFrameCallback;
      const grab = () => {
        if (stopped || !sctx) return;
        while (captured < FRAMES && video.currentTime >= slotTime(captured)) {
          sctx.drawImage(video, (captured % SHEET_COLS) * FRAME_W, Math.floor(captured / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H);
          captured += 1;
        }
        if (captured >= FRAMES) {
          stopped = true;
          video.pause();
          return;
        }
        if (rvfc) rvfc.call(video, grab);
        else requestAnimationFrame(grab);
      };
      const ready = new Promise<void>((resolve) => {
        const go = () => {
          grab();
          void video.play().catch(() => {
            stopped = true;
            video.currentTime = BLOOM_TO * video.duration;
            video.addEventListener(
              "seeked",
              () => {
                if (!sctx) return;
                for (let i = 0; i < FRAMES; i += 1) {
                  sctx.drawImage(video, (i % SHEET_COLS) * FRAME_W, Math.floor(i / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H);
                }
                captured = FRAMES;
              },
              { once: true },
            );
          });
          resolve();
        };
        if (video.readyState >= 2) go();
        else {
          video.addEventListener("loadeddata", go, { once: true });
          video.addEventListener("error", () => resolve(), { once: true });
        }
      });
      // The stem bends in a breeze, as on the band.
      const STRIPS = 36;
      const sway = (t: number, h: number) => {
        const arm = Math.pow(1 - h, 1.6);
        const slow = 5.5 * Math.sin(t * 0.9) + 2.2 * Math.sin(t * 1.7 + 1.1);
        return arm * slow + 1.1 * Math.pow(1 - h, 4) * Math.sin(t * 6.3 + h * 9);
      };
      const source: CanvasSource = {
        canvas: frame,
        animated: true,
        ready,
        update: (timeSec) => {
          if (captured === 0) return false;
          const i = Math.min(want, captured - 1);
          if (reduced && i === shown) return false;
          shown = i;
          const sx = (i % SHEET_COLS) * FRAME_W;
          const sy = Math.floor(i / SHEET_COLS) * FRAME_H;
          fctx.fillStyle = "#000";
          fctx.fillRect(0, 0, FRAME_W, FRAME_H);
          if (reduced) {
            fctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
            return true;
          }
          const sh = FRAME_H / STRIPS;
          for (let k = 0; k < STRIPS; k += 1) {
            const y = k * sh;
            fctx.drawImage(sheet, sx, sy + y, FRAME_W, sh + 1, sway(timeSec, (k + 0.5) / STRIPS), y, FRAME_W, sh + 1);
          }
          return true;
        },
      };
      flowerBar = createBarCanvas(flowerCanvas, [{ type: "canvas", source, config: flowerCfg }], {
        colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(INK) }),
        defaults: { bgOpacity: 0 },
        fps: reduced ? 4 : 60,
      });
      cleanups.push(() => {
        stopped = true;
        flowerBar?.destroy();
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
    }

    // ---- The petals --------------------------------------------------------
    const pctx = petalCanvas.getContext("2d");
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let W = window.innerWidth;
    let H = window.innerHeight;
    const sizePetals = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      petalCanvas.width = Math.round(W * dpr);
      petalCanvas.height = Math.round(H * dpr);
    };
    sizePetals();

    // Per petal: start, end, widths, and its own random numbers.
    let N = 0;
    let sx = new Float32Array(0);
    let sy = new Float32Array(0);
    let sw = new Float32Array(0);
    let tx = new Float32Array(0);
    let ty = new Float32Array(0);
    let tw = new Float32Array(0);
    let delay = new Float32Array(0);
    let rnd = new Float32Array(0);
    let fromH = 1;
    let toH = 1;
    let target: Bars | null = null;
    let haveSource = false;

    const hash = (n: number) => {
      const t = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return t - Math.floor(t);
    };

    /** Pair the flower's bars (top first) with the koi's (head first). */
    const pairUp = (from: Bars, to: Bars) => {
      N = Math.min(14000, Math.max(from.n, to.n));
      sx = new Float32Array(N); sy = new Float32Array(N); sw = new Float32Array(N);
      tx = new Float32Array(N); ty = new Float32Array(N); tw = new Float32Array(N);
      delay = new Float32Array(N); rnd = new Float32Array(N);
      // Flower bars come in row order already (top first). Koi bars: order
      // them along the fish's run, down and to the right.
      const order = Array.from({ length: to.n }, (_, i) => i).sort(
        (a, b) => to.x[a] * 0.8 + to.y[a] - (to.x[b] * 0.8 + to.y[b]),
      );
      const top = from.n ? from.y[0] : 0;
      const bottom = from.n ? from.y[from.n - 1] : 1;
      for (let i = 0; i < N; i += 1) {
        const a = from.n ? Math.min(from.n - 1, Math.floor((i * from.n) / N)) : 0;
        const b = order.length ? order[Math.min(order.length - 1, Math.floor((i * order.length) / N))] : 0;
        sx[i] = from.n ? from.x[a] : W * 0.2; sy[i] = from.n ? from.y[a] : H * 0.5; sw[i] = from.n ? from.w[a] : 0;
        tx[i] = to.n ? to.x[b] : W * 0.3; ty[i] = to.n ? to.y[b] : H * 0.5; tw[i] = to.n ? to.w[b] : 0;
        rnd[i] = hash(i);
        // The head of the flower lets go first, the foot of the stem last.
        const down = from.n ? (sy[i] - top) / Math.max(1, bottom - top) : 0;
        delay[i] = 0.4 * clamp01(0.8 * down + 0.2 * hash(i + 91));
      }
    };

    const readFlower = () => {
      if (!fctx || !target) return;
      const data = fctx.getImageData(0, 0, FRAME_W, FRAME_H).data;
      const from = readBars(
        data, FRAME_W, FRAME_H,
        { x: FLOWER.x * W, y: FLOWER.y * H, w: FLOWER.w * W, h: FLOWER.h * H },
        FLOWER.cols, FLOWER.rows, FLOWER.black, FLOWER.white,
      );
      fromH = (FLOWER.h * H) / FLOWER.rows;
      pairUp(from, target);
      haveSource = true;
    };

    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    let lastQ = -1;
    const drawPetals = (q: number) => {
      if (!pctx) return;
      if (q === lastQ) return;
      lastQ = q;
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, petalCanvas.width, petalCanvas.height);
      if (q <= 0 || q >= 1 || !haveSource) return;
      pctx.fillStyle = INK;
      // The last few hundredths: the koi shader comes up under the bars.
      pctx.globalAlpha = 1 - clamp01((q - 0.96) / 0.04);
      // The pond's slow turn: round a point low and left of the middle.
      const cx = W * 0.36;
      const cy = H * 0.58;
      for (let i = 0; i < N; i += 1) {
        const t = clamp01((q - delay[i]) / 0.6);
        const e = ease(t);
        const lift = Math.sin(Math.PI * e); // 0 at both ends, 1 mid-drift
        const r = rnd[i];
        let x = sx[i] + (tx[i] - sx[i]) * e;
        let y = sy[i] + (ty[i] - sy[i]) * e;
        // First the petal drops a little, as onto water; then the whole
        // drift swings round the pond, the outer ones further.
        y += lift * H * (0.05 + 0.06 * r);
        const ang = lift * (0.35 + 0.35 * r);
        const dx = x - cx;
        const dy = y - cy;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        x = cx + dx * c - dy * s;
        y = cy + dx * s + dy * c;
        // Spread out flat over the surface, wider than tall.
        x += lift * ((hash(i + 7) - 0.5) * W * 0.5 + W * 0.14);
        y += lift * (hash(i + 13) - 0.5) * H * 0.3;
        // A wobble on the surface.
        x += lift * 14 * Math.sin(q * 18 + r * 40);
        y += lift * 9 * Math.cos(q * 13 + r * 31);
        const bw = Math.max(sw[i] + (tw[i] - sw[i]) * e, lift * (1.2 + 2.2 * r));
        const bh = (fromH + (toH - fromH) * e) * (1 + lift * (1.5 + 2.5 * r));
        const rot = lift * (r * 2 - 1) * 1.6 + lift * 0.4 * Math.sin(q * 9 + r * 20);
        const co = Math.cos(rot) * dpr;
        const si = Math.sin(rot) * dpr;
        pctx.setTransform(co, si, -si, co, x * dpr, y * dpr);
        pctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      }
      // Rings on the water where the petals come down, scrubbed outward.
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.strokeStyle = INK;
      pctx.lineWidth = 1.2;
      pctx.setLineDash([2, 7]);
      for (let k = 0; k < 4; k += 1) {
        const g = clamp01((q - 0.08 - k * 0.09) / 0.55);
        if (g <= 0 || g >= 1) continue;
        pctx.globalAlpha = 0.4 * Math.sin(Math.PI * g);
        pctx.beginPath();
        pctx.ellipse(cx, cy, W * 0.06 + g * W * 0.42, (W * 0.06 + g * W * 0.42) * 0.32, 0, 0, Math.PI * 2);
        pctx.stroke();
      }
      pctx.setLineDash([]);
      pctx.globalAlpha = 1;
    };

    // ---- The koi -----------------------------------------------------------
    let koiCfg: BarLayerConfig | null = null;
    let koiBar: BarCanvas | null = null;
    let setKoi: ((p: number) => void) | null = null;
    /** The koi's progress at the landing: where both fish are on screen. */
    let p0 = 0;

    // ---- The scroll --------------------------------------------------------
    const soft = gsap.parseEase("power2.out");
    const pondRgb = [hexToRgb(BAND), hexToRgb(POND)];
    let workSpan = 1;
    const apply = (scrollPx: number) => {
      const vh = window.innerHeight;
      const T = scrollPx / vh;
      // The flower opens.
      want = Math.round(clamp01(T / OPEN_END) * (FRAMES - 1));
      const q = reduced || narrow ? 0 : clamp01((T - LOOSE) / (LANDED - LOOSE));
      if (q <= 0) haveSource = false;
      else if (!haveSource) readFlower();
      flowerCfg.fillOpacity = T <= 0.002 || (q > 0 && haveSource) ? 0 : 1;
      // The introduction comes in, then the text goes as the petals do.
      const leave = clamp01((T - LOOSE) / 0.55);
      for (const el of intro) {
        const k = soft(clamp01((T - 0.1) / 0.3));
        el.style.opacity = String(k * (1 - leave));
        el.style.transform = `translateY(${(1 - k) * 28 - leave * 40}px)`;
      }
      if (!reduced) {
        text.style.opacity = String(1 - leave);
        text.style.filter = leave > 0 ? `blur(${(leave * 10).toFixed(1)}px)` : "";
      }
      // The ground goes down into the pond.
      const d = soft(clamp01((T - LOOSE) / 1.1));
      const [a, b] = pondRgb;
      root.style.backgroundColor = `rgb(${[0, 1, 2].map((k) => Math.round(255 * (a[k] + (b[k] - a[k]) * d))).join(",")})`;
      drawPetals(q);
      // The koi: hidden until the petals are down, then on with the scroll.
      if (koiCfg) {
        if (reduced || narrow) koiCfg.fillOpacity = reduced ? clamp01((T - LOOSE) / 1) : 1;
        else koiCfg.fillOpacity = clamp01((q - 0.94) / 0.04);
      }
      setKoi?.(p0 + Math.max(0, scrollPx - LANDED * vh) / workSpan);
    };

    let lastScroll = 0;
    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (st) => {
          lastScroll = st.scroll() - st.start;
          apply(lastScroll);
        },
        onRefresh: (st) => {
          const work = root.querySelector<HTMLElement>("#work");
          workSpan = Math.max(1, (work?.offsetHeight ?? 3 * window.innerHeight) - window.innerHeight);
          lastScroll = Math.max(0, st.scroll() - st.start);
          apply(lastScroll);
        },
      });
    }, root);
    cleanups.push(() => context.revert());

    // The koi picture, then the pose the petals land in.
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const pair = createKoiPair(img, W, H);
      const kc = pair.source.canvas;
      const kctx = kc.getContext("2d", { willReadFrequently: true });
      const cols = Math.round(W / (W < NARROW ? 4 : 4.8));
      const rows = Math.round((cols * H) / W);
      // Find the first progress at which both fish are whole on screen:
      // the most lit pixels, scanning from the start.
      const lit = (p: number) => {
        pair.setProgress(p);
        pair.source.update?.(0, 0);
        if (!kctx) return 0;
        const data = kctx.getImageData(0, 0, kc.width, kc.height).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 16) if (data[i] > 60) n += 1;
        return n;
      };
      let best = 0;
      for (let k = 0; k <= 40; k += 1) {
        const p = k * 0.005;
        const n = lit(p);
        if (n > best * 1.02) {
          best = n;
          p0 = p;
        }
      }
      lit(p0);
      if (kctx) {
        target = readBars(
          kctx.getImageData(0, 0, kc.width, kc.height).data, kc.width, kc.height,
          { x: 0, y: 0, w: W, h: H }, cols, rows, KOI_BLACK, KOI_WHITE,
        );
      }
      toH = H / rows;
      koiCfg = {
        x: "0%", y: "0%", width: "100%", height: "100%",
        blackPoint: KOI_BLACK, whitePoint: KOI_WHITE, threshold: 255,
        xSquares: cols, ySquares: rows, bgOpacity: 0, fillOpacity: 0,
      };
      koiBar = createBarCanvas(koiCanvas, [{ type: "canvas", source: pair.source, config: koiCfg }], {
        colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(INK) }),
        defaults: { bgOpacity: 0 },
        fps: reduced ? 12 : 60,
      });
      setKoi = (p) => pair.setProgress(p);
      haveSource = false;
      lastQ = -1;
      apply(lastScroll);
    };
    img.src = "/work/koi.png";
    cleanups.push(() => koiBar?.destroy());

    const onResize = () => {
      sizePetals();
      haveSource = false;
      lastQ = -1;
    };
    window.addEventListener("resize", onResize);
    cleanups.push(() => window.removeEventListener("resize", onResize));

    if (reduced || narrow) for (const el of intro) el.style.opacity = "1";

    return () => {
      gone = true;
      for (const f of cleanups) f();
    };
  }, []);

  // The line coming to, a letter at a time (StatementSection's).
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return undefined;
    const letters = Array.from(line.querySelectorAll<HTMLElement>("[data-letter]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(letters, { opacity: 1, filter: "blur(0px)" });
      return undefined;
    }
    const context = gsap.context(() => {
      gsap.fromTo(
        letters,
        { opacity: 0.06, filter: "blur(7px)" },
        {
          opacity: 1,
          filter: "blur(0px)",
          ease: "none",
          duration: 1,
          stagger: 0.16,
          scrollTrigger: { trigger: rootRef.current, start: "top top", end: `+=${OPEN_END * 100}%`, scrub: 0.5 },
        },
      );
    }, line);
    return () => context.revert();
  }, []);

  return (
    <div className="relative" id="t2" ref={rootRef} style={{ backgroundColor: BAND, color: INK }}>
      {/* The screen layer: petals and koi, held over the whole stretch. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
        <div className="sticky top-0 h-screen w-full">
          <canvas
            className="absolute inset-0 block h-full w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
            ref={koiRef}
          />
          <canvas className="absolute inset-0 block h-full w-full" ref={petalRef} />
        </div>
      </div>

      {/* The band: the flower and the sentence, held for a screen and a half. */}
      <section className="relative min-h-[260vh]" data-statement id="t2-band">
        <div className="sticky top-0 flex h-[100vh] items-center overflow-hidden">
          <canvas
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
            ref={flowerRef}
          />
          <div className="relative z-[2] flex h-[100vh] w-full items-center">
            <div className="mx-[6vw] will-change-[filter,opacity] lg:ml-[50vw] lg:mr-0" ref={textRef}>
              <p
                aria-label={LINE}
                className="pb-[0.1em] font-serif-display italic text-[12vw] leading-[1.02] tracking-[-0.03em] lg:whitespace-nowrap lg:text-[min(16vh,6.2vw)]"
                ref={lineRef}
              >
                {LINE_ROWS.map((row, r) => (
                  <span aria-hidden="true" className="block" key={r}>
                    {row.split(" ").map((word, index, all) => (
                      <span className="inline-block" key={index}>
                        {Array.from(word).map((glyph, at) => (
                          <span className="inline-block will-change-[filter,opacity]" data-letter key={at}>
                            {glyph}
                          </span>
                        ))}
                        {index < all.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </span>
                ))}
              </p>
              <p className={`${INTRO} mt-[5vh] max-w-[46rem] lg:w-[22vw] lg:max-w-none`} data-intro>
                My name is Kevin. I{"’"}m a computer engineering student at the University of Toronto. I design and
                build software, hardware and robots, for the love of the craft and the people who use what I make.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-[2]">
        <Work />
      </div>
    </div>
  );
}
