import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import { type BarLayer, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { createBirds } from "@/components/valley/sources/birds";
import * as L from "./layout";
import { buildMap } from "./scene";

/**
 * Drives the map from the page: reads the scroll, moves the camera, and
 * keeps the pins, cards, village names and the small map in step.
 *
 * journey  the pinned walk: scroll moves the camera from shrine to shrine,
 *          up over the valley for the skills, and off the north edge for
 *          the email.
 * still    one frame of the whole valley, nothing moving.
 *
 * Everything runs inside the bar engine's own frame loop, which only
 * turns while its canvas is on screen and the tab is in front.
 */

export type MapMode = "journey" | "still";

type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };

type DevState = {
  mode: MapMode;
  u: number;
  k: number;
  stop: number;
  grid: { cols: number; rows: number };
  camera: { target: number[]; position: number[]; dist: number; pitchDeg: number; yaw: number };
  precincts: { x: string; y: string; depth: number }[];
  pins: { x: string; y: string; shown: number }[];
  card: { x0: string; y0: string; x1: string; y1: string } | null;
  minimapDot: { x: number; z: number };
  rise: number;
  skills: number;
  contact: number;
};
type DevHandle = { goTo(i: number): void; readonly state: DevState };

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

export function startMap(root: HTMLElement, mode: MapMode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("[data-bars]");
  if (!stage || !bars) throw new Error("b12: stage missing");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  const all = <T extends Element>(sel: string): T[] => Array.from(root.querySelectorAll<T>(sel));
  const pins = all<HTMLElement>("[data-pin]");
  const cards = all<HTMLElement>("[data-card]");
  const villageLabels = all<HTMLElement>("[data-village]");
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const chrome = all<HTMLElement>("[data-chrome]");
  const dot = root.querySelector<SVGCircleElement>("[data-mm-dot]");
  const mmButtons = all<HTMLButtonElement>("[data-mm-stop]");

  const scene = buildMap();

  // ------------------------------------------------------------ sizes
  let W = Math.max(2, stage.clientWidth);
  let H = Math.max(2, stage.clientHeight);
  let aspect = W / H;
  const gridFor = (): { cols: number; rows: number } => {
    const cols = W >= 1100 ? 240 : 170;
    return { cols, rows: Math.max(10, Math.round((cols * H) / W)) };
  };
  let grid = gridFor();
  scene.setGrid(grid.cols, grid.rows);

  // The bars are never drawn more than 2560 device pixels wide: past that
  // the canvas is laid out smaller and scaled up to fill the stage.
  const fitBars = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const s = Math.min(1, 2560 / (W * ratio));
    bars.style.width = `${s * 100}%`;
    bars.style.height = `${s * 100}%`;
    bars.style.transform = s < 1 ? `scale(${1 / s})` : "";
    bars.style.transformOrigin = "0 0";
  };
  fitBars();

  const mapConfig = { x: 0, y: 0, width: "100%", height: "100%", xSquares: grid.cols, ySquares: grid.rows };
  // The birds are drawn light on black and graded upside down, as the
  // valley draws them: a light bird is a wide bar.
  const birdBox = { w: 0.34, h: 0.22 };
  const birdsConfig = {
    x: mode === "journey" ? "-34%" : "58%",
    y: "5%",
    width: `${birdBox.w * 100}%`,
    height: `${birdBox.h * 100}%`,
    xSquares: Math.round(grid.cols * birdBox.w),
    ySquares: Math.round(grid.rows * birdBox.h),
    blackPoint: 255,
    whitePoint: 0,
  };
  const birdsLive = createBirds({ seed: 1217, width: 480, height: Math.round((480 * birdBox.h * H) / (birdBox.w * W)), count: 7 });
  const birds: CanvasSource =
    mode === "journey"
      ? birdsLive
      : { canvas: birdsLive.canvas, animated: false, ready: Promise.resolve(), dispose: birdsLive.dispose };

  // ------------------------------------------------------------ state
  const scrollU = (): number => {
    if (!journey) return 0;
    return L.clamp(-journey.getBoundingClientRect().top / Math.max(1, H), 0, L.END_U);
  };
  let u = mode === "journey" ? scrollU() : 0;
  let state: L.State = mode === "journey" ? L.stateAt(u, aspect) : L.stillState(aspect);
  let lastU = -1;
  let lastDraw = -Infinity;
  let dirty = true;

  // Only what changed is written, so a still scroll costs no layout.
  const shown = new Map<Element, string>();
  const put = (el: Element, key: string, value: string, write: () => void): void => {
    const tag = `${key}:${value}`;
    if (shown.get(el) === tag) return;
    shown.set(el, tag);
    write();
  };
  const fade = (el: HTMLElement, amount: number, interactive = false): void => {
    const o = amount.toFixed(3);
    put(el, "o", o, () => {
      el.style.opacity = o;
      el.style.visibility = amount > 0.001 ? "visible" : "hidden";
      if (interactive) el.style.pointerEvents = amount > 0.6 ? "auto" : "none";
    });
  };
  // Where things are placed is kept apart from how faded they are: both
  // are written to one element.
  const shownPos = new Map<Element, string>();
  const placeOnce = (el: HTMLElement, x: number, y: number): void => {
    const pos = `${pct(x)},${pct(y)}`;
    if (shownPos.get(el) === pos) return;
    shownPos.set(el, pos);
    el.style.left = pct(x);
    el.style.top = pct(y);
  };

  const paintDom = (): void => {
    const cam = state.cam;
    pins.forEach((pin, i) => {
      const s = L.project(L.pinPoint(i), cam, aspect);
      const amount = s.depth > L.NEAR ? state.cards[i] : 0;
      placeOnce(pin, s.x, s.y);
      fade(pin, amount);
    });
    if (mode === "journey") {
      cards.forEach((card, i) => fade(card, state.cards[i], true));
      if (skillsLayer) fade(skillsLayer, state.skills, true);
      if (contactLayer) fade(contactLayer, state.contact, true);
      for (const el of chrome) fade(el, state.chrome, true);
      mmButtons.forEach((b, i) => {
        const current = String(i === state.stop);
        put(b, "c", current, () => b.setAttribute("aria-current", i === state.stop ? "step" : "false"));
      });
      if (dot) {
        const t = cam.target;
        const at = `${t[0].toFixed(1)},${t[2].toFixed(1)}`;
        put(dot, "d", at, () => {
          dot.setAttribute("cx", t[0].toFixed(2));
          dot.setAttribute("cy", t[2].toFixed(2));
        });
      }
    }
    villageLabels.forEach((label, i) => {
      const s = L.project(L.villageLabelPoint(i, skillGroups[i]?.skills.length ?? 6), cam, aspect);
      placeOnce(label, s.x, s.y);
      fade(label, mode === "journey" ? state.skills : 1);
    });
  };

  const draw = (time: number): void => {
    scene.render(state, aspect, time);
    lastDraw = time;
    dirty = false;
  };

  // The bar engine calls this every frame it draws. Returning false says
  // the picture did not change, and the upload is skipped.
  const tick = (time: number): boolean => {
    u = scrollU();
    if (u !== lastU) {
      lastU = u;
      state = L.stateAt(u, aspect);
      dirty = true;
      paintDom();
    }
    birdsConfig.x = `${(-34 + ((time * 2.2) % 168)).toFixed(2)}%`;
    // Still, the map redraws ten times a second for the cloud shadows.
    if (!dirty && time - lastDraw < 0.1) return false;
    draw(time);
    return true;
  };

  // The first picture is in the canvas before the engine takes it.
  draw(0);
  paintDom();

  const mapSource: CanvasSource = {
    canvas: scene.canvas,
    animated: mode === "journey",
    ready: Promise.resolve(),
    update: mode === "journey" ? (time: number) => tick(time) : undefined,
    dispose: () => undefined,
  };
  const layers: BarLayer[] = [
    { type: "canvas", source: mapSource, config: mapConfig },
    { type: "canvas", source: birds, config: birdsConfig },
  ];
  const engine = createBarCanvas(bars, layers, {
    colors: () => ({ bg: hexToRgb(BLOSSOM), fill: hexToRgb(BAND) }),
    visibleRootMargin: "0px",
    fps: 60,
  });
  if (!engine) {
    birdsLive.dispose?.();
    scene.dispose();
    throw new Error("b12: the bar engine could not start");
  }

  const resized = new ResizeObserver(() => {
    const w = Math.max(2, stage.clientWidth);
    const h = Math.max(2, stage.clientHeight);
    if (w === W && h === H) return;
    W = w;
    H = h;
    aspect = W / H;
    grid = gridFor();
    scene.setGrid(grid.cols, grid.rows);
    mapConfig.xSquares = grid.cols;
    mapConfig.ySquares = grid.rows;
    birdsConfig.xSquares = Math.round(grid.cols * birdBox.w);
    birdsConfig.ySquares = Math.round(grid.rows * birdBox.h);
    fitBars();
    state = mode === "journey" ? L.stateAt(scrollU(), aspect) : L.stillState(aspect);
    lastU = -1;
    shown.clear();
    shownPos.clear();
    draw(lastDraw === -Infinity ? 0 : lastDraw);
    paintDom();
    // A still engine has no loop; ask it to take the new picture.
    engine.redraw();
  });
  resized.observe(stage);

  // Clicking a number on the small map scrolls to that shrine.
  const host = window as unknown as { __b12?: DevHandle; __lenis?: LenisLike };
  const scrollToU = (target: number, immediate: boolean): void => {
    if (!journey) return;
    const y = journey.getBoundingClientRect().top + window.scrollY + target * H;
    if (host.__lenis) host.__lenis.scrollTo(y, { immediate });
    else window.scrollTo({ top: y, behavior: immediate ? "auto" : "smooth" });
  };
  const onJump = (e: Event): void => {
    const i = Number((e.currentTarget as HTMLElement).dataset.mmStop);
    if (Number.isFinite(i)) scrollToU(L.STOP_U[i], false);
  };
  for (const b of mmButtons) b.addEventListener("click", onJump);

  // ------------------------------------------------------- dev handle
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    handle = {
      // 0 to 4: the shrines. 5: the skills. 6: the email.
      goTo(i: number): void {
        const n = Math.round(i);
        scrollToU(n <= 4 ? L.STOP_U[Math.max(0, n)] : n === 5 ? L.SKILLS_U : L.CONTACT_U, true);
      },
      get state(): DevState {
        const cam = state.cam;
        const p = L.camPosition(cam);
        const box = stage.getBoundingClientRect();
        const visibleCard = cards.find((c, i) => state.cards[i] > 0.5);
        const r = visibleCard?.getBoundingClientRect();
        return {
          mode,
          u: Math.round(u * 1000) / 1000,
          k: Math.round(state.k * 1000) / 1000,
          stop: state.stop,
          grid,
          camera: {
            target: cam.target.map((v) => Math.round(v * 10) / 10),
            position: p.map((v) => Math.round(v * 10) / 10),
            dist: Math.round(cam.dist * 10) / 10,
            pitchDeg: Math.round((cam.pitch * 180) / Math.PI),
            yaw: Math.round(cam.yaw * 100) / 100,
          },
          precincts: L.PRECINCTS.map((_, i) => {
            const s = L.project(L.precinctPoint(i), cam, aspect);
            return { x: pct(s.x), y: pct(s.y), depth: Math.round(s.depth) };
          }),
          pins: L.PRECINCTS.map((_, i) => {
            const s = L.project(L.pinPoint(i), cam, aspect);
            return { x: pct(s.x), y: pct(s.y), shown: state.cards[i] };
          }),
          card: r
            ? {
                x0: pct((r.left - box.left) / box.width),
                y0: pct((r.top - box.top) / box.height),
                x1: pct((r.right - box.left) / box.width),
                y1: pct((r.bottom - box.top) / box.height),
              }
            : null,
          minimapDot: { x: Math.round(cam.target[0]), z: Math.round(cam.target[2]) },
          rise: state.rise,
          skills: state.skills,
          contact: state.contact,
        };
      },
    };
    host.__b12 = handle;
  }

  return () => {
    resized.disconnect();
    for (const b of mmButtons) b.removeEventListener("click", onJump);
    // The engine disposes the birds; the map's scene is ours.
    engine.destroy();
    scene.dispose();
    if (handle && host.__b12 === handle) delete host.__b12;
  };
}
