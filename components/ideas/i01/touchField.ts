// Idea 1, "Touch": the one field every bar picture reads while it draws on /i/1.

/** The idea that switches the field on (ideaNow() / useIdea()). */
export const TOUCH_IDEA = 1;

/** The push's gaussian radius, CSS px. Bars feel it out to about 2.5 of
 *  these, 120 px from the cursor. */
export const PUSH_RADIUS = 48;
/** How far a bar one radius from the cursor moves aside, CSS px: about one
 *  koi bar. Nearer and further bars move less. */
export const PUSH = 12;
/** The head and its trail, at most. The bar shader's u_touch is this long. */
export const MAX_POINTS = 16;
/** The tap ripple's ring: its thickness and push, CSS px. */
export const RIPPLE_WIDTH = 28;
const RIPPLE_PUSH = 10;
const RIPPLE_REACH = 220;
const RIPPLE_LIFE = 0.9;
/** Past this a point moves a bar by under a fifth of a px. */
const REACH = 3.5 * PUSH_RADIUS;
/** A new trail point is left behind once the cursor is this far, and this
 *  long, from the last one. */
const TRAIL_SPACING = 24;
const TRAIL_GAP_MS = 40;
/** The trail springs back critically damped, (1 + t/τ)·e^(-t/τ): 4% left
 *  at 0.6 s. */
const TRAIL_SPRING = 0.12;
const HEAD_ATTACK = 0.06;
/** The smear, CSS px of ghost per px of scroll in a 60 Hz frame, and at most. */
const SMEAR_GAIN = 0.6;
const SMEAR_MAX = 32;
const SMEAR_ATTACK = 0.03;
/** Gone (under 0.5 px) about 0.4 s after the page stops. */
const SMEAR_RELEASE = 0.09;
const TAP_MS = 350;
const TAP_SLOP = 12;

export type TouchPoint = { x: number; y: number; strength: number; from: number; age: number; held: boolean };
export type Ripple = { x: number; y: number; radius: number; strength: number };
/** A box in an element's own px, from its top left corner (client px). */
export type TouchRegion = { left: number; top: number; right: number; bottom: number };

export type TouchTarget = {
  element: Element;
  /** True for a picture that paints only what it is asked to (a 2D
   *  canvas): it is also handed what is on screen whenever the page
   *  scrolls, to bring rows painted under an older smear up to date. False
   *  for one that always draws whole (WebGL). */
  partial: boolean;
  /** pointer: where the cursor and ripple move bars now or did last
   *  frame. seen: the part on (or near) the screen, while the page scrolls
   *  or smears. */
  repaint: (pointer: TouchRegion | null, seen: TouchRegion | null) => void;
};

type Joined = TouchTarget & { last: TouchRegion | null };

/** Client px. points[0] is the cursor's own point while it is on the page. */
const points: TouchPoint[] = [];
let ripple: (Ripple & { age: number }) | null = null;
/** Px the smear's ghost trails above each bar (negative: below). */
let smearUp = 0;
let lastSmearUp = 0;

const targets = new Set<Joined>();
let rafId: number | null = null;
let lastTickAt: number | null = null;
let lastScrollY = 0;
let pointerMoved = false;
let lastSpawn = { x: 0, y: 0, at: 0 };
let tap: { id: number; x: number; y: number; at: number } | null = null;
let reducedMotion = false;

export function touchPoints(): readonly TouchPoint[] {
  return points;
}

export function touchRipple(): Ripple | null {
  return ripple;
}

export function touchSmearUp(): number {
  return smearUp;
}

/** How far the field moves a bar at (x, y), client px, positive to the
 *  right. The bar shader (barShader.ts, pushAt) is the same sum. Each
 *  point pushes away from itself, strongest one radius out; where points
 *  overlap their pushes are averaged, not added, so a pile of trail points
 *  can never push harder than one. */
export function touchShiftAt(x: number, y: number): number {
  let shift = 0;
  let weight = 0;
  for (const p of points) {
    const ux = (x - p.x) / PUSH_RADIUS;
    const uy = (y - p.y) / PUSH_RADIUS;
    const k = Math.exp(-0.5 * (ux * ux + uy * uy));
    shift += p.strength * ux * k;
    weight += p.strength * k;
  }
  shift = (shift * Math.exp(0.5) * PUSH) / Math.max(1, weight);
  if (ripple) {
    const dx = x - ripple.x;
    const len = Math.max(1, Math.hypot(dx, y - ripple.y));
    const ring = (len - ripple.radius) / RIPPLE_WIDTH;
    shift += (ripple.strength * dx * Math.exp(-ring * ring)) / len;
  }
  return shift;
}

/** True when nothing in the field can move a bar in the client-px band
 *  from top to bottom, so a painter can skip the row. */
export function touchQuietBetween(top: number, bottom: number): boolean {
  for (const p of points) if (p.y + REACH > top && p.y - REACH < bottom) return false;
  if (!ripple) return true;
  const reach = ripple.radius + 2.5 * RIPPLE_WIDTH;
  return ripple.y + reach <= top || ripple.y - reach >= bottom;
}

/** Adds a picture to the field; the field calls its repaint while
 *  anything near it moves. Returns the leave. */
export function joinTouchField(target: TouchTarget): () => void {
  const joined: Joined = { ...target, last: null };
  targets.add(joined);
  if (targets.size === 1) listen(true);
  return () => {
    targets.delete(joined);
    if (targets.size === 0) {
      listen(false);
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

const wake = (): void => {
  if (rafId !== null || targets.size === 0) return;
  lastTickAt = null;
  rafId = requestAnimationFrame(tick);
};

const release = (p: TouchPoint): void => {
  p.held = false;
  p.from = p.strength;
  p.age = 0;
};

const onPointerMove = (e: PointerEvent): void => {
  if (e.pointerType === "touch") return;
  const head = points[0]?.held ? points[0] : null;
  if (!head) {
    points.unshift({ x: e.clientX, y: e.clientY, strength: 0, from: 0, age: 0, held: true });
    lastSpawn = { x: e.clientX, y: e.clientY, at: e.timeStamp };
  } else if (Math.hypot(e.clientX - lastSpawn.x, e.clientY - lastSpawn.y) >= TRAIL_SPACING && e.timeStamp - lastSpawn.at >= TRAIL_GAP_MS) {
    // The head leaves its strength behind as a trail point where it is and
    // starts again from nothing, so the field does not jump.
    points.splice(1, 0, { ...head, held: false, from: head.strength, age: 0 });
    head.strength = 0;
    lastSpawn = { x: e.clientX, y: e.clientY, at: e.timeStamp };
  }
  if (points.length > MAX_POINTS) points.pop();
  const moved = points[0];
  moved.x = e.clientX;
  moved.y = e.clientY;
  pointerMoved = true;
  wake();
};

const onPointerLeave = (): void => {
  if (points[0]?.held) release(points[0]);
  wake();
};

const onPointerDown = (e: PointerEvent): void => {
  if (e.pointerType !== "touch") return;
  tap = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
};

const onPointerUp = (e: PointerEvent): void => {
  if (e.pointerType !== "touch" || !tap || tap.id !== e.pointerId) return;
  const quick = e.timeStamp - tap.at < TAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < TAP_SLOP;
  tap = null;
  if (!quick) return;
  ripple = { x: e.clientX, y: e.clientY, radius: 0, strength: RIPPLE_PUSH, age: 0 };
  wake();
};

const onPointerCancel = (): void => {
  tap = null;
};

const listen = (on: boolean): void => {
  if (!on) {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("scroll", wake);
    window.removeEventListener("blur", onPointerLeave);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    return;
  }
  lastScrollY = window.scrollY;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("blur", onPointerLeave);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
};

const stepSmear = (scrolled: number, dt: number): void => {
  lastSmearUp = smearUp;
  const perFrame = scrolled / (dt * 60);
  const target = reducedMotion ? 0 : -Math.sign(scrolled) * Math.min(SMEAR_MAX, Math.abs(perFrame) * SMEAR_GAIN);
  const growing = Math.abs(target) > Math.abs(smearUp);
  smearUp += (target - smearUp) * (1 - Math.exp(-dt / (growing ? SMEAR_ATTACK : SMEAR_RELEASE)));
  if (Math.abs(smearUp) < 0.05) smearUp = 0;
};

const stepPoints = (dt: number): void => {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i];
    if (p.held) {
      p.strength = p.strength > 0.999 ? 1 : p.strength + (1 - p.strength) * (1 - Math.exp(-dt / HEAD_ATTACK));
      continue;
    }
    p.age += dt;
    const t = p.age / TRAIL_SPRING;
    p.strength = p.from * (1 + t) * Math.exp(-t);
    if (p.strength < 0.01) points.splice(i, 1);
  }
};

const stepRipple = (dt: number): void => {
  if (!ripple) return;
  ripple.age += dt;
  const t = ripple.age / RIPPLE_LIFE;
  if (t >= 1) {
    ripple = null;
    return;
  }
  ripple.radius = RIPPLE_WIDTH + (RIPPLE_REACH - RIPPLE_WIDTH) * (1 - (1 - t) ** 3);
  ripple.strength = RIPPLE_PUSH * (1 - t) ** 2;
};

const union = (a: TouchRegion | null, b: TouchRegion | null): TouchRegion | null => {
  if (!a) return b;
  if (!b) return a;
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
};

/** The part of rect that the client-px box covers, in rect's own px. */
const within = (rect: DOMRect, left: number, top: number, right: number, bottom: number): TouchRegion | null => {
  const l = Math.max(left, rect.left);
  const t = Math.max(top, rect.top);
  const r = Math.min(right, rect.right);
  const b = Math.min(bottom, rect.bottom);
  if (l >= r || t >= b) return null;
  return { left: l - rect.left, top: t - rect.top, right: r - rect.left, bottom: b - rect.top };
};

/** Where the field moves bars on rect now, in rect's own px. */
const reachOn = (rect: DOMRect): TouchRegion | null => {
  let region: TouchRegion | null = null;
  for (const p of points) region = union(region, within(rect, p.x - REACH, p.y - REACH, p.x + REACH, p.y + REACH));
  if (ripple) {
    const r = ripple.radius + 2.5 * RIPPLE_WIDTH;
    region = union(region, within(rect, ripple.x - r, ripple.y - r, ripple.x + r, ripple.y + r));
  }
  return region;
};

const repaintTargets = (scrolled: boolean): void => {
  const smearing = smearUp !== 0 || lastSmearUp !== 0;
  // A quarter screen past each edge, so rows are right before they show.
  const margin = window.innerHeight / 4;
  for (const t of targets) {
    const rect = t.element.getBoundingClientRect();
    const reach = reachOn(rect);
    const pointer = union(reach, t.last);
    t.last = reach;
    const seen = smearing || (scrolled && t.partial) ? within(rect, 0, -margin, window.innerWidth, window.innerHeight + margin) : null;
    if (pointer || seen) t.repaint(pointer, seen);
  }
};

function tick(now: number): void {
  rafId = null;
  const dt = lastTickAt === null ? 1 / 60 : Math.min(0.1, (now - lastTickAt) / 1000);
  lastTickAt = now;
  const scrolled = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
  stepSmear(scrolled, dt);
  stepPoints(dt);
  stepRipple(dt);
  repaintTargets(scrolled !== 0);
  const head = points[0]?.held ? points[0] : null;
  const settling = pointerMoved || scrolled !== 0 || smearUp !== 0 || ripple !== null || points.length > (head ? 1 : 0) || (head !== null && head.strength < 1);
  pointerMoved = false;
  if (settling) rafId = requestAnimationFrame(tick);
}
