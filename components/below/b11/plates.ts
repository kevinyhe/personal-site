import * as THREE from "three";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import { createBarCanvas, hexToRgb, type BarCanvas, type BarLayerConfig, type CanvasSource } from "@/components/valley/barShader";
import {
  CONTACT_STOP,
  OPEN_RECTS,
  PROJECT_COUNT,
  SHOTS,
  SKILLS_STOP,
  STOPS,
  STOP_COUNT,
  cameraAt,
  captionAnchors,
  cropSpan,
  frameRect,
  grade,
  gridFor,
  labelAlpha,
  phaseAt,
  smooth,
  type Rect,
} from "./layout";
import { buildWorld } from "./scenes";

/**
 * The running page: one three.js renderer drawing whichever plate is up
 * into a canvas nobody sees, and one bar canvas on the stage that redraws
 * that picture in plum bars inside the frame. The scroll decides which
 * plate, how far open, and where the labels go.
 *
 * There is one loop, the bar canvas's own. It asks our source for a new
 * picture every frame it draws, and that is when we read the scroll, move
 * the frame and draw the scene. The bar canvas already stops drawing when
 * the stage is off screen, so this stops with it.
 */

export type Mode = "journey" | "still";

/** The time a still page is drawn at: the robot mid-turn, rings half out. */
const STILL_T = 6.5;
/** The picture we render is never wider than this. The bar grid is far coarser. */
const SOURCE_MAX_W = 1280;
/** Nor is the bar canvas: past this it is drawn smaller and scaled up. */
const BARS_MAX_W = 2560;
const ENGINE_DPR_CAP = 1.5;

const STOP_NAMES = ["Work", "Work", "Work", "Work", "Work", "Skills", "Contact"];
const pad2 = (n: number): string => String(n).padStart(2, "0");
const pct = (v: number): string => `${(v * 100).toFixed(3)}%`;
const round = (v: number): number => Math.round(v * 1000) / 1000;

type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };
type Box = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: Mode;
  u: number;
  stop: number;
  open: number;
  raw: number;
  frame: Box;
  crop: number;
  grade: { blackPoint: number; whitePoint: number };
  grid: { xSquares: number; ySquares: number };
  robot: boolean;
  labels: Record<string, Box>;
  marks: Box[];
};
type DevHandle = { goTo(i: number): void; readonly state: DevState };

/** Writes a style only when it changed, so a still scroll costs nothing. */
function styler(): (el: HTMLElement | null, key: string, value: string) => void {
  const last = new WeakMap<HTMLElement, Record<string, string>>();
  return (el, key, value) => {
    if (!el) return;
    let seen = last.get(el);
    if (!seen) {
      seen = {};
      last.set(el, seen);
    }
    if (seen[key] === value) return;
    seen[key] = value;
    el.style.setProperty(key, value);
  };
}

export function startPlates(root: HTMLElement, mode: Mode): () => void {
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("[data-bars]");
  if (!journey || !stage || !bars) throw new Error("b11: markup missing");
  const frameEl = root.querySelector<HTMLElement>("[data-frame]");
  const countEl = root.querySelector<HTMLElement>("[data-count]");
  const nameEl = root.querySelector<HTMLElement>("[data-count-name]");
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const caps = Array.from({ length: PROJECT_COUNT }, (_, i) => {
    const el = root.querySelector<HTMLElement>(`[data-cap="${i}"]`);
    const part = (n: string) => el?.querySelector<HTMLElement>(`[data-part="${n}"]`) ?? null;
    return { el, stack: part("stack"), year: part("year"), title: part("title"), award: part("award") };
  });
  const markEls = Array.from(root.querySelectorAll<HTMLElement>("[data-mark]"));
  const still = mode === "still";
  const set = styler();

  // ---------------------------------------------------------- the renderer
  // The context is asked for here, so a browser without one throws before
  // three.js is involved and the page keeps its plain layout.
  const source = document.createElement("canvas");
  const gl = source.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!gl) throw new Error("b11: no webgl2");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: source, context: gl, antialias: true });
  } catch (e) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw e;
  }
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(0.8, 0.8, 0.8), 1);

  const depths = skillGroups.map((g) => g.skills.map((s) => s.depth));
  const world = buildWorld(depths, "/models/hero.glb");
  const camera = new THREE.PerspectiveCamera(30, 2, 0.05, 200);

  // --------------------------------------------------------------- sizes
  let stageW = stage.clientWidth || window.innerWidth;
  let stageH = stage.clientHeight || window.innerHeight;
  let current = -1;
  let dirty = true;
  let robotIn = false;
  void world.robot.then(() => {
    robotIn = true;
    dirty = true;
  });

  const config: BarLayerConfig = {
    x: "40%", y: "40%", width: "20%", height: "20%",
    blackPoint: 20, whitePoint: 235, threshold: 255,
    xSquares: 160, ySquares: 80,
    // Capped under a full cell, so the darkest part of an object is still
    // a comb of bars and its edges and parts read through it.
    maxSquareWidth: "88%",
    bgOpacity: 0, fillOpacity: 0,
    crop: [0, 0, 1, 1],
  };

  // The bar canvas's backing store follows its CSS size. On a screen wider
  // than BARS_MAX_W device pixels it is laid out smaller and scaled up, so
  // it never draws more than that across.
  const fitBars = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, ENGINE_DPR_CAP);
    const k = Math.max(1, (stageW * dpr) / BARS_MAX_W);
    set(bars, "width", `${100 / k}%`);
    set(bars, "height", `${100 / k}%`);
    set(bars, "transform", k > 1 ? `scale(${k})` : "none");
  };

  const sizePlate = (k: number): void => {
    const r = OPEN_RECTS[k];
    const wPx = (r.x1 - r.x0) * stageW;
    const hPx = (r.y1 - r.y0) * stageH;
    const aspect = wPx / Math.max(1, hPx);
    const srcW = Math.max(64, Math.min(SOURCE_MAX_W, Math.round(wPx * pr)));
    const srcH = Math.max(32, Math.round(srcW / aspect));
    renderer.setSize(srcW / pr, srcH / pr, false);
    camera.aspect = aspect;
    camera.fov = SHOTS[k].fov;
    camera.updateProjectionMatrix();
    const g = gridFor(k, stageW, stageH);
    config.xSquares = g.xSquares;
    config.ySquares = g.ySquares;
  };

  // ---------------------------------------------------------- per frame
  let u = 0;
  let phase = phaseAt(0, still);
  let frame: Rect = frameRect(0, 0);
  let crop = 1;
  const where = (): number => -journey.getBoundingClientRect().top / Math.max(1, stageH);
  const v3 = new THREE.Vector3();

  const layout = (): void => {
    u = where();
    phase = phaseAt(u, still);
    const { k, open, raw } = phase;
    if (k !== current) {
      current = k;
      dirty = true;
      sizePlate(k);
    }
    frame = frameRect(k, open);
    crop = cropSpan(open);
    const c0 = (1 - crop) / 2;
    const c1 = 1 - c0;
    config.x = pct(frame.x0);
    config.y = pct(frame.y0);
    config.width = pct(frame.x1 - frame.x0);
    config.height = pct(frame.y1 - frame.y0);
    config.crop = [c0, c0, c1, c1];
    const gr = grade(raw);
    config.blackPoint = gr.blackPoint;
    config.whitePoint = gr.whitePoint;
    // A plate is gone for a moment at each hand-over, so one leaves before
    // the next arrives. Before the first one grows there is none at all.
    const shown = still ? 1 : smooth(0, 0.08, raw);
    config.fillOpacity = shown;

    set(frameEl, "left", pct(frame.x0));
    set(frameEl, "top", pct(frame.y0));
    set(frameEl, "width", pct(frame.x1 - frame.x0));
    set(frameEl, "height", pct(frame.y1 - frame.y0));
    set(frameEl, "opacity", String(round(shown)));

    const alpha = still ? 1 : labelAlpha(raw);
    const a = captionAnchors(frame);
    caps.forEach((c, i) => {
      const on = i === k;
      set(c.el, "opacity", on ? String(round(alpha)) : "0");
      set(c.el, "visibility", on && alpha > 0.01 ? "visible" : "hidden");
      if (!on) return;
      set(c.stack, "left", pct(a.stack.left));
      set(c.stack, "bottom", pct(a.stack.bottom));
      set(c.year, "right", pct(a.year.right));
      set(c.year, "bottom", pct(a.year.bottom));
      set(c.title, "left", pct(a.title.left));
      set(c.title, "top", pct(a.title.top));
      set(c.award, "right", pct(a.award.right));
      set(c.award, "top", pct(a.award.top));
    });
    set(skillsLayer, "opacity", k === SKILLS_STOP ? String(round(alpha)) : "0");
    set(skillsLayer, "visibility", k === SKILLS_STOP && alpha > 0.01 ? "visible" : "hidden");

    if (countEl) {
      const text = `${pad2(k + 1)} / ${pad2(STOP_COUNT)}`;
      if (countEl.textContent !== text) countEl.textContent = text;
    }
    if (nameEl && nameEl.textContent !== STOP_NAMES[k]) nameEl.textContent = STOP_NAMES[k];
  };

  // The lantern groups' numbers, put over the groups by projecting each
  // group's top through the camera and into the frame.
  const markBoxes: Box[] = [];
  const placeMarks = (): void => {
    const plate = world.plates[SKILLS_STOP];
    const on = phase.k === SKILLS_STOP;
    const alpha = on ? (still ? 1 : labelAlpha(phase.raw)) : 0;
    const c0 = (1 - crop) / 2;
    // The names' layer is still scrolling into its pin while the plate
    // opens; the numbers follow the plate, so take that offset back out.
    let lift = 0;
    if (on && skillsLayer) {
      lift = (skillsLayer.getBoundingClientRect().top - stage.getBoundingClientRect().top) / Math.max(1, stageH);
    }
    markEls.forEach((el, g) => {
      const p = plate.marks[g];
      if (!p || !on) {
        set(el, "opacity", "0");
        return;
      }
      v3.copy(p).project(camera);
      const fu = ((v3.x + 1) / 2 - c0) / crop;
      const fv = ((1 - v3.y) / 2 - c0) / crop;
      const inside = fu > 0.02 && fu < 0.98 && fv > 0.04 && fv < 0.98 ? 1 : 0;
      const x = frame.x0 + fu * (frame.x1 - frame.x0);
      const y = frame.y0 + fv * (frame.y1 - frame.y0);
      set(el, "left", pct(x));
      set(el, "top", pct(y - lift));
      set(el, "opacity", String(round(alpha * inside)));
      markBoxes[g] = { x0: round(x * 100), y0: round((y - lift) * 100), x1: round(x * 100), y1: round((y - lift) * 100) };
    });
  };

  const draw = (t: number, dt: number): void => {
    const k = current;
    const plate = world.plates[k];
    const cam = cameraAt(k, t);
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    camera.updateMatrixWorld();
    plate.tick(t, dt, camera);
    renderer.render(plate.scene, camera);
  };

  const scene: CanvasSource = {
    canvas: source,
    animated: true,
    update: (timeSec, dtSec) => {
      layout();
      const t = still ? STILL_T : timeSec;
      // Still: the picture only changes when the plate does, or the robot lands.
      if (still && !dirty) {
        placeMarks();
        return false;
      }
      draw(t, still ? 0 : Math.min(0.1, dtSec));
      placeMarks();
      dirty = false;
      return true;
    },
  };

  fitBars();
  layout();
  const bar: BarCanvas | null = createBarCanvas(bars, [{ type: "canvas", source: scene, config }], {
    colors: () => ({ bg: hexToRgb(BLOSSOM), fill: hexToRgb(BAND) }),
    defaults: { bgOpacity: 0 },
    fps: still ? 20 : 60,
  });
  if (!bar) {
    world.dispose();
    renderer.dispose();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw new Error("b11: bar canvas failed");
  }

  const sized = new ResizeObserver(() => {
    stageW = stage.clientWidth || window.innerWidth;
    stageH = stage.clientHeight || window.innerHeight;
    fitBars();
    if (current >= 0) sizePlate(current);
    dirty = true;
  });
  sized.observe(stage);

  const onVisibility = (): void => bar.setPaused(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);

  // ---------------------------------------------------- the dev handle
  const host = window as unknown as { __b11?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const rel = (el: HTMLElement | null): Box => {
      const s = stage.getBoundingClientRect();
      const b = el?.getBoundingClientRect();
      if (!b || !s.width) return { x0: 0, y0: 0, x1: 0, y1: 0 };
      return {
        x0: round(((b.left - s.left) / s.width) * 100),
        y0: round(((b.top - s.top) / s.height) * 100),
        x1: round(((b.right - s.left) / s.width) * 100),
        y1: round(((b.bottom - s.top) / s.height) * 100),
      };
    };
    handle = {
      goTo(i: number): void {
        const n = Math.max(0, Math.min(STOP_COUNT - 1, Math.round(i)));
        const y = journey.getBoundingClientRect().top + window.scrollY + STOPS[n] * stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      get state(): DevState {
        const k = phase.k;
        const c = k < PROJECT_COUNT ? caps[k] : null;
        const labels: Record<string, Box> = {};
        if (c) {
          labels.stack = rel(c.stack);
          labels.year = rel(c.year);
          labels.title = rel(c.title);
          labels.award = rel(c.award);
        }
        if (k === SKILLS_STOP) labels.skills = rel(root.querySelector<HTMLElement>("[data-skills-list]"));
        if (k === CONTACT_STOP) labels.email = rel(root.querySelector<HTMLElement>("[data-email]"));
        return {
          mode,
          u: round(u),
          stop: k,
          open: round(phase.open),
          raw: round(phase.raw),
          frame: { x0: round(frame.x0 * 100), y0: round(frame.y0 * 100), x1: round(frame.x1 * 100), y1: round(frame.y1 * 100) },
          crop: round(crop),
          grade: { blackPoint: round(Number(config.blackPoint)), whitePoint: round(Number(config.whitePoint)) },
          grid: { xSquares: Number(config.xSquares), ySquares: Number(config.ySquares) },
          robot: robotIn,
          labels,
          marks: markBoxes.slice(),
        };
      },
    };
    host.__b11 = handle;
  }

  return () => {
    sized.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    bar.destroy();
    world.dispose();
    renderer.dispose();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    source.width = 1;
    source.height = 1;
    if (handle && host.__b11 === handle) delete host.__b11;
  };
}
