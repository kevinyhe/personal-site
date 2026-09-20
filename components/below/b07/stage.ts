import { Scene } from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import type { DeskControls } from "./Desktop";
import { ARRIVE, clamp, MOVE_SCREENS, PANEL, panelSize, SCREEN } from "./rig";
import { buildRoom } from "./room";

/**
 * Joins the page to the room. Each frame it reads how far the page has
 * scrolled, moves the camera, and lays the desktop over the television's
 * screen so the two move as one.
 *
 * Nothing here goes through React. It changes every frame.
 */

type Lenis = { scrollTo(target: number | HTMLElement, options?: { immediate?: boolean; force?: boolean }): void };
type Handle = {
  goTo(t: number): void;
  open(name: string): void;
  readonly state: { t: number; screens: number; live: boolean; open: string[]; front: string | null };
  screenCorners(): { x: number; y: number }[];
};
type DevWindow = Window & { __lenis?: Lenis; __b07?: Handle };

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b07: ${selector} is missing`);
  return el;
}

/** The canvas is made here and thrown away at the end. In development
 *  React starts every effect twice, and a canvas whose context was let go
 *  the first time cannot be given a new one. */
function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  // Clicks go through the canvas to the desktop behind it.
  canvas.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none";
  return canvas;
}

/** One still frame, drawn again when the window changes or a model lands. */
export function startStill(root: HTMLElement): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const canvas = makeCanvas();
  const room = buildRoom(canvas, true);
  slot.appendChild(canvas);
  let alive = true;
  const draw = (): void => {
    if (!alive) return;
    room.resize(stage.clientWidth, stage.clientHeight);
    room.still();
  };
  draw();
  const watcher = new ResizeObserver(draw);
  watcher.observe(stage);
  // The models and their pictures land over the next few seconds. There
  // is no frame loop here, so look again a few times and then stop.
  const timers = [300, 900, 1800, 3200, 6000].map((ms) => window.setTimeout(draw, ms));
  void room.ready.then(draw);
  return () => {
    alive = false;
    watcher.disconnect();
    for (const id of timers) window.clearTimeout(id);
    room.dispose();
    canvas.remove();
  };
}

/** The pinned move in. `host` is the element the desktop is drawn into. */
export function startMoveIn(root: HTMLElement, host: HTMLElement, controls: () => DeskControls | null): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const behind = need<HTMLElement>(stage, "[data-behind]");
  const track = need<HTMLElement>(root, "[data-track]");
  const hint = need<HTMLElement>(root, "[data-hint]");

  const canvas = makeCanvas();
  const room = buildRoom(canvas, false);
  slot.appendChild(canvas);

  // The desktop, placed in the room by the browser's own 3D transforms.
  const css = new CSS3DRenderer();
  css.domElement.style.position = "absolute";
  css.domElement.style.inset = "0";
  behind.appendChild(css.domElement);
  const cssScene = new Scene();
  const sheet = new CSS3DObject(host);
  sheet.position.set(SCREEN.cx, SCREEN.cy, PANEL.z);
  cssScene.add(sheet);
  // Text on the desktop can be selected like any other.
  host.style.userSelect = "";
  host.style.overflow = "hidden";

  let live = false;
  const setLive = (on: boolean): void => {
    live = on;
    // Far away the desktop is too small to read. It must not take a
    // click or the keyboard until the camera is seated.
    host.inert = !on;
    host.style.pointerEvents = on ? "auto" : "none";
    host.dataset.live = on ? "true" : "false";
  };
  setLive(false);

  let stageW = 1;
  let stageH = 1;
  const measure = (): void => {
    stageW = Math.max(2, stage.clientWidth);
    stageH = Math.max(2, stage.clientHeight);
    room.resize(stageW, stageH);
    css.setSize(stageW, stageH);
    // Sized so that, seated, one of its pixels is one of the window's.
    // These four are in pixels because they are measured from the
    // window, not designed.
    const size = panelSize(stageW, stageH);
    host.style.width = `${size.w.toFixed(2)}px`;
    host.style.height = `${size.h.toFixed(2)}px`;
    host.style.setProperty("--b07-safe-w", `${stageW}px`);
    host.style.setProperty("--b07-safe-h", `${stageH}px`);
    sheet.scale.setScalar(1 / size.perMetre);
  };

  let time = 0;
  let t = 0;
  let screens = 0;
  let before = -1;
  let leanX = 0;
  let leanY = 0;
  let wantX = 0;
  let wantY = 0;
  let hintShown = true;
  let restingOn = -1;

  const frame = (dt: number, redraw = false): void => {
    time += dt;
    screens = -track.getBoundingClientRect().top / stageH;
    t = clamp(screens / MOVE_SCREENS, 0, 1);
    const ease = 1 - Math.exp(-dt * 4);
    leanX += (wantX - leanX) * ease;
    leanY += (wantY - leanY) * ease;
    // Seated, with the cursor still, the screen covers the whole view and
    // nothing drawn changes. Stop drawing until something does.
    const resting = t >= 1 && Math.abs(wantX - leanX) < 0.002 && Math.abs(wantY - leanY) < 0.002;
    if (redraw || !resting || restingOn !== room.version()) {
      room.frame(t, time, dt, leanX, leanY);
      css.render(cssScene, room.camera);
      restingOn = resting ? room.version() : -1;
    }

    const seated = t >= 1;
    if (seated !== live) setLive(seated);

    // Each window opens by itself when the page passes its place going
    // down. It is asked once per pass, so closing one by hand holds.
    const desk = controls();
    if (desk) {
      for (const name of ["work", "skills", "contact"] as const) {
        if (before < ARRIVE[name] && screens >= ARRIVE[name]) desk.open(name, false);
      }
      before = screens;
    }

    const show = screens < 0.25;
    if (show !== hintShown) {
      hintShown = show;
      hint.style.opacity = show ? "0.8" : "0";
    }
  };

  let raf = 0;
  let running = false;
  let onScreen = false;
  let last = 0;
  let alive = true;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    frame(dt);
  };
  // Draw only while the stage can be seen and the tab is the one in front.
  const sync = (): void => {
    const should = onScreen && !document.hidden;
    if (should && !running) {
      running = true;
      last = performance.now();
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

  // Changing the canvas's size empties it. Draw at once.
  const sized = new ResizeObserver(() => {
    measure();
    frame(0, true);
  });
  sized.observe(stage);
  measure();

  const onPointer = (e: PointerEvent): void => {
    wantX = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
    wantY = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const win = window as DevWindow;
  const scrollPage = (to: number | HTMLElement): void => {
    if (win.__lenis) win.__lenis.scrollTo(to, { immediate: true, force: true });
    else if (typeof to === "number") window.scrollTo(0, to);
    else to.scrollIntoView();
  };

  // The page was laid out differently when the browser first looked for
  // the part named in the address. Go there again now.
  const named = /^#(work|skills|contact)$/.test(window.location.hash) ? root.querySelector<HTMLElement>(window.location.hash) : null;
  const settle = named
    ? window.setTimeout(() => {
        if (alive) scrollPage(named);
      }, 60)
    : 0;

  if (process.env.NODE_ENV !== "production") {
    win.__b07 = {
      goTo: (to: number): void => {
        const top = window.scrollY + track.getBoundingClientRect().top;
        scrollPage(top + clamp(to, 0, 1) * MOVE_SCREENS * stageH);
        frame(0, true);
      },
      open: (name: string): void => controls()?.open(name, false),
      get state() {
        const desk = controls()?.state() ?? { open: [], front: null };
        return { t, screens, live, open: desk.open, front: desk.front };
      },
      screenCorners: () => room.corners().map((c) => ({ x: c.x, y: c.y })),
    };
  }

  // One frame now, so the stage is never an empty canvas while it waits
  // for the observer to say it is on screen.
  frame(0, true);

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    window.clearTimeout(settle);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pointermove", onPointer);
    if (win.__b07) delete win.__b07;
    // Taking the sheet out of its scene takes the host out of the page.
    cssScene.remove(sheet);
    css.domElement.remove();
    room.dispose();
    canvas.remove();
  };
}
