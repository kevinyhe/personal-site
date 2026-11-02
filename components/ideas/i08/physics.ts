/** Idea 8: the tray's chips as upright rounded boxes under gravity, with a floor, two walls and a ceiling. */

export type Chip = {
  w: number;
  h: number;
  /** Its middle, px from the tray's top left. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held by the pointer: it goes where it is put and pushes the others. */
  held: boolean;
  /** Thrown out of the robot and not yet over the tray on its way down:
   *  it passes through the walls and the other chips until it is. */
  flying: boolean;
  /** Has come down on the floor or on a chip that has. Two chips still in
   *  the air pass through each other: thrown one after the other on near
   *  the same line, they met in the air and came down as a tower. */
  landed: boolean;
  /** Drawn only: its lean, degrees, and how fast that changes. Eased flat
   *  once something holds it up. */
  lean: number;
  spin: number;
  /** Drawn only: it grows out of the robot, 0 to 1. */
  grown: number;
};

export type Tray = {
  width: number;
  depth: number;
  /** How far above the tray's top a thrown chip may go, px. */
  headroom: number;
};

export const GRAVITY = 1000;
export const STEP = 1 / 120;
/** A slow landing does not bounce; a fast one keeps this much. */
const RESTITUTION = 0.18;
const BOUNCE_FROM = 140;
const FRICTION = 0.55;
const PASSES = 6;
/** A chip resting on the round end of the one under it slides off it, at
 *  up to this share of gravity: as boxes they balanced on a few px of
 *  corner, over nothing. */
const TIP = 0.8;
const GROW_TIME = 0.3;
const LEAN_SETTLE = 10;

const mass = (c: Chip): number => (c.held ? 0 : 1 / (c.w * c.h));

/** Pushes `a` and `b` apart if they overlap. Null if they do not; else
 *  the one on top, if one is on the other. */
function collide(a: Chip, b: Chip): { upper: Chip | null } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
  const overlapY = (a.h + b.h) / 2 - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return null;
  const ia = mass(a);
  const ib = mass(b);
  const total = ia + ib;
  if (total === 0) return { upper: null };
  const alongX = overlapX < overlapY;
  const nx = alongX ? Math.sign(dx) || 1 : 0;
  const ny = alongX ? 0 : Math.sign(dy) || 1;
  const depth = alongX ? overlapX : overlapY;
  a.x -= (nx * depth * ia) / total;
  a.y -= (ny * depth * ia) / total;
  b.x += (nx * depth * ib) / total;
  b.y += (ny * depth * ib) / total;
  const upper = alongX ? null : dy > 0 ? a : b;
  const rounding = Math.min(a.h, b.h) / 2;
  const onEnd = upper !== null && overlapX < rounding;
  if (upper && onEnd && !upper.held) {
    const lower = upper === a ? b : a;
    upper.vx += (Math.sign(upper.x - lower.x) * TIP * GRAVITY * STEP * (1 - overlapX / rounding)) / PASSES;
  }
  const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (closing >= 0) return { upper };
  const bounce = -closing > BOUNCE_FROM ? RESTITUTION : 0;
  const push = (-(1 + bounce) * closing) / total;
  a.vx -= push * nx * ia;
  a.vy -= push * ny * ia;
  b.vx += push * nx * ib;
  b.vy += push * ny * ib;
  if (onEnd) return { upper };
  const sliding = alongX ? b.vy - a.vy : b.vx - a.vx;
  const rub = Math.max(-FRICTION * push, Math.min(FRICTION * push, -sliding / total));
  if (alongX) {
    a.vy -= rub * ia;
    b.vy += rub * ib;
  } else {
    a.vx -= rub * ia;
    b.vx += rub * ib;
  }
  return { upper };
}

/** Holds `c` inside the tray: `against` is the side it pushes on, `at`
 *  the bound, and its speed into that side is bounced or stopped, its
 *  speed along it rubbed down. */
function bound(c: Chip, axis: "x" | "y", at: number, against: 1 | -1): boolean {
  const half = axis === "x" ? c.w / 2 : c.h / 2;
  const pos = c[axis];
  if ((pos + half * against - at) * against <= 0) return false;
  c[axis] = at - half * against;
  const v = axis === "x" ? "vx" : "vy";
  const along = axis === "x" ? "vy" : "vx";
  const into = c[v] * against;
  if (into > 0) {
    c[v] = -c[v] * (into > BOUNCE_FROM ? RESTITUTION : 0);
    const rub = FRICTION * into * (1 + RESTITUTION);
    c[along] = Math.sign(c[along]) * Math.max(0, Math.abs(c[along]) - rub);
  }
  return true;
}

/** One STEP of the tray. */
export function step(chips: Chip[], tray: Tray): void {
  for (const c of chips) {
    if (c.held) continue;
    c.vy += GRAVITY * STEP;
    c.x += c.vx * STEP;
    c.y += c.vy * STEP;
    if (c.flying && c.vy > 0 && c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= tray.width) c.flying = false;
    c.grown = Math.min(1, c.grown + STEP / GROW_TIME);
  }
  const held = new Set<Chip>();
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (let i = 0; i < chips.length; i += 1) {
      const a = chips[i];
      if (a.flying) continue;
      for (let j = i + 1; j < chips.length; j += 1) {
        const b = chips[j];
        if (b.flying || (!a.landed && !b.landed)) continue;
        const contact = collide(a, b);
        if (!contact) continue;
        a.landed = true;
        b.landed = true;
        if (contact.upper) held.add(contact.upper);
      }
    }
    for (const c of chips) {
      if (bound(c, "y", tray.depth, 1)) {
        held.add(c);
        c.flying = false;
        c.landed = true;
      }
      bound(c, "y", -tray.headroom, -1);
      if (c.flying) continue;
      bound(c, "x", 0, -1);
      bound(c, "x", tray.width, 1);
    }
  }
  for (const c of chips) {
    if (held.has(c) || c.held) c.lean -= c.lean * Math.min(1, LEAN_SETTLE * STEP);
    else c.lean += c.spin * STEP;
  }
}

/** The fastest any chip is going, px/s, or Infinity while one is still
 *  growing, leaning or flying. */
export function liveliest(chips: Chip[]): number {
  let most = 0;
  for (const c of chips) {
    if (c.flying || !c.landed || c.grown < 1 || Math.abs(c.lean) > 0.05) return Infinity;
    most = Math.max(most, Math.hypot(c.vx, c.vy));
  }
  return most;
}
