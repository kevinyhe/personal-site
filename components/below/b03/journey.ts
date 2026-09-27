import { PROJECT_STOPS, stopNumber, STOPS } from "./path";
import { buildPlain, type Plain, type Point } from "./scene";

/**
 * Joins the page to the scene. Each frame it reads how far the page has
 * scrolled, moves the camera, then redraws what is laid over the canvas:
 * the typed readouts, the leader lines, the skill names, the counter.
 *
 * Nothing here goes through React. It all changes every frame, and a
 * React render per frame would be the slowest thing on the page.
 */

/** Screens of scroll the pinned journey lasts: work 6, skills 2, contact 1, less the one on screen. */
const SPAN = 8;
const TYPE_SECONDS = 1.2;
const CLEAR_SECONDS = 0.3;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** One piece of text that types in. The whole text is always in the DOM:
 *  what is typed in one span, what is still to come in a second, unseen
 *  one. So it wraps the same from the first letter to the last, and a
 *  reader that does not look at the screen gets all of it. */
class Typed {
  private readonly on: HTMLElement;
  private readonly off: HTMLElement;
  private readonly caret: HTMLElement | null;
  private readonly text: string;
  private shown = -1;
  readonly length: number;

  constructor(el: HTMLElement) {
    this.on = el.querySelector<HTMLElement>("[data-on]") as HTMLElement;
    this.off = el.querySelector<HTMLElement>("[data-off]") as HTMLElement;
    this.caret = el.querySelector<HTMLElement>("[data-caret]");
    this.text = (this.on.textContent ?? "") + (this.off.textContent ?? "");
    this.length = this.text.length;
  }

  show(count: number): void {
    const n = clamp(Math.round(count), 0, this.length);
    if (n === this.shown) return;
    this.shown = n;
    this.on.textContent = this.text.slice(0, n);
    this.off.textContent = this.text.slice(n);
    if (this.caret) this.caret.style.opacity = n > 0 && n < this.length ? "1" : "0";
  }
}

/** The texts of one stop. They type together, at one speed, so the short
 *  ones finish first, as lines on a terminal do. */
class Readout {
  private readonly fields: Typed[];
  private readonly longest: number;
  private readonly hasLinks: boolean;
  amount = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly rules: HTMLElement[],
  ) {
    this.fields = Array.from(root.querySelectorAll<HTMLElement>("[data-type]")).map((el) => new Typed(el));
    this.longest = this.fields.reduce((m, f) => Math.max(m, f.length), 1);
    this.hasLinks = root.querySelector("a") !== null;
    this.paint();
  }

  step(wanted: boolean, dt: number): void {
    const before = this.amount;
    this.amount = wanted
      ? Math.min(1, this.amount + dt / TYPE_SECONDS)
      : Math.max(0, this.amount - dt / CLEAR_SECONDS);
    if (this.amount !== before) this.paint();
  }

  private paint(): void {
    const n = this.amount * this.longest;
    for (const f of this.fields) f.show(n);
    const drawn = clamp(this.amount * 2.5, 0, 1);
    for (const r of this.rules) r.style.transform = `scaleX(${drawn})`;
    // Links in a cleared readout cannot be seen, so they must not be hit.
    if (this.hasLinks) this.root.style.pointerEvents = this.amount > 0.5 ? "auto" : "none";
  }
}

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b03: ${selector} is missing`);
  return el;
}

/** Starts the scene on the page. Returns what stops it. Throws if WebGL
 *  cannot start, before it has touched the page. */
export function startJourney(root: HTMLElement, still: boolean): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const monoFamily = getComputedStyle(need<HTMLElement>(root, "[data-mono]")).fontFamily;
  // A canvas of our own, made here and thrown away at the end. In
  // development React starts every effect twice, and a canvas whose
  // context was let go the first time cannot be given a new one.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const plain = buildPlain(canvas, monoFamily);
  slot.appendChild(canvas);
  const endScene = (): void => {
    plain.dispose();
    canvas.remove();
  };
  try {
    return bind(root, stage, plain, monoFamily, endScene, still);
  } catch (error) {
    // Something on the page was not as expected. Give the GPU back
    // before passing the error on.
    endScene();
    throw error;
  }
}

function bind(
  root: HTMLElement,
  stage: HTMLElement,
  plain: Plain,
  monoFamily: string,
  endScene: () => void,
  still: boolean,
): () => void {
  let alive = true;
  // The marks that are letters were drawn in whatever font was there at
  // the time. Draw them again when the page's own has arrived.
  void document.fonts.ready.then(() => {
    if (alive) plain.redrawMarks(monoFamily);
  });

  if (still) {
    // One frame, at the first block, and again if the window changes.
    const draw = (): void => {
      plain.resize(stage.clientWidth, stage.clientHeight);
      plain.frame(0.5, 2.4, 0);
    };
    draw();
    const watcher = new ResizeObserver(draw);
    watcher.observe(stage);
    return () => {
      alive = false;
      watcher.disconnect();
      endScene();
    };
  }

  const journey = need<HTMLElement>(root, "[data-journey]");
  const workLayer = need<HTMLElement>(root, "[data-work-layer]");
  const readoutStop = need<HTMLElement>(root, "[data-readout-stop]");
  const readoutFrac = need<HTMLElement>(root, "[data-readout-frac]");
  const hint = need<HTMLElement>(root, "[data-hint]");

  type Stop = {
    readout: Readout;
    ruleBoxes: [HTMLElement, HTMLElement];
    leads: [SVGPathElement, SVGPathElement];
    ends: [SVGRectElement, SVGRectElement];
    starts: [Point, Point];
  };
  const stops: Stop[] = [];
  for (let i = 0; i < PROJECT_STOPS; i += 1) {
    const el = need<HTMLElement>(root, `[data-stop="${i}"]`);
    const ruleBoxes: [HTMLElement, HTMLElement] = [need(el, '[data-rule="0"]'), need(el, '[data-rule="1"]')];
    stops.push({
      readout: new Readout(
        el,
        ruleBoxes.map((b) => need<HTMLElement>(b, "[data-rule-ink]")),
      ),
      ruleBoxes,
      leads: [need(root, `[data-lead="${i}-0"]`), need(root, `[data-lead="${i}-1"]`)],
      ends: [need(root, `[data-end="${i}-0"]`), need(root, `[data-end="${i}-1"]`)],
      starts: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    });
  }

  const skillsLayer = need<HTMLElement>(root, "[data-skills-layer]");
  const skillsReadout = new Readout(skillsLayer, []);
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-skill-row]")).map((el, r) => ({
    label: need<HTMLElement>(el, "[data-skill-label]"),
    names: need<HTMLElement>(el, "[data-skill-names]"),
    lines: [need<SVGLineElement>(root, `[data-row="${r}-0"]`), need<SVGLineElement>(root, `[data-row="${r}-1"]`)] as const,
  }));

  let stageW = 1;
  let stageH = 1;
  let rem = 8;
  const measure = (): void => {
    stageW = stage.clientWidth;
    stageH = stage.clientHeight;
    rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 8;
    plain.resize(stageW, stageH);
    // Where each leader line starts: the inner end of the rule under the
    // title (top left) and over the year (bottom right). Both boxes are
    // read against the layer they sit in, so the page's scroll cancels.
    const base = workLayer.getBoundingClientRect();
    for (const s of stops) {
      const a = s.ruleBoxes[0].getBoundingClientRect();
      const b = s.ruleBoxes[1].getBoundingClientRect();
      s.starts[0].x = a.right - base.left;
      s.starts[0].y = a.top + a.height / 2 - base.top;
      s.starts[1].x = b.left - base.left;
      s.starts[1].y = b.top + b.height / 2 - base.top;
      for (const e of s.ends) {
        e.setAttribute("width", String(rem));
        e.setAttribute("height", String(rem));
      }
    }
  };

  const end: Point = { x: 0, y: 0 };
  const first: Point = { x: 0, y: 0 };
  const last: Point = { x: 0, y: 0 };

  /** A line from the text, level for a short run, then straight to the
   *  block. `drawn` is how much of its length to draw, 0 to 1. */
  const lead = (path: SVGPathElement, box: SVGRectElement, from: Point, to: Point, drawn: number, shiftY: number): void => {
    if (drawn <= 0) {
      path.style.opacity = "0";
      box.style.opacity = "0";
      return;
    }
    const sx = from.x;
    const sy = from.y + shiftY;
    const run = stageW * 0.05 * Math.sign(to.x - sx || 1);
    const ex = sx + run;
    const l1 = Math.abs(run);
    const l2 = Math.hypot(to.x - ex, to.y - sy);
    const reach = (l1 + l2) * drawn;
    let d = `M${sx.toFixed(1)} ${sy.toFixed(1)}`;
    if (reach <= l1) {
      d += `L${(sx + Math.sign(run) * reach).toFixed(1)} ${sy.toFixed(1)}`;
    } else {
      const k = l2 > 0 ? (reach - l1) / l2 : 1;
      d += `L${ex.toFixed(1)} ${sy.toFixed(1)}L${(ex + (to.x - ex) * k).toFixed(1)} ${(sy + (to.y - sy) * k).toFixed(1)}`;
    }
    path.setAttribute("d", d);
    path.style.opacity = "1";
    box.setAttribute("x", (to.x - rem / 2).toFixed(1));
    box.setAttribute("y", (to.y - rem / 2).toFixed(1));
    box.style.opacity = drawn >= 1 ? "1" : "0";
  };

  let shownStop = -1;
  let shownFrac = "";
  let time = 0;

  const frame = (dt: number): void => {
    time += dt;
    const top = journey.getBoundingClientRect().top;
    const scrolled = -top;
    const u = scrolled / stageH;
    plain.frame(u, time, dt);

    // The layers that hold the text are pinned by CSS, each inside its own
    // section, so for a moment at each end they are not where the stage
    // is. These say how far off, so lines still meet their text.
    const stageAt = clamp(scrolled, 0, SPAN * stageH);
    const workShift = clamp(scrolled, 0, 5 * stageH) - stageAt;
    const skillsShift = clamp(scrolled, 6 * stageH, 7 * stageH) - stageAt;

    for (let i = 0; i < stops.length; i += 1) {
      const s = stops[i];
      s.readout.step(u > i + 0.2 && u < i + 0.86, dt);
      const drawn = clamp(s.readout.amount * 2.5, 0, 1);
      const upper = drawn > 0 && plain.blockPoint(i, 0, end);
      lead(s.leads[0], s.ends[0], s.starts[0], end, upper ? drawn : 0, workShift);
      const lower = drawn > 0 && plain.blockPoint(i, 1, end);
      lead(s.leads[1], s.ends[1], s.starts[1], end, lower ? drawn : 0, workShift);
    }

    skillsReadout.step(u > 5.93 && u < 6.95, dt);
    const amount = skillsReadout.amount;
    skillsLayer.style.opacity = amount > 0 ? "1" : "0";
    if (amount > 0) {
      const drawn = clamp(amount * 2.5, 0, 1);
      for (let r = 0; r < rows.length; r += 1) {
        const row = rows[r];
        if (!plain.rowEnds(r, first, last)) continue;
        const reach = plain.cubeReach(r);
        const gap = stageW * 0.035;
        const y = (first.y + last.y) / 2;
        const leftX = first.x - reach - gap;
        const rightX = last.x + reach + gap;
        row.label.style.transform = `translate(${leftX.toFixed(1)}px, ${(y - skillsShift).toFixed(1)}px) translate(-100%, -50%)`;
        row.names.style.transform = `translate(${rightX.toFixed(1)}px, ${(y - skillsShift).toFixed(1)}px) translate(0, -50%)`;
        const pad = rem * 0.8;
        const a = row.lines[0];
        a.setAttribute("x1", (leftX + pad).toFixed(1));
        a.setAttribute("x2", (leftX + pad + (first.x - reach - pad - leftX - pad) * drawn).toFixed(1));
        a.setAttribute("y1", y.toFixed(1));
        a.setAttribute("y2", y.toFixed(1));
        a.style.opacity = "1";
        const b = row.lines[1];
        b.setAttribute("x1", (rightX - pad).toFixed(1));
        b.setAttribute("x2", (rightX - pad + (last.x + reach + pad - rightX + pad) * drawn).toFixed(1));
        b.setAttribute("y1", y.toFixed(1));
        b.setAttribute("y2", y.toFixed(1));
        b.style.opacity = "1";
      }
    } else {
      for (const row of rows) {
        row.lines[0].style.opacity = "0";
        row.lines[1].style.opacity = "0";
      }
    }

    const n = stopNumber(u);
    if (n !== shownStop) {
      shownStop = n;
      readoutStop.textContent = `${String(n).padStart(2, "0")} / ${String(STOPS).padStart(2, "0")}`;
    }
    const frac = clamp(u / SPAN, 0, 1).toFixed(3);
    if (frac !== shownFrac) {
      shownFrac = frac;
      readoutFrac.textContent = frac;
    }
    hint.style.opacity = u < 6.9 ? "0.6" : "0";
  };

  let raf = 0;
  let running = false;
  let onScreen = false;
  let before = 0;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - before) / 1000));
    before = now;
    frame(dt);
  };
  // Draw only while the stage can be seen and the tab is the one in front.
  const sync = (): void => {
    const should = onScreen && !document.hidden;
    if (should && !running) {
      running = true;
      before = performance.now();
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

  // Changing the canvas's size empties it. Draw at once, or a window
  // being dragged wider shows a blank stage between frames.
  const sized = new ResizeObserver(() => {
    measure();
    frame(0);
  });
  sized.observe(stage);
  measure();
  void document.fonts.ready.then(() => {
    if (alive) measure();
  });

  const onPointer = (e: PointerEvent): void => {
    plain.pointer((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // One frame now, so the stage is never an empty canvas while it waits
  // for the observer to say it is on screen.
  frame(0);

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pointermove", onPointer);
    endScene();
  };
}
