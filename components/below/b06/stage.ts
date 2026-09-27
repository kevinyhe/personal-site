import { projects, skillGroups } from "@/components/profile";
import * as L from "./layout";
import { flatSkills } from "./marks";
import { buildScene, type Pose, type StripScene } from "./scene";

/**
 * Joins the page to the scene. Each frame it reads how far the page has
 * scrolled and where the pointer is, moves the two rows, and puts the
 * words that belong to a strip beside it.
 *
 * Nothing here goes through React. It all changes every frame.
 */

const pad2 = (n: number): string => String(n).padStart(2, "0");
/** How fast a strip takes up a new place or width, per second. */
const CHASE = 9;
/** A press that moves less than this, in vw, is a click and not a drag. */
const DRAG_START = 0.6;
/** How far past its ends a row can be pulled by hand, in vw. */
const RUBBER = 4;
/** The still frame's moment in the artworks' time. */
const STILL_TIME = 2.4;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b06: ${selector} is missing`);
  return el;
}

type Info = {
  root: HTMLElement;
  title: HTMLElement;
  lines: HTMLElement[];
  left: number;
  side: L.Side;
  /** The column is changing sides. It stays out of sight until the
   *  opened strip has got out of the way. */
  wait: boolean;
  shown: boolean;
  held: boolean;
};

/** A row that scroll and hand both move: where the hand has put it,
 *  how fast the hand let go, and the weight that follows. */
type Row = { drag: number; throwV: number; spring: L.Spring; bend: number; lo: number; hi: number };

const newRow = (at: number, lo: number, hi: number): Row => ({ drag: 0, throwV: 0, spring: { x: at, v: 0 }, bend: 0, lo, hi });

/** Starts the scene on the page. Returns what stops it. Throws if WebGL
 *  cannot start, before it has changed the page. */
export function startStrips(root: HTMLElement, still: boolean): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const monoFamily = getComputedStyle(need<HTMLElement>(root, "[data-mono]")).fontFamily;
  // A canvas of our own, made here and thrown away at the end. In
  // development React starts every effect twice, and a canvas whose
  // context was let go the first time cannot be given a new one.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const scene = buildScene(canvas, monoFamily);
  slot.appendChild(canvas);
  const endScene = (): void => {
    scene.dispose();
    canvas.remove();
  };
  try {
    return bind(root, stage, scene, monoFamily, endScene, still);
  } catch (error) {
    endScene();
    throw error;
  }
}

function bind(
  root: HTMLElement,
  stage: HTMLElement,
  scene: StripScene,
  monoFamily: string,
  endScene: () => void,
  still: boolean,
): () => void {
  let alive = true;
  let stageW = 1;
  let stageH = 1;

  const infos: Info[] = Array.from(root.querySelectorAll<HTMLElement>("[data-info]")).map((el) => ({
    root: el,
    title: need<HTMLElement>(el, "[data-title]"),
    lines: Array.from(el.querySelectorAll<HTMLElement>("[data-line]")),
    left: 0,
    side: "right",
    wait: false,
    shown: false,
    held: false,
  }));

  /** Sets each title as large as its column allows. The real type is
   *  measured, so this holds for whatever font the page ends up with. */
  const fitTitles = (): void => {
    for (const info of infos) {
      info.title.style.fontSize = "5vw";
      const at = parseFloat(getComputedStyle(info.title).fontSize) || 1;
      let widest = 0.1;
      for (const line of info.lines) widest = Math.max(widest, line.getBoundingClientRect().width / at);
      const size = L.titleSize(widest, Math.max(1, info.lines.length), stageW, stageH);
      info.title.style.fontSize = `${((size / stageW) * 100).toFixed(3)}vw`;
    }
  };

  const showInfo = (info: Info, shown: boolean, held: boolean): void => {
    if (info.shown !== shown) {
      info.shown = shown;
      info.root.dataset.on = shown ? "true" : "false";
    }
    if (info.held !== held) {
      info.held = held;
      info.root.dataset.held = held ? "true" : "false";
    }
  };

  const moveTo = (el: HTMLElement, x: number, y: number, extra = ""): void => {
    el.style.transform = `translate3d(${((x / 100) * stageW).toFixed(1)}px, ${((y / 100) * stageH).toFixed(1)}px, 0)${extra}`;
  };

  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    scene.resize(stageW, stageH);
    fitTitles();
  };

  // The marks that are letters were drawn in whatever font was there at
  // the time. Draw them again when the page's own has arrived.
  void document.fonts.ready.then(() => {
    if (!alive) return;
    scene.redrawMarks(monoFamily);
    measure();
    if (still) drawStill();
  });

  const hidden: Pose = { left: 0, width: 1, top: 0, height: 1, stand: 1, light: 1, alpha: 0 };

  /** The row at rest, the first strip open, nothing moving. */
  function drawStill(): void {
    const lay = L.openLayout(0, L.workRowLeft(0.5));
    lay.rects.forEach((r, i) => {
      const win = L.artWindow(i % L.WORK.perProject, r.width);
      const pose: Pose = { left: r.left, width: r.width, top: L.WORK.top, height: L.WORK.h, stand: 1, light: i === 0 ? 1 : 0.6, alpha: 1 };
      scene.work(i, pose, win.centre, win.width, 1, i === 0);
    });
    for (let i = 0; i < flatSkills.length; i += 1) scene.skill(i, hidden, 1);
    scene.workMotion(0, 0);
    scene.skillsMotion(0, 0);
    if (infos[0]) {
      moveTo(infos[0].root, lay.title.left, L.WORK.top);
      showInfo(infos[0], true, false);
    }
    scene.draw(STILL_TIME);
  }

  if (still) {
    const redraw = (): void => {
      measure();
      drawStill();
    };
    redraw();
    const watcher = new ResizeObserver(redraw);
    watcher.observe(stage);
    return () => {
      alive = false;
      watcher.disconnect();
      endScene();
    };
  }

  // ------------------------------------------------------------ the page
  const journey = need<HTMLElement>(root, "[data-journey]");
  const workLayer = need<HTMLElement>(root, "[data-work-layer]");
  const skillsLayer = need<HTMLElement>(root, "[data-skills-layer]");
  const counter = need<HTMLElement>(root, "[data-counter]");
  const hint = need<HTMLElement>(root, "[data-hint]");
  const skillName = need<HTMLElement>(root, "[data-skill-name]");
  const captions = Array.from(root.querySelectorAll<HTMLElement>("[data-caption]"));
  const groupLabels = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));

  const skills = L.skillsRow(skillGroups.map((g) => g.skills.length));
  const workRow = newRow(L.workRowLeft(0), L.WORK.endLeft, L.WORK.startLeft);
  const skillRow = newRow(skills.startLeft, skills.endLeft, skills.startLeft);

  // Each work strip's place, measured from the row's left edge, and its
  // width and brightness. These chase their marks; the row carries them.
  const rel = Array.from({ length: L.WORK.count }, (_, i) => i * L.WORK_PITCH);
  const wide = Array.from({ length: L.WORK.count }, () => L.WORK.w as number);
  const light = Array.from({ length: L.WORK.count }, () => 1);
  // The same for the skills: how far each has stepped aside, and its width.
  const aside = flatSkills.map(() => 0);
  const skillWide = flatSkills.map(() => L.SKILLS.w as number);
  const skillLight = flatSkills.map(() => 1);

  let u = 0;
  let phase: L.Phase = "work";
  let hover = -1;
  let held = -1;
  let heldSide: L.Side = "right";
  let lastOpen = 0;
  let lastSide: L.Side = "right";
  let openness = 0;
  let skillHover = -1;
  let lastSkill = 0;
  let skillOpenness = 0;
  let time = 0;
  let aspect = 1.85;
  // Where the two pinned layers are on the stage, in vh, as last read.
  let workTop = 0;
  let skillsTop = 0;
  let shownCursor = "";
  let shownHint = "";

  // The pointer, in vw and vh of the stage.
  const pointer = { x: -1, y: -1, over: false, mouse: true };
  const drag = { on: false, moved: false, id: -1, fromX: 0, fromDrag: 0, lastX: 0, lastT: 0, row: null as Row | null };

  const close = (): void => {
    held = -1;
    hover = -1;
  };
  const hold = (i: number): void => {
    if (i < 0 || i >= L.WORK.count) return;
    heldSide = L.openLayout(i, workRow.spring.x).side;
    held = i;
  };

  const rowOf = (p: L.Phase): Row | null => (p === "work" ? workRow : p === "skills" ? skillRow : null);

  /** Moves a row: scroll sets where it should be, the hand adds to that,
   *  and the weight follows both. The bend comes from the weight's speed. */
  const stepRow = (row: Row, base: number, active: boolean, dt: number): void => {
    const dragging = drag.on && drag.moved && drag.row === row;
    if (!dragging) {
      row.drag += row.throwV * dt;
      row.throwV *= Math.exp(-3.5 * dt);
      // Off stage, let go of what the hand added, so the row comes back
      // to where scroll alone would have it.
      if (!active) row.drag *= Math.exp(-2 * dt);
    }
    const slack = dragging ? RUBBER : 0;
    row.drag = L.clamp(row.drag, row.lo - RUBBER - base, row.hi + RUBBER - base);
    const target = L.clamp(base + row.drag, row.lo - slack, row.hi + slack);
    L.stepSpring(row.spring, target, dt);
    const want = L.bendFromSpeed(row.spring.v);
    row.bend += (want - row.bend) * (1 - Math.exp(-10 * dt));
    if (Math.abs(row.bend) < 0.0005 && Math.abs(want) < 0.0005) row.bend = 0;
  };

  const pose: Pose = { left: 0, width: 1, top: 0, height: 1, stand: 1, light: 1, alpha: 1 };
  let shownCounter = "";
  let shownSkill = -1;

  const frame = (dt: number): void => {
    time += dt;
    const box = stage.getBoundingClientRect();
    const top = journey.getBoundingClientRect().top;
    u = -top / stageH;
    aspect = stageW / stageH;
    // Read where the pinned layers are from the page itself, so the
    // strips sit with their words even where the browser rounds.
    workTop = ((workLayer.getBoundingClientRect().top - box.top) / stageH) * 100;
    skillsTop = ((skillsLayer.getBoundingClientRect().top - box.top) / stageH) * 100;
    phase = L.phaseAt(u);
    const follow = 1 - Math.exp(-CHASE * dt);

    stepRow(workRow, L.workRowLeft(L.workSlide(u)), phase === "work", dt);
    stepRow(skillRow, L.skillsRowLeft(skills, L.skillsSlide(u)), phase === "skills", dt);
    const x = workRow.spring.x;
    const sx = skillRow.spring.x;
    const workShear = workRow.bend * L.SHEAR_PER_BEND;
    const skillShear = skillRow.bend * L.SHEAR_PER_BEND;
    scene.workMotion(workRow.bend, workShear);
    scene.skillsMotion(skillRow.bend, skillShear);

    // ------------------------------------------------ which strip is open
    const dragging = drag.on && drag.moved;
    if (phase !== "work") close();
    else if (held < 0) {
      if (!pointer.over || !pointer.mouse || dragging) hover = -1;
      else {
        const at = L.workSlotAt(pointer.x, pointer.y, x, L.WORK.top + workTop);
        if (at >= 0) hover = at;
        else if (hover >= 0) {
          // Off the row's places, but still on the strip that is open.
          const r = L.openLayout(hover, x).rects[hover];
          const on =
            pointer.x >= r.left &&
            pointer.x <= r.left + r.width &&
            pointer.y >= L.WORK.top + workTop &&
            pointer.y <= L.WORK.top + workTop + L.WORK.h;
          if (!on) hover = -1;
        }
      }
    }
    const open = held >= 0 ? held : hover;
    const lay = open >= 0 ? L.openLayout(open, x, held >= 0 ? heldSide : undefined) : null;
    if (open >= 0 && lay) {
      lastOpen = open;
      lastSide = lay.side;
    }
    openness += ((open >= 0 ? 1 : 0) - openness) * follow;

    // ------------------------------------------------------ work strips
    const asFence = u > L.FENCE_FROM;
    for (let i = 0; i < L.WORK.count; i += 1) {
      const wantRel = lay ? lay.rects[i].left - x : i * L.WORK_PITCH;
      const wantWide = lay ? lay.rects[i].width : L.WORK.w;
      const wantLight = lay && i !== open ? 0.5 : 1;
      rel[i] += (wantRel - rel[i]) * follow;
      wide[i] += (wantWide - wide[i]) * follow;
      light[i] += (wantLight - light[i]) * follow;
      if (asFence) {
        const r = L.fenceRect(i);
        const stand = L.fenceStand(i, u);
        const win = L.artWindow(i % L.WORK.perProject, r.width);
        pose.left = r.left;
        pose.width = r.width;
        pose.top = L.FENCE.top;
        pose.height = L.FENCE.h;
        pose.stand = stand;
        pose.light = L.lerp(0.45, 1, stand);
        pose.alpha = L.smooth(0, 0.12, stand);
        scene.work(i, pose, win.centre, win.width, L.FENCE.h / L.WORK.h, false);
        continue;
      }
      const centre = x + rel[i] + wide[i] / 2;
      const win = L.artWindow(i % L.WORK.perProject, wide[i]);
      pose.left = x + rel[i];
      pose.width = wide[i];
      pose.top = L.WORK.top + workTop;
      pose.height = L.WORK.h;
      pose.stand = 1;
      pose.light = light[i];
      pose.alpha = 1;
      // The picture slides a little against its frame: with the strip's
      // place on screen, and against the way the row is moving.
      const drift = (centre - 50) * -0.0006 + workRow.bend * 0.05;
      scene.work(i, pose, win.centre + drift * (1 - win.width), win.width, 1, i === open);
    }

    // ----------------------------------------------- words beside a strip
    const titleLeft = lay ? lay.title.left : 0;
    infos.forEach((info, p) => {
      const mine = lay !== null && Math.floor(open / L.WORK.perProject) === p;
      if (!mine || !lay) {
        info.wait = false;
        showInfo(info, false, false);
        return;
      }
      // Changing sides would carry the words across the picture. Take
      // them away instead, and bring them back on the other side once
      // the strip has opened there.
      if (info.shown && info.side !== lay.side) info.wait = true;
      if (info.wait && wide[open] > 0.85 * L.WORK.openW) info.wait = false;
      if (!info.wait) {
        // A column that was out of sight starts where it belongs. One
        // already showing slides there.
        if (!info.shown) {
          info.left = titleLeft;
          info.side = lay.side;
        } else info.left += (titleLeft - info.left) * follow;
        const at = L.bendPoint(info.left, L.WORK.top, workRow.bend, workShear, aspect);
        moveTo(info.root, at.x, at.y);
      }
      showInfo(info, !info.wait, !info.wait && held >= 0);
    });
    captions.forEach((el, p) => {
      const first = p * L.WORK.perProject;
      const at = L.bendPoint(x + rel[first], L.WORK.top + L.WORK.h + 2.5, workRow.bend, workShear, aspect);
      moveTo(el, at.x, at.y);
      el.style.opacity = Math.max(0, 1 - openness * 3).toFixed(3);
    });

    // ----------------------------------------------------------- skills
    // With a mouse the skill under it is open. A finger's tap set it in
    // click(), and it stays until the next tap.
    if (phase !== "skills") skillHover = -1;
    else if (pointer.mouse) {
      skillHover = pointer.over && !dragging ? L.skillSlotAt(skills, pointer.x, pointer.y, sx, L.SKILLS.top + skillsTop) : -1;
    }
    if (skillHover >= 0) lastSkill = skillHover;
    skillOpenness += ((skillHover >= 0 ? 1 : 0) - skillOpenness) * follow;
    const skillsSeen = L.SKILLS.top + skillsTop < 110 && L.SKILLS.top + skillsTop + L.SKILLS.h > -10;
    for (let i = 0; i < flatSkills.length; i += 1) {
      const want = L.skillRect(skills, i, skillHover, 0);
      aside[i] += (want.left - skills.rel[i] - aside[i]) * follow;
      skillWide[i] += (want.width - skillWide[i]) * follow;
      skillLight[i] += ((skillHover >= 0 && i !== skillHover ? 0.62 : 1) - skillLight[i]) * follow;
      pose.left = sx + skills.rel[i] + aside[i];
      pose.width = skillWide[i];
      pose.top = L.SKILLS.top + skillsTop;
      pose.height = L.SKILLS.h;
      pose.stand = 1;
      pose.light = skillLight[i];
      pose.alpha = skillsSeen ? 1 : 0;
      scene.skill(i, pose, Math.min(6.5, skillWide[i] * 0.95));
    }
    groupLabels.forEach((el, g) => {
      const first = skills.rel.indexOf(skills.groups[g].left);
      const left = sx + skills.groups[g].left + (first >= 0 ? aside[first] : 0);
      const at = L.bendPoint(left, L.SKILLS.labelTop, skillRow.bend, skillShear, aspect);
      moveTo(el, at.x, at.y);
    });
    if (shownSkill !== lastSkill) {
      shownSkill = lastSkill;
      skillName.textContent = flatSkills[lastSkill]?.name ?? "";
    }
    {
      const r = L.skillRect(skills, lastSkill, lastSkill, sx);
      const at = L.bendPoint(L.clamp(r.left + r.width / 2, 8, 92), L.SKILLS.nameTop, skillRow.bend, skillShear, aspect);
      moveTo(skillName, at.x, at.y, " translate(-50%, 0)");
      skillName.style.opacity = skillOpenness.toFixed(3);
    }

    // --------------------------------------------------------- the chrome
    let text = "";
    if (phase === "work") {
      const nearest = L.clamp(Math.round((50 - x - L.WORK.w / 2) / L.WORK_PITCH), 0, L.WORK.count - 1);
      const strip = open >= 0 ? open : nearest;
      text = `${pad2(Math.floor(strip / L.WORK.perProject) + 1)} / ${pad2(projects.length)}`;
    } else if (phase === "skills") {
      text = skillHover >= 0 ? `${pad2(skillHover + 1)} / ${flatSkills.length}` : `${flatSkills.length}`;
    }
    if (text !== shownCounter) {
      shownCounter = text;
      counter.textContent = text;
    }
    const hintNow = phase === "contact" ? "0" : "0.6";
    if (hintNow !== shownHint) {
      shownHint = hintNow;
      hint.style.opacity = hintNow;
    }
    const cursor = dragging ? "grabbing" : open >= 0 || skillHover >= 0 ? "pointer" : phase === "contact" ? "" : "grab";
    if (cursor !== shownCursor) {
      shownCursor = cursor;
      stage.style.cursor = cursor;
    }

    scene.draw(time);
  };

  // ------------------------------------------------------------ the hand
  const place = (e: PointerEvent): void => {
    const box = stage.getBoundingClientRect();
    pointer.x = ((e.clientX - box.left) / Math.max(1, box.width)) * 100;
    pointer.y = ((e.clientY - box.top) / Math.max(1, box.height)) * 100;
    pointer.mouse = e.pointerType === "mouse" || e.pointerType === "pen";
    pointer.over = e.target instanceof Node && journey.contains(e.target);
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // A press on a link is the link's.
    if (e.target instanceof Element && e.target.closest("a")) return;
    place(e);
    drag.on = true;
    drag.moved = false;
    drag.id = e.pointerId;
    drag.row = rowOf(phase);
    drag.fromX = e.clientX;
    drag.fromDrag = drag.row ? drag.row.drag : 0;
    drag.lastX = e.clientX;
    drag.lastT = performance.now();
    if (drag.row) drag.row.throwV = 0;
  };

  const onMove = (e: PointerEvent): void => {
    place(e);
    if (!drag.on || e.pointerId !== drag.id || !drag.row) return;
    const moved = ((e.clientX - drag.fromX) / stageW) * 100;
    if (!drag.moved && Math.abs(moved) > DRAG_START) drag.moved = true;
    if (!drag.moved) return;
    drag.row.drag = drag.fromDrag + moved;
    const now = performance.now();
    const gap = Math.max(1, now - drag.lastT) / 1000;
    const speed = (((e.clientX - drag.lastX) / stageW) * 100) / gap;
    // Smoothed, so one late event does not decide the throw.
    drag.row.throwV = L.clamp(drag.row.throwV * 0.6 + speed * 0.4, -220, 220);
    drag.lastX = e.clientX;
    drag.lastT = now;
  };

  const click = (): void => {
    if (phase === "work") {
      if (held >= 0) {
        close();
        return;
      }
      const at = L.workSlotAt(pointer.x, pointer.y, workRow.spring.x, L.WORK.top + workTop);
      hold(at >= 0 ? at : hover);
    } else if (phase === "skills" && !pointer.mouse) {
      // A finger cannot hover. A tap opens the skill under it, and a tap
      // anywhere else closes it.
      skillHover = L.skillSlotAt(skills, pointer.x, pointer.y, skillRow.spring.x, L.SKILLS.top + skillsTop);
    }
  };

  const onUp = (e: PointerEvent): void => {
    if (!drag.on || e.pointerId !== drag.id) return;
    const wasDrag = drag.moved;
    const stale = performance.now() - drag.lastT > 120;
    if (drag.row && (!wasDrag || stale)) drag.row.throwV = 0;
    drag.on = false;
    drag.moved = false;
    drag.row = null;
    place(e);
    if (!wasDrag && e.type === "pointerup") click();
    if (!pointer.mouse) pointer.over = false;
  };

  const onLeave = (): void => {
    pointer.over = false;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && held >= 0) close();
  };

  journey.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  document.documentElement.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKey);

  // ------------------------------------------------------------ the loop
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
  frame(0);

  // ------------------------------------------------- the handle, for tests
  const dev = process.env.NODE_ENV !== "production";
  const holder = window as unknown as Record<string, unknown>;
  if (dev) {
    const vwBox = (el: Element): L.Box => {
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        left: ((r.left - s.left) / s.width) * 100,
        top: ((r.top - s.top) / s.height) * 100,
        width: (r.width / s.width) * 100,
        height: (r.height / s.height) * 100,
      };
    };
    holder.__b06 = {
      /** Holds a project open by its first strip. i is 0 to 4. */
      open: (i: number): void => hold(L.clamp(Math.round(i), 0, projects.length - 1) * L.WORK.perProject),
      /** Holds one strip open. k is 0 to 9. */
      openStrip: (k: number): void => hold(Math.round(k)),
      close,
      /** Puts the row now on stage at x: 0 the start of its travel, 1 the end. */
      slide: (at: number): void => {
        const t = L.clamp(at, 0, 1);
        if (phase === "skills") skillRow.drag = L.skillsRowLeft(skills, t) - L.skillsRowLeft(skills, L.skillsSlide(u));
        else workRow.drag = L.workRowLeft(t) - L.workRowLeft(L.workSlide(u));
      },
      /** Opens a skill, 0 to 41, as a tap would. -1 closes. */
      skill: (i: number): void => {
        pointer.mouse = false;
        skillHover = L.clamp(Math.round(i), -1, flatSkills.length - 1);
      },
      /** Scrolls the page to u screens into the stage, 0 to 5.5. */
      goTo: (to: number): void => {
        const y = window.scrollY + journey.getBoundingClientRect().top + L.clamp(to, 0, L.TRAVEL) * stageH;
        const lenis = holder.__lenis as { scrollTo?: (y: number, o: { immediate: boolean }) => void } | undefined;
        if (lenis?.scrollTo) lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      get state(): unknown {
        const open = held >= 0 ? held : hover;
        const info = open >= 0 ? infos[Math.floor(open / L.WORK.perProject)] : undefined;
        return {
          u,
          phase,
          stage: { width: stageW, height: stageH },
          open,
          held,
          side: open >= 0 ? lastSide : null,
          project: open >= 0 ? Math.floor(lastOpen / L.WORK.perProject) : null,
          counter: shownCounter,
          work: {
            left: workRow.spring.x,
            speed: workRow.spring.v,
            bend: workRow.bend,
            drag: workRow.drag,
            strips: rel.map((r, i) => ({ left: workRow.spring.x + r, width: wide[i] })),
          },
          title: info ? vwBox(info.title) : null,
          column: info ? vwBox(info.root) : null,
          skills: {
            left: skillRow.spring.x,
            right: skillRow.spring.x + skills.width,
            speed: skillRow.spring.v,
            bend: skillRow.bend,
            open: skillHover,
            name: skillHover >= 0 ? flatSkills[skillHover].name : null,
          },
          fence: Array.from({ length: L.WORK.count }, (_, i) => L.fenceStand(i, u)),
        };
      },
    };
  }

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", sync);
    journey.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKey);
    stage.style.cursor = "";
    if (dev) delete holder.__b06;
    endScene();
  };
}
