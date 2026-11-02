import type { CanvasSource } from "@/components/valley/barShader";

/**
 * The band's flower (StatementSection.tsx: sondaven's prolog-r-c.mp4, a
 * spray of poppies opening), decoded once into a sheet of frames so the
 * scroll can pick any frame of the bloom, and drawn from the sheet as a
 * canvas source for the bar shader, bending in a breeze as the band's
 * does. prolog-l-c.mp4 is the same clip mirrored, so one sheet serves
 * both sides: the left spray is drawn flipped.
 *
 * Each frame is kept as the brightest of its three channels, not its
 * luminance: the petals are a saturated red, which the shader's
 * channel-by-channel grade read as half-weight bars, so the heads of the
 * flowers came out lighter than their leaves. By the brightest channel a
 * petal is as bright as a stem, and graded upside down (poppies.GRADE)
 * the heads draw solid and the leaves a lighter texture.
 */

export type Hole = { x: number; y: number; w: number; h: number };

/** Frames kept of the bloom, and each one's size. The clip is 594 x 872;
 *  a spray a screen tall over 5px bars is about 150 x 216 cells, so 280 x
 *  411 is finer than what survives. The sheet is 2240 x 2877, 26 MB, held
 *  for the page's life. */
export const FRAMES = 56;
const COLS = 8;
export const FRAME_W = 280;
export const FRAME_H = 411;
/** Which slice of the clip the frames are taken from (the band's own
 *  measurement: after 0.8 it is the same open flower over and over). */
const BLOOM_FROM = 0;
const BLOOM_TO = 0.8;
/** The bar shader's grade for the sheet: a bright cell draws a wide bar. */
export const GRADE = { blackPoint: 230, whitePoint: 60, threshold: 255 } as const;

type Sheet = {
  canvas: HTMLCanvasElement;
  /** How many frames have been decoded so far. */
  captured: () => number;
  ready: Promise<void>;
};

let cached: Sheet | null = null;

/** Decodes the clip into the sheet once, playing it through off screen
 *  (seeking lands on keyframes; the band found that out). */
export function loadSheet(src = "/sonda/prolog-r-c.mp4"): Sheet {
  if (cached) return cached;
  const sheet = document.createElement("canvas");
  sheet.width = COLS * FRAME_W;
  sheet.height = Math.ceil(FRAMES / COLS) * FRAME_H;
  const sctx = sheet.getContext("2d");
  const tmp = document.createElement("canvas");
  tmp.width = FRAME_W;
  tmp.height = FRAME_H;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  let captured = 0;
  let stopped = false;
  const slotTime = (i: number) => (BLOOM_FROM + ((BLOOM_TO - BLOOM_FROM) * i) / (FRAMES - 1)) * video.duration;
  const put = (i: number) => {
    if (!sctx || !tctx) return;
    tctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
    const im = tctx.getImageData(0, 0, FRAME_W, FRAME_H);
    const d = im.data;
    for (let k = 0; k < d.length; k += 4) {
      const m = Math.max(d[k], d[k + 1], d[k + 2]);
      d[k] = d[k + 1] = d[k + 2] = m;
      d[k + 3] = 255;
    }
    sctx.putImageData(im, (i % COLS) * FRAME_W, Math.floor(i / COLS) * FRAME_H);
  };
  type WithRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  const rvfc = (video as WithRvfc).requestVideoFrameCallback;
  const grab = () => {
    if (stopped) return;
    while (captured < FRAMES && video.currentTime >= slotTime(captured)) {
      put(captured);
      captured += 1;
    }
    if (captured >= FRAMES) {
      stopped = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }
    if (rvfc) rvfc.call(video, grab);
    else requestAnimationFrame(grab);
  };
  const ready = new Promise<void>((resolve) => {
    const go = () => {
      grab();
      void video.play().catch(() => {
        // Autoplay refused: one still of the open flower in every slot.
        stopped = true;
        video.currentTime = BLOOM_TO * video.duration;
        video.addEventListener(
          "seeked",
          () => {
            for (let i = 0; i < FRAMES; i += 1) put(i);
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
  cached = { canvas: sheet, captured: () => captured, ready };
  return cached;
}

/** Strips the picture is bent in. */
const STRIPS = 36;
/** How soft a hole's edge is, as a share of the frame's width. */
const HOLE_SOFT = 0.025;

export type Poppy = {
  source: CanvasSource;
  /** 0 bud .. 1 open. */
  setOpen(t: number): void;
  /** Where the sentence's words stand, in frame px, read every frame. */
  setHoles(fn: () => Hole[]): void;
};

/**
 * One spray from the sheet: the scroll's frame, bent as a stem in a breeze
 * bends (the band's sway: strips slid sideways, most at the head), with
 * the words' holes cut out of it. `mirror` draws the left-hand spray.
 */
export function createPoppy(sheet: Sheet, { mirror = false, phase = 0, still = false }: { mirror?: boolean; phase?: number; still?: boolean } = {}): Poppy {
  const frame = document.createElement("canvas");
  frame.width = FRAME_W;
  frame.height = FRAME_H;
  const ctx = frame.getContext("2d");
  let open = 0;
  let shown = -1;
  let holes: (() => Hole[]) | null = null;

  const sway = (t: number, h: number) => {
    // h: 0 at the head, 1 at the foot. The lever arm is (1 - h)^1.6.
    const arm = Math.pow(1 - h, 1.6);
    const slow = 5.5 * Math.sin(t * 0.9 + phase) + 2.2 * Math.sin(t * 1.7 + 1.1 + phase);
    const flutter = 1.1 * Math.pow(1 - h, 4) * Math.sin(t * 6.3 + h * 9 + phase);
    return (arm * slow + flutter) * (FRAME_W / 200);
  };

  const source: CanvasSource = {
    canvas: frame,
    animated: true,
    ready: sheet.ready,
    update: (timeSec) => {
      const captured = sheet.captured();
      if (!ctx || captured === 0) return false;
      // Never ahead of what has been decoded.
      const i = Math.min(Math.round(open * (FRAMES - 1)), captured - 1);
      if (still && i === shown) return false;
      shown = i;
      const sx = (i % COLS) * FRAME_W;
      const sy = Math.floor(i / COLS) * FRAME_H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
      if (mirror) ctx.setTransform(-1, 0, 0, 1, FRAME_W, 0);
      if (still) {
        ctx.drawImage(sheet.canvas, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      } else {
        const stripH = FRAME_H / STRIPS;
        for (let k = 0; k < STRIPS; k += 1) {
          const y = k * stripH;
          const h = (k + 0.5) / STRIPS;
          ctx.drawImage(sheet.canvas, sx, sy + y, FRAME_W, stripH + 1, sway(timeSec, h), y, FRAME_W, stripH + 1);
        }
      }
      // Where a word stands the spray goes dark under it, softly, so the
      // bars stop short of the letters.
      const list = holes?.() ?? [];
      if (list.length) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000";
        ctx.filter = `blur(${(HOLE_SOFT * FRAME_W).toFixed(1)}px)`;
        for (const r of list) if (r.w > 0 && r.h > 0) ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.filter = "none";
      }
      return true;
    },
    dispose: () => {
      frame.width = 1;
      frame.height = 1;
    },
  };
  return {
    source,
    setOpen: (t) => {
      open = Math.max(0, Math.min(1, t));
    },
    setHoles: (fn) => {
      holes = fn;
    },
  };
}
