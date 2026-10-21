/**
 * The band's flower clip (public/sonda/prolog-r-c.mp4, a flower growing
 * and opening on black), kept as a sheet of still frames so any moment of
 * it can be drawn at once.
 *
 * Why a sheet and not seeking: setting currentTime fast makes the browser
 * answer with the nearest keyframe, and this clip has only a few, so the
 * flower jumps between two or three pictures (components/StatementSection
 * found this). So the clip plays once, off screen, and every frame that
 * reaches a slot is copied into the sheet. If autoplay is refused, the
 * slots are filled by seeking one at a time and waiting for each, which
 * does give the right frames.
 *
 * Each frame is turned to grey on the way in, for the diamond field: the
 * red petals go near white, the grey-green leaves to the middle, black
 * stays black. The field then colours it with the site's palette.
 */

const SRC = "/sonda/prolog-r-c.mp4";
const FRAMES = 40;
const SHEET_COLS = 8;
/** The clip is 594 x 872; frames are kept at 200 x 294. */
export const FW = 200;
export const FH = 294;
/** The part of the clip the slots cover, as shares of its length. */
const SPAN0 = 0.06;
const SPAN1 = 0.985;

export type Clip = {
  /** How many slots hold a frame so far, from the first. */
  captured(): number;
  /** The slot nearest a moment of the clip (0..1 of its length). */
  slot(at: number): number;
  last: number;
  /** Draws slot `i` into the box. `bend(h)` slides the strip at height
   *  h (0 top, 1 foot) sideways, in frame pixels, for a stem in wind. */
  draw(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, w: number, h: number, bend?: (h: number) => number): void;
  dispose(): void;
};

export function createClip(onFrame: () => void): Clip {
  const sheet = document.createElement("canvas");
  sheet.width = SHEET_COLS * FW;
  sheet.height = Math.ceil(FRAMES / SHEET_COLS) * FH;
  const sheetCtx = sheet.getContext("2d");
  const scratch = document.createElement("canvas");
  scratch.width = FW;
  scratch.height = FH;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = SRC;

  let captured = 0;
  let stopped = false;

  const slotTime = (i: number): number => (SPAN0 + ((SPAN1 - SPAN0) * i) / (FRAMES - 1)) * (video.duration || 5);

  /** Copies the frame on screen into slot i, graded to grey. */
  const store = (i: number): void => {
    if (!sheetCtx || !sctx) return;
    sctx.drawImage(video, 0, 0, FW, FH);
    const im = sctx.getImageData(0, 0, FW, FH);
    const d = im.data;
    for (let k = 0; k < d.length; k += 4) {
      const r = d[k] / 255;
      const g = d[k + 1] / 255;
      const b = d[k + 2] / 255;
      // Red petals bright, leaves middling, black nothing.
      const v = Math.min(0.9, 0.55 * r + 0.25 * g + 0.1 * b + 0.6 * Math.max(0, r - g));
      const c = Math.round(v * 255);
      d[k] = c;
      d[k + 1] = c;
      d[k + 2] = c;
    }
    sheetCtx.putImageData(im, (i % SHEET_COLS) * FW, Math.floor(i / SHEET_COLS) * FH);
  };

  /** Fills every slot left with whatever frame is up, at the end. */
  const finish = (): void => {
    if (stopped) return;
    stopped = true;
    if (captured > 0 && captured < FRAMES && sheetCtx) {
      const li = captured - 1;
      for (let i = captured; i < FRAMES; i += 1) {
        sheetCtx.drawImage(sheet, (li % SHEET_COLS) * FW, Math.floor(li / SHEET_COLS) * FH, FW, FH, (i % SHEET_COLS) * FW, Math.floor(i / SHEET_COLS) * FH, FW, FH);
      }
      captured = FRAMES;
      onFrame();
    }
    video.pause();
  };

  type WithRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  const rvfc = (video as WithRvfc).requestVideoFrameCallback;
  const grab = (): void => {
    if (stopped) return;
    let got = false;
    while (captured < FRAMES && video.currentTime >= slotTime(captured)) {
      store(captured);
      captured += 1;
      got = true;
    }
    if (got) onFrame();
    if (captured >= FRAMES) {
      finish();
      return;
    }
    if (rvfc) rvfc.call(video, grab);
    else requestAnimationFrame(grab);
  };

  /** Autoplay refused: one seek per slot, each awaited. */
  const seekAll = async (): Promise<void> => {
    for (let i = captured; i < FRAMES && !stopped; i += 1) {
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.currentTime = slotTime(i);
      });
      if (stopped) return;
      store(i);
      captured = i + 1;
      onFrame();
    }
    stopped = true;
  };

  const start = (): void => {
    if (rvfc) rvfc.call(video, grab);
    else requestAnimationFrame(grab);
    video.play().catch(() => {
      void seekAll();
    });
  };
  if (video.readyState >= 2) start();
  else video.addEventListener("loadeddata", start, { once: true });
  video.addEventListener("ended", finish, { once: true });

  return {
    captured: () => captured,
    slot: (at) => Math.max(0, Math.min(FRAMES - 1, Math.round(((at - SPAN0) / (SPAN1 - SPAN0)) * (FRAMES - 1)))),
    last: FRAMES - 1,
    draw: (ctx, i, x, y, w, h, bend) => {
      if (captured === 0) return;
      const k = Math.max(0, Math.min(i, captured - 1));
      const sx = (k % SHEET_COLS) * FW;
      const sy = Math.floor(k / SHEET_COLS) * FH;
      if (!bend) {
        ctx.drawImage(sheet, sx, sy, FW, FH, x, y, w, h);
        return;
      }
      const strips = 28;
      const sh = FH / strips;
      const dh = h / strips;
      const scale = w / FW;
      for (let s = 0; s < strips; s += 1) {
        const dx = bend((s + 0.5) / strips) * scale;
        ctx.drawImage(sheet, sx, sy + s * sh, FW, sh, x + dx, y + s * dh, w, dh + 0.5);
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
