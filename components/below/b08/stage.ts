import { clamp, CONTACT_STOP, labelShow, PROJECT_STOPS, rowLift, SKILLS_STOP, smooth, SPAN, stageAt, STOP_U, STOPS } from "./layout";
import { buildGlass, type Content, type Glass } from "./scene";

/**
 * Joins the page to the scene. Each frame it reads how far the page has
 * scrolled, hands that to the scene, and shows the small text that goes
 * with what is on the stage.
 *
 * Nothing here goes through React: it all changes every frame.
 */

type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean; force?: boolean }): void };

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b08: ${selector} is missing`);
  return el;
}

/** Writes a style only when its value has changed. */
class Fade {
  private last = "";
  constructor(
    private readonly el: HTMLElement,
    private readonly links: boolean,
  ) {}
  set(amount: number): void {
    const text = amount.toFixed(3);
    if (text === this.last) return;
    this.last = text;
    this.el.style.opacity = text;
    // Text that cannot be seen must not be hit either.
    if (this.links) this.el.style.pointerEvents = amount > 0.5 ? "auto" : "none";
    this.el.style.visibility = amount <= 0 ? "hidden" : "visible";
  }
}

/** Starts the scene on the page. Returns what stops it. Throws if WebGL
 *  cannot start, before it has touched the page. */
export function startStage(root: HTMLElement, content: Content, still: boolean): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const family = getComputedStyle(need<HTMLElement>(root, "[data-sans]")).fontFamily;
  // A canvas of our own, made here and thrown away at the end. In
  // development React starts every effect twice, and a canvas whose
  // context was let go the first time cannot be given a new one.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const glass = buildGlass(canvas, family, content);
  slot.appendChild(canvas);
  const endScene = (): void => {
    glass.dispose();
    canvas.remove();
  };
  try {
    return bind(root, stage, glass, family, endScene, still);
  } catch (error) {
    // Something on the page was not as expected. Give the GPU back
    // before passing the error on.
    endScene();
    throw error;
  }
}

function bind(root: HTMLElement, stage: HTMLElement, glass: Glass, family: string, endScene: () => void, still: boolean): () => void {
  let alive = true;
  // The type was drawn in whatever font was there at the time. Ask for
  // the page's own heavy cut, and draw again when it has arrived.
  const fonts = document.fonts;
  const whenFonts = (then: () => void): void => {
    void fonts
      .load(`700 100px ${family}`, "ABC abc 123 @")
      .catch(() => undefined)
      .then(() => fonts.ready)
      .then(() => {
        if (alive) then();
      });
  };

  if (still) {
    // One frame, of the first arrangement, and again if the window changes.
    const draw = (): void => {
      glass.resize(stage.clientWidth, stage.clientHeight);
      glass.snap();
      glass.frame(STOP_U[0], 0, 0);
    };
    draw();
    const watcher = new ResizeObserver(draw);
    watcher.observe(stage);
    whenFonts(() => {
      glass.redraw();
      draw();
    });
    return () => {
      alive = false;
      watcher.disconnect();
      endScene();
    };
  }

  const journey = need<HTMLElement>(root, "[data-journey]");
  const hint = new Fade(need<HTMLElement>(root, "[data-hint]"), false);
  const workHead = new Fade(need<HTMLElement>(root, "[data-work-head]"), false);
  const labels: Fade[] = [];
  for (let i = 0; i < PROJECT_STOPS; i += 1) labels.push(new Fade(need<HTMLElement>(root, `[data-stop="${i}"]`), true));
  const skillsLayer = new Fade(need<HTMLElement>(root, "[data-skills-layer]"), false);
  const rowEls = Array.from(root.querySelectorAll<HTMLElement>("[data-row]"));
  const rows = rowEls.map((el) => ({
    fade: new Fade(el, false),
    label: need<HTMLElement>(el, "[data-row-label]"),
    caps: Array.from(el.querySelectorAll<HTMLElement>("[data-cap]")),
  }));
  const email = need<HTMLElement>(root, "[data-email]");

  let stageW = 1;
  let stageH = 1;
  const pc = (v: number): string => `${(v * 100).toFixed(3)}%`;

  /** Puts the words that belong to places in the scene at those places. */
  const place = (): void => {
    const grid = glass.grid();
    let j = 0;
    rows.forEach((row, r) => {
      row.label.style.left = pc(grid.labelLeft);
      row.label.style.top = pc(grid.rows[r] ?? 0);
      row.label.style.width = pc(grid.labelRight - grid.labelLeft - 0.02);
      for (const cap of row.caps) {
        const at = grid.lenses[j];
        j += 1;
        if (!at) continue;
        cap.style.left = pc(at.x);
        cap.style.top = pc(at.y + grid.r * 1.14 + 0.008);
      }
    });
    // The email's link lies over the email drawn in the scene. Its own
    // letters are not painted; it is there to be read out and clicked.
    const head = glass.heads()[CONTACT_STOP];
    if (head) {
      email.style.left = pc(head.left[0]);
      email.style.top = pc(head.box.t);
      email.style.width = pc(head.width[0]);
      email.style.height = pc(head.box.b - head.box.t);
      email.style.fontSize = `${(head.size * 100).toFixed(3)}vw`;
    }
  };

  const measure = (): void => {
    stageW = stage.clientWidth || 1;
    stageH = stage.clientHeight || 1;
    glass.resize(stageW, stageH);
    place();
  };

  let time = 0;
  let u = 0;
  let snaps = 2;

  const frame = (dt: number): void => {
    time += dt;
    u = clamp(-journey.getBoundingClientRect().top / stageH, -1, SPAN);
    if (snaps > 0) {
      snaps -= 1;
      glass.snap();
    }
    glass.frame(u, time, dt);

    for (let i = 0; i < labels.length; i += 1) labels[i].set(labelShow(i, u));
    workHead.set(1 - smooth((u - 4.5) / 0.3));
    const skills = smooth((u - 4.85) / 0.15) * (1 - smooth((u - 7) / 0.2));
    skillsLayer.set(skills);
    if (skills > 0) for (let r = 0; r < rows.length; r += 1) rows[r].fade.set(0.62 + 0.38 * rowLift(r, u));
    hint.set(0.7 * (1 - smooth((u - 7.2) / 0.3)));
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
  whenFonts(() => {
    glass.redraw();
    place();
  });

  const onPointer = (e: PointerEvent): void => {
    const box = stage.getBoundingClientRect();
    const x = (e.clientX - box.left) / (box.width || 1);
    const y = (e.clientY - box.top) / (box.height || 1);
    glass.pointer(x, y, x >= 0 && x <= 1 && y >= 0 && y <= 1);
  };
  const onLeave = (): void => glass.pointer(0.5, 0.5, false);
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);

  // In development, a handle for whoever drives the page from outside.
  const host = window as unknown as { __b08?: unknown; __lenis?: LenisLike };
  if (process.env.NODE_ENV !== "production") {
    host.__b08 = {
      stops: STOPS,
      /** Scrolls to stop i (0 to 4 the projects, 5 the skills, 6 the contact) and settles the scene there. */
      goTo(i: number): number {
        const stop = clamp(Math.round(i), 0, STOPS - 1);
        const top = journey.getBoundingClientRect().top + window.scrollY;
        const y = top + STOP_U[stop] * stageH;
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
        snaps = 3;
        return y;
      },
      get state() {
        const at = stageAt(u);
        const head = glass.heads()[at.to];
        return {
          u,
          stage: at,
          size: { w: stageW, h: stageH },
          running,
          headline: head ? { lines: head.lines, sizeVw: head.size * 100, box: head.box } : null,
          solids: glass.seen().map((s) => ({
            name: s.name,
            xPct: s.x * 100,
            yPct: s.y * 100,
            rPctOfHeight: s.r * 100,
            show: s.show,
          })),
          lenses: at.from === SKILLS_STOP || at.to === SKILLS_STOP ? glass.grid().lenses.length : 0,
        };
      },
    };
  }

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
    document.documentElement.removeEventListener("pointerleave", onLeave);
    if (host.__b08) delete host.__b08;
    endScene();
  };
}
