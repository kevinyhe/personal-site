import { BAND } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { type BarCanvas, type BarLayer, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import * as L from "./layout";
import { buildRelief, type Relief } from "./relief";

/**
 * Joins the page to the wall. Each frame it reads how far the page has
 * scrolled, places the camera, moves the light (on its own slow path,
 * pulled toward the cursor), draws the wall in grey, and lets the bar
 * dither turn that grey into plum bars on the pale ground. Then it fades
 * the words laid over the stage in and out.
 *
 * Nothing here goes through React. It all changes every frame.
 *
 *   journey  the pinned sequence, driven by scroll.
 *   still    one frame of the robot's panel, for a visitor who asked for
 *            less motion or a small screen. The words are plain blocks.
 */
export type Mode = "journey" | "still";

type Share = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: Mode;
  u: number;
  stop: number;
  aspect: number;
  grid: { cols: number; rows: number };
  camera: { x: number; z: number; yaw: number; vh: number; panel: number };
  light: { x: number; y: number; onStage: { x: number; y: number } };
  robot: string;
  titles: { shown: number; title: Share; block: Share; subject: Share }[];
  skills: number;
  contact: number;
};
type DevHandle = { goTo(i: number): void; light(x?: number, y?: number): void; readonly state: DevState };
type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };

/** The bar canvas never draws wider than this many pixels; past it the canvas is scaled up. */
const MAX_PIXELS_WIDE = 2560;
const MAX_RATIO = 1.5;
/** How hard the cursor pulls the light, 0 none, 1 all the way. */
const PULL = 0.8;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b19: ${selector} is missing`);
  return el;
}

const pct = (v: number): number => Math.round(v * 1000) / 10;

/** Starts the wall on the page. Returns what stops it. Throws, having tidied up, if it cannot start. */
export function startRelief(root: HTMLElement, mode: Mode): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const sans = getComputedStyle(root).fontFamily || "sans-serif";
  let relief: Relief | null = null;
  let bar: BarCanvas | null = null;
  let draw: (() => void) | null = null;
  const barEl = document.createElement("canvas");
  barEl.setAttribute("aria-hidden", "true");
  barEl.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;image-rendering:pixelated;transform-origin:0 0";

  const end = (): void => {
    bar?.destroy();
    bar = null;
    relief?.dispose();
    relief = null;
    barEl.remove();
  };

  try {
    relief = buildRelief(skillGroups, sans, () => draw?.());
    const source: CanvasSource = {
      canvas: relief.canvas,
      animated: mode === "journey",
      update: (_time, dt) => {
        frame(dt);
        return true;
      },
    };
    const layer: BarLayer = {
      type: "canvas",
      source,
      config: { x: 0, y: 0, width: "100%", height: "100%", xSquares: L.COLS, ySquares: L.rowsFor(1.85), threshold: L.THRESHOLD },
    };
    slot.appendChild(barEl);

    // ------------------------------------------------------------ state
    const journey = mode === "journey" ? need<HTMLElement>(root, "[data-journey]") : null;
    let stageW = 1;
    let stageH = 1;
    let aspect = 1.85;
    let time = 0;
    let u = 0;
    let shownRows = 0;
    const cam: L.Cam = { x: 0, y: 0, z: 1, yaw: 0, vh: 1, panel: 0 };
    const light = { x: 0.4, y: 0.2, set: false };
    const cursor = { x: 0.5, y: 0.5, inside: false };
    let pinned: { x: number; y: number } | null = null;

    const titles = journey
      ? projects.map((_, i) => ({ el: need<HTMLElement>(root, `[data-title="${i}"]`), shown: -1 }))
      : [];
    const count = journey ? need<HTMLElement>(root, "[data-count]") : null;
    const workLabel = journey ? need<HTMLElement>(root, "[data-work-label]") : null;
    const skillsLayer = journey ? need<HTMLElement>(root, "[data-skills-layer]") : null;
    const contact = journey ? need<HTMLElement>(root, "[data-contact]") : null;
    const hint = journey ? need<HTMLElement>(root, "[data-hint]") : null;
    const painted = { count: -1, label: -1, skills: -1, contact: -1, hint: -1 };

    const setOpacity = (el: HTMLElement, v: number, key: keyof typeof painted): void => {
      const q = Math.round(v * 100) / 100;
      if (painted[key] === q) return;
      painted[key] = q;
      el.style.opacity = String(q);
      el.style.pointerEvents = q > 0.6 ? "auto" : "none";
      el.style.visibility = q > 0 ? "visible" : "hidden";
    };

    const measure = (): void => {
      stageW = Math.max(1, stage.clientWidth);
      stageH = Math.max(1, stage.clientHeight);
      aspect = stageW / stageH;
      const rows = L.rowsFor(aspect);
      if (rows !== shownRows) {
        shownRows = rows;
        layer.config.ySquares = rows;
        relief?.resize(L.COLS * 2, rows * 2);
      }
      root.style.setProperty("--b19-sv", L.skillsVh(aspect).toFixed(4));
      // Past 2560 device pixels the bars are drawn smaller and scaled up.
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
      const s = Math.min(1, MAX_PIXELS_WIDE / (stageW * ratio));
      barEl.style.width = `${(s * 100).toFixed(3)}%`;
      barEl.style.height = `${(s * 100).toFixed(3)}%`;
      barEl.style.transform = s < 1 ? `scale(${(1 / s).toFixed(5)})` : "";
    };

    // ------------------------------------------------------- the frame
    function frame(dt: number): void {
      if (!relief) return;
      time += dt;
      if (journey) {
        u = -journey.getBoundingClientRect().top / stageH;
        L.cameraAt(u, aspect, cam);
      } else {
        Object.assign(cam, L.stillCamera(aspect));
        u = L.STOP_AT[L.ROBOT_PANEL];
      }
      const base = journey ? L.lightBase(cam, time, u) : { x: cam.x - 0.12, y: 0.3 };
      let tx = base.x;
      let ty = base.y;
      const at = pinned ?? (cursor.inside && journey ? cursor : null);
      if (at) {
        const w = L.toWall(at.x, at.y, cam, aspect);
        const pull = pinned ? 1 : PULL * (1 - 0.7 * L.dimAt(u));
        tx += (w.x - tx) * pull;
        ty += (L.clamp(w.y, -0.6, 0.6) - ty) * pull;
      }
      // Slow: the light drifts to where it is wanted over a second or two.
      const k = light.set && dt > 0 ? 1 - Math.exp(-dt * 1.6) : 1;
      if (light.set && dt === 0 && !pinned) {
        // A redraw with no time passing keeps the light where it was.
      } else {
        light.x += (tx - light.x) * k;
        light.y += (ty - light.y) * k;
      }
      light.set = true;
      relief.render({
        cam,
        light,
        dim: journey ? L.dimAt(u) : 0,
        lintel: journey ? L.lintelAt(u) : 1,
      });
      if (journey) words();
    }

    function words(): void {
      for (let i = 0; i < titles.length; i += 1) {
        const t = titles[i];
        const a = Math.round(L.titleAmount(i, u) * 100) / 100;
        if (a === t.shown) continue;
        t.shown = a;
        t.el.style.opacity = String(a);
        t.el.style.visibility = a > 0 ? "visible" : "hidden";
        t.el.style.pointerEvents = a > 0.6 ? "auto" : "none";
        t.el.style.transform = `translateY(calc(-50% + ${((1 - a) * 2).toFixed(2)}vh))`;
      }
      const stop = Math.min(L.WORK_PANELS - 1, Math.max(0, Math.round(cam.panel)));
      if (count && painted.count !== stop) {
        painted.count = stop;
        count.textContent = `${String(stop + 1).padStart(2, "0")} / ${String(projects.length).padStart(2, "0")}`;
      }
      if (workLabel) setOpacity(workLabel, 1 - L.smooth(5.0, 5.4, u), "label");
      if (skillsLayer) setOpacity(skillsLayer, L.skillsAmount(u), "skills");
      if (contact) setOpacity(contact, L.contactAmount(u), "contact");
      if (hint) setOpacity(hint, 0.7 * (1 - L.smooth(7.0, 7.5, u)), "hint");
    }

    // ------------------------------------------------------- the cursor
    const onPointer = (e: PointerEvent): void => {
      const r = stage.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      cursor.x = (e.clientX - r.left) / r.width;
      cursor.y = (e.clientY - r.top) / r.height;
      cursor.inside = cursor.x >= 0 && cursor.x <= 1 && cursor.y >= 0 && cursor.y <= 1;
    };
    const onLeave = (): void => {
      cursor.inside = false;
    };

    // --------------------------------------------------------- drawing
    measure();
    frame(0);
    bar = createBarCanvas(barEl, [layer], {
      fps: 60,
      colors: () => ({ bg: hexToRgb(L.PALE), fill: hexToRgb(BAND) }),
      visibleRootMargin: "0px",
    });
    if (!bar) throw new Error("b19: the bar dither could not start");
    // Listeners only once nothing below can throw, so a failed start leaves none behind.
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    // A still page draws when something changes, not every frame.
    draw = () => {
      if (!bar || !relief) return;
      frame(0);
      bar.redraw();
    };
    const sized = new ResizeObserver(() => {
      measure();
      if (mode === "still") draw?.();
    });
    sized.observe(stage);
    const fonts = (): void => {
      relief?.redrawSkills(getComputedStyle(root).fontFamily || sans);
      if (mode === "still") draw?.();
    };
    void document.fonts.ready.then(fonts);
    void bar.loaded.then(() => {
      if (mode === "still") draw?.();
    });
    const onVisibility = (): void => bar?.setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    // ---------------------------------------------------- the dev handle
    const host = window as unknown as { __b19?: DevHandle; __lenis?: LenisLike };
    let handle: DevHandle | null = null;
    if (process.env.NODE_ENV === "development") {
      const shareOf = (el: Element): Share => {
        const s = stage.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return { x0: pct((b.left - s.left) / s.width), y0: pct((b.top - s.top) / s.height), x1: pct((b.right - s.left) / s.width), y1: pct((b.bottom - s.top) / s.height) };
      };
      const round = (r: L.Rect): Share => ({ x0: pct(r.x0), y0: pct(r.y0), x1: pct(r.x1), y1: pct(r.y1) });
      handle = {
        goTo(i: number): void {
          if (!journey) return;
          const stop = L.STOP_AT[L.clamp(Math.round(i), 0, L.STOP_AT.length - 1)];
          const y = journey.getBoundingClientRect().top + window.scrollY + stop * stageH;
          if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
          else window.scrollTo(0, y);
        },
        // x, y: a place on the stage as shares, 0..1 from its top left.
        // Holds the light there until called with nothing.
        light(x?: number, y?: number): void {
          pinned = x === undefined || y === undefined ? null : { x, y };
          if (pinned) {
            light.set = false;
            draw?.();
          }
        },
        get state(): DevState {
          const onStage = L.project(light.x, light.y, 0, cam, aspect);
          return {
            mode,
            u: Math.round(u * 1000) / 1000,
            stop: L.stopAt(u),
            aspect: Math.round(aspect * 1000) / 1000,
            grid: { cols: L.COLS, rows: L.rowsFor(aspect) },
            camera: { x: cam.x, z: cam.z, yaw: cam.yaw, vh: cam.vh, panel: cam.panel },
            light: { x: light.x, y: light.y, onStage: { x: pct(onStage.x), y: pct(onStage.y) } },
            robot: relief?.robotState() ?? "gone",
            titles: titles.map((t, i) => {
              const px = L.panelX(i);
              const s = L.SUBJECT[i];
              return {
                shown: t.shown,
                title: shareOf(need(t.el, "h3")),
                block: shareOf(t.el),
                subject: round(L.projectRect({ x0: px + s.x0, y0: s.y0, x1: px + s.x1, y1: s.y1 }, 0, L.DEPTH, cam, aspect)),
              };
            }),
            skills: painted.skills,
            contact: painted.contact,
          };
        },
      };
      host.__b19 = handle;
    }

    return () => {
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      sized.disconnect();
      draw = null;
      if (handle && host.__b19 === handle) delete host.__b19;
      end();
    };
  } catch (error) {
    end();
    throw error;
  }
}
