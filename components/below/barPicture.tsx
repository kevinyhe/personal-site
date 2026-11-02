"use client";

import { type CSSProperties, type JSX, useEffect, useRef } from "react";

import { BLOSSOM } from "@/components/bandColours";
import { ideaNow } from "@/components/ideas/idea";
import { type BarGrid, barGrid, paintBarGrid, repaintBarGrid } from "@/components/ideas/i01/barGrid";
import { joinTouchField, TOUCH_IDEA } from "@/components/ideas/i01/touchField";
import type { Project } from "@/components/profile";
import { NEAR } from "@/components/useNear";

/**
 * A picture drawn in the site's bars (valley/barShader's look) on a plain
 * 2D canvas: the picture is shrunk to one pixel per cell, and each cell
 * gets one vertical bar, centred, as wide as that pixel is bright. Bars run
 * the full cell height, so a lit area reads as a run of vertical lines.
 *
 * 2D, not WebGL, on purpose: a design with five of these would otherwise
 * open five WebGL contexts on a page that can spare about one.
 *
 * The canvas fills its parent box (give the parent a size). `level` (0..1)
 * scales every bar, for fading a picture in or out as bars; `invert` turns
 * a light picture over so its pale ground draws nothing ("auto" does it
 * when the mean brightness is over 0.6).
 */

export type BarSource = string | HTMLCanvasElement;

export type BarPictureProps = {
  source: BarSource;
  /** Cell width in CSS px. Cells are square. */
  cell?: number;
  ink?: string;
  /** Widest bar as a share of the cell. */
  maxWidth?: number;
  /** Brightness (0..1) that draws no bar, and that draws the widest. */
  black?: number;
  white?: number;
  /** "auto" turns a light picture over, so its pale ground draws nothing
   *  and its dark marks draw bars (the hands). "plate" is the other way
   *  about: whichever tone a picture has most of draws the bars, so any
   *  picture comes out as a solid plate with its other tone as the gaps. */
  invert?: boolean | "auto" | "plate";
  /** "cover" crops the picture to fill the box; "contain" fits it inside. */
  fit?: "cover" | "contain";
  /** 0..1, multiplies every bar's width. */
  level?: number;
  /** Hands back a setter for the level that redraws at once, outside
   *  React, for a picture whose bars thin with the scroll every frame.
   *  Levels are taken in twentieths, so a slow scroll does not redraw the
   *  picture for a change no one could see. */
  bind?: (setLevel: (level: number) => void) => void;
  className?: string;
  style?: CSSProperties;
  alt?: string;
};

const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

export default function BarPicture({
  source,
  cell = 6,
  ink = BLOSSOM,
  maxWidth = 0.78,
  black = 0.08,
  white = 0.95,
  invert = "auto",
  fit = "cover",
  level = 1,
  bind,
  className,
  style,
  alt,
}: BarPictureProps): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(level);
  const redrawRef = useRef<() => void>(() => {});
  const bindRef = useRef(bind);
  bindRef.current = bind;

  useEffect(() => {
    levelRef.current = level;
    redrawRef.current();
  }, [level]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let img: CanvasImageSource | null = null;
    let iw = 1;
    let ih = 1;
    let flip = false;
    let gone = false;
    // Idea 1 (/i/1): the bars feel the cursor and the scroll.
    const touch = ideaNow() === TOUCH_IDEA;
    let touchGrid: BarGrid | null = null;
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d", { willReadFrequently: true });

    const draw = (): void => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !sctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!img) return;
      const cols = Math.max(1, Math.floor(w / cell));
      const rows = Math.max(1, Math.floor(h / cell));
      small.width = cols;
      small.height = rows;
      // What "contain" leaves around the picture draws no bar: black, or
      // white for a picture that is turned over (else it drew solid rows).
      sctx.fillStyle = flip ? "#fff" : "#000";
      sctx.fillRect(0, 0, cols, rows);
      // Where the picture lands in the grid.
      const boxA = cols / rows;
      const picA = iw / ih;
      let dw = cols;
      let dh = rows;
      if ((fit === "cover") === picA > boxA) dw = rows * picA;
      else dh = cols / picA;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(img, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      const data = sctx.getImageData(0, 0, cols, rows).data;
      const ox = (w - cols * cell) / 2;
      const oy = (h - rows * cell) / 2;
      const lv = Math.max(0, Math.min(1, levelRef.current));
      if (touch) {
        touchGrid = barGrid(data, { cols, rows, cell, ox, oy, dpr, width: w, height: h, ink, level: lv }, { flip, black, white, maxWidth });
        paintBarGrid(ctx, canvas, touchGrid);
        return;
      }
      ctx.fillStyle = ink;
      // In device px, with every row's top and bottom on a whole pixel. At
      // 125% or 150% scaling (or a zoomed page) a 5px row is 6.25 or 7.5
      // device px, so its edges fell inside a pixel and were half drawn,
      // and where two rows met the bar did not quite cover: a faint light
      // line across every bar at every row.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let y = 0; y < rows; y += 1) {
        const top = Math.round((oy + y * cell) * dpr);
        const tall = Math.round((oy + (y + 1) * cell) * dpr) - top;
        for (let x = 0; x < cols; x += 1) {
          const k = (y * cols + x) * 4;
          let L = (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]) / 255;
          if (flip) L = 1 - L;
          const t = Math.max(0, Math.min(1, (L - black) / (white - black)));
          const bw = t * maxWidth * cell * lv;
          if (bw < 0.6) continue;
          ctx.fillRect((ox + x * cell + (cell - bw) / 2) * dpr, top, bw * dpr, tall);
        }
      }
    };
    redrawRef.current = draw;
    bindRef.current?.((l) => {
      const q = Math.round(Math.max(0, Math.min(1, l)) * 20) / 20;
      if (q === levelRef.current) return;
      levelRef.current = q;
      draw();
    });

    const meanOf = (im: CanvasImageSource): number => {
      if (!sctx) return 0;
      small.width = 24;
      small.height = 24;
      sctx.drawImage(im, 0, 0, 24, 24);
      const d = sctx.getImageData(0, 0, 24, 24).data;
      let s = 0;
      for (let k = 0; k < d.length; k += 4) s += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      return s / (255 * 576);
    };
    const use = (im: CanvasImageSource, w: number, h: number): void => {
      if (gone) return;
      img = im;
      iw = w;
      ih = h;
      flip = invert === "auto" ? meanOf(im) > 0.6 : invert === "plate" ? meanOf(im) < 0.6 : Boolean(invert);
      draw();
    };
    // A picture by URL is fetched when it comes near the screen (NEAR), not
    // when the page mounts: Contact's four were 210 KB and their first
    // draws in the first load, five screens down.
    let seen: IntersectionObserver | null = null;
    if (typeof source === "string") {
      const src = source;
      seen = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          seen?.disconnect();
          loadImage(src).then((im) => use(im, im.naturalWidth, im.naturalHeight), () => {});
        },
        { rootMargin: NEAR },
      );
      seen.observe(canvas);
    } else {
      use(source, source.width, source.height);
    }
    const sized = new ResizeObserver(() => draw());
    sized.observe(canvas);
    const leaveTouch = touch
      ? joinTouchField({
          element: canvas,
          partial: true,
          repaint: (pointer, seen) => {
            const ctx = canvas.getContext("2d");
            if (ctx && touchGrid) repaintBarGrid(ctx, canvas, touchGrid, pointer, seen);
          },
        })
      : null;
    return () => {
      gone = true;
      leaveTouch?.();
      seen?.disconnect();
      sized.disconnect();
      redrawRef.current = () => {};
    };
  }, [source, cell, ink, maxWidth, black, white, invert, fit]);

  return <canvas aria-label={alt} className={className} ref={ref} role={alt ? "img" : undefined} style={{ display: "block", width: "100%", height: "100%", ...style }} />;
}

/** Type drawn on a black canvas in white, for BarPicture: big letters, a
 *  number, a word. `font` is a CSS font shorthand without the size. */
export function textPlate(text: string, opts: { width?: number; height?: number; font?: string; grey?: string } = {}): HTMLCanvasElement {
  const width = opts.width ?? 1200;
  const height = opts.height ?? 600;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = opts.grey ?? "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const family = opts.font ?? `300 {size}px ${getComputedStyle(document.body).fontFamily}`;
  // Largest size that fits the width.
  let size = height * 0.8;
  const fontAt = (s: number) => family.replace("{size}", String(Math.round(s)));
  ctx.font = fontAt(size);
  const m = ctx.measureText(text).width;
  if (m > width * 0.94) size *= (width * 0.94) / m;
  ctx.font = fontAt(size);
  ctx.fillText(text, width / 2, height / 2);
  return c;
}

/** The picture for a project: its own image, or for one with none (Saturn)
 *  its one number set as type. */
export function projectSource(p: Project): BarSource {
  if (p.image) return p.image;
  if (typeof document === "undefined") return "";
  return textPlate("40,000+ users", { width: 1200, height: 800 });
}
