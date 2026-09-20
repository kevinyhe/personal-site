import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarCanvas, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import * as L from "./layout";
import { type BrushScene, buildScene } from "./scene";

/**
 * Joins the page to the picture. The scene draws grey on black into a
 * canvas nobody sees; the bar dither turns it into blossom bars on the
 * plum ground, the way the band above is drawn. Under that, a plain 2D
 * canvas holds the cursor's wet trail on the grid.
 *
 * The dither canvas runs the loop: each of its frames asks the scene to
 * draw, then uploads what it drew. So the scene only draws while the
 * dither canvas is on screen.
 *
 *   journey  pinned and driven by scroll.
 *   still    the visitor asked for less motion, or the screen is narrow:
 *            one frame of the five strokes, drawn once.
 *
 * Nothing here goes through React. It changes every frame.
 */
export type Mode = "journey" | "still";

/** Most pixels across the dither canvas may have; past this it is drawn smaller and scaled up. */
const MAX_BACKING = 2560;
/** Most pixels across the hidden scene canvas. The bars are coarser than this. */
const MAX_SOURCE = 1280;
/** Bars across the stage. At 1920 wide a bar cell is 4 px; at 3840, 8. */
const COLUMNS = 480;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: Mode;
  u: number;
  step: number;
  aspect: number;
  draw: number[];
  ghost: number[];
  ages: number[];
  /** The newest project stroke, painted in full, and its text block, as % of the stage. */
  stroke: Rect | null;
  title: Rect | null;
  overlap: boolean;
  skills: Rect[];
  contact: { stroke: Rect | null; email: Rect | null };
};
type DevHandle = { goTo(i: number): void; readonly state: DevState };
type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b20: ${selector} is missing`);
  return el;
}

const pctRect = (r: Rect): Rect => ({
  x0: Math.round(r.x0 * 1000) / 10,
  y0: Math.round(r.y0 * 1000) / 10,
  x1: Math.round(r.x1 * 1000) / 10,
  y1: Math.round(r.y1 * 1000) / 10,
});

/** Starts the picture. Returns what stops it. Throws, having cleaned up, if WebGL cannot start. */
export function startBrush(root: HTMLElement, mode: Mode): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const sansFamily = getComputedStyle(root).fontFamily;

  // Our own canvases, made here and thrown away at the end. In development
  // React starts every effect twice, and a canvas whose context was let
  // go cannot be given another.
  const source = document.createElement("canvas");
  const gl = source.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) throw new Error("b20: no WebGL2");
  let scene: BrushScene;
  try {
    scene = buildScene(source, gl, sansFamily, mode === "still");
  } catch (error) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw error;
  }

  const shown = document.createElement("canvas");
  shown.setAttribute("aria-hidden", "true");
  shown.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;transform-origin:0 0";
  slot.appendChild(shown);

  let bar: BarCanvas | null = null;
  const endAll = (): void => {
    bar?.destroy();
    bar = null;
    scene.dispose();
    shown.remove();
  };
  try {
    return bind(root, stage, shown, source, scene, mode, (b) => (bar = b), endAll);
  } catch (error) {
    endAll();
    throw error;
  }
}

function bind(
  root: HTMLElement,
  stage: HTMLElement,
  shown: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  scene: BrushScene,
  mode: Mode,
  keep: (b: BarCanvas) => void,
  endAll: () => void,
): () => void {
  let alive = true;
  let stageW = 1;
  let stageH = 1;
  let aspect = 1.85;
  let rem = 8;
  let time = 0;
  let u = mode === "still" ? 0 : -1;

  const journey = mode === "journey" ? need<HTMLElement>(root, "[data-journey]") : null;
  const trail = mode === "journey" ? root.querySelector<HTMLCanvasElement>("[data-trail]") : null;
  const trailCtx = trail?.getContext("2d") ?? null;
  const hint = root.querySelector<HTMLElement>("[data-hint]");
  const titles = journey ? Array.from({ length: L.WORK }, (_, i) => need<HTMLElement>(root, `[data-title="${i}"]`)) : [];
  const titleShown = titles.map(() => -1);
  const email = journey ? root.querySelector<HTMLElement>("[data-email]") : null;

  // The still frame draws into a plain 2D copy, handed to the dither as a
  // picture that does not change. The scene's own canvas is emptied by
  // the browser once a frame is shown, so it cannot be read later.
  const copy = mode === "still" ? document.createElement("canvas") : null;

  // ------------------------------------------------------------ size
  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = stageW / stageH;
    rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 8;
    const srcW = Math.min(MAX_SOURCE, Math.round(stageW));
    const srcH = Math.max(1, Math.round(srcW / aspect));
    scene.resize(srcW, srcH, aspect);
    // The dither canvas sizes itself from its box at up to 1.5 pixels per
    // CSS pixel. Past 2560 across it is given a smaller box and scaled up.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.max(1, (stageW * dpr) / MAX_BACKING);
    shown.style.width = `${100 / k}%`;
    shown.style.height = `${100 / k}%`;
    shown.style.transform = k > 1 ? `scale(${k})` : "none";
    if (trail && trailCtx) {
      // Soft marks: half resolution is plenty.
      trail.width = Math.round(stageW / 2);
      trail.height = Math.round(stageH / 2);
    }
    if (copy) {
      copy.width = srcW;
      copy.height = srcH;
    }
  };

  // ---------------------------------------------------------- cursor
  const cursor = { x: 0, y: 0, inside: false, moved: false, fresh: true };
  const last = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  const leanTo = { x: 0, y: 0 };
  let lastMark = -10;
  let trailClear = true;
  const onPointer = (e: PointerEvent): void => {
    const r = stage.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const inside = x >= 0 && x <= r.width && y >= 0 && y <= r.height;
    if (inside && !cursor.inside) cursor.fresh = true;
    cursor.x = x;
    cursor.y = y;
    cursor.inside = inside;
    cursor.moved = true;
    leanTo.x = L.clamp((x / r.width) * 2 - 1, -1, 1);
    leanTo.y = L.clamp((y / r.height) * 2 - 1, -1, 1);
  };

  /** The wet trail: a faint wide line where the cursor went, which dries away. */
  const paintTrail = (dt: number): void => {
    if (!trail || !trailCtx) return;
    const ctx = trailCtx;
    if (!trailClear) {
      // Fading by a fraction each frame never quite reaches nothing on an
      // 8-bit canvas, so a trail left alone for a while is wiped outright.
      if (time - lastMark > 3.5) {
        ctx.clearRect(0, 0, trail.width, trail.height);
        trailClear = true;
      } else {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0.05, 1 - Math.exp(-dt / 1.1)).toFixed(3)})`;
        ctx.fillRect(0, 0, trail.width, trail.height);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    if (cursor.moved && cursor.inside) {
      if (cursor.fresh) {
        last.x = cursor.x;
        last.y = cursor.y;
        cursor.fresh = false;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(249, 185, 220, 0.1)";
      ctx.lineWidth = rem * 3.2 * 0.5;
      ctx.beginPath();
      ctx.moveTo(last.x * 0.5, last.y * 0.5);
      ctx.lineTo(cursor.x * 0.5 + 0.01, cursor.y * 0.5);
      ctx.stroke();
      last.x = cursor.x;
      last.y = cursor.y;
      lastMark = time;
      trailClear = false;
    }
    cursor.moved = false;
  };

  // ----------------------------------------------------------- frame
  // Seconds since each stroke finished; below 0 while it is still being
  // painted. Index 5 is the underline under the email.
  const ages = [-1, -1, -1, -1, -1, -1];
  const burstAt = [-1, -1, -1, -1, -1, -1];
  let shownHint = -1;

  const frame = (dt: number): void => {
    time += dt;
    if (journey) u = -journey.getBoundingClientRect().top / stageH;
    const ease = 1 - Math.exp(-dt * 2.5);
    lean.x += (leanTo.x - lean.x) * ease;
    lean.y += (leanTo.y - lean.y) * ease;

    const tl = L.timeline(u);
    const draws = [...tl.draw, tl.contactDraw];
    for (let k = 0; k < draws.length; k += 1) {
      // A stroke bursts into blossom once, when it is finished, and again
      // only if it was scrolled back to half painted first.
      if (draws[k] >= 0.999 && burstAt[k] < 0) burstAt[k] = time;
      else if (draws[k] < 0.9) burstAt[k] = -1;
      ages[k] = burstAt[k] < 0 ? -1 : time - burstAt[k];
    }
    scene.render({ u, time, leanX: lean.x, leanY: lean.y, ages });
    paintTrail(dt);

    for (let i = 0; i < titles.length; i += 1) {
      const v = Math.round(tl.title[i] * 100) / 100;
      if (v === titleShown[i]) continue;
      titleShown[i] = v;
      titles[i].style.opacity = String(v);
      titles[i].style.transform = `translateY(calc(-50% + ${((1 - v) * 2).toFixed(2)}rem))`;
      // Links in a block that cannot be seen must not be hit.
      titles[i].style.pointerEvents = v > 0.6 ? "auto" : "none";
    }
    const h = u < 7.3 ? 1 : 0;
    if (hint && h !== shownHint) {
      hint.style.opacity = h ? "0.6" : "0";
      shownHint = h;
    }
  };

  // ------------------------------------------------------ the dither
  measure();
  const colors = { bg: hexToRgb(BLOSSOM), fill: hexToRgb(BAND) };
  let src: CanvasSource;
  let paintStill: (() => void) | null = null;
  if (copy) {
    paintStill = (): void => {
      scene.render({ u: 0, time: 0, leanX: 0, leanY: 0, ages });
      const c2 = copy.getContext("2d");
      c2?.drawImage(sourceCanvas, 0, 0, copy.width, copy.height);
    };
    paintStill();
    src = { canvas: copy, animated: false };
  } else {
    src = {
      canvas: sourceCanvas,
      animated: true,
      // Drawn here, right before the dither uploads it, while the
      // browser still holds the frame.
      update: (_t, dt) => {
        if (!alive) return false;
        frame(dt);
        return true;
      },
    };
  }
  const bar = createBarCanvas(
    shown,
    [
      {
        type: "canvas",
        source: src,
        config: {
          x: 0,
          y: 0,
          width: "100%",
          height: "100%",
          xSquares: COLUMNS,
          ySquares: Math.round(COLUMNS / aspect),
          // Bright ink is a wide run of blossom, thin ink a thin one; the
          // gaps are left clear so the grid shows between the bars.
          bgOpacity: 1,
          fillOpacity: 0,
        },
      },
    ],
    { colors: () => colors, defaults: { bgOpacity: 1, fillOpacity: 0 }, fps: 60 },
  );
  if (!bar) throw new Error("b20: the dither could not start");
  keep(bar);
  const barRef = bar;

  // Hidden tab: stop.
  const onVisibility = (): void => barRef.setPaused(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointermove", onPointer, { passive: true });

  const sized = new ResizeObserver(() => {
    if (!alive) return;
    measure();
    if (paintStill) {
      paintStill();
      barRef.redraw();
    }
  });
  sized.observe(stage);
  void document.fonts.ready.then(() => {
    if (!alive) return;
    // The skill marks set in type need the page's font.
    scene.redrawAtlas(getComputedStyle(root).fontFamily);
    measure();
    if (paintStill) {
      paintStill();
      barRef.redraw();
    }
  });

  // ------------------------------------------------- the dev handle
  const host = window as unknown as { __b20?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const inStage = (el: Element | null): Rect | null => {
      if (!el) return null;
      const s = stage.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { x0: (b.left - s.left) / s.width, y0: (b.top - s.top) / s.height, x1: (b.right - s.left) / s.width, y1: (b.bottom - s.top) / s.height };
    };
    handle = {
      goTo(i: number): void {
        if (!journey) return;
        const at = L.STOPS[L.clamp(Math.round(i), 0, L.STOPS.length - 1)];
        const y = journey.getBoundingClientRect().top + window.scrollY + at * stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      get state(): DevState {
        const tl = L.timeline(u);
        const step = L.stepAt(u);
        const cam = scene.camera;
        const k = Math.min(step, L.WORK - 1);
        const ribbons = scene.work();
        const stroke = mode === "journey" && step < L.WORK && ribbons[k] ? L.projectBox(ribbons[k].positions, cam, L.ghostOffset(tl.ghost[k])) : null;
        const title = titles[k] ? inStage(titles[k]) : null;
        const skillBoxes = scene.skills().map((r) => {
          const b = L.projectBox(r.positions, cam, [0, -2 * tl.skillShift, 0]);
          return pctRect(b);
        });
        const cr = scene.contact();
        return {
          mode,
          u: Math.round(u * 1000) / 1000,
          step,
          aspect: Math.round(aspect * 1000) / 1000,
          draw: tl.draw.map((v) => Math.round(v * 100) / 100),
          ghost: tl.ghost.map((v) => Math.round(v * 100) / 100),
          ages: ages.map((v) => Math.round(v * 10) / 10),
          stroke: stroke ? pctRect(stroke) : null,
          title: title ? pctRect(title) : null,
          overlap: !!(stroke && title && L.overlaps(stroke, title)),
          skills: skillBoxes,
          contact: {
            stroke: cr ? pctRect(L.projectBox(cr.positions, cam, [0, -2 * tl.contactShift, 0])) : null,
            email: email ? pctRect(inStage(email) as Rect) : null,
          },
        };
      },
    };
    host.__b20 = handle;
  }

  return () => {
    alive = false;
    sized.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    if (handle && host.__b20 === handle) delete host.__b20;
    endAll();
  };
}
