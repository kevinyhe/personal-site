import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import {
  camAt,
  cardAt,
  CONTACT_AT,
  contactAt,
  DROP_AT,
  GO_TO,
  gatherAt,
  OBJECT_TOP,
  PADS,
  type Pose,
  project,
  rng,
  S_END,
  SIDES,
  skillsAt,
  STOPS,
  textBox,
  unproject,
} from "./layout";
import { buildPond } from "./pond";
import { createStrokes } from "./strokes";

/**
 * Drives the pond from the page's scroll and the cursor. The bar shader's
 * own frame loop calls back here once a frame while the stage is on
 * screen: read the scroll, move the camera, step the ripples, draw, set
 * the words. Nothing runs while the stage is off screen or the tab is
 * hidden, because the bar shader stops its loop then.
 */

export type Mode = "journey" | "still";

/** Cells across the bar grid. */
const X_SQUARES = 320;
const MAX_BAR_W = 2560;
/** Where the stone starts, above the water. */
const STONE_FROM = 5;
const GRAVITY = 14;

type Handle = { goTo(i: number): void; drop(x: number, y: number): void; readonly state: unknown };

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export function startPond(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const inkCanvas = root.querySelector<HTMLCanvasElement>("canvas[data-strokes]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b27: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const scrims = Array.from(root.querySelectorAll<HTMLElement>("[data-scrim]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const email = root.querySelector<HTMLElement>("[data-email]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return 0;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(S_END, -journey.getBoundingClientRect().top / h));
  };

  // Styles are written only when they change, so a still scroll costs no
  // style work.
  const written = new WeakMap<HTMLElement, Record<string, string>>();
  const set = (el: HTMLElement | null | undefined, key: string, value: string): void => {
    if (!el) return;
    const rec = written.get(el) ?? {};
    if (rec[key] === value) return;
    rec[key] = value;
    written.set(el, rec);
    el.style.setProperty(key, value);
  };

  // The cursor, in page pixels, and whether a press is waiting.
  let pointer: { x: number; y: number } | null = null;
  let press: { x: number; y: number } | null = null;
  let lastWorld: { x: number; z: number } | null = null;
  const onMove = (e: PointerEvent): void => {
    pointer = { x: e.clientX, y: e.clientY };
  };
  const onDown = (e: PointerEvent): void => {
    if (e.target instanceof Element && e.target.closest("a")) return;
    press = { x: e.clientX, y: e.clientY };
  };
  const onLeave = (): void => {
    pointer = null;
  };

  let s = 0;
  let pose: Pose = camAt(0, aspect());
  let clock = 0;
  // The contact stone: when it was let go, when it hit the water.
  let dropped = false;
  let dropAt = 0;
  let splashAt = -1;
  let reboundDone = false;
  let lastDrip = 0;
  let stoneY: number | null = null;
  let emailShow = 0;
  // Small drops now and then, so the pond is never quite still.
  const idle = rng(2701);
  let nextIdle = 1.5;

  const placeWords = (): void => {
    cards.forEach((el, k) => {
      const v = still ? 0 : cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(calc(-50% + ${((1 - v) * 1.5).toFixed(2)}vh))`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
    });
    scrims.forEach((el) => {
      const side = el.dataset.scrim === "left" ? 1 : -1;
      // A scrim darkens behind the words, on the side away from the pad.
      let v = 0;
      STOPS.forEach((_, k) => {
        if (SIDES[k] === side) v = Math.max(v, cardAt(k, s));
      });
      set(el, "opacity", v.toFixed(3));
    });
    const sk = still ? 0 : skillsAt(s);
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    const c = still ? 0 : contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "visibility", c > 0.001 ? "visible" : "hidden");
    set(contactLayer, "pointer-events", c > 0.5 ? "auto" : "none");
    set(email, "opacity", emailShow.toFixed(3));
    set(email, "transform", `scale(${(0.94 + 0.06 * emailShow).toFixed(4)})`);
    set(hint, "opacity", still ? "0" : (0.7 * (1 - Math.min(1, s / 0.3))).toFixed(3));
  };

  /** A page point to a point on the water, or null when it is off the stage. */
  const toWater = (px: number, py: number): { x: number; z: number } | null => {
    const r = stage.getBoundingClientRect();
    const sx = (px - r.left) / Math.max(1, r.width);
    const sy = (py - r.top) / Math.max(1, r.height);
    if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null;
    return unproject(pose, sx, sy, 0, aspect());
  };

  const stir = (): void => {
    const here = pointer ? toWater(pointer.x, pointer.y) : null;
    if (here && lastWorld) {
      const d = Math.hypot(here.x - lastWorld.x, here.z - lastWorld.z);
      // Only a moving cursor makes a wake, and a fast one a stronger wake.
      if (d > 0.01) pond.stroke(lastWorld.x, lastWorld.z, here.x, here.z, Math.min(0.09, 0.02 + d * 0.05));
    }
    lastWorld = here;
    if (press) {
      const at = toWater(press.x, press.y);
      if (at) pond.drop(at.x, at.z, 0.45, 0.28);
      press = null;
    }
  };

  const tick = (time: number): void => {
    clock = time;
    s = scrollS();
    const a = aspect();
    const base = camAt(s, a);
    // The camera never quite stops: a slow drift of a few centimetres.
    pose = { x: base.x + 0.07 * Math.sin(time * 0.13), z: base.z + 0.05 * Math.sin(time * 0.17 + 1), h: base.h };

    stir();

    if (time > nextIdle) {
      const at = unproject(pose, 0.1 + idle() * 0.8, 0.1 + idle() * 0.8, 0, a);
      pond.drop(at.x, at.z, 0.14 + idle() * 0.1, 0.12);
      nextIdle = time + 1.2 + idle() * 1.8;
    }

    // The stone: let go once the scroll reaches contact, and again only
    // after the reader has scrolled well back up.
    if (s >= DROP_AT && !dropped) {
      dropped = true;
      dropAt = time;
      splashAt = -1;
      reboundDone = false;
    } else if (s < DROP_AT - 0.3 && dropped) {
      dropped = false;
      splashAt = -1;
    }
    stoneY = null;
    if (dropped && splashAt < 0) {
      const fall = time - dropAt;
      const y = STONE_FROM - 0.5 * GRAVITY * fall * fall;
      if (y <= 0) {
        splashAt = time;
        pond.drop(CONTACT_AT.x, CONTACT_AT.z, 0.9, 0.42);
      } else stoneY = y;
    }
    if (splashAt >= 0 && !reboundDone && time - splashAt > 0.45) {
      // The water that the stone pushed down jumps back up in the middle.
      reboundDone = true;
      pond.drop(CONTACT_AT.x, CONTACT_AT.z, 0.35, 0.22);
    }
    // While the email is up, a drip falls on the same spot now and then so
    // there are always a few rings round it.
    if (splashAt >= 0 && contactAt(s) > 0.5 && time - lastDrip > 3.2 && time - splashAt > 2.5) {
      lastDrip = time;
      pond.drop(CONTACT_AT.x, CONTACT_AT.z, 0.3, 0.2);
    }
    const ready = splashAt >= 0 ? smooth((time - splashAt - 0.3) / 0.9) : 0;
    emailShow = contactAt(s) * ready;

    pond.step();
    pond.draw({ pose, time, gather: gatherAt(s), stoneY });
    placeWords();
    // Each stroke paints in over the last stretch of the approach to its
    // pad, holds while the words are up, and lifts as the camera leaves.
    strokes?.render(
      (k) => smooth((s - (STOPS[k] - 0.55)) / 0.5),
      (k) => 0.92 * (1 - smooth((s - (STOPS[k] + 0.35)) / 0.35)),
    );
  };

  const monoFamily = getComputedStyle(root).getPropertyValue("--font-mono").trim() || "monospace";
  const glCanvas = document.createElement("canvas");
  // The strokes go round the pad, on its side of the screen.
  const strokes =
    inkCanvas && !still
      ? createStrokes(
          inkCanvas,
          (k) => (SIDES[k] < 0 ? { x0: 0.06, y0: 0.14, x1: 0.5, y1: 0.88 } : { x0: 0.5, y0: 0.14, x1: 0.94, y1: 0.88 }),
          BLOSSOM,
        )
      : null;
  const pond = buildPond(glCanvas, { animated: !still, monoFamily, update: still ? undefined : tick });
  pond.resize(aspect());

  // The still frame: over the first pad, with one ring spreading beside it.
  const drawStill = (): void => {
    pose = camAt(STOPS[0], aspect());
    const p = PADS[0];
    pond.drop(p.x + 2.2, p.z + 0.9, 0.7, 0.35);
    for (let i = 0; i < 70; i += 1) pond.step();
    pond.draw({ pose, time: 4, gather: 0, stoneY: null });
  };
  if (still) drawStill();

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
    // Upside down: a bright grey is a wide blossom bar on the plum, so the
    // koi, the petals and the lanterns draw the widest bars and the deep
    // water only fine lines.
    blackPoint: 255,
    whitePoint: 0,
    threshold: 255,
    xSquares: X_SQUARES,
    ySquares: Math.round(X_SQUARES / aspect()),
    minSquareWidth: "-2%",
    maxSquareWidth: "100%",
    bgOpacity: 1,
    fillOpacity: 1,
  };
  const bar = createBarCanvas(bars, [{ type: "canvas", source: pond.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    fps: 60,
  });
  if (!bar) {
    pond.dispose();
    throw new Error("b27: bar shader could not start");
  }

  const resizer = new ResizeObserver(() => {
    fitBars();
    strokes?.resize();
    pond.resize(aspect());
    config.ySquares = Math.round(X_SQUARES / aspect());
    if (still) {
      pose = camAt(STOPS[0], aspect());
      pond.draw({ pose, time: 4, gather: 0, stoneY: null });
      bar.redraw();
    }
  });
  resizer.observe(stage);

  if (!still) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
  }
  placeWords();

  const dev = process.env.NODE_ENV !== "production";
  const w = window as unknown as { __b27?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b27 = {
      goTo(i: number) {
        if (!journey) return;
        const k = Math.max(0, Math.min(GO_TO.length - 1, Math.round(i)));
        const top = window.scrollY + journey.getBoundingClientRect().top;
        const y = top + GO_TO[k] * stage.clientHeight;
        if (w.__lenis) w.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
      drop(x: number, y: number) {
        // x and y are shares of the stage, 0..1 from the top left.
        const at = unproject(pose, x, y, 0, aspect());
        pond.drop(at.x, at.z, 0.6, 0.3);
      },
      get state() {
        const a = aspect();
        return {
          mode,
          s,
          time: clock,
          pose,
          ripples: pond.ripples,
          pads: PADS.map((p, k) => ({
            centre: project(pose, { x: p.x, y: 0, z: p.z }, a),
            objectTop: project(pose, { x: p.x, y: OBJECT_TOP, z: p.z }, a),
            words: textBox(k),
            shown: still ? 0 : cardAt(k, s),
          })),
          gather: gatherAt(s),
          skills: skillsAt(s),
          contact: { shown: contactAt(s), email: emailShow, dropped, stoneY, splashAt },
          stops: { projects: [...STOPS], skills: GO_TO[5], contact: GO_TO[6], drop: DROP_AT },
          aspect: a,
        };
      },
    };
  }

  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    resizer.disconnect();
    bar.destroy();
    strokes?.dispose();
    pond.dispose();
    if (dev && w.__b27) delete w.__b27;
  };
}
