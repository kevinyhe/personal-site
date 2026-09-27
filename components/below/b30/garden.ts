import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarCanvas, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import * as L from "./layout";
import { buildGarden, type GardenScene, type Rings } from "./scene";

/**
 * Joins the page to the garden. The scene draws grey on black into a
 * canvas nobody sees; the bar dither turns it into plum bars on blossom,
 * the way the valley above is drawn, and leaves the black sky as the plum
 * ground.
 *
 * The dither runs the loop: each of its frames asks the scene to draw,
 * then uploads what it drew. So the scene only draws while the dither
 * canvas is on screen.
 *
 *   journey  pinned and driven by scroll; the cursor rakes the sand.
 *   still    less motion was asked for, or the screen is narrow: one
 *            frame of the first stone, drawn once.
 *
 * Nothing here goes through React. It changes every frame.
 */
export type Mode = "journey" | "still";

/** Most pixels across the dither canvas; past this it is drawn smaller and scaled up. */
const MAX_BACKING = 2560;
/** Most pixels across the hidden scene canvas. The bars are coarser than this. */
const MAX_SOURCE = 1280;
/** Bars across the stage: 4 px each at 1920 wide, 8 at 3840. */
const COLUMNS = 480;
/** Seconds for the rings round a stone to ripple out once the page reaches it. */
const RIPPLE = 2.4;

type Rect = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: Mode;
  u: number;
  stop: number;
  aspect: number;
  camera: L.Pose;
  /** The stone at this stop and its words, as % of the stage. */
  stone: Rect | null;
  words: Rect | null;
  overlap: boolean;
  rings: { inner: number; outer: number }[];
  pebbles: { count: number; box: Rect | null };
  skillsWords: Rect | null;
  contact: { on: number; email: Rect | null; calm: Rect | null };
  raking: boolean;
};
type DevHandle = {
  goTo(i: number): void;
  rake(x0: number, y0: number, x1: number, y1: number): { from: { x: number; z: number } | null; to: { x: number; z: number } | null };
  readonly state: DevState;
};
type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b30: ${selector} is missing`);
  return el;
}

const r1 = (v: number): number => Math.round(v * 1000) / 10;
const pctRect = (r: Rect): Rect => ({ x0: r1(r.x0), y0: r1(r.y0), x1: r1(r.x1), y1: r1(r.y1) });

/** Starts the garden. Returns what stops it. Throws, having cleaned up, if WebGL cannot start. */
export function startGarden(root: HTMLElement, mode: Mode): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const sansFamily = getComputedStyle(root).fontFamily;

  // Our own canvases, made here and thrown away at the end. React starts
  // every effect twice in development, and a canvas whose context was let
  // go cannot be given another.
  const source = document.createElement("canvas");
  const gl = source.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) throw new Error("b30: no WebGL2");
  let scene: GardenScene;
  try {
    scene = buildGarden(source, gl, sansFamily);
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
  scene: GardenScene,
  mode: Mode,
  keep: (b: BarCanvas) => void,
  endAll: () => void,
): () => void {
  let alive = true;
  let stageW = 1;
  let stageH = 1;
  let aspect = 1.85;
  let time = 0;
  let u = mode === "still" ? L.STOP_U[0] : -1;
  let pose = L.poseAt(u, aspect);

  const journey = mode === "journey" ? need<HTMLElement>(root, "[data-journey]") : null;
  const hint = root.querySelector<HTMLElement>("[data-hint]");
  const words = journey ? Array.from({ length: L.WORK }, (_, i) => need<HTMLElement>(root, `[data-words="${i}"]`)) : [];
  const wordsShown = words.map(() => -1);
  const contactSection = journey ? root.querySelector<HTMLElement>("#contact") : null;
  const calm = journey ? root.querySelector<HTMLElement>("[data-calm]") : null;

  // The still frame is copied into a plain 2D canvas and handed to the
  // dither as a picture that does not change: the scene's own canvas is
  // emptied by the browser once a frame is shown.
  const copy = mode === "still" ? document.createElement("canvas") : null;

  // ------------------------------------------------------------ size
  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = stageW / stageH;
    const srcW = Math.min(MAX_SOURCE, Math.round(stageW));
    const srcH = Math.max(1, Math.round(srcW / aspect));
    scene.resize(srcW, srcH, aspect);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.max(1, (stageW * dpr) / MAX_BACKING);
    shown.style.width = `${100 / k}%`;
    shown.style.height = `${100 / k}%`;
    shown.style.transform = k > 1 ? `scale(${k})` : "none";
    if (copy) {
      copy.width = srcW;
      copy.height = srcH;
    }
    // The calm patch of sand is laid under wherever the email and links
    // actually are in the last screen, as a share of that screen.
    if (contactSection && calm) {
      const s = contactSection.getBoundingClientRect();
      const c = calm.getBoundingClientRect();
      if (s.width > 0 && s.height > 0) {
        const pad = 0.02;
        scene.setContact(
          L.contactRect(aspect, {
            x0: (c.left - s.left) / s.width - pad,
            x1: (c.right - s.left) / s.width + pad,
            y0: (c.top - s.top) / s.height - pad,
            y1: (c.bottom - s.top) / s.height + pad,
          }),
        );
      }
    } else {
      scene.setContact(L.contactRect(aspect, L.CONTACT_BOX));
    }
  };

  // ---------------------------------------------------------- cursor
  // Only where the pointer passes over open sand, not over the words.
  const cursor = { sx: 0, sy: 0, over: false, moved: false };
  let lastHit: { x: number; z: number } | null = null;
  const onPointer = (e: PointerEvent): void => {
    const r = stage.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const sx = (e.clientX - r.left) / r.width;
    const sy = (e.clientY - r.top) / r.height;
    const target = e.target instanceof Element ? e.target : null;
    cursor.over = sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1 && !target?.closest("[data-panel]");
    cursor.sx = sx;
    cursor.sy = sy;
    cursor.moved = true;
  };
  const onLeave = (): void => {
    cursor.over = false;
    lastHit = null;
  };

  const sandAt = (sx: number, sy: number): { x: number; z: number } | null => {
    const hit = L.unproject(pose, aspect, sx, sy, 0);
    if (!hit) return null;
    if (hit.z < L.WALL_Z + 0.15 || hit.z > L.SAND.z1 || hit.x < L.SAND.x0 || hit.x > L.SAND.x1) return null;
    return { x: hit.x, z: hit.z };
  };

  const rakeFromCursor = (): void => {
    if (!cursor.moved) return;
    cursor.moved = false;
    if (!cursor.over) {
      lastHit = null;
      return;
    }
    const hit = sandAt(cursor.sx, cursor.sy);
    if (!hit) {
      lastHit = null;
      return;
    }
    if (lastHit) {
      const d = Math.hypot(hit.x - lastHit.x, hit.z - lastHit.z);
      // A jump (the page scrolled under a still pointer) starts a new stroke.
      if (d > 0.01 && d < 4) scene.stroke(lastHit.x, lastHit.z, hit.x, hit.z);
    }
    lastHit = hit;
  };

  // ----------------------------------------------------------- rings
  const arrivedAt = L.STONES.map(() => -1);
  const here = L.STONES.map(() => false);
  const ringsFor = (fixed: boolean): Rings[] =>
    L.STONES.map((st, i) => {
      const inner = st.moss + 0.1;
      const kept = inner + L.RINGS_KEPT * L.SPACING;
      const p = fixed ? (i === 0 ? 1 : 0) : L.presence(i, u);
      if (!fixed) {
        if (p > 0.5 && !here[i]) {
          here[i] = true;
          arrivedAt[i] = time;
        } else if (p < 0.2) {
          here[i] = false;
        }
      }
      const t = fixed ? 1 : arrivedAt[i] < 0 ? 0 : L.clamp((time - arrivedAt[i]) / RIPPLE, 0, 1);
      const front = 1 - (1 - t) * (1 - t) * (1 - t);
      return { inner, outer: kept + L.RINGS_REACH * p * front, phase: L.SPACING * p * front };
    });

  // ----------------------------------------------------------- frame
  let shownHint = -1;
  let lastRings: Rings[] = [];
  const frame = (dt: number): void => {
    time += dt;
    if (journey) u = -journey.getBoundingClientRect().top / stageH;
    pose = L.poseAt(u, aspect);
    rakeFromCursor();
    lastRings = ringsFor(false);
    scene.render({ pose, time, dt, rings: lastRings, contactOn: L.contactOn(u) });

    for (let i = 0; i < words.length; i += 1) {
      const v = Math.round(L.wordsOn(i, u) * 100) / 100;
      if (v === wordsShown[i]) continue;
      wordsShown[i] = v;
      words[i].style.opacity = String(v);
      words[i].style.transform = `translateY(calc(-50% + ${((1 - v) * 2).toFixed(2)}rem))`;
      // Links in words that cannot be seen must not catch the pointer.
      words[i].style.pointerEvents = v > 0.6 ? "auto" : "none";
    }
    const h = u < 7.1 ? 1 : 0;
    if (hint && h !== shownHint) {
      hint.style.opacity = h ? "0.7" : "0";
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
      pose = L.poseAt(L.STOP_U[0], aspect);
      scene.render({ pose, time: 4, dt: 0, rings: ringsFor(true), contactOn: 0 });
      copy.getContext("2d")?.drawImage(sourceCanvas, 0, 0, copy.width, copy.height);
    };
    paintStill();
    src = { canvas: copy, animated: false };
  } else {
    src = {
      canvas: sourceCanvas,
      animated: true,
      // Drawn here, right before the dither uploads it, while the browser
      // still holds the frame.
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
        config: { x: 0, y: 0, width: "100%", height: "100%", xSquares: COLUMNS, ySquares: Math.round(COLUMNS / aspect) },
      },
    ],
    { colors: () => colors, fps: 60 },
  );
  if (!bar) throw new Error("b30: the dither could not start");
  keep(bar);
  const barRef = bar;

  const onVisibility = (): void => barRef.setPaused(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  if (journey) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
  }

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
    // Marks set in type need the page's font, and the email's width changes when it lands.
    scene.redrawMarks(getComputedStyle(root).fontFamily);
    measure();
    if (paintStill) {
      paintStill();
      barRef.redraw();
    }
  });

  // ------------------------------------------------- the dev handle
  const host = window as unknown as { __b30?: DevHandle; __lenis?: LenisLike };
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
        const at = L.STOP_U[L.clamp(Math.round(i), 0, L.STOP_U.length - 1)];
        const y = journey.getBoundingClientRect().top + window.scrollY + at * stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      rake(x0: number, y0: number, x1: number, y1: number) {
        const from = sandAt(x0, y0);
        const to = sandAt(x1, y1);
        if (from && to) {
          // Cut into short pieces so a long pull bends with the sand it crosses.
          const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5));
          for (let k = 0; k < n; k += 1) {
            const a = k / n;
            const b = (k + 1) / n;
            scene.stroke(from.x + (to.x - from.x) * a, from.z + (to.z - from.z) * a, from.x + (to.x - from.x) * b, from.z + (to.z - from.z) * b);
          }
        }
        return { from, to };
      },
      get state(): DevState {
        const stop = L.stopAt(u);
        const k = Math.min(stop, L.WORK - 1);
        const stone = mode === "journey" && stop < L.WORK ? L.stoneBox(k, pose, aspect) : null;
        const w = words[k] && stop < L.WORK ? inStage(words[k]) : null;
        const peb = scene.pebbles();
        let pbox: Rect | null = null;
        for (const p of peb) {
          const q = L.project(pose, aspect, p.x, 0, p.z);
          if (q.depth <= 0) continue;
          pbox = pbox
            ? { x0: Math.min(pbox.x0, q.sx), y0: Math.min(pbox.y0, q.sy), x1: Math.max(pbox.x1, q.sx), y1: Math.max(pbox.y1, q.sy) }
            : { x0: q.sx, y0: q.sy, x1: q.sx, y1: q.sy };
        }
        const email = root.querySelector("[data-email]");
        return {
          mode,
          u: Math.round(u * 1000) / 1000,
          stop,
          aspect: Math.round(aspect * 1000) / 1000,
          camera: { x: +pose.x.toFixed(2), y: +pose.y.toFixed(2), z: +pose.z.toFixed(2), pitch: +((pose.pitch * 180) / Math.PI).toFixed(1) },
          stone: stone ? pctRect(stone) : null,
          words: w ? pctRect(w) : null,
          overlap: !!(stone && w && L.overlaps(stone, w)),
          rings: lastRings.map((r) => ({ inner: +r.inner.toFixed(2), outer: +r.outer.toFixed(2) })),
          pebbles: { count: peb.length, box: pbox ? pctRect(pbox) : null },
          skillsWords: (() => {
            const el = root.querySelector("[data-skills-panel]");
            const b = inStage(el);
            return b ? pctRect(b) : null;
          })(),
          contact: {
            on: Math.round(L.contactOn(u) * 100) / 100,
            email: email ? pctRect(inStage(email) as Rect) : null,
            calm: calm ? pctRect(inStage(calm) as Rect) : null,
          },
          raking: scene.raking(),
        };
      },
    };
    host.__b30 = handle;
  }

  return () => {
    alive = false;
    sized.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    if (handle && host.__b30 === handle) delete host.__b30;
    endAll();
  };
}
