/**
 * Idea 9, "Sky": the end page's night sky (Ending.tsx) answers the cursor.
 * Its stars drift with the cursor in three depths, a click or tap sends a
 * shooting star from where it lands, and the stars the cursor passes link
 * up into a constellation of dots that fades after about four seconds.
 *
 * All of it is drawn into Ending's own sky painter, in its cells (one
 * pixel of the painter is one diamond of the dot field), so it reads in
 * the same dots as the stars. A star moves in whole cells, about 7px on a
 * wide screen, as the stars' own slow wheel already does.
 */

type Point = [number, number];
type Link = { from: number; to: number; born: number };
type Shot = { x: number; y: number; dx: number; dy: number; born: number };

/** Ending's shooting star, drawn `life` (0..1) into its flight from (x, y), heading (dx, dy). */
export type ShootingStar = (ctx: CanvasRenderingContext2D, W: number, x: number, y: number, dx: number, dy: number, life: number) => void;

export type Sky = {
  /** Each depth's offset this frame (far, mid, near), in cells. */
  shift(t: number, W: number): readonly Point[];
  /** Where star `i` was drawn this frame, in cells. */
  seen(i: number, x: number, y: number): void;
  /** The constellation and the stars sent by clicks, drawn before the peak. */
  paint(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void;
  dispose(): void;
};

/** How far each depth drifts, px, with the cursor at an edge of the screen. */
const DRIFT_PX = [4, 10, 20];
const DRIFT_EASE_SECONDS = 0.6;
/** A star is passed when the cursor comes within this many px of it. A
 *  move longer than JUMP_SHARE of the screen's width in one frame is a
 *  jump (the cursor coming back in elsewhere), and passes nothing. */
const PASS_PX = 34;
const JUMP_SHARE = 0.12;
/** Stars passed within CHAIN_GAP seconds of each other, and no further
 *  apart than LINK_SHARE of the screen's width, are linked. */
const CHAIN_GAP = 1.5;
const LINK_SHARE = 0.22;
const MAX_LINKS = 40;
/** A link lasts LINK_LIFE seconds, fading over the last LINK_FADE. */
const LINK_LIFE = 4;
const LINK_FADE = 1.6;
/** The link's dots, every DOT_STEP cells, and how much light they and the
 *  linked stars add to the sky (0..1). */
const DOT_STEP = 2;
const LINK_LIGHT = 0.24;
const STAR_LIGHT = 0.5;
/** Clicks send shooting stars down and to the left at 17 to 33 degrees,
 *  as the sky's own do; from the left of the screen, down to the right. */
const SHOT_LEFT_EDGE = 0.3;

/** Which depth a star is at: the brighter, the nearer. */
export function depthOf(brightness: number): number {
  return brightness > 0.8 ? 2 : brightness > 0.57 ? 1 : 0;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len = vx * vx + vy * vy;
  const k = len > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - k * vx, p[1] - a[1] - k * vy);
}

const fade = (age: number): number => {
  const v = Math.min(1, Math.max(0, (LINK_LIFE - age) / LINK_FADE));
  return v * v * (3 - 2 * v);
};

export function createSky(opts: {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  stars: number;
  shootFor: number;
  shootingStar: ShootingStar;
}): Sky {
  const { root, canvas, shootFor, shootingStar } = opts;
  const pointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const drawn = new Float32Array(opts.stars * 2);
  const offsets: Point[] = DRIFT_PX.map(() => [0, 0]);
  const links: Link[] = [];
  const shots: Shot[] = [];
  // The cursor, as shares of the canvas; and where it was last frame, in cells.
  let cursor: Point | null = null;
  let trail: Point | null = null;
  let lastStar = -1;
  let lastStarAt = -Infinity;
  let lastT = -1;
  const pendingShots: Point[] = [];

  const share = (e: MouseEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") cursor = share(e);
  };
  const onLeave = (): void => {
    cursor = null;
    trail = null;
  };
  const onClick = (e: MouseEvent): void => {
    if (e.target instanceof Element && e.target.closest("a")) return;
    pendingShots.push(share(e));
  };
  if (pointer) {
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
  }
  root.addEventListener("click", onClick);

  const shift = (t: number, W: number): readonly Point[] => {
    const dt = lastT < 0 ? 0 : Math.max(0, t - lastT);
    lastT = t;
    if (!pointer) return offsets;
    const cell = canvas.clientWidth / W;
    const ease = 1 - Math.exp(-dt / DRIFT_EASE_SECONDS);
    DRIFT_PX.forEach((px, depth) => {
      const goalX = cursor ? ((cursor[0] - 0.5) * 2 * px) / cell : 0;
      const goalY = cursor ? ((cursor[1] - 0.5) * 2 * px) / cell : 0;
      offsets[depth][0] += (goalX - offsets[depth][0]) * ease;
      offsets[depth][1] += (goalY - offsets[depth][1]) * ease;
    });
    return offsets;
  };

  const seen = (i: number, x: number, y: number): void => {
    drawn[2 * i] = x + 0.5;
    drawn[2 * i + 1] = y + 0.5;
  };
  const starAt = (i: number): Point => [drawn[2 * i], drawn[2 * i + 1]];

  /** Links the stars the cursor passed since the last frame. */
  const pass = (W: number, H: number, t: number): void => {
    if (!cursor) return;
    const now: Point = [cursor[0] * W, cursor[1] * H];
    const from = trail && Math.hypot(now[0] - trail[0], now[1] - trail[1]) < JUMP_SHARE * W ? trail : now;
    trail = now;
    const reach = PASS_PX / (canvas.clientWidth / W);
    const passed: number[] = [];
    for (let i = 0; i < opts.stars; i += 1) {
      if (distanceToSegment(starAt(i), from, now) <= reach) passed.push(i);
    }
    // In the order the cursor came to them.
    passed.sort((a, b) => Math.hypot(drawn[2 * a] - from[0], drawn[2 * a + 1] - from[1]) - Math.hypot(drawn[2 * b] - from[0], drawn[2 * b + 1] - from[1]));
    for (const i of passed) {
      if (i === lastStar) continue;
      const [ax, ay] = lastStar >= 0 ? starAt(lastStar) : [0, 0];
      const [bx, by] = starAt(i);
      const close = lastStar >= 0 && t - lastStarAt < CHAIN_GAP && Math.hypot(bx - ax, by - ay) < LINK_SHARE * W;
      const known = links.some((l) => (l.from === lastStar && l.to === i) || (l.from === i && l.to === lastStar));
      if (close && !known) links.push({ from: lastStar, to: i, born: t });
      lastStar = i;
      lastStarAt = t;
    }
    while (links.length > MAX_LINKS) links.shift();
  };

  const paint = (x: CanvasRenderingContext2D, W: number, H: number, t: number): void => {
    for (const [u, v] of pendingShots.splice(0)) {
      const angle = ((17 + 16 * Math.random()) * Math.PI) / 180;
      shots.push({ x: u * W, y: v * H, dx: (u < SHOT_LEFT_EDGE ? 1 : -1) * Math.cos(angle), dy: Math.sin(angle), born: t });
    }
    if (pointer) pass(W, H, t);

    while (links.length && t - links[0].born > LINK_LIFE) links.shift();
    if (links.length) {
      x.globalCompositeOperation = "lighter";
      for (const l of links) {
        const alpha = fade(t - l.born);
        const [ax, ay] = starAt(l.from);
        const [bx, by] = starAt(l.to);
        const len = Math.hypot(bx - ax, by - ay);
        // A star that wheeled off one edge and on at the other.
        if (len > LINK_SHARE * W * 1.5) continue;
        const dots = Math.floor(len / DOT_STEP);
        const line = Math.round(255 * LINK_LIGHT * alpha);
        x.fillStyle = `rgb(${line},${line},${line})`;
        for (let k = 1; k < dots; k += 1) {
          const f = k / dots;
          x.fillRect(Math.floor(ax + (bx - ax) * f), Math.floor(ay + (by - ay) * f), 1, 1);
        }
        const star = Math.round(255 * STAR_LIGHT * alpha);
        x.fillStyle = `rgb(${star},${star},${star})`;
        x.fillRect(Math.floor(ax), Math.floor(ay), 1, 1);
        x.fillRect(Math.floor(bx), Math.floor(by), 1, 1);
      }
      x.globalCompositeOperation = "source-over";
    }

    for (let i = shots.length - 1; i >= 0; i -= 1) {
      const s = shots[i];
      const life = (t - s.born) / shootFor;
      if (life > 1) shots.splice(i, 1);
      else shootingStar(x, W, s.x, s.y, s.dx, s.dy, life);
    }
  };

  return {
    shift,
    seen,
    paint,
    dispose: () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("click", onClick);
    },
  };
}
