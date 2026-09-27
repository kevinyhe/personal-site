import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import { type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import {
  CONTACT_ARRIVE,
  camAt,
  cardAt,
  contactAt,
  GO_TO,
  LAMP_H,
  LAMP_LIFT,
  LANTERN_X,
  LANTERN_Z,
  BIG_H,
  lampX,
  litAt,
  type Pose,
  project,
  RACK_X0,
  RACK_Z,
  rackRowY,
  rowLitAt,
  S_END,
  SIDES,
  skillsAt,
  STOPS,
  WINDOW_AT,
} from "./path";
import { buildNight } from "./scene";

/**
 * Drives the night approach from the page's scroll. The bar shader's own
 * frame loop calls back here once a frame while the stage is on screen:
 * read the scroll, place the camera, draw the scene, set the words.
 * Nothing runs while the stage is off screen or the tab is hidden, because
 * the bar shader stops its loop then.
 */

export type Mode = "journey" | "still";

/** How far the cursor turns the head, in radians: about three degrees across, two up and down. */
const HEAD_YAW = 0.05;
const HEAD_PITCH = 0.035;
/** Cells across the bar grid. */
const X_SQUARES = 260;
const MAX_BAR_W = 2560;

type Handle = { goTo(i: number): void; readonly state: unknown };

export function startLanterns(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b17: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const scrims = Array.from(root.querySelectorAll<HTMLElement>("[data-scrim]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const skillItems = Array.from(root.querySelectorAll<HTMLElement>("[data-skill]"));
  const groupItems = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  // Where each skill's lamp sits on the shelves.
  const lamps: { row: number; col: number }[] = [];
  skillGroups.forEach((g, row) => g.skills.forEach((_, col) => lamps.push({ row, col })));

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return 0;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(S_END, -journey.getBoundingClientRect().top / h));
  };

  // The cursor's pull on the head, eased so it never snaps.
  let wantYaw = 0;
  let wantPitch = 0;
  let headYaw = 0;
  let headPitch = 0;
  const onPointer = (e: PointerEvent): void => {
    wantYaw = -((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1) * HEAD_YAW;
    wantPitch = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1) * HEAD_PITCH;
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

  let s = 0;
  let pose: Pose = camAt(0);

  const placeWords = (): void => {
    const a = aspect();
    cards.forEach((el, k) => {
      const v = still ? 0 : cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(calc(-50% + ${((1 - v) * 1.5).toFixed(2)}vh))`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
    });
    scrims.forEach((el) => {
      const side = el.dataset.scrim === "left" ? 1 : -1;
      // A scrim darkens behind the words, on the side away from the lantern.
      let v = 0;
      STOPS.forEach((_, k) => {
        if (SIDES[k] === side) v = Math.max(v, cardAt(k, s));
      });
      set(el, "opacity", v.toFixed(3));
    });
    const sk = still ? 0 : skillsAt(s);
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    if (sk > 0.001) {
      lamps.forEach((l, i) => {
        const p = project(pose, { x: lampX(l.col), y: rackRowY(l.row) + LAMP_LIFT - LAMP_H / 2, z: RACK_Z }, a);
        set(skillItems[i], "left", `${(p.x * 100).toFixed(2)}%`);
        set(skillItems[i], "top", `${(p.y * 100 + 0.8).toFixed(2)}%`);
      });
      groupItems.forEach((el, r) => {
        const p = project(pose, { x: RACK_X0, y: rackRowY(r) + LAMP_LIFT, z: RACK_Z }, a);
        set(el, "top", `${(p.y * 100).toFixed(2)}%`);
      });
    }
    const c = still ? 0 : contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "pointer-events", c > 0.5 ? "auto" : "none");
    set(hint, "opacity", still ? "0" : (0.7 * (1 - Math.min(1, s / 0.3))).toFixed(3));
  };

  const drawAt = (time: number): void => {
    night.draw({
      pose,
      lit: LANTERN_Z.map((_, k) => (still ? 1 : litAt(k, s))),
      rows: [0, 1, 2, 3, 4].map((r) => (still ? 1 : rowLitAt(r, s))),
      time,
    });
  };

  const tick = (time: number, dt: number): void => {
    s = scrollS();
    const ease = Math.min(1, dt * 4);
    headYaw += (wantYaw - headYaw) * ease;
    headPitch += (wantPitch - headPitch) * ease;
    const base = camAt(s);
    pose = { ...base, yaw: base.yaw + headYaw, pitch: base.pitch + headPitch };
    drawAt(time);
    placeWords();
  };

  const sansFamily = getComputedStyle(root).fontFamily || "sans-serif";
  const glCanvas = document.createElement("canvas");
  const night = buildNight(glCanvas, { animated: !still, sansFamily, update: still ? undefined : tick });
  night.resize(aspect());

  // The still frame: from the first gates, looking down the whole lit path.
  if (still) {
    pose = camAt(0);
    drawAt(4);
  }

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
    // lantern light draws the widest bars and the night sky almost none.
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
  const bar = createBarCanvas(bars, [{ type: "canvas", source: night.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    fps: 60,
  });
  if (!bar) {
    night.dispose();
    throw new Error("b17: bar shader could not start");
  }

  const resizer = new ResizeObserver(() => {
    fitBars();
    night.resize(aspect());
    config.ySquares = Math.round(X_SQUARES / aspect());
    if (still) {
      drawAt(4);
      bar.redraw();
    }
  });
  resizer.observe(stage);

  if (!still) window.addEventListener("pointermove", onPointer, { passive: true });
  placeWords();

  const dev = process.env.NODE_ENV !== "production";
  const w = window as unknown as { __b17?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b17 = {
      goTo(i: number) {
        if (!journey) return;
        const k = Math.max(0, Math.min(GO_TO.length - 1, Math.round(i)));
        const top = window.scrollY + journey.getBoundingClientRect().top;
        const y = top + GO_TO[k] * stage.clientHeight;
        if (w.__lenis) w.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
      get state() {
        const a = aspect();
        return {
          mode,
          s,
          stops: { projects: [...STOPS], skills: GO_TO[5], contact: GO_TO[6], contactArrive: CONTACT_ARRIVE },
          pose,
          lanterns: LANTERN_Z.map((z, k) => ({
            lit: still ? 1 : litAt(k, s),
            window: project(pose, { x: SIDES[k] * LANTERN_X, y: BIG_H * WINDOW_AT, z }, a),
          })),
          words: { cards: STOPS.map((_, k) => cardAt(k, s)), skills: skillsAt(s), contact: contactAt(s) },
          aspect: a,
        };
      },
    };
  }

  return () => {
    window.removeEventListener("pointermove", onPointer);
    resizer.disconnect();
    bar.destroy();
    night.dispose();
    if (dev && w.__b17) delete w.__b17;
  };
}
