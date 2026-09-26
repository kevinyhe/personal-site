import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarCanvas, type BarLayerConfig, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import * as L from "./layout";
import { type Form, type Fonts, sampleForm } from "./sample";
import { buildScene, type LettersScene } from "./scene";

/**
 * Joins the page to the picture. The scene draws grey on black into a
 * canvas nobody sees; the bar dither turns it into blossom bars on the plum
 * ground, the way the band above is drawn.
 *
 * The dither canvas runs the loop: each of its frames asks the scene to
 * draw, then uploads what it drew. So the scene only draws while the dither
 * canvas is on screen and the tab is showing.
 *
 *   journey  pinned and driven by scroll.
 *   still    the visitor asked for less motion, or the screen is narrow:
 *            the first project's name standing whole, drawn once.
 *
 * Nothing here goes through React. It changes every frame.
 */
export type Mode = "journey" | "still";

/** Most pixels across the dither canvas may have; past this it is drawn smaller and scaled up. */
const MAX_BACKING = 2560;
/** Most pixels across the hidden scene canvas. Kept high so the bars' edge test does not eat thin strokes. */
const MAX_SOURCE = 1920;
/** Bars across the stage. At 1920 wide a bar cell is 4 px; at 3840, 8. */
const COLUMNS = 480;

type Rect = L.Rect;
type DevState = {
  mode: Mode;
  u: number;
  pair: L.Pair;
  form: number;
  pool: number;
  counts: number[];
  grids: string[];
  /** The standing word's tiles and its text block, as % of the stage. */
  word: Rect | null;
  text: Rect | null;
  overlap: boolean;
  push: { x: number; y: number; s: number };
};
type DevHandle = { goTo(i: number): void; readonly state: DevState };
type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b24: ${selector} is missing`);
  return el;
}

const pct = (r: Rect): Rect => ({
  x0: Math.round(r.x0 * 1000) / 10,
  y0: Math.round(r.y0 * 1000) / 10,
  x1: Math.round(r.x1 * 1000) / 10,
  y1: Math.round(r.y1 * 1000) / 10,
});

/** The still frame's one word: centred in its shorter stage. */
const STILL_SPEC: L.FormSpec = { ...L.FORMS[0], box: { x0: 0.1, y0: 0.14, x1: 0.9, y1: 0.86 }, align: "center", yaw: 0.22 };

/** Starts the picture. Returns what stops it. Throws, having cleaned up, if WebGL cannot start. */
export function startLetters(root: HTMLElement, mode: Mode): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");

  // Our own canvases, made here and thrown away at the end. In development
  // React starts every effect twice, and a canvas whose context was let go
  // cannot be given another.
  const source = document.createElement("canvas");
  const gl = source.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) throw new Error("b24: no WebGL2");
  let scene: LettersScene;
  try {
    scene = buildScene(source, gl);
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
  scene: LettersScene,
  mode: Mode,
  keep: (b: BarCanvas) => void,
  endAll: () => void,
): () => void {
  let alive = true;
  let stageW = 1;
  let stageH = 1;
  let aspect = 1.85;
  let time = 0;
  let u = 0;
  let forms: Form[] = [];
  let pair: L.Pair = { a: 0, b: 1, t: 0 };

  const journey = mode === "journey" ? need<HTMLElement>(root, "[data-journey]") : null;
  const hint = root.querySelector<HTMLElement>("[data-hint]");
  const blocks = journey ? L.FORMS.map((_, f) => root.querySelector<HTMLElement>(`[data-form="${f}"]`)) : [];
  const blockShown = blocks.map(() => -1);

  const serifProbe = root.querySelector<HTMLElement>("[data-serif]");
  const fonts = (): Fonts => ({
    serif: serifProbe ? getComputedStyle(serifProbe).fontFamily : "Georgia, serif",
    sans: getComputedStyle(root).fontFamily,
  });

  // The still frame draws into a plain 2D copy, handed to the dither as a
  // picture that does not change. The scene's own canvas is emptied by the
  // browser once a frame is shown, so it cannot be read later.
  const copy = mode === "still" ? document.createElement("canvas") : null;

  // The dither reads this object on every draw, so a new size only has to
  // change its row count to keep the cells square.
  const barConfig: BarLayerConfig = {
    x: 0,
    y: 0,
    width: "100%",
    height: "100%",
    xSquares: COLUMNS,
    ySquares: Math.round(COLUMNS / aspect),
    // A bright face is a wide run of blossom, a dark side a thin one; the
    // gaps are left clear so the plum shows between the bars.
    bgOpacity: 1,
    fillOpacity: 0,
  };

  // ------------------------------------------------------------ size
  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = stageW / stageH;
    barConfig.ySquares = Math.round(COLUMNS / aspect);
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
    if (copy) {
      copy.width = srcW;
      copy.height = srcH;
    }
  };

  /** Draws every word into tiles for the stage as it is now. */
  const buildForms = (): void => {
    const f = fonts();
    forms = mode === "still" ? [sampleForm(STILL_SPEC, stageW, stageH, f, 101)] : L.FORMS.map((spec, i) => sampleForm(spec, stageW, stageH, f, 101 + i * 31));
    scene.setForms(forms);
  };

  // ---------------------------------------------------------- cursor
  // The push follows the cursor on a spring, and its strength springs to 1
  // while the cursor is over the stage and back to 0 when it leaves: under
  // damped, so the tiles rock back past rest before they settle.
  const aim = { x: 0, y: 0, inside: false, lean: { x: 0, y: 0 } };
  const push = { x: 0, y: 0, vx: 0, vy: 0, s: 0, vs: 0 };
  const lean = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent): void => {
    const r = stage.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const sx = (e.clientX - r.left) / r.width;
    const sy = (e.clientY - r.top) / r.height;
    const inside = sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1;
    const [wx, wy] = L.toWorld(sx, sy, aspect);
    if (inside && !aim.inside && Math.abs(push.s) < 0.05) {
      // Coming back in: start the push where the cursor is, not where it left.
      push.x = wx;
      push.y = wy;
      push.vx = 0;
      push.vy = 0;
    }
    aim.x = wx;
    aim.y = wy;
    aim.inside = inside;
    aim.lean.x = L.clamp(sx * 2 - 1, -1, 1);
    aim.lean.y = L.clamp(sy * 2 - 1, -1, 1);
  };
  const onLeave = (): void => {
    aim.inside = false;
  };

  const stepSprings = (dt: number): void => {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      push.vx += (60 * (aim.x - push.x) - 9 * push.vx) * h;
      push.vy += (60 * (aim.y - push.y) - 9 * push.vy) * h;
      push.x += push.vx * h;
      push.y += push.vy * h;
      push.vs += (40 * ((aim.inside ? 1 : 0) - push.s) - 5 * push.vs) * h;
      push.s += push.vs * h;
    }
    const ease = 1 - Math.exp(-dt * 2.5);
    lean.x += (aim.lean.x - lean.x) * ease;
    lean.y += (aim.lean.y - lean.y) * ease;
  };

  // ----------------------------------------------------------- frame
  let shownHint = -1;
  /** Reads the scroll and shows the text that goes with it. Runs even before the words are built. */
  const follow = (): void => {
    if (journey) u = -journey.getBoundingClientRect().top / stageH;
    pair = L.pairAt(u);
    for (let f = 0; f < blocks.length; f += 1) {
      const el = blocks[f];
      if (!el) continue;
      const v = Math.round(L.textShown(f, u) * 100) / 100;
      if (v === blockShown[f]) continue;
      blockShown[f] = v;
      el.style.opacity = String(v);
      el.style.transform = `translateY(calc(-50% + ${((1 - v) * 2).toFixed(2)}rem))`;
      // Links in a block that cannot be seen must not be hit.
      el.style.pointerEvents = v > 0.6 ? "auto" : "none";
    }
    const hv = u < 10.4 ? 1 : 0;
    if (hint && hv !== shownHint) {
      hint.style.opacity = hv ? "0.6" : "0";
      shownHint = hv;
    }
  };

  const frame = (dt: number): void => {
    time += dt;
    follow();
    stepSprings(dt);
    scene.render({ pair, time, leanX: lean.x, leanY: lean.y, push: { x: push.x, y: push.y, s: push.s } });
  };

  // ------------------------------------------------------ the dither
  measure();
  const colors = { bg: hexToRgb(BLOSSOM), fill: hexToRgb(BAND) };
  let src: CanvasSource;
  let paintStill: (() => void) | null = null;
  if (copy) {
    paintStill = (): void => {
      scene.render({ pair: { a: 0, b: 0, t: 0 }, time: 0, leanX: 0, leanY: 0, push: { x: 0, y: 0, s: 0 } });
      copy.getContext("2d")?.drawImage(sourceCanvas, 0, 0, copy.width, copy.height);
    };
    src = { canvas: copy, animated: false };
  } else {
    src = {
      canvas: sourceCanvas,
      animated: true,
      // Drawn here, right before the dither uploads it, while the browser
      // still holds the frame.
      update: (_t, dt) => {
        if (!alive) return false;
        if (!forms.length) {
          follow();
          return false;
        }
        frame(dt);
        return true;
      },
    };
  }
  const made = createBarCanvas(
    shown,
    [
      {
        type: "canvas",
        source: src,
        config: barConfig,
      },
    ],
    { colors: () => colors, defaults: { bgOpacity: 1, fillOpacity: 0 }, fps: 60 },
  );
  if (!made) throw new Error("b24: the dither could not start");
  keep(made);
  const barRef = made;

  const onVisibility = (): void => barRef.setPaused(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);

  const repaintStill = (): void => {
    if (!paintStill || !forms.length) return;
    paintStill();
    barRef.redraw();
  };

  // The words are drawn in the page's own fonts, so wait for them (a short
  // while at most; the fallback faces are better than nothing).
  const f0 = fonts();
  let fontTimer = 0;
  const fontsIn = Promise.race([
    Promise.all([document.fonts.load(`italic 700 100px ${f0.serif}`), document.fonts.load(`700 100px ${f0.sans}`)]).catch(() => undefined),
    new Promise<void>((resolve) => {
      fontTimer = window.setTimeout(resolve, 2500);
    }),
  ]);
  const safeBuild = (): void => {
    try {
      buildForms();
      repaintStill();
    } catch {
      // No words to draw: the stage stays plum and the text stands beside it.
      forms = [];
    }
  };
  void fontsIn.then(() => {
    window.clearTimeout(fontTimer);
    if (alive) safeBuild();
  });

  // A new size redraws the words, once the resizing has stopped.
  let resizeTimer = 0;
  let firstSize = true;
  const sized = new ResizeObserver(() => {
    if (!alive) return;
    // The observer reports once at the start; the words are built after the fonts.
    if (firstSize) {
      firstSize = false;
      return;
    }
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!alive) return;
      measure();
      if (forms.length) safeBuild();
    }, 160);
  });
  sized.observe(stage);

  // ------------------------------------------------- the dev handle
  const host = window as unknown as { __b24?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const inStage = (el: Element | null): Rect | null => {
      if (!el) return null;
      const s = stage.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { x0: (b.left - s.left) / s.width, y0: (b.top - s.top) / s.height, x1: (b.right - s.left) / s.width, y1: (b.bottom - s.top) / s.height };
    };
    const wordBox = (fm: Form): Rect => {
      const cam = L.cameraAt(lean.x, lean.y);
      const r: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i < fm.count; i += 1) {
        const p = L.project([fm.pos[i * 3], fm.pos[i * 3 + 1], fm.pos[i * 3 + 2]], cam, aspect);
        r.x0 = Math.min(r.x0, p.x);
        r.x1 = Math.max(r.x1, p.x);
        r.y0 = Math.min(r.y0, p.y);
        r.y1 = Math.max(r.y1, p.y);
      }
      return r;
    };
    handle = {
      goTo(i: number): void {
        if (!journey) return;
        const at = L.CENTRES[L.clamp(Math.round(i), 0, L.CENTRES.length - 1)];
        const y = journey.getBoundingClientRect().top + window.scrollY + at * stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      get state(): DevState {
        const f = mode === "journey" ? L.formAt(u) : 0;
        const fm = forms[f];
        const word = fm && fm.count ? wordBox(fm) : null;
        const text = mode === "journey" ? inStage(blocks[f] ?? null) : null;
        return {
          mode,
          u: Math.round(u * 1000) / 1000,
          pair: { ...pair, t: Math.round(pair.t * 1000) / 1000 },
          form: f,
          pool: scene.pool,
          counts: forms.map((x) => x.count),
          grids: forms.map((x) => `${x.cols}x${x.rows}`),
          word: word ? pct(word) : null,
          text: text ? pct(text) : null,
          overlap: !!(word && text && L.overlaps(word, text)),
          push: { x: Math.round(push.x * 100) / 100, y: Math.round(push.y * 100) / 100, s: Math.round(push.s * 100) / 100 },
        };
      },
    };
    host.__b24 = handle;
  }

  return () => {
    alive = false;
    window.clearTimeout(resizeTimer);
    window.clearTimeout(fontTimer);
    sized.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    if (handle && host.__b24 === handle) delete host.__b24;
    endAll();
  };
}
