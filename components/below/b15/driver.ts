import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import {
  type BarCanvas,
  type BarLayer,
  type BarLayerConfig,
  type CanvasSource,
  createBarCanvas,
  hexToRgb,
} from "@/components/valley/barShader";
import { createBirds } from "@/components/valley/sources/birds";
import * as P from "./plan";
import { buildSky, type Point, type Sky } from "./scene";

/**
 * Joins the page to the sky. The bar shader owns the frame loop: each time
 * it is about to draw, it asks the sky canvas to update, and that is where
 * this reads the scroll, moves the camera, draws the scene and moves the
 * words. So nothing runs while the stage is off screen or the tab is
 * hidden, and nothing goes through React per frame.
 */

type DevState = {
  mode: "journey" | "still";
  u: number;
  darkness: number;
  pose: P.Pose;
  project: number;
  groups: { stars: Box; label: Box }[];
  lines: number;
};
type Box = { x0: string; y0: string; x1: string; y1: string };
type DevHandle = { goTo(i: number): void; readonly state: DevState };
type LenisLike = { scrollTo(y: number, o?: { immediate?: boolean }): void };

/** How wide one bar cell is, in CSS px: a 240-cell grid across a big
 *  screen, never under 6 px on a small one. */
const cellFor = (stageW: number): number => Math.max(6, stageW / 240);

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b15: ${selector} is missing`);
  return el;
}

/** Starts the sky on the page and returns what stops it. Throws, having
 *  cleaned up after itself, if WebGL cannot start. */
export function startDusk(root: HTMLElement, still: boolean): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const cons = P.buildConstellations(
    skillGroups.map((g) => g.skills.length),
    skillGroups.map((g) => g.skills.map((s) => s.depth)),
  );
  const sky = buildSky(cons);

  // A canvas of our own, made here and dropped at the end: in development
  // React runs every effect twice, and a canvas whose context was let go
  // cannot be given another.
  const barCanvas = document.createElement("canvas");
  barCanvas.setAttribute("aria-hidden", "true");
  barCanvas.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%";
  slot.appendChild(barCanvas);

  // The sky, graded so a grey at or under 12 is a solid bar (the plum) and
  // one at or over 245 is no bar at all (the blossom ground).
  const skyConfig: BarLayerConfig = {
    x: 0,
    y: 0,
    width: "100%",
    height: "100%",
    blackPoint: 12,
    whitePoint: 245,
    threshold: 255,
    xSquares: 240,
    ySquares: 130,
    bgOpacity: 1,
    fillOpacity: 1,
  };
  // The birds, upside down as the valley grades them: a bright bird is a
  // wide bar, so they are plum on the sky. Only the bars are drawn, so the
  // sky shows between them.
  const birdConfig: BarLayerConfig = {
    x: "-40%",
    y: "7%",
    width: "34%",
    height: "22%",
    blackPoint: 255,
    whitePoint: 0,
    threshold: 255,
    xSquares: 82,
    ySquares: 29,
    bgOpacity: 0,
    fillOpacity: 1,
  };

  let stageW = 1;
  let stageH = 1;
  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    const cell = cellFor(stageW);
    const cols = Math.round(stageW / cell);
    const rows = Math.round(stageH / cell);
    skyConfig.xSquares = cols;
    skyConfig.ySquares = rows;
    // The birds' box is 34% by 22% of the stage; the same cell size.
    birdConfig.xSquares = Math.max(8, Math.round(cols * 0.34));
    birdConfig.ySquares = Math.max(4, Math.round(rows * 0.22));
    sky.resize(stageW, stageH, cell);
  };
  measure();

  let tick: (time: number, dt: number) => void = () => {};
  const skySource: CanvasSource = {
    canvas: sky.canvas,
    animated: !still,
    ready: Promise.resolve(),
    update: (time, dt) => {
      tick(time, dt);
      return true;
    },
  };
  const layers: BarLayer[] = [{ type: "canvas", source: skySource, config: skyConfig }];
  if (!still) {
    // The box is 34% by 22% of a 1.85 screen, so this canvas is that shape.
    const birds = createBirds({ seed: 15, width: 900, height: 315, count: 7 });
    layers.push({ type: "canvas", source: birds, config: birdConfig });
  }

  let bar: BarCanvas | null = null;
  try {
    if (still) sky.frame(0.4, 0, { x: 0, y: 0 }, 1);
    bar = createBarCanvas(barCanvas, layers, {
      colors: () => ({ bg: hexToRgb(BLOSSOM), fill: hexToRgb(BAND) }),
      visibleRootMargin: "10% 0px 10% 0px",
    });
  } catch {
    bar = null;
  }
  if (!bar) {
    barCanvas.remove();
    sky.dispose();
    throw new Error("b15: the bar shader could not start");
  }
  const bars = bar;
  const endScene = (): void => {
    bars.destroy();
    sky.dispose();
    barCanvas.remove();
  };

  if (still) {
    // One frame. Drawn again only if the window changes size.
    const sized = new ResizeObserver(() => {
      measure();
      sky.frame(0.4, 0, { x: 0, y: 0 }, 1);
      bars.redraw();
    });
    sized.observe(stage);
    // In development, the same handle as the moving page: goTo(i) goes to
    // the section that holds stop i.
    const host = window as unknown as { __b15?: { goTo(i: number): void; readonly state: { mode: "still" } } };
    const handle = {
      goTo(i: number): void {
        const id = i < 5 ? "work" : i === 5 ? "skills" : "contact";
        root.querySelector(`#${id}`)?.scrollIntoView();
      },
      get state(): { mode: "still" } {
        return { mode: "still" };
      },
    };
    if (process.env.NODE_ENV === "development") host.__b15 = handle;
    return () => {
      sized.disconnect();
      if (host.__b15 === handle) delete host.__b15;
      endScene();
    };
  }

  try {
    return bind(root, stage, sky, cons, bars, birdConfig, measure, (fn) => {
      tick = fn;
    }, endScene, () => ({ stageW, stageH }));
  } catch (error) {
    endScene();
    throw error;
  }
}

function bind(
  root: HTMLElement,
  stage: HTMLElement,
  sky: Sky,
  cons: P.Constellation[],
  bars: BarCanvas,
  birdConfig: BarLayerConfig,
  measure: () => void,
  setTick: (fn: (time: number, dt: number) => void) => void,
  endScene: () => void,
  size: () => { stageW: number; stageH: number },
): () => void {
  const journey = need<HTMLElement>(root, "[data-journey]");
  const workHead = need<HTMLElement>(root, "[data-work-head]");
  const articles = Array.from(root.querySelectorAll<HTMLElement>("[data-project]"));
  const skillsLayer = need<HTMLElement>(root, "[data-skills-layer]");
  const groupLabels = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const contactLayer = need<HTMLElement>(root, "[data-contact-layer]");
  const lineEls = cons.map((c) => c.lines.map((_, k) => need<SVGLineElement>(root, `[data-line="${c.group}-${k}"]`)));

  // Only write a style when it changed enough to see: most frames, most of
  // these are the same as the last.
  const shownOps = new Map<HTMLElement, number>();
  const setOpacity = (el: HTMLElement | SVGElement, v: number): void => {
    const key = el as HTMLElement;
    const r = Math.round(v * 200) / 200;
    if (shownOps.get(key) === r) return;
    shownOps.set(key, r);
    el.style.opacity = String(r);
    // Words that cannot be seen must not catch the pointer.
    if (el instanceof HTMLElement && el.dataset.hit !== undefined) el.style.pointerEvents = r > 0.5 ? "auto" : "none";
  };

  const target: Point = { x: 0, y: 0 };
  const lean: Point = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent): void => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const pt: Point = { x: 0, y: 0 };
  const pts: Point[][] = cons.map((c) => c.stars.map(() => ({ x: 0, y: 0 })));
  const starBoxes = cons.map(() => ({ x0: 0, y0: 0, x1: 0, y1: 0, seen: false }));
  let u = 0;
  let project = -1;

  const frame = (time: number, dt: number): void => {
    const { stageW, stageH } = size();
    u = -journey.getBoundingClientRect().top / stageH;
    const ease = 1 - Math.exp(-dt * 2.5);
    lean.x += (target.x - lean.x) * ease;
    lean.y += (target.y - lean.y) * ease;
    sky.frame(u, time, lean);

    // Birds cross the upper sky, one pass every two minutes, and go home
    // as the night comes.
    birdConfig.x = `${(-40 + ((time * 1.5) % 180)).toFixed(2)}%`;
    birdConfig.fillOpacity = 1 - P.smoothstep(4.7, 5.5, u);

    // Work: one title at a time across the middle.
    let most = 0;
    project = -1;
    articles.forEach((el, i) => {
      const k = P.projectShown(i, u);
      if (k > most) {
        most = k;
        project = i;
      }
      setOpacity(el, k);
    });
    setOpacity(workHead, most);

    // Skills: stars first, then the lines between them, then the names.
    const gone = P.starsGone(u);
    const skillsOn = P.skillsShown(u);
    setOpacity(skillsLayer, skillsOn);
    const layerShift = skillsOn > 0 ? skillsLayer.getBoundingClientRect().top - stage.getBoundingClientRect().top : 0;
    cons.forEach((c, g) => {
      const box = starBoxes[g];
      box.x0 = Infinity;
      box.y0 = Infinity;
      box.x1 = -Infinity;
      box.y1 = -Infinity;
      box.seen = true;
      c.stars.forEach((_, n) => {
        const ok = sky.star(g, n, pt);
        box.seen = box.seen && ok;
        pts[g][n].x = pt.x * stageW;
        pts[g][n].y = pt.y * stageH;
        box.x0 = Math.min(box.x0, pt.x);
        box.x1 = Math.max(box.x1, pt.x);
        box.y0 = Math.min(box.y0, pt.y);
        box.y1 = Math.max(box.y1, pt.y);
      });
      const drawn = P.linesDrawn(g, u) * c.lines.length;
      c.lines.forEach(([a, b], k) => {
        const el = lineEls[g][k];
        const part = Math.min(1, Math.max(0, drawn - k));
        if (part <= 0 || !box.seen) {
          setOpacity(el, 0);
          return;
        }
        const A = pts[g][a];
        const B = pts[g][b];
        el.setAttribute("x1", A.x.toFixed(1));
        el.setAttribute("y1", A.y.toFixed(1));
        el.setAttribute("x2", (A.x + (B.x - A.x) * part).toFixed(1));
        el.setAttribute("y2", (A.y + (B.y - A.y) * part).toFixed(1));
        setOpacity(el, 0.75 * gone);
      });
      if (skillsOn > 0 && groupLabels[g]) {
        const x = box.x0 * stageW;
        const y = (box.y1 + P.SKILL_LABEL_GAP) * stageH - layerShift;
        groupLabels[g].style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    });

    setOpacity(contactLayer, P.contactShown(u));
  };
  setTick(frame);

  // The stage changed size: the canvas, the grid and the words' places.
  const sized = new ResizeObserver(() => {
    measure();
    bars.redraw({ reupload: false });
  });
  sized.observe(stage);

  // ---------------------------------------------------- the dev handle
  const host = window as unknown as { __b15?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
    const rel = (el: Element): Box => {
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        x0: pct((r.left - s.left) / s.width),
        y0: pct((r.top - s.top) / s.height),
        x1: pct((r.right - s.left) / s.width),
        y1: pct((r.bottom - s.top) / s.height),
      };
    };
    handle = {
      goTo(i: number): void {
        const at = P.STOPS[Math.max(0, Math.min(P.STOPS.length - 1, Math.round(i)))];
        const y = journey.getBoundingClientRect().top + window.scrollY + at * size().stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      get state(): DevState {
        return {
          mode: "journey",
          u: Math.round(u * 1000) / 1000,
          darkness: Math.round(P.darkness(u) * 1000) / 1000,
          pose: sky.pose(),
          project,
          groups: starBoxes.map((b, g) => ({
            stars: { x0: pct(b.x0), y0: pct(b.y0), x1: pct(b.x1), y1: pct(b.y1) },
            label: rel(groupLabels[g]),
          })),
          lines: lineEls.flat().filter((l) => Number(l.style.opacity) > 0).length,
        };
      },
    };
    host.__b15 = handle;
  }

  return () => {
    setTick(() => {});
    sized.disconnect();
    window.removeEventListener("pointermove", onPointer);
    if (handle && host.__b15 === handle) delete host.__b15;
    endScene();
  };
}
