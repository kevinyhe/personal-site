/** Idea 6: a flock of birds on a 2D canvas that wheels over the cloud passage and spells "Work" before Work's heading comes in. */
import { GROUND, INK } from "@/components/luke/theme";
import { type Point, type Spot, wordPoints } from "@/components/ideas/i06/wordPoints";

/** How far the flock spreads round its anchor, across and down, in px at a 900 px screen. */
const SPREAD_X = 210;
const SPREAD_Y = 100;
/** Below this the cloud bank is not drawn (CloudPassage.tsx): the flock flies over the plum band, in its pink. */
const NARROW = 1024;
const COUNT = 56;
const WORD = "Work";

type Span = [from: number, to: number];

/**
 * Every stage is read off the top of Work's heading, in screens down the
 * viewport. That number falls as the page scrolls, so each stage is
 * scrubbed and scrolling back undoes it.
 */
type Script = {
  enter: Span;
  gather: Span;
  release: Span;
  leave: Span;
  /** The word's centre, in screens above the heading's top. */
  wordAbove: number;
  /** The word's size against the heading's. */
  wordScale: number;
  /** The loop the flock wheels round: centre and radii as shares of the screen. */
  wheel: { x: number; y: number; rx: number; ry: number };
  ink: string;
  inkAlpha: number;
};

const WIDE: Script = {
  enter: [1.5, 1.3],
  gather: [1.12, 1.0],
  release: [0.9, 0.78],
  leave: [0.3, 0],
  wordAbove: 0.5,
  wordScale: 1,
  wheel: { x: 0.55, y: 0.4, rx: 0.24, ry: 0.16 },
  ink: GROUND,
  inkAlpha: 0.92,
};

/** On a phone the flock keeps to the sky above the sentence, and the word forms in the gap between the statement's foot and the heading. */
const PHONE: Script = {
  enter: [1.5, 1.3],
  gather: [1.0, 0.86],
  release: [0.74, 0.6],
  leave: [0.3, 0],
  wordAbove: 0.11,
  wordScale: 1,
  wheel: { x: 0.5, y: 0.08, rx: 0.25, ry: 0.03 },
  ink: INK,
  inkAlpha: 1,
};

type Bird = {
  x: number;
  y: number;
  /** Where it was last drawn: the gather blends it from (x, y) to its spot in the word. */
  shownX: number;
  shownY: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
  wing: number;
  flapping: number;
  fright: number;
  seed: number;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => v * v * (3 - 2 * v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const along = (h: number, [from, to]: Span): number => smooth(clamp01((h - from) / (to - from)));

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A gull seen from below: two curved wings, tips raised by `lift` (-1 wings down to 1 wings up). */
function traceBird(ctx: CanvasRenderingContext2D, x: number, y: number, span: number, lift: number, tilt: number): void {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const at = (lx: number, ly: number): [number, number] => [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
  const half = span / 2;
  const tipY = -lift * span * 0.32;
  const elbowY = -lift * span * 0.12 - span * 0.06;
  const thick = span * 0.07;
  ctx.moveTo(...at(-half, tipY));
  ctx.quadraticCurveTo(...at(-half * 0.45, elbowY - thick), ...at(0, -thick * 0.5));
  ctx.quadraticCurveTo(...at(half * 0.45, elbowY - thick), ...at(half, tipY));
  ctx.quadraticCurveTo(...at(half * 0.45, elbowY + thick), ...at(0, thick * 1.4));
  ctx.quadraticCurveTo(...at(-half * 0.45, elbowY + thick), ...at(-half, tipY));
  ctx.closePath();
}

export function startFlock(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  const title = document.getElementById("work-title");
  const titleInk = title?.querySelector<HTMLElement>("span");
  if (!ctx || !title || !titleInk) throw new Error("Flock: needs a 2D canvas and Work's heading (#work-title)");

  const random = seeded(6);
  const birds: Bird[] = Array.from({ length: COUNT }, () => {
    const r = Math.sqrt(random());
    const a = random() * Math.PI * 2;
    return {
      x: 0,
      y: 0,
      shownX: 0,
      shownY: 0,
      vx: 0,
      vy: 0,
      homeX: r * Math.cos(a),
      homeY: r * Math.sin(a),
      targetX: 0,
      targetY: 0,
      targetAngle: 0,
      wing: random() * Math.PI * 2,
      flapping: 1,
      fright: 0,
      seed: random(),
    };
  });

  let script = WIDE;
  let width = 0;
  let height = 0;
  let unit = 1;
  let word: Spot[] = [];
  let paired = false;
  let stopped = false;

  /** Off the left at the loop's height, where the flock comes in; off the top right, where it goes. */
  const entry = (): Point => ({ x: -0.3 * width, y: script.wheel.y * height });
  const exit = (): Point => ({ x: 1.3 * width, y: -0.35 * height });

  const placeOff = (side: "in" | "out"): void => {
    const { x: cx, y: cy } = side === "in" ? entry() : exit();
    for (const b of birds) {
      b.x = cx + b.homeX * SPREAD_X * unit;
      b.y = cy + b.homeY * SPREAD_Y * unit;
      b.shownX = b.x;
      b.shownY = b.y;
      b.vx = (side === "in" ? 2 : -2) * unit;
      b.vy = 0;
      b.fright = 0;
    }
  };

  const shapeWord = async (): Promise<void> => {
    const style = getComputedStyle(titleInk);
    const size = parseFloat(getComputedStyle(title).fontSize) * script.wordScale;
    const font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    await document.fonts.load(font, WORD);
    if (stopped) return;
    word = wordPoints(WORD, font, size, COUNT);
    paired = false;
  };

  const layout = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    script = width < NARROW ? PHONE : WIDE;
    unit = Math.min(width, height) / 900;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    void shapeWord();
  };

  /** Each bird takes the word's point in the same place along x as it is in the flock, so few paths cross. */
  const pair = (): void => {
    const byX = [...birds].sort((a, b) => a.x - b.x);
    const spots = [...word].sort((a, b) => a.x - b.x);
    byX.forEach((b, i) => {
      b.targetX = spots[i].x;
      b.targetY = spots[i].y;
      b.targetAngle = spots[i].angle;
    });
    paired = true;
  };

  const cursor = { x: 0, y: 0, on: false };

  /** A bird scared out of the word takes off from where it is seen, not from where the sim had it. */
  const scare = (b: Bird, amount: number): void => {
    if (b.fright < 0.05) {
      b.x = b.shownX;
      b.y = b.shownY;
    }
    b.fright = Math.max(b.fright, amount);
  };

  let raf = 0;
  let asleep = true;
  let onScreen = false;
  let last = 0;
  let time = 0;
  let lastScroll = window.scrollY;
  let lastGather = 0;

  const tick = (now: number): void => {
    raf = 0;
    const dt = Math.min(3, (now - last) / (1000 / 60));
    last = now;
    time += dt / 60;
    const scroll = window.scrollY;
    const scrollStep = scroll - lastScroll;
    lastScroll = scroll;

    const canvasTop = canvas.getBoundingClientRect().top;
    const head = title.getBoundingClientRect();
    const inkBox = titleInk.getBoundingClientRect();
    const h = head.top / height;
    const enter = along(h, script.enter);
    const leave = along(h, script.leave);
    const gather = word.length ? along(h, script.gather) * (1 - along(h, script.release)) : 0;
    if (gather > 0 && !paired) pair();
    if (gather === 0) paired = false;

    const theta = time * 0.12 + (scroll / height) * 1.4;
    const wheelX = (script.wheel.x + script.wheel.rx * Math.cos(theta)) * width;
    const wheelY = (script.wheel.y + script.wheel.ry * Math.sin(theta)) * height;
    const anchorX = mix(mix(entry().x, wheelX, enter), exit().x, leave);
    const anchorY = mix(mix(entry().y, wheelY, enter), exit().y, leave);
    const wordX = (inkBox.left + inkBox.right) / 2;
    const wordY = head.top - script.wordAbove * height;

    const release = Math.max(0, lastGather - gather);
    lastGather = gather;

    const maxSpeed = 3.6 * unit;
    const near = 70 * unit;
    const personal = 26 * unit;
    const fleeRadius = 170 * unit;
    for (const b of birds) {
      let aliX = 0;
      let aliY = 0;
      let cohX = 0;
      let cohY = 0;
      let sepX = 0;
      let sepY = 0;
      let n = 0;
      for (const o of birds) {
        if (o === b) continue;
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > near * near) continue;
        n += 1;
        aliX += o.vx;
        aliY += o.vy;
        cohX += dx;
        cohY += dy;
        if (d2 < personal * personal) {
          const d = Math.sqrt(d2) || 1;
          sepX -= (dx / d) * (1 - d / personal);
          sepY -= (dy / d) * (1 - d / personal);
        }
      }
      let ax = sepX * 0.14 * unit;
      let ay = sepY * 0.14 * unit;
      if (n) {
        ax += (aliX / n - b.vx) * 0.04 + (cohX / n) * 0.0012;
        ay += (aliY / n - b.vy) * 0.04 + (cohY / n) * 0.0012;
      }
      const homeDx = anchorX + b.homeX * SPREAD_X * unit - b.x;
      const homeDy = anchorY + b.homeY * SPREAD_Y * unit - b.y;
      const homeD = Math.hypot(homeDx, homeDy) || 1;
      const want = maxSpeed * Math.min(1, homeD / (150 * unit));
      ax += ((homeDx / homeD) * want - b.vx) * 0.03;
      ay += ((homeDy / homeD) * want - b.vy) * 0.03;
      ay -= scrollStep * 0.012;

      if (cursor.on) {
        const dx = b.shownX - cursor.x;
        const dy = b.shownY - cursor.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < fleeRadius) {
          const push = 1 - d / fleeRadius;
          ax += (dx / d) * push * 0.9 * unit;
          ay += (dy / d) * push * 0.9 * unit;
          scare(b, push);
        }
      }
      b.fright = Math.max(0, b.fright - dt * 0.011);

      const held = gather * (1 - b.fright);
      const springX = (wordX + b.targetX - b.x) * 0.02 - b.vx * 0.12;
      const springY = (wordY + b.targetY - b.y) * 0.02 - b.vy * 0.12;
      ax = mix(ax, springX, held * held);
      ay = mix(ay, springY, held * held);
      if (release > 0) {
        const dx = b.x - wordX;
        const dy = b.y - wordY;
        const d = Math.hypot(dx, dy) || 1;
        b.vx += (dx / d) * release * 40 * unit;
        b.vy += (dy / d) * release * 40 * unit - release * 25 * unit;
      }

      b.vx += ax * dt;
      b.vy += ay * dt;
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const top = mix(maxSpeed * (1 + 1.2 * b.fright), 4 * maxSpeed, held);
      const bottom = 1.4 * unit * (1 - held);
      const scale = speed > top ? top / speed : speed < bottom ? bottom / speed : 1;
      b.vx *= scale;
      b.vy *= scale;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const gliding = Math.sin(time * 0.5 + b.seed * 40) > 0.35 && b.fright < 0.2;
      b.flapping = mix(b.flapping, gliding || held > 0.5 ? 0 : 1, 0.06 * dt);
      b.wing += dt * (0.26 + 0.25 * b.fright) * mix(0.3, 1, b.flapping);
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = script.ink;
    ctx.globalAlpha = script.inkAlpha;
    ctx.beginPath();
    const span = 24 * unit;
    let anyOnScreen = false;
    for (const b of birds) {
      const held = smooth(gather * (1 - b.fright));
      const x = mix(b.x, wordX + b.targetX + Math.sin(time * 1.1 + b.seed * 9) * 1.5 * unit, held);
      const y = mix(b.y, wordY + b.targetY + Math.cos(time * 0.9 + b.seed * 7) * 1.2 * unit, held);
      b.shownX = x;
      b.shownY = y;
      if (x > -span && x < width + span && y > -span && y < height + span) anyOnScreen = true;
      const lift = mix(mix(0.3, 0.12, held) + 0.06 * Math.sin(time * 2 + b.seed * 10), Math.sin(b.wing), b.flapping);
      const tilt = mix(Math.atan2(b.vy, Math.abs(b.vx)) * 0.5 * Math.sign(b.vx || 1), b.targetAngle, held);
      traceBird(ctx, x, y - canvasTop, span, lift, tilt);
    }
    ctx.fill();

    const absent = enter === 0 || leave === 1;
    if (absent && !anyOnScreen) {
      asleep = true;
      return;
    }
    if (onScreen && !document.hidden) raf = requestAnimationFrame(tick);
  };

  const wake = (): void => {
    if (raf || !onScreen || document.hidden) return;
    if (asleep) {
      const h = title.getBoundingClientRect().top / height;
      if (along(h, script.enter) === 0 || along(h, script.leave) === 1) return;
      placeOff(h > (script.enter[1] + script.leave[0]) / 2 ? "in" : "out");
      asleep = false;
    }
    last = performance.now();
    lastScroll = window.scrollY;
    raf = requestAnimationFrame(tick);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") return;
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.on = true;
  };
  const onPointerLeave = (): void => {
    cursor.on = false;
  };
  const onPointerDown = (e: PointerEvent): void => {
    const reach = 240 * unit;
    for (const b of birds) {
      const dx = b.shownX - e.clientX;
      const dy = b.shownY - e.clientY;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const push = 1 - d / reach;
      scare(b, 0.6 + 0.4 * push);
      b.vx += (dx / d) * push * 7 * unit;
      b.vy += (dy / d) * push * 7 * unit;
    }
    wake();
  };
  const onResize = (): void => {
    layout();
    wake();
  };

  const seen = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) wake();
  });
  seen.observe(canvas);
  layout();
  placeOff("in");
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", wake);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    seen.disconnect();
    window.removeEventListener("scroll", wake);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", wake);
  };
}
