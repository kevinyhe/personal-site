import { skillGroups } from "@/components/profile";
import * as L from "./layout";
import { createPainter, type Painter } from "./paint";
import { buildRoom, type Light, type Room } from "./scene";

/**
 * Joins the page to the room. Each frame it reads how far the page has
 * scrolled, turns that into stage time (whole numbers at the stops),
 * folds the screen to match, moves the camera, and fades the words for
 * the stop in view. Nothing here goes through React: it changes every
 * frame.
 *
 *   journey  the pinned scene, driven by scroll; the cursor moves the lamp.
 *   still    reduced motion or a narrow screen: one frame of the screen
 *            standing open, drawn once.
 */

export type Mode = "journey" | "still";

type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };
type Box = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: Mode;
  u: number;
  t: number;
  aspect: number;
  hinges: number[];
  psiDeg: number[];
  camera: L.Cam;
  /** Each panel's painted face on the stage, % from the top left, and whether its face is turned to the lens. */
  panels: { i: number; corners: { x: number; y: number; depth: number }[]; box: Box; facing: boolean }[];
  words: number[];
  painted: boolean;
};
type DevHandle = { goTo(i: number): void; at(t: number): void; readonly state: DevState };

const pct = (v: number): number => Math.round(v * 1000) / 10;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b28: ${selector} is missing`);
  return el;
}

/** Resolves once the mono face the seals and marks are set in has loaded, or after a second and a half either way. */
function monoIn(root: HTMLElement): Promise<string> {
  const family = getComputedStyle(need<HTMLElement>(root, '[data-font="mono"]')).fontFamily;
  const load = document.fonts ? document.fonts.load(`500 40px ${family}`).catch(() => []) : Promise.resolve([]);
  return Promise.race([load, new Promise<void>((done) => setTimeout(done, 1500))]).then(() => family);
}

/** Paints the faces and builds the room. Paints nothing and throws if WebGL cannot start. */
function begin(canvas: HTMLCanvasElement): { painter: Painter; room: Room } {
  const painter = createPainter(skillGroups);
  try {
    return { painter, room: buildRoom(canvas, painter.faces, painter.back) };
  } catch (error) {
    painter.dispose();
    throw error;
  }
}

function panelsOnStage(pose: L.Pose, cam: L.Cam, aspect: number): DevState["panels"] {
  const out: DevState["panels"] = [];
  for (let i = 0; i < L.PANELS; i += 1) {
    const cs = L.faceCorners(pose, i).map((p) => L.project(p, cam, aspect));
    const mid = L.panelPoint(pose, i, L.PANEL_W / 2, L.PANEL_H / 2);
    const facing = Math.sin(pose.psi[i]) * (cam.pos.x - mid.x) + Math.cos(pose.psi[i]) * (cam.pos.z - mid.z) > 0;
    out.push({
      i,
      corners: cs.map((s) => ({ x: pct(s.x), y: pct(s.y), depth: Math.round(s.depth * 100) / 100 })),
      box: {
        x0: pct(Math.min(...cs.map((s) => s.x))),
        y0: pct(Math.min(...cs.map((s) => s.y))),
        x1: pct(Math.max(...cs.map((s) => s.x))),
        y1: pct(Math.max(...cs.map((s) => s.y))),
      },
      facing,
    });
  }
  return out;
}

// ------------------------------------------------------------ still

export function startStill(root: HTMLElement): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const canvas = need<HTMLCanvasElement>(stage, "canvas[data-gl]");
  const { painter, room } = begin(canvas);
  let alive = true;
  let aspect = 1.85;
  const light: Light = { x: -0.7, y: 0.5, z: 0.6 };
  const draw = (): void => {
    if (!alive) return;
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    aspect = w / h;
    room.resize(w, h);
    const { pose, cam } = L.overview(aspect);
    const m = (pose.points[0].x + pose.points[L.PANELS].x) / 2;
    room.draw(pose, cam, light, m);
  };
  void monoIn(root).then((mono) => {
    if (!alive) return;
    painter.paint(mono);
    room.refresh();
    draw();
  });
  const sized = new ResizeObserver(draw);
  sized.observe(stage);
  draw();
  return () => {
    alive = false;
    sized.disconnect();
    room.dispose();
    painter.dispose();
  };
}

// ------------------------------------------------------------ journey

export function startJourney(root: HTMLElement): () => void {
  const journey = need<HTMLElement>(root, "[data-journey]");
  const stage = need<HTMLElement>(journey, "[data-stage]");
  const canvas = need<HTMLCanvasElement>(stage, "canvas[data-gl]");
  const scrim = stage.querySelector<HTMLElement>("[data-scrim]");
  const hint = stage.querySelector<HTMLElement>("[data-hint]");
  const words: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("[data-words]").forEach((el) => {
    words[Number(el.dataset.words)] = el;
  });
  const { painter, room } = begin(canvas);

  let alive = true;
  let painted = false;
  let stageH = 1;
  let aspect = 1.85;
  let u = 0;
  let t = 0;
  let dirty = true;
  let lastU = NaN;
  const pose = L.poseAt(0);
  const cam: L.Cam = { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
  // The lamp starts on the left, as the room is lit from one side. The
  // cursor swings it across; the lean is the cursor too, for the lens.
  const aim = { lx: -0.75, ly: 0, mx: 0, my: 0 };
  const now = { ...aim };
  const light: Light = { x: 0, y: 0, z: 0 };
  const lean = { x: 0, y: 0 };
  const shown: number[] = [];

  void monoIn(root).then((mono) => {
    if (!alive) return;
    painter.paint(mono);
    room.refresh();
    painted = true;
    dirty = true;
  });

  const onPointer = (e: PointerEvent): void => {
    const x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    aim.lx = L.clamp(x, -1, 1);
    aim.ly = L.clamp(y, -1, 1);
    aim.mx = aim.lx;
    aim.my = -aim.ly;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const setWords = (): void => {
    for (let k = 0; k < words.length; k += 1) {
      const el = words[k];
      if (!el) continue;
      const o = Math.round(L.wordsAt(t, k) * 1000) / 1000;
      if (shown[k] === o) continue;
      shown[k] = o;
      el.style.opacity = String(o);
      el.style.visibility = o < 0.01 ? "hidden" : "visible";
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      el.style.setProperty("--b28-rise", `${((1 - o) * 2.4).toFixed(3)}vh`);
    }
    // The scrim and the hint go as the screen opens flat for the contact stop.
    const away = 1 - L.clamp((t - 5.25) / 0.5, 0, 1);
    if (scrim) scrim.style.opacity = String(away);
    if (hint) hint.style.opacity = String(0.7 * away);
  };

  const frame = (): void => {
    u = -journey.getBoundingClientRect().top / stageH;
    let moving = false;
    for (const key of ["lx", "ly", "mx", "my"] as const) {
      const d = aim[key] - now[key];
      if (Math.abs(d) > 0.0015) {
        now[key] += d * 0.08;
        moving = true;
      } else now[key] = aim[key];
    }
    if (u === lastU && !dirty && !moving) return;
    lastU = u;
    dirty = false;
    t = L.stageAt(u);
    L.poseAt(t, pose);
    lean.x = now.mx;
    lean.y = now.my;
    L.cameraAt(t, pose, aspect, lean, cam);
    light.x = now.lx * 0.9;
    light.y = 0.5 - now.ly * 0.3;
    light.z = 0.6;
    room.draw(pose, cam, light, cam.look.x);
    setWords();
  };

  const measure = (): void => {
    const w = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = w / stageH;
    room.resize(w, stageH);
    dirty = true;
  };

  // ---------------------------------------------------------- the loop
  let raf = 0;
  let running = false;
  let onScreen = false;
  const tick = (): void => {
    raf = requestAnimationFrame(tick);
    frame();
  };
  // Draw only while the stage can be seen and the tab is the one in front.
  const sync = (): void => {
    const should = onScreen && !document.hidden && alive;
    if (should && !running) {
      running = true;
      dirty = true;
      raf = requestAnimationFrame(tick);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  const seen = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  seen.observe(stage);
  document.addEventListener("visibilitychange", sync);
  // Changing the canvas's size empties it, so draw at once.
  const sized = new ResizeObserver(() => {
    measure();
    frame();
  });
  sized.observe(stage);
  measure();
  frame();

  // ---------------------------------------------------- the dev handle
  const host = window as unknown as { __b28?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const scrollToU = (target: number): void => {
      const y = journey.getBoundingClientRect().top + window.scrollY + target * stageH;
      if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    handle = {
      goTo(i: number): void {
        scrollToU(L.STOP_U[L.clamp(Math.round(i), 0, L.LAST)]);
      },
      at(time: number): void {
        scrollToU(L.scrollFor(time));
      },
      get state(): DevState {
        return {
          mode: "journey",
          u: Math.round(u * 1000) / 1000,
          t: Math.round(t * 1000) / 1000,
          aspect,
          hinges: pose.hinges.map((h) => Math.round(h * 10) / 10),
          psiDeg: pose.psi.map((p) => Math.round((p * 1800) / Math.PI) / 10),
          camera: JSON.parse(JSON.stringify(cam)) as L.Cam,
          panels: panelsOnStage(pose, cam, aspect),
          words: shown.slice(),
          painted,
        };
      },
    };
    host.__b28 = handle;
  }

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pointermove", onPointer);
    if (handle && host.__b28 === handle) delete host.__b28;
    room.dispose();
    painter.dispose();
  };
}
