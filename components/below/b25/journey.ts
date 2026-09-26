import { BAND, BLOSSOM } from "@/components/bandColours";
import { createBloomField } from "@/components/bloomField";
import { type BarLayerConfig, type CanvasSource, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { GROUPS } from "./parts";
import {
  anchorOf,
  cardAt,
  cardLeaderStart,
  contactAt,
  driveAt,
  explodeAt,
  GO_TO,
  litAt,
  ORDER,
  poseAt,
  project,
  SKILL_PART_OF,
  SKILL_SLOT_OF,
  skillLeaderStart,
  skillsAt,
  SKILLS_AT,
  STAGE_END,
  STOPS,
  toWorld,
} from "./layout";
import { buildExploded } from "./scene";

/**
 * Drives the exploded robot from the page's scroll. The bar shader's own
 * frame loop calls back here once a frame while the stage is on screen:
 * read the scroll, draw the robot if the scroll moved, set the words and
 * the leader lines. Nothing runs while the stage is off screen or the tab
 * is hidden, because the bar shader stops its loop then.
 */

export type Mode = "journey" | "still";

/** Cells across the bar grid: the band's own density. */
const X_SQUARES = 300;
const MAX_BAR_W = 2560;
/** The sakura spray's box on the contact screen, as shares of the stage. */
const FIELD = { x: 0.02, y: 0.02, w: 0.3, h: 0.54 };
const FIELD_H = 640;

type Handle = { goTo(i: number): void; readonly state: unknown };

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function startExploded(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b25: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const leaders = Array.from(root.querySelectorAll<SVGLineElement>("[data-leader]"));
  const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return SKILLS_AT;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(STAGE_END, -journey.getBoundingClientRect().top / h));
  };

  // Styles are written only when they change, so a still scroll costs no
  // style work.
  const written = new WeakMap<Element, Record<string, string>>();
  const set = (el: HTMLElement | SVGElement | null | undefined, key: string, value: string): void => {
    if (!el) return;
    const rec = written.get(el) ?? {};
    if (rec[key] === value) return;
    rec[key] = value;
    written.set(el, rec);
    el.style.setProperty(key, value);
  };
  const setAttr = (el: Element | undefined, key: string, value: string): void => {
    if (!el) return;
    const rec = written.get(el) ?? {};
    if (rec[`@${key}`] === value) return;
    rec[`@${key}`] = value;
    written.set(el, rec);
    el.setAttribute(key, value);
  };

  let s = still ? SKILLS_AT : 0;

  /** Where a group's leader lands on the stage right now, 0..1. */
  const anchorOnStage = (group: number): { x: number; y: number } => {
    const pose = poseAt(s);
    return project(pose, toWorld(pose, anchorOf(group, explodeAt(group, s))), aspect());
  };

  /** Leader i from a to b, at opacity v; its dot sits on b. */
  const lead = (i: number, a: { x: number; y: number }, b: { x: number; y: number }, v: number): void => {
    const line = leaders[i];
    const on = v > 0.01;
    set(line, "opacity", on ? v.toFixed(3) : "0");
    set(dots[i], "opacity", on ? v.toFixed(3) : "0");
    if (!on) return;
    setAttr(line, "x1", (a.x * 100).toFixed(2));
    setAttr(line, "y1", (a.y * 100).toFixed(2));
    setAttr(line, "x2", (b.x * 100).toFixed(2));
    setAttr(line, "y2", (b.y * 100).toFixed(2));
    set(dots[i], "left", `${(b.x * 100).toFixed(2)}%`);
    set(dots[i], "top", `${(b.y * 100).toFixed(2)}%`);
  };

  const placeWords = (): void => {
    const a = aspect();
    // Work: one card at a time, one leader, from the card to its group.
    let best = -1;
    let bestV = 0;
    cards.forEach((el, k) => {
      const v = still ? 0 : cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(${((1 - v) * 1.5).toFixed(2)}vh)`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
      if (v > bestV) {
        bestV = v;
        best = k;
      }
    });
    if (best >= 0) lead(0, cardLeaderStart(a), anchorOnStage(ORDER[best]), bestV);
    else lead(0, { x: 0, y: 0 }, { x: 0, y: 0 }, 0);
    // Skills: five leaders, one per block.
    const sk = still ? 0 : skillsAt(s);
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    SKILL_PART_OF.forEach((g, i) => {
      if (sk > 0.001) lead(i + 1, skillLeaderStart(SKILL_SLOT_OF[i], a), anchorOnStage(g), sk);
      else lead(i + 1, { x: 0, y: 0 }, { x: 0, y: 0 }, 0);
    });
    const c = still ? 0 : contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "pointer-events", c > 0.5 ? "auto" : "none");
    set(hint, "opacity", still ? "0" : (0.7 * (1 - Math.min(1, s / 0.3))).toFixed(3));
  };

  const glCanvas = document.createElement("canvas");
  const robot = buildExploded(glCanvas, "/models/hero.glb");
  robot.resize(aspect());

  // The spray on the contact screen, opening as the robot drives off.
  const fieldW = (): number => Math.round((FIELD.w * aspect() * FIELD_H) / FIELD.h);
  const field = createBloomField({ width: fieldW(), height: FIELD_H, still, tilt: 0.22 });
  const fieldConfig: BarLayerConfig = {
    x: `${FIELD.x * 100}%`,
    y: `${FIELD.y * 100}%`,
    width: `${FIELD.w * 100}%`,
    height: `${FIELD.h * 100}%`,
    // The band's flower grade: a bright petal is a wide bar.
    blackPoint: 200,
    whitePoint: 25,
    threshold: 255,
    xSquares: 110,
    ySquares: 150,
    bgOpacity: 0,
    fillOpacity: 0,
  };

  const tick = (): void => {
    s = still ? SKILLS_AT : scrollS();
    robot.draw(s);
    const open = still ? 0 : smooth(8.35, 9.0, s);
    field.set(open);
    fieldConfig.fillOpacity = open > 0.002 ? 1 : 0;
    placeWords();
  };

  // The robot's layer: every frame it asks where the scroll is, and the
  // robot redraws only if that moved.
  const robotSource: CanvasSource = {
    canvas: glCanvas,
    animated: true,
    ready: robot.source.ready,
    update: (time, dt) => {
      tick();
      return robot.source.update?.(time, dt) ?? true;
    },
  };

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

  const ySquares = (): number => Math.round((190 * 1.85) / aspect());
  const config: BarLayerConfig = {
    x: 0,
    y: 0,
    width: "100%",
    height: "100%",
    // The band's robot grade, as StatementSection has it: upside down, so
    // a lit face is a wide bar; anything over 190 grey is a full bar,
    // anything under 70 none; and the bar capped under its cell so a lit
    // part stays a run of lines rather than one solid mass.
    blackPoint: 190,
    whitePoint: 70,
    threshold: 255,
    xSquares: X_SQUARES,
    ySquares: ySquares(),
    maxSquareWidth: "64%",
    bgOpacity: 0,
    fillOpacity: 1,
  };
  const bar = createBarCanvas(
    bars,
    [
      { type: "canvas", source: field.source, config: fieldConfig },
      { type: "canvas", source: robotSource, config },
    ],
    {
      colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
      defaults: { bgOpacity: 0 },
      fps: still ? 4 : 60,
    },
  );
  if (!bar) {
    field.dispose();
    robot.dispose();
    throw new Error("b25: bar shader could not start");
  }

  // The still frame waits for the model, then draws once more.
  if (still) {
    void robot.ready.then(() => {
      tick();
      bar.redraw();
    });
  }

  const resizer = new ResizeObserver(() => {
    fitBars();
    robot.resize(aspect());
    config.ySquares = ySquares();
    tick();
    bar.redraw();
  });
  resizer.observe(stage);
  placeWords();

  const dev = process.env.NODE_ENV === "development";
  const w = window as unknown as { __b25?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b25 = {
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
          goTo: [...GO_TO],
          stops: [...STOPS],
          pose: poseAt(s),
          drive: driveAt(s),
          groups: GROUPS.map((g, i) => ({
            name: g.name,
            explode: explodeAt(i, s),
            lit: litAt(i, s),
            anchor: anchorOnStage(i),
          })),
          words: { cards: STOPS.map((_, k) => cardAt(k, s)), skills: skillsAt(s), contact: contactAt(s) },
          aspect: a,
        };
      },
    };
  }

  return () => {
    resizer.disconnect();
    bar.destroy();
    field.dispose();
    robot.dispose();
    if (dev && w.__b25) delete w.__b25;
  };
}
