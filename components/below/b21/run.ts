import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import {
  BLOCK_X,
  cardAt,
  contactAt,
  GO_TO,
  holdAt,
  introAt,
  PLACES,
  placeMid,
  project,
  S_END,
  skillsAt,
  STOPS,
  textBox,
  toWorld,
  type View,
  villageBlocks,
  villageLitAt,
  villageMid,
  VILLAGES,
  viewAt,
} from "./layout";
import { buildIsland } from "./scene";

/**
 * Drives the island from the page's scroll and the pointer. The bar
 * shader's own frame loop calls back here once a frame while the stage
 * is on screen: read the scroll, turn the island, place the camera, draw,
 * set the words. Nothing runs while the stage is off screen or the tab is
 * hidden, because the bar shader stops its loop then.
 *
 * The island's turn is the scroll's turn plus a free part. The free part
 * is what a drag adds, with some carry after release, and a slow turn of
 * its own where nothing needs to be read. Where words are on screen (a
 * project stop, the skills) the free part eases back to none a moment
 * after the last drag, so the place comes back beside its words.
 */

export type Mode = "diorama" | "still";

const X_SQUARES = 260;
const MAX_BAR_W = 2560;
/** How far one screen-width of drag turns the island, in radians. */
const DRAG_TURN = 3.2;
/** How far one screen-height of drag tilts it, and the most it tilts. */
const DRAG_TILT = 1.2;
const TILT_MAX = 0.3;
/** The island's own turn, in radians a second: a full turn in about two minutes. */
const AUTO_TURN = 0.055;
/** Seconds after a drag before the island eases back at a stop. */
const SETTLE_AFTER = 1.2;
const TAU = Math.PI * 2;

type Handle = { goTo(i: number): void; turn(rad: number): void; readonly state: unknown };

export function startDiorama(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b21: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const scrims = Array.from(root.querySelectorAll<HTMLElement>("[data-scrim]"));
  const intro = root.querySelector<HTMLElement>("[data-intro]");
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-block]"));
  const leaders = Array.from(root.querySelectorAll<SVGLineElement>("[data-leader]"));
  const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return 0;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(S_END, -journey.getBoundingClientRect().top / h));
  };

  // Styles are written only when they change, so a still scroll costs no style work.
  const written = new WeakMap<Element, Record<string, string>>();
  const set = (el: HTMLElement | null | undefined, key: string, value: string): void => {
    if (!el) return;
    const rec = written.get(el) ?? {};
    if (rec[key] === value) return;
    rec[key] = value;
    written.set(el, rec);
    el.style.setProperty(key, value);
  };
  const attr = (el: Element | undefined, key: string, value: string): void => {
    if (!el) return;
    const rec = written.get(el) ?? {};
    if (rec[key] === value) return;
    rec[key] = value;
    written.set(el, rec);
    el.setAttribute(key, value);
  };

  // ------------------------------------------------------------ the drag
  let free = 0;
  let spinVel = 0;
  let tilt = 0;
  let dragging = false;
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let lastAt = 0;
  let touchedAt = -Infinity;

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || dragging) return;
    // A link under the pointer keeps its click.
    if ((e.target as Element | null)?.closest?.("a")) return;
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    lastAt = performance.now();
    spinVel = 0;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that has already gone cannot be captured; the drag still works.
    }
    stage.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== pointerId) return;
    const now = performance.now();
    const d = ((e.clientX - lastX) / Math.max(1, stage.clientWidth)) * DRAG_TURN;
    free += d;
    tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, tilt + ((e.clientY - lastY) / Math.max(1, stage.clientHeight)) * DRAG_TILT));
    const dt = Math.max(1, now - lastAt) / 1000;
    spinVel = Math.max(-4, Math.min(4, spinVel * 0.6 + (d / dt) * 0.4));
    lastX = e.clientX;
    lastY = e.clientY;
    lastAt = now;
    touchedAt = now;
  };
  const onUp = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    // A pointer that stopped before it let go carries no spin.
    if (performance.now() - lastAt > 80) spinVel = 0;
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    stage.style.cursor = "";
    touchedAt = performance.now();
  };

  // ------------------------------------------------------------- frames
  let s = 0;
  let view: View = viewAt(0, aspect());
  let lastLift: number[] = [0, 0, 0, 0, 0];

  const blockAt = (a: number) => villageBlocks(a);
  let layout = blockAt(aspect());
  const placeBlocks = (): void => {
    layout = blockAt(aspect());
    for (const b of layout) {
      const el = blocks[b.v];
      set(el, "left", `${((b.side < 0 ? BLOCK_X.left : BLOCK_X.right) * 100).toFixed(2)}%`);
      set(el, "top", `${(b.top * 100).toFixed(2)}%`);
    }
  };

  const placeWords = (): void => {
    const a = aspect();
    cards.forEach((el, k) => {
      const v = still ? 0 : cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(calc(-50% + ${((1 - v) * 1.5).toFixed(2)}vh))`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
    });
    scrims.forEach((el) => {
      // The left scrim darkens behind words on the left, which go with a place on the right.
      const want = el.dataset.scrim === "left" ? 1 : -1;
      let v = 0;
      PLACES.forEach((p, k) => {
        if (p.side === want) v = Math.max(v, cardAt(k, s));
      });
      set(el, "opacity", (still ? 0 : v).toFixed(3));
    });
    set(intro, "opacity", (still ? 1 : introAt(s)).toFixed(3));
    const sk = still ? 0 : skillsAt(s);
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    if (sk > 0.001) {
      for (const b of layout) {
        const p = project(view, toWorld(villageMid(b.v), view.yaw, view.drop), a);
        const x0 = (b.side < 0 ? BLOCK_X.left + BLOCK_X.w : BLOCK_X.right) * 100;
        const y0 = (b.top + 0.02) * 100;
        const line = leaders[b.v];
        attr(line, "x1", x0.toFixed(2));
        attr(line, "y1", y0.toFixed(2));
        attr(line, "x2", (p.x * 100).toFixed(2));
        attr(line, "y2", (p.y * 100).toFixed(2));
        set(dots[b.v], "left", `${(p.x * 100).toFixed(2)}%`);
        set(dots[b.v], "top", `${(p.y * 100).toFixed(2)}%`);
      }
    }
    const c = still ? 0 : contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "visibility", c > 0.001 ? "visible" : "hidden");
  };

  const drawAt = (time: number): void => {
    lastLift = STOPS.map((_, k) => (still ? 0 : cardAt(k, s)));
    island.draw({
      ...view,
      tilt,
      bob: still ? 0 : Math.sin(time * 0.6) * 0.12,
      time,
      lift: lastLift,
      lit: VILLAGES.map((_, v) => (still ? 1 : villageLitAt(v, s))),
    });
  };

  const tick = (time: number, dt: number): void => {
    s = scrollS();
    const hold = holdAt(s);
    if (!dragging) {
      free += spinVel * dt;
      spinVel *= Math.exp(-dt * 3);
      free += AUTO_TURN * dt * (1 - hold);
      // Kept within half a turn either way, so easing back is never more than that.
      if (free > Math.PI) free -= TAU;
      if (free < -Math.PI) free += TAU;
      if (hold > 0 && (performance.now() - touchedAt) / 1000 > SETTLE_AFTER) {
        free -= free * (1 - Math.exp(-dt * 1.4 * hold));
      }
      tilt *= Math.exp(-dt * 1.2);
    }
    const base = viewAt(s, aspect());
    view = { ...base, yaw: base.yaw + free };
    drawAt(time);
    placeWords();
  };

  const glCanvas = document.createElement("canvas");
  const island = buildIsland(glCanvas, { animated: !still, update: still ? undefined : tick });
  island.resize(aspect());

  // The bar canvas is never drawn more than MAX_BAR_W device pixels wide.
  // On a wider screen it is drawn smaller and scaled up to fill the stage.
  const fitBars = (): void => {
    const want = stage.clientWidth * Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.max(1, want / MAX_BAR_W);
    bars.style.width = `${(100 / k).toFixed(4)}%`;
    bars.style.height = `${(100 / k).toFixed(4)}%`;
    bars.style.transformOrigin = "0 0";
    bars.style.transform = k > 1 ? `scale(${k.toFixed(4)})` : "";
  };
  fitBars();

  const config: BarLayerConfig = {
    x: 0,
    y: 0,
    width: "100%",
    height: "100%",
    // Upside down, as the band above reads its robot: a bright grey is a
    // wide blossom bar on the plum. The bar is capped under its cell so a
    // bright mass stays a run of lines rather than one block.
    blackPoint: 240,
    whitePoint: 10,
    threshold: 255,
    xSquares: X_SQUARES,
    ySquares: Math.round(X_SQUARES / aspect()),
    minSquareWidth: "-2%",
    maxSquareWidth: "82%",
    bgOpacity: 1,
    fillOpacity: 1,
  };
  const bar = createBarCanvas(bars, [{ type: "canvas", source: island.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    fps: 60,
  });
  if (!bar) {
    island.dispose();
    throw new Error("b21: bar shader could not start");
  }

  // The still frame: the whole island, lanterns lit.
  const drawStill = (): void => {
    s = 0;
    view = viewAt(0, aspect());
    drawAt(4);
    bar.redraw();
  };
  let alive = true;
  if (still) {
    drawStill();
    // The robot arrives after the first frame; draw it once more when it has.
    void island.robot.then((ok) => {
      if (ok && alive) drawStill();
    });
  }

  const resizer = new ResizeObserver(() => {
    fitBars();
    island.resize(aspect());
    config.ySquares = Math.round(X_SQUARES / aspect());
    placeBlocks();
    if (still) drawStill();
  });
  resizer.observe(stage);

  if (!still) {
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
  }
  placeBlocks();
  placeWords();

  const dev = process.env.NODE_ENV !== "production";
  const w = window as unknown as { __b21?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b21 = {
      goTo(i: number) {
        if (!journey) return;
        const k = Math.max(0, Math.min(GO_TO.length - 1, Math.round(i)));
        const top = window.scrollY + journey.getBoundingClientRect().top;
        const y = top + GO_TO[k] * stage.clientHeight;
        if (w.__lenis) w.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
      turn(rad: number) {
        free += rad;
        spinVel = 0;
        // Counts as a drag, so a stop waits before easing back.
        touchedAt = performance.now();
      },
      get state() {
        const a = aspect();
        return {
          mode,
          s,
          free,
          tilt,
          view,
          stops: { projects: [...STOPS], skills: GO_TO[5], contact: GO_TO[6] },
          places: PLACES.map((p, k) => ({
            kind: p.kind,
            lift: lastLift[k],
            screen: project(view, toWorld(placeMid(k), view.yaw, view.drop), a),
            words: textBox(k),
          })),
          words: { cards: STOPS.map((_, k) => cardAt(k, s)), skills: skillsAt(s), contact: contactAt(s), intro: introAt(s) },
          blocks: layout,
          aspect: a,
        };
      },
    };
  }

  return () => {
    alive = false;
    stage.removeEventListener("pointerdown", onDown);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerup", onUp);
    stage.removeEventListener("pointercancel", onUp);
    resizer.disconnect();
    bar.destroy();
    island.dispose();
    if (dev && w.__b21) delete w.__b21;
  };
}
