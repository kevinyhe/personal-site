/**
 * The flower for concept 03: sondaven's blooming clip (public/sonda/
 * prolog-r-c.mp4, a stem opening on black), decoded once into a sheet of
 * frames, so the scroll can pick any frame without seeking.
 *
 * Why a sheet and not currentTime: seeking a video many times a second
 * makes the browser answer with the nearest keyframe, and this clip has
 * few, so the flower would jump from bud to open in two or three steps.
 * StatementSection found this first; this copies its fix. The clip is
 * played once, muted and off screen, and each frame that passes is copied
 * into the sheet.
 *
 * Each frame is re-graded as it is copied, to grey. The dot field colours
 * by brightness, and in the raw clip the pale stems and leaves are brighter
 * than the red petals, so the petals would come out darker than the leaves.
 * The grade makes "how red" the main signal: petals near white (blossom in
 * the dots), leaves and stems a low grey (plum and rose).
 */

const CLIP = "/sonda/prolog-r-c.mp4";

/** The part of the clip where something happens: the last fifth of it is
 *  the same open flower (StatementSection measured this). */
const TO = 0.8;

export const FRAMES = 48;
const SHEET_COLS = 8;
const FW = 160;
const FH = 284;

export type Flower = {
  /** Frames copied so far. The scroll is clamped to these. */
  captured(): number;
  /** Paints frame `i`, bent by a breeze at time `t` (seconds, or null for
   *  still), into a cols x rows canvas, standing on its foot. */
  paint(ctx: CanvasRenderingContext2D, cols: number, rows: number, i: number, t: number | null): void;
  dispose(): void;
};

/** Petals up, leaves and stems down. Values 0..255. */
function grade(d: Uint8ClampedArray): void {
  for (let k = 0; k < d.length; k += 4) {
    const r = d[k] / 255;
    const g = d[k + 1] / 255;
    const b = d[k + 2] / 255;
    const red = Math.max(0, Math.min(1, (r - Math.max(g, b)) * 1.55));
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Petals land between rose and blossom with their shading kept; the
    // leaves and stems stay under 0.45, in the plums.
    const v = Math.max(red * (0.3 + 0.55 * r), lum * 0.44);
    const o = Math.round(255 * Math.min(1, v));
    d[k] = o;
    d[k + 1] = o;
    d[k + 2] = o;
  }
}

export function createFlower(): Flower {
  const sheet = document.createElement("canvas");
  sheet.width = SHEET_COLS * FW;
  sheet.height = Math.ceil(FRAMES / SHEET_COLS) * FH;
  const sctx = sheet.getContext("2d", { willReadFrequently: true });

  const video = document.createElement("video");
  video.src = CLIP;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  let done = 0;
  let stopped = false;

  const store = (slot: number): void => {
    if (!sctx) return;
    const x = (slot % SHEET_COLS) * FW;
    const y = Math.floor(slot / SHEET_COLS) * FH;
    sctx.drawImage(video, x, y, FW, FH);
    const img = sctx.getImageData(x, y, FW, FH);
    grade(img.data);
    sctx.putImageData(img, x, y);
  };
  const slotTime = (i: number): number => (TO * i * video.duration) / (FRAMES - 1);

  type WithRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  const rvfc = (video as WithRvfc).requestVideoFrameCallback;
  const schedule = (): void => {
    if (stopped) return;
    if (rvfc) rvfc.call(video, grab);
    else requestAnimationFrame(grab);
  };
  function grab(): void {
    if (stopped) return;
    while (done < FRAMES && video.currentTime >= slotTime(done)) {
      store(done);
      done += 1;
    }
    if (done >= FRAMES || video.ended) {
      // A short clip can end a hair before the last slot; fill the rest
      // with the last frame there is.
      while (done < FRAMES) {
        store(done);
        done += 1;
      }
      stopped = true;
      video.pause();
      return;
    }
    schedule();
  }

  const go = (): void => {
    schedule();
    void video.play().catch(() => {
      // Autoplay refused: one still of the open flower in every slot.
      stopped = true;
      video.currentTime = TO * (video.duration || 4);
      video.addEventListener(
        "seeked",
        () => {
          for (let i = 0; i < FRAMES; i += 1) store(i);
          done = FRAMES;
        },
        { once: true },
      );
    });
  };
  if (video.readyState >= 2) go();
  else video.addEventListener("loadeddata", go, { once: true });

  const STRIPS = 32;
  return {
    captured: () => done,
    paint: (ctx, cols, rows, frame, t) => {
      if (done === 0) return;
      const i = Math.max(0, Math.min(done - 1, frame));
      const sx = (i % SHEET_COLS) * FW;
      const sy = Math.floor(i / SHEET_COLS) * FH;
      // Fit the frame to the height, foot on the bottom row, centred.
      const h = rows * 0.96;
      const w = h * (FW / FH);
      const scale = Math.min(1, (cols * 0.98) / w);
      const dw = w * scale;
      const dh = h * scale;
      const x0 = (cols - dw) / 2;
      const y0 = rows - dh;
      ctx.imageSmoothingEnabled = true;
      if (t === null) {
        ctx.drawImage(sheet, sx, sy, FW, FH, x0, y0, dw, dh);
        return;
      }
      // A breeze: horizontal strips slid sideways, nothing at the foot and
      // most at the head, on two slow sines and a small flutter at the top.
      const sh = FH / STRIPS;
      const dsh = dh / STRIPS;
      for (let k = 0; k < STRIPS; k += 1) {
        const up = 1 - (k + 0.5) / STRIPS;
        const arm = Math.pow(up, 1.6);
        const sway = arm * (0.022 * Math.sin(t * 0.8) + 0.009 * Math.sin(t * 1.55 + 1.1)) + 0.004 * Math.pow(up, 4) * Math.sin(t * 5.2 + up * 9);
        ctx.drawImage(sheet, sx, sy + k * sh, FW, sh + 0.5, x0 + sway * dw * 2.2, y0 + k * dsh, dw, dsh + 0.5);
      }
    },
    dispose: () => {
      stopped = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      sheet.width = 1;
      sheet.height = 1;
    },
  };
}
