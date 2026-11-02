import { css, ground, onPalette } from "@/components/cloudPalette";
import type { Look } from "@/components/ideas/i08/look";
import { type Chip, GRAVITY, liveliest, step, STEP, type Tray } from "@/components/ideas/i08/physics";

/** Idea 8: the tray under the skill groups. The open group's tags are thrown out of the robot as chips, land in it and settle; a chip can be picked up and thrown. */

/** A chip's face, in the ruler and in the tray. */
export const CHIP_FACE =
  "select-none whitespace-nowrap rounded-full border border-current px-[0.85em] pb-[0.34em] pt-[0.28em] text-[clamp(12px,0.85vw,22px)] leading-[1.2]";
const CHIP_IN_TRAY = "absolute left-0 top-0 cursor-grab touch-pan-y will-change-transform active:cursor-grabbing";

/** Room between the chips in a row as they are aimed, px. */
const GAP = 8;
/** How far a thrown chip rises before it falls, px. Low, so that it
 *  passes under the groups' type rather than through it. */
const RISE = 16;
/** Where on the robot's ink a chip comes out, down from its top: beside
 *  the groups, its intake, low on its front, though never under the
 *  tray's rim; above the tray, its middle. */
const OUT_BESIDE = 0.96;
const OUT_ABOVE = 0.55;
const OVER_RIM = 6;
/** Seconds between one chip leaving the robot and the next. */
const STAGGER = 0.09;
/** How far the robot has turned to the groups before it throws. */
const TURNED_ENOUGH = 0.7;
/** Seconds it waits for the turn at most. */
const TURN_WAIT = 0.65;
/** Px/s under which a chip counts as still, and seconds of that before
 *  the tray stops. */
const STILL = 6;
const STILL_FOR = 0.4;
/** The fastest a chip leaves the hand, px/s. */
const THROW_MOST = 1100;
/** The pointer's last this many ms give the throw's speed. */
const THROW_SAMPLE = 90;
const LEAVE_MS = 380;

type Live = { chip: Chip; el: HTMLElement; group: number; index: number };
type Slot = { x: number; y: number; row: number };
type Size = { w: number; h: number };
type Sample = { t: number; x: number; y: number };

export type Bench = {
  /** Puts `group`'s chips in the tray: thrown by the robot, or already
   *  settled the first time. */
  show(group: number): void;
  destroy(): void;
};

export function createBench({
  tray,
  layer,
  ruler,
  look,
  groups,
}: {
  tray: HTMLElement;
  layer: HTMLElement;
  ruler: HTMLElement;
  look: () => Look | null;
  groups: string[][];
}): Bench {
  const wide = window.matchMedia("(min-width: 1024px)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const world: Tray = { width: 0, depth: 0, headroom: 0 };
  let sizes: Size[][] = [];
  let live: Live[] = [];
  let queue: number[] = [];
  let throwFrom: number | null = null;
  let askedAt = 0;
  let shown = -1;
  let wanted = -1;
  let measured = false;
  let onScreen = false;
  let gone = false;
  let frame = 0;
  let last = 0;
  let spare = 0;
  let still = 0;
  let held: { item: Live; pointer: number; dx: number; dy: number; samples: Sample[] } | null = null;
  const timers = new Set<number>();

  const local = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = tray.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  /** Each chip's place in rows from the tray's floor up, each row centred:
   *  where it is aimed. */
  const slots = (group: number): Slot[] => {
    const rows: { index: number; x: number }[][] = [[]];
    let x = 0;
    sizes[group].forEach((s, index) => {
      if (x > 0 && x + s.w > world.width) {
        rows.push([]);
        x = 0;
      }
      rows[rows.length - 1].push({ index, x });
      x += s.w + GAP;
    });
    const out: Slot[] = [];
    rows.forEach((row, r) => {
      const end = row[row.length - 1];
      const used = end.x + sizes[group][end.index].w;
      const shift = (world.width - used) / 2 + (Math.random() - 0.5) * Math.min(24, world.width - used);
      for (const { index, x: at } of row) {
        const s = sizes[group][index];
        out[index] = { x: shift + at + s.w / 2, y: world.depth - (r + 0.5) * s.h, row: r };
      }
    });
    return out;
  };

  const rowsOf = (group: number): number => {
    let rows = 1;
    let x = 0;
    for (const s of sizes[group]) {
      if (x > 0 && x + s.w > world.width) {
        rows += 1;
        x = 0;
      }
      x += s.w + GAP;
    }
    return rows;
  };

  const measure = (): void => {
    sizes = groups.map((_, g) =>
      [...ruler.querySelectorAll<HTMLElement>(`[data-g="${g}"]`)].map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    world.width = tray.clientWidth;
    const chipH = sizes[0][0].h;
    const deepest = Math.max(...groups.map((_, g) => rowsOf(g)));
    world.depth = Math.round((deepest + 1.5) * chipH);
    world.headroom = 0.45 * window.innerHeight;
    tray.style.height = `${world.depth}px`;
    for (const item of live) Object.assign(item.chip, sizes[item.group][item.index]);
    measured = true;
  };

  const draw = (): void => {
    for (const { chip, el } of live) {
      const scale = 0.35 + 0.65 * chip.grown;
      el.style.transform = `translate3d(${(chip.x - chip.w / 2).toFixed(2)}px, ${(chip.y - chip.h / 2).toFixed(2)}px, 0) rotate(${chip.lean.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    }
  };

  // The drag is followed on the window, not on the chip's captured
  // pointer: a mouse that moved with no button down lost the capture, and
  // the chip it had let go of stayed held in the air.
  const grab = (item: Live, e: PointerEvent): void => {
    if (e.button !== 0 || held) return;
    e.preventDefault();
    item.el.setPointerCapture(e.pointerId);
    const at = local(e.clientX, e.clientY);
    held = { item, pointer: e.pointerId, dx: at.x - item.chip.x, dy: at.y - item.chip.y, samples: [{ t: e.timeStamp, ...at }] };
    item.chip.held = true;
    item.chip.flying = false;
    item.chip.landed = true;
    window.addEventListener("pointermove", drag);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    wake();
  };
  const letGo = (): void => {
    window.removeEventListener("pointermove", drag);
    window.removeEventListener("pointerup", drop);
    window.removeEventListener("pointercancel", drop);
    if (held) held.item.chip.held = false;
    held = null;
  };
  const drag = (e: PointerEvent): void => {
    if (!held || e.pointerId !== held.pointer) return;
    const at = local(e.clientX, e.clientY);
    held.samples.push({ t: e.timeStamp, ...at });
    while (held.samples.length > 2 && e.timeStamp - held.samples[0].t > THROW_SAMPLE) held.samples.shift();
  };
  const drop = (e: PointerEvent): void => {
    if (!held || e.pointerId !== held.pointer) return;
    const { chip } = held.item;
    const end = { t: e.timeStamp, ...local(e.clientX, e.clientY) };
    const first = held.samples.find((sample) => end.t - sample.t <= THROW_SAMPLE) ?? end;
    const span = (end.t - first.t) / 1000;
    const thrown = e.type === "pointerup" && span > 0;
    const vx = thrown ? (end.x - first.x) / span : 0;
    const vy = thrown ? (end.y - first.y) / span : 0;
    const speed = Math.hypot(vx, vy);
    const cap = speed > THROW_MOST ? THROW_MOST / speed : 1;
    chip.vx = vx * cap;
    chip.vy = vy * cap;
    chip.spin = chip.vx * 0.04;
    letGo();
    wake();
  };

  const make = (group: number, index: number, chip: Chip): Live => {
    const el = document.createElement("span");
    el.className = `${CHIP_FACE} ${CHIP_IN_TRAY}`;
    el.style.background = "var(--bench-ground)";
    el.textContent = groups[group][index];
    el.addEventListener("pointerdown", (e) => grab(item, e));
    const item: Live = { chip, el, group, index };
    layer.append(el);
    return item;
  };

  const settle = (group: number): void => {
    const aim = slots(group);
    live = sizes[group].map((s, index) =>
      make(group, index, { ...s, x: aim[index].x, y: aim[index].y - 2, vx: 0, vy: 0, held: false, flying: false, landed: true, lean: 0, spin: 0, grown: 1 }),
    );
    for (let i = 0; i < 240; i += 1) step(live.map((l) => l.chip), world);
    draw();
  };

  /** Where the robot throws from, in the tray's px: low on its front
   *  beside the groups, its middle above the tray under them. Above the
   *  tray if it is not drawn. */
  const origin = (): { x: number; y: number } => {
    const ink = look()?.ink;
    if (!ink) return { x: wide.matches ? -0.1 * world.width : world.width / 2, y: -world.depth };
    const r = tray.getBoundingClientRect();
    const x = wide.matches ? ink.right - 0.2 * (ink.right - ink.left) : (ink.left + ink.right) / 2;
    if (!wide.matches) return { x: x - r.left, y: ink.top + OUT_ABOVE * (ink.bottom - ink.top) - r.top };
    const chipH = sizes[0][0].h;
    return { x: x - r.left, y: Math.min(ink.top + OUT_BESIDE * (ink.bottom - ink.top) - r.top, -chipH / 2 - OVER_RIM) };
  };

  /** Thrown up by RISE, so it lands on `aim` when it comes down there. */
  const throwOne = (index: number, aim: Slot): void => {
    const s = sizes[shown][index];
    const from = origin();
    const up = Math.sqrt(2 * GRAVITY * RISE);
    const fall = Math.max(0, aim.y - from.y);
    const time = (up + Math.sqrt(up * up + 2 * GRAVITY * fall)) / GRAVITY;
    live.push(
      make(shown, index, {
        ...s,
        x: from.x,
        y: from.y,
        vx: (aim.x - from.x) / time,
        vy: -up,
        held: false,
        flying: true,
        landed: false,
        lean: (Math.random() - 0.5) * 10,
        spin: (Math.random() - 0.5) * 20,
        grown: 0,
      }),
    );
  };

  let aims: Slot[] = [];
  const tick = (now: number): void => {
    frame = 0;
    if (gone || !onScreen) return;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (queue.length) {
      const facing = look()?.facing ?? 1;
      if (throwFrom === null && (facing >= TURNED_ENOUGH || (now - askedAt) / 1000 > TURN_WAIT)) throwFrom = now;
      while (throwFrom !== null && queue.length && now >= throwFrom + (aims.length - queue.length) * STAGGER * 1000) {
        const index = queue.shift() as number;
        throwOne(index, aims[index]);
      }
    }
    if (held) {
      const end = held.samples[held.samples.length - 1];
      const { chip } = held.item;
      chip.x = Math.max(chip.w / 2, Math.min(world.width - chip.w / 2, end.x - held.dx));
      chip.y = Math.max(-world.headroom + chip.h / 2, Math.min(world.depth - chip.h / 2, end.y - held.dy));
    }
    const chips = live.map((l) => l.chip);
    spare += dt;
    while (spare >= STEP) {
      step(chips, world);
      spare -= STEP;
    }
    draw();
    still = !queue.length && !held && liveliest(chips) < STILL ? still + dt : 0;
    if (still > STILL_FOR) {
      for (const c of chips) {
        c.vx = 0;
        c.vy = 0;
      }
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  function wake(): void {
    if (frame || gone || !onScreen) return;
    still = 0;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  const leave = (item: Live): void => {
    item.el.style.pointerEvents = "none";
    item.el.style.transition = `opacity ${LEAVE_MS}ms ease, translate ${LEAVE_MS}ms ease`;
    item.el.style.opacity = "0";
    item.el.style.translate = "0 10px";
    const timer = window.setTimeout(() => {
      item.el.remove();
      timers.delete(timer);
    }, LEAVE_MS);
    timers.add(timer);
  };

  const show = (group: number): void => {
    wanted = group;
    if (!measured || group === shown) return;
    const first = shown === -1;
    letGo();
    live.forEach(leave);
    live = [];
    shown = group;
    if (first || reduced) {
      queue = [];
      settle(group);
      return;
    }
    // The floor's row first, each row from the far end: a chip coming in
    // low from the robot's side does not pass through those already down.
    aims = slots(group);
    queue = aims.map((_, i) => i).sort((a, b) => aims[a].row - aims[b].row || aims[b].x - aims[a].x);
    throwFrom = null;
    askedAt = performance.now();
    wake();
  };

  const seen = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) wake();
  });
  seen.observe(tray);
  const resized = new ResizeObserver(() => {
    if (!measured) return;
    measure();
    wake();
  });
  resized.observe(tray);
  resized.observe(ruler);
  const offPalette = onPalette((t) => tray.style.setProperty("--bench-ground", css(ground(t))));
  void document.fonts.ready.then(() => {
    if (gone) return;
    measure();
    if (wanted >= 0) show(wanted);
  });

  return {
    show,
    destroy() {
      gone = true;
      letGo();
      if (frame) cancelAnimationFrame(frame);
      seen.disconnect();
      resized.disconnect();
      offPalette();
      for (const timer of timers) window.clearTimeout(timer);
      for (const { el } of live) el.remove();
      live = [];
    },
  };
}
