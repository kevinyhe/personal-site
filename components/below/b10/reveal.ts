import * as L from "./layout";
import { buildReveal, type Reveal, type Stroke } from "./scene";
import { STROKES } from "./shaders";

/**
 * Joins the page to the picture. Each frame it reads how far the page has
 * scrolled, works out the robot's pose, turns the cursor's movement into
 * strokes on the mask, and moves what is laid over the canvas: the dots,
 * the leader lines, the text blocks.
 *
 * Nothing here goes through React. It all changes every frame.
 *
 *   journey  the pinned sequence, driven by scroll.
 *   compact  a narrow screen: one stage with the robot turning slowly,
 *            the words below it as ordinary blocks.
 *   still    the visitor asked for less motion: one frame, solid on the
 *            left half and drawn on the right.
 */
export type Mode = "journey" | "compact" | "still";

/** Seconds without the cursor moving before the wandering point takes over. */
const IDLE_AFTER = 3;
/** Seconds a mark made through the dev handle is kept up. */
const STAMP_HOLD = 4;

const VIEWS = ["Front", "Left wheel pod", "Top", "Rear", "Underside", "Three quarter", "Right side"];

type Percent = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: Mode;
  u: number;
  step: number;
  aspect: number;
  robot: string;
  wander: number;
  box: Percent;
  callouts: { shown: number; dot: { x: number; y: number }; block: Percent; leader: { from: { x: number; y: number }; to: { x: number; y: number } } }[];
};
type DevHandle = { goTo(i: number): void; stamp(x: number, y: number, r?: number): void; readonly state: DevState };
type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b10: ${selector} is missing`);
  return el;
}

const pct = (v: number): number => Math.round(v * 1000) / 10;
const smooth = (a: number, b: number, v: number): number => {
  const t = L.clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Starts the picture on the page. Returns what stops it. Throws if WebGL cannot start, before it has touched the page. */
export function startReveal(root: HTMLElement, mode: Mode): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const monoFamily = getComputedStyle(need<HTMLElement>(root, "[data-mono]")).fontFamily;
  // A canvas of our own, made here and thrown away at the end. In
  // development React starts every effect twice, and a canvas whose
  // context was let go the first time cannot be given a new one.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const scene = buildReveal(canvas, monoFamily);
  slot.appendChild(canvas);
  const endScene = (): void => {
    scene.dispose();
    canvas.remove();
  };
  try {
    return bind(root, stage, scene, monoFamily, endScene, mode);
  } catch (error) {
    // Something on the page was not as expected. Give the GPU back
    // before passing the error on.
    endScene();
    throw error;
  }
}

function bind(root: HTMLElement, stage: HTMLElement, scene: Reveal, monoFamily: string, endScene: () => void, mode: Mode): () => void {
  let alive = true;
  let stageW = 1;
  let stageH = 1;
  let aspect = 1.85;
  let rem = 8;
  let time = 0;
  let u = 0;

  const pose = L.makePose();
  const spot: L.Spot = { x: 0, y: 0, depth: 0 };

  void document.fonts.ready.then(() => {
    if (alive) scene.redrawLabels(monoFamily);
  });

  // ------------------------------------------------------------ still
  if (mode === "still") {
    const draw = (): void => {
      if (!alive) return;
      stageW = stage.clientWidth;
      stageH = stage.clientHeight;
      aspect = stageW / Math.max(1, stageH);
      scene.resize(stageW, stageH);
      L.poseAt(L.STOPS[0].at, aspect, pose);
      // In the middle, so the line between the halves runs through it.
      pose.pos.set(0, 0, 0);
      L.project(L.CENTRE, pose, aspect, spot);
      scene.frame({ pose, time: 0, dt: 0, strokes: [], split: true, open: 0, spotX: spot.x, spotY: spot.y });
    };
    draw();
    // Again when the robot is in, and when its numbers have their font.
    void scene.ready.then(draw);
    void document.fonts.ready.then(draw);
    const watcher = new ResizeObserver(draw);
    watcher.observe(stage);
    return () => {
      alive = false;
      watcher.disconnect();
      endScene();
    };
  }

  // --------------------------------------------- what is on the page
  const journey = mode === "journey" ? need<HTMLElement>(root, "[data-journey]") : null;
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  type Callout = {
    block: HTMLElement;
    rule: HTMLElement;
    lead: SVGPathElement;
    dot: SVGCircleElement;
    ring: SVGCircleElement;
    side: "left" | "right";
    /** The block and the inner end of its rule, px from the corner of the work layer. */
    rect: L.Rect;
    from: { x: number; y: number };
    at: { x: number; y: number };
    amount: number;
    painted: number;
  };
  const callouts: Callout[] = [];
  let workLayer: HTMLElement | null = null;
  let skillsLayer: HTMLElement | null = null;
  let ticker: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  let view: HTMLElement | null = null;
  if (journey) {
    workLayer = need<HTMLElement>(root, "[data-work-layer]");
    skillsLayer = need<HTMLElement>(root, "[data-skills-layer]");
    ticker = need<HTMLElement>(root, "[data-ticker]");
    count = need<HTMLElement>(root, "[data-count]");
    view = need<HTMLElement>(root, "[data-view]");
    for (let i = 0; i < L.WORK_STEPS; i += 1) {
      const block = need<HTMLElement>(root, `[data-callout="${i}"]`);
      callouts.push({
        block,
        rule: need<HTMLElement>(block, "[data-rule]"),
        lead: need<SVGPathElement>(root, `[data-lead="${i}"]`),
        dot: need<SVGCircleElement>(root, `[data-dot="${i}"]`),
        ring: need<SVGCircleElement>(root, `[data-ring="${i}"]`),
        side: L.SIDES[i],
        rect: { x0: 0, y0: 0, x1: 0, y1: 0 },
        from: { x: 0, y: 0 },
        at: { x: 0, y: 0 },
        amount: 0,
        painted: -1,
      });
    }
  }

  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = stageW / stageH;
    rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 8;
    scene.resize(stageW, stageH);
    if (!workLayer) return;
    // Each block and its rule, read against the layer they sit in, so
    // the page's scroll cancels.
    const base = workLayer.getBoundingClientRect();
    for (const c of callouts) {
      const b = c.block.getBoundingClientRect();
      const r = c.rule.getBoundingClientRect();
      c.rect = { x0: b.left - base.left, y0: b.top - base.top, x1: b.right - base.left, y1: b.bottom - base.top };
      c.from.x = (c.side === "left" ? r.right : r.left) - base.left;
      c.from.y = r.top + r.height / 2 - base.top;
      c.painted = -1;
    }
  };

  // ------------------------------------------------------- the cursor
  const cursor = { x: 0.5, y: 0.5, inside: false, moved: false, fresh: true };
  const last = { x: 0.5, y: 0.5 };
  const lean = { x: 0, y: 0 };
  const leanTo = { x: 0, y: 0 };
  let radius = 0.12;
  // Long enough that the wandering point starts at once on a page
  // nobody has touched yet.
  let idleFor = IDLE_AFTER + 1;
  let wander = 0;
  const wanderAt = { x: 0.5, y: 0.5, set: false };
  const stamps: { x: number; y: number; r: number; until: number }[] = [];
  const strokes: Stroke[] = Array.from({ length: STROKES }, () => ({ ax: 0, ay: 0, bx: 0, by: 0, radius: 0, strength: 0 }));

  const onPointer = (e: PointerEvent): void => {
    const r = stage.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    // Coming in from outside starts a new stroke where it came in.
    if (inside && !cursor.inside) cursor.fresh = true;
    cursor.x = x;
    cursor.y = y;
    cursor.inside = inside;
    cursor.moved = true;
    leanTo.x = L.clamp(x * 2 - 1, -1, 1);
    leanTo.y = L.clamp(y * 2 - 1, -1, 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const strokesFor = (dt: number, centreX: number, centreY: number): void => {
    // 0: the cursor. A stroke from where it was a frame ago to where it
    // is, wider the faster it went.
    const own = strokes[0];
    if (cursor.moved && cursor.inside) {
      if (cursor.fresh) {
        last.x = cursor.x;
        last.y = cursor.y;
        cursor.fresh = false;
      }
      const distance = Math.hypot((cursor.x - last.x) * aspect, cursor.y - last.y);
      const speed = distance / Math.max(dt, 1 / 240);
      const wanted = L.clamp(0.11 + speed * 0.06, 0.11, 0.24);
      radius += (wanted - radius) * (1 - Math.exp(-dt * 8));
      own.ax = last.x;
      own.ay = last.y;
      own.bx = cursor.x;
      own.by = cursor.y;
      own.radius = radius;
      own.strength = 1;
      last.x = cursor.x;
      last.y = cursor.y;
      idleFor = 0;
    } else {
      own.strength = 0;
      idleFor += dt;
    }
    cursor.moved = false;

    // 1: the wandering point, which keeps the drawing in view when the
    // cursor is away. It loops slowly round the robot.
    wander = L.clamp(wander + (idleFor > IDLE_AFTER ? dt / 1.5 : -dt / 0.4), 0, 1);
    const cx = L.clamp(centreX, 0.25, 0.75);
    const cy = L.clamp(centreY, 0.3, 0.7);
    const wx = cx + (0.34 * Math.sin(0.31 * time + 1) + 0.08 * Math.sin(0.83 * time)) / aspect;
    const wy = cy + 0.22 * Math.sin(0.47 * time) + 0.05 * Math.sin(1.1 * time + 2);
    if (!wanderAt.set) {
      wanderAt.x = wx;
      wanderAt.y = wy;
      wanderAt.set = true;
    }
    const roam = strokes[1];
    roam.ax = wanderAt.x;
    roam.ay = wanderAt.y;
    roam.bx = wx;
    roam.by = wy;
    roam.radius = 0.2 + 0.03 * Math.sin(0.9 * time);
    roam.strength = wander;
    wanderAt.x = wx;
    wanderAt.y = wy;

    // 2 and up: marks made through the dev handle, held for a few seconds.
    for (let i = 2; i < STROKES; i += 1) {
      const s = stamps[i - 2];
      const stroke = strokes[i];
      if (s && s.until > time) {
        stroke.ax = s.x;
        stroke.ay = s.y;
        stroke.bx = s.x;
        stroke.by = s.y;
        stroke.radius = s.r;
        stroke.strength = 1;
      } else {
        stroke.strength = 0;
      }
    }
  };

  // -------------------------------------------------------- the frame
  let shownStep = -1;
  let shownSkills = 0;
  let shownHint = true;

  const paintCallout = (c: Callout, i: number): void => {
    L.project(L.ANCHORS[i], pose, aspect, spot);
    c.at.x = spot.x * stageW;
    c.at.y = spot.y * stageH;
    const drawn = L.clamp(c.amount * 2, 0, 1);
    const run = (c.side === "left" ? L.LEADER_RUN : -L.LEADER_RUN) * stageW;
    // From the dot to the bend to the rule, so it grows out of the robot.
    c.lead.setAttribute(
      "d",
      `M${c.at.x.toFixed(1)} ${c.at.y.toFixed(1)}L${(c.from.x + run).toFixed(1)} ${c.from.y.toFixed(1)}L${c.from.x.toFixed(1)} ${c.from.y.toFixed(1)}`,
    );
    c.lead.style.strokeDashoffset = String(1 - drawn);
    c.lead.style.opacity = "1";
    const grown = L.clamp(c.amount * 3, 0, 1);
    c.dot.setAttribute("cx", c.at.x.toFixed(1));
    c.dot.setAttribute("cy", c.at.y.toFixed(1));
    c.dot.setAttribute("r", (rem * 0.45 * grown).toFixed(2));
    c.ring.setAttribute("cx", c.at.x.toFixed(1));
    c.ring.setAttribute("cy", c.at.y.toFixed(1));
    c.ring.setAttribute("r", (rem * (0.6 + 0.7 * grown)).toFixed(2));
    c.ring.style.opacity = String(grown * 0.8);
    c.dot.style.opacity = "1";
    if (c.amount !== c.painted) {
      c.block.style.opacity = String(L.clamp((c.amount - 0.35) / 0.5, 0, 1));
      // Links in a block that cannot be seen must not be hit.
      c.block.style.pointerEvents = c.amount > 0.6 ? "auto" : "none";
    }
    c.painted = c.amount;
  };

  const frame = (dt: number): void => {
    time += dt;
    if (journey) {
      u = -journey.getBoundingClientRect().top / stageH;
      L.poseAt(u, aspect, pose);
    } else {
      L.poseAt(L.STOPS[0].at, aspect, pose);
      pose.pos.set(0, 0, 0);
    }
    // It is never quite still: a slow sway, and a lean toward the cursor.
    const ease = 1 - Math.exp(-dt * 3);
    lean.x += (leanTo.x - lean.x) * ease;
    lean.y += (leanTo.y - lean.y) * ease;
    const turn = journey ? 0.05 * Math.sin(time * 0.5) : time * 0.22;
    L.nudge(pose, turn + lean.x * 0.1, lean.y * 0.06);

    L.project(L.CENTRE, pose, aspect, spot);
    const centreX = spot.x;
    const centreY = spot.y;
    strokesFor(dt, centreX, centreY);

    // The skills step: its layer comes up with the page and fades in,
    // and the ground opens to the large type behind the canvas.
    const skills = journey ? smooth(5.35, 5.9, u) * (1 - smooth(7.0, 7.4, u)) : 0;
    scene.frame({ pose, time, dt, strokes, split: false, open: skills * 0.32, spotX: centreX, spotY: centreY });

    if (!journey) return;

    for (let i = 0; i < callouts.length; i += 1) {
      const c = callouts[i];
      c.amount = L.calloutShown(i, u) ? Math.min(1, c.amount + dt / 0.55) : Math.max(0, c.amount - dt / 0.25);
      if (c.amount > 0) {
        paintCallout(c, i);
      } else if (c.painted !== 0) {
        c.painted = 0;
        c.lead.style.opacity = "0";
        c.dot.style.opacity = "0";
        c.ring.style.opacity = "0";
        c.block.style.opacity = "0";
        c.block.style.pointerEvents = "none";
      }
    }

    if (skills !== shownSkills) {
      // The rows of large type only run while they can be seen.
      if (ticker && (skills > 0) !== (shownSkills > 0)) {
        ticker.style.visibility = skills > 0 ? "visible" : "hidden";
        ticker.style.setProperty("--b10-run", skills > 0 ? "running" : "paused");
      }
      if (skillsLayer) skillsLayer.style.opacity = skills.toFixed(3);
      shownSkills = skills;
    }
    const hinted = u < 6.9;
    if (hint && hinted !== shownHint) {
      hint.style.opacity = hinted ? "0.7" : "0";
      shownHint = hinted;
    }

    const step = L.stepNumber(u);
    if (step !== shownStep) {
      shownStep = step;
      if (count) count.textContent = `${String(step + 1).padStart(2, "0")} / ${String(L.STEPS).padStart(2, "0")}`;
      if (view) view.textContent = VIEWS[step];
    }
  };

  // ---------------------------------------------------------- the loop
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
  frame(0);

  // ---------------------------------------------------- the dev handle
  const host = window as unknown as { __b10?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const share = (r: L.Rect, w: number, h: number): Percent => ({ x0: pct(r.x0 / w), y0: pct(r.y0 / h), x1: pct(r.x1 / w), y1: pct(r.y1 / h) });
    handle = {
      goTo(i: number): void {
        if (!journey) return;
        const stop = L.STOPS[L.clamp(Math.round(i), 0, L.STEPS - 1)];
        const y = journey.getBoundingClientRect().top + window.scrollY + stop.at * stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      // x, y: a place on the screen, px from the corner of the window.
      // r: the radius, px. Left out, an eighth of the stage's height.
      stamp(x: number, y: number, r?: number): void {
        const box = stage.getBoundingClientRect();
        stamps.unshift({
          x: (x - box.left) / box.width,
          y: (y - box.top) / box.height,
          r: (r ?? box.height * 0.125) / box.height,
          until: time + STAMP_HOLD,
        });
        stamps.length = Math.min(stamps.length, STROKES - 2);
      },
      get state(): DevState {
        return {
          mode,
          u: Math.round(u * 1000) / 1000,
          step: L.stepNumber(u),
          aspect,
          robot: scene.stage(),
          wander,
          box: share(L.screenBox(pose, aspect), 1, 1),
          callouts: callouts.map((c) => ({
            shown: c.amount,
            dot: { x: pct(c.at.x / stageW), y: pct(c.at.y / stageH) },
            block: share(c.rect, stageW, stageH),
            leader: {
              from: { x: pct(c.from.x / stageW), y: pct(c.from.y / stageH) },
              to: { x: pct(c.at.x / stageW), y: pct(c.at.y / stageH) },
            },
          })),
        };
      },
    };
    host.__b10 = handle;
  }

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pointermove", onPointer);
    if (handle && host.__b10 === handle) delete host.__b10;
    endScene();
  };
}
