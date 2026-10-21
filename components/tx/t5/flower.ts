import {
  createBarCanvas,
  hexToRgb,
  type BarCanvas,
  type BarLayerConfig,
  type CanvasSource,
} from "@/components/valley/barShader";

/**
 * The band's flower (StatementSection's), lifted out so the slat scene can
 * drive it: sondaven's prolog-r-c.mp4 decoded once into a sheet of frames,
 * the scroll picking the frame, the picture bent in strips like a stem in a
 * breeze, all through the bar shader.
 */

const FRAMES = 64;
const SHEET_COLS = 8;
const FRAME_W = 200;
const FRAME_H = 356;
const BLOOM_FROM = 0.0;
const BLOOM_TO = 0.8;
const STRIPS = 36;

export type Flower = {
  /** 0 is the bud, 1 fully open. */
  setOpen(v: number): void;
  setVisible(on: boolean): void;
  destroy(): void;
};

export function startFlower(canvas: HTMLCanvasElement, band: string, ink: string, reduced: boolean): Flower {
  const video = document.createElement("video");
  video.src = "/sonda/prolog-r-c.mp4";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const sheet = document.createElement("canvas");
  sheet.width = SHEET_COLS * FRAME_W;
  sheet.height = Math.ceil(FRAMES / SHEET_COLS) * FRAME_H;
  const sheetCtx = sheet.getContext("2d");
  const frame = document.createElement("canvas");
  frame.width = FRAME_W;
  frame.height = FRAME_H;
  const ctx = frame.getContext("2d");

  let captured = 0;
  let want = 0;
  let shown = -1;
  let stopped = false;

  const slotTime = (i: number) => (BLOOM_FROM + ((BLOOM_TO - BLOOM_FROM) * i) / (FRAMES - 1)) * video.duration;
  const put = (i: number) => {
    sheetCtx?.drawImage(video, (i % SHEET_COLS) * FRAME_W, Math.floor(i / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H);
  };
  type WithRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  const rvfc = (video as WithRvfc).requestVideoFrameCallback;
  const grab = () => {
    if (stopped || !sheetCtx) return;
    while (captured < FRAMES && video.currentTime >= slotTime(captured)) {
      put(captured);
      captured += 1;
    }
    if (captured >= FRAMES) {
      stopped = true;
      video.pause();
      return;
    }
    schedule();
  };
  const schedule = () => {
    if (stopped) return;
    if (rvfc) rvfc.call(video, grab);
    else requestAnimationFrame(grab);
  };
  const ready = new Promise<void>((resolve) => {
    const go = () => {
      schedule();
      void video.play().catch(() => {
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

  const sway = (t: number, h: number) => {
    const arm = Math.pow(1 - h, 1.6);
    const slow = 5.5 * Math.sin(t * 0.9) + 2.2 * Math.sin(t * 1.7 + 1.1);
    const flutter = 1.1 * Math.pow(1 - h, 4) * Math.sin(t * 6.3 + h * 9);
    return arm * slow + flutter;
  };
  const source: CanvasSource = {
    canvas: frame,
    animated: true,
    ready,
    update: (timeSec) => {
      if (!ctx || captured === 0) return false;
      const i = Math.min(want, captured - 1);
      if (reduced && i === shown) return false;
      shown = i;
      const sx = (i % SHEET_COLS) * FRAME_W;
      const sy = Math.floor(i / SHEET_COLS) * FRAME_H;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
      if (reduced) {
        ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
        return true;
      }
      const stripH = FRAME_H / STRIPS;
      for (let k = 0; k < STRIPS; k += 1) {
        const y = k * stripH;
        ctx.drawImage(sheet, sx, sy + y, FRAME_W, stripH + 1, sway(timeSec, (k + 0.5) / STRIPS), y, FRAME_W, stripH + 1);
      }
      return true;
    },
  };

  const config: BarLayerConfig = {
    x: "-2.5%", y: "2%", width: "50%", height: "100%",
    blackPoint: 200, whitePoint: 25, threshold: 255,
    xSquares: 150, ySquares: 190, bgOpacity: 0, fillOpacity: 0,
  };
  let visible = true;
  let open = 0;
  const bar: BarCanvas | null = createBarCanvas(canvas, [{ type: "canvas", source, config }], {
    colors: () => ({ bg: hexToRgb(band), fill: hexToRgb(ink) }),
    defaults: { bgOpacity: 0 },
    fps: reduced ? 4 : 60,
  });
  const sync = () => {
    config.fillOpacity = visible && open > 0.002 ? 1 : 0;
  };

  return {
    setOpen(v) {
      open = v;
      want = Math.round(v * (FRAMES - 1));
      sync();
    },
    setVisible(on) {
      visible = on;
      sync();
    },
    destroy() {
      stopped = true;
      bar?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      sheet.width = 1;
      sheet.height = 1;
      frame.width = 1;
      frame.height = 1;
    },
  };
}
