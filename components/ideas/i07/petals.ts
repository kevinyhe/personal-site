/** Idea 7: blossom petals falling down the page after the hero, on one fixed 2D canvas over it. */
import { onPalette } from "@/components/cloudPalette";
import { ridgeAt } from "@/components/ideas/i07/ridge";
import { createTextBoxes } from "@/components/ideas/i07/textBoxes";

const NARROW = 1024;
const COUNT_WIDE = 52;
const COUNT_NARROW = 34;

/** On the plum ground: the hero's blossom with a rose heart. On the cloud's pink ground (Work and Skills on a wide screen): the plums the type and koi turn to there. */
const ON_PLUM = { body: "#f9b9dc", heart: "#e0457f" };
const ON_PINK = { body: "#9c6890", heart: "#58304f" };

type Dot = [x: number, y: number, radius: number, heart: boolean];

/** Petals as a few diamonds (the end page's dots), in units of the petal's size: a rose heart at the foot, a notched tip at the other end. */
const SHAPES: Dot[][] = [
  [[-2.1, 0, 0.6, true], [-1.2, 0, 0.85, false], [-0.2, -0.55, 0.95, false], [-0.2, 0.55, 0.95, false], [0.9, -0.65, 0.9, false], [0.9, 0.65, 0.9, false], [1.8, -0.5, 0.7, false], [1.8, 0.5, 0.7, false]],
  [[-1.6, 0, 0.6, true], [-0.7, 0, 0.85, false], [0.3, -0.5, 0.9, false], [0.3, 0.5, 0.9, false], [1.2, 0, 0.8, false]],
  [[-1.8, 0.2, 0.55, true], [-0.9, 0.1, 0.8, false], [0.1, -0.3, 0.95, false], [0.2, 0.6, 0.75, false], [1.1, -0.4, 0.85, false], [1.8, 0.1, 0.6, false]],
];

/** Seconds a petal floats on the pond, and when it starts to fade. */
const FLOAT_FOR = 5;
const FLOAT_FADE = 2.6;
/** Seconds a petal lies on the mountain, and when it starts to fade into its dots. */
const REST_FOR = 9;
const REST_FADE = 4;
const RIPPLE_FOR = 1.8;
/** Share of petals that settle on the pond when they fall over it. */
const POND_SHARE = 0.45;
/** Scroll speed, px a frame, below which the scroll only carries the petals a little and does not blow them. */
const CALM_SCROLL = 3;

type Mode = "falling" | "floating" | "resting";

type Petal = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  shape: Dot[];
  spin: number;
  spinRate: number;
  tumble: number;
  tumbleRate: number;
  swayPhase: number;
  swayRate: number;
  /** Its own fall speed, px a frame on a screen 900 px tall. */
  fall: number;
  /** Share of the screen's height at which it settles if it is over the pond; null for one that falls on through. */
  pondAt: number | null;
  /** How far under the ridge line it lies on the mountain, px. */
  restDepth: number;
  mode: Mode;
  age: number;
  /** 0 clear, 1 faded out because it is over text. */
  hidden: number;
};

type Ripple = { x: number; y: number; age: number; reach: number };

function traceDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

export function startPetals(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  const statement = document.querySelector<HTMLElement>("section[data-statement]");
  const work = document.getElementById("work");
  const contact = document.getElementById("contact");
  const end = document.getElementById("end");
  if (!ctx || !statement || !work || !contact || !end) {
    throw new Error("Petals: needs a 2D canvas and the statement, #work, #contact and #end sections");
  }

  let width = 0;
  let height = 0;
  /** Sizes and reaches scale with the screen's short side, speeds with its height. */
  let unit = 1;
  let pace = 1;
  const petals: Petal[] = [];
  const ripples: Ripple[] = [];
  const text = createTextBoxes(10);
  let pinkGround = 0;
  const offPalette = onPalette((t) => {
    pinkGround = t;
  });

  const respawn = (p: Petal, at: "top" | "bottom" | "anywhere"): void => {
    p.x = Math.random() * width;
    p.y = at === "top" ? -20 : at === "bottom" ? height + 20 + 0.25 * height * Math.random() : Math.random() * height;
    p.vx = 0;
    p.vy = at === "bottom" ? -(2 + 4 * Math.random()) * pace : p.fall * pace;
    p.mode = "falling";
    p.age = 0;
    p.hidden = 0;
    p.pondAt = Math.random() < POND_SHARE ? 0.3 + 0.6 * Math.random() : null;
  };

  const makePetal = (): Petal => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: Math.max(3.4, 5.4 * unit) * (0.75 + 0.45 * Math.random()),
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    spin: Math.random() * Math.PI * 2,
    spinRate: (Math.random() - 0.5) * 0.04,
    tumble: Math.random() * Math.PI * 2,
    tumbleRate: 0.02 + Math.random() * 0.05,
    swayPhase: Math.random() * Math.PI * 2,
    swayRate: 0.5 + Math.random() * 0.7,
    fall: 0.45 + Math.random() * 0.45,
    pondAt: null,
    restDepth: Math.random() * 14,
    mode: "falling",
    age: 0,
    hidden: 0,
  });

  const layout = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    unit = Math.min(width, height) / 900;
    pace = height / 900;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = width < NARROW ? COUNT_NARROW : COUNT_WIDE;
    while (petals.length < count) {
      const p = makePetal();
      respawn(p, "anywhere");
      petals.push(p);
    }
    petals.length = count;
  };

  const cursor = { x: 0, y: 0, on: false };
  let raf = 0;
  let last = 0;
  let time = 0;
  let frame = 0;
  let shown = 0;
  let lastScroll = window.scrollY;
  let lastEndTop = end.getBoundingClientRect().top;

  const tick = (now: number): void => {
    raf = 0;
    const dt = Math.min(3, (now - last) / (1000 / 60));
    last = now;
    time += dt / 60;
    frame += 1;
    const scroll = window.scrollY;
    const jumped = Math.abs(scroll - lastScroll) > 0.8 * height;
    const scrollStep = jumped ? 0 : scroll - lastScroll;
    lastScroll = scroll;
    if (jumped) {
      for (const p of petals) respawn(p, "anywhere");
      ripples.length = 0;
    }

    const active = statement.getBoundingClientRect().top < 0.5 * height;
    shown = Math.max(0, Math.min(1, shown + (active ? 1 : -1) * 0.02 * dt));
    if (!active && shown === 0) {
      ctx.clearRect(0, 0, width, height);
      return;
    }
    if (frame % 12 === 1) text.refresh(height);

    const pond = work.getBoundingClientRect();
    const contactTop = contact.getBoundingClientRect().top;
    const endBox = end.getBoundingClientRect();
    if (jumped) lastEndTop = endBox.top;
    const onMountain = endBox.top < 0.5 * height;
    const gust = Math.sign(scrollStep) * Math.max(0, Math.abs(scrollStep) - CALM_SCROLL);
    const wind = 0.25 + 0.2 * Math.sin(time * 0.07);
    const reach = 110 * unit;

    for (const p of petals) {
      if (p.mode === "falling") {
        const sway = Math.sin(time * p.swayRate + p.swayPhase);
        const flutter = 0.65 + 0.35 * Math.abs(Math.cos(p.tumble));
        p.vx += ((wind + 0.55 * sway) * pace - p.vx) * 0.035 * dt;
        p.vy += (p.fall * flutter * pace - p.vy) * 0.035 * dt;
        p.vy = Math.max(-40, Math.min(40, p.vy - gust * 0.08));
        p.vx += gust * 0.012 * Math.sin(p.swayPhase);
        if (cursor.on) {
          const dx = p.x - cursor.x;
          const dy = p.y - cursor.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < reach) {
            p.vx += (dx / d) * (1 - d / reach) * 0.9 * unit;
            p.vy += (dy / d) * (1 - d / reach) * 0.9 * unit;
          }
        }
        const before = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt - 0.3 * scrollStep;
        p.spin += p.spinRate * dt * (1 + 0.03 * Math.abs(gust));
        p.tumble += p.tumbleRate * dt * (1 + 0.05 * Math.abs(gust));

        if (p.x < -30) p.x += width + 60;
        else if (p.x > width + 30) p.x -= width + 60;
        if (p.y > height + 30) respawn(p, "top");
        else if (p.y < -60) respawn(p, "bottom");

        const overPond = p.y > Math.max(0, pond.top) && p.y < Math.min(height, pond.bottom);
        const crossesPondLine = p.pondAt !== null && before < p.pondAt * height && p.y >= p.pondAt * height;
        if (crossesPondLine && overPond && !text.covers(p.x, p.y)) {
          p.mode = "floating";
          p.age = 0;
          p.vx = 0.15 * unit * Math.sign(wind);
          ripples.push({ x: p.x, y: p.y, age: 0, reach: 46 * unit }, { x: p.x, y: p.y, age: -0.45, reach: 28 * unit });
        } else if (onMountain) {
          const slope = ridgeAt(p.x / width) * endBox.height + p.restDepth * unit;
          const ridge = endBox.top + slope;
          const crossesRidge = before < lastEndTop + slope && p.y >= ridge;
          if (ridge < height && crossesRidge && !text.covers(p.x, p.y)) {
            p.mode = "resting";
            p.age = 0;
            p.y = ridge;
          }
        }
      } else {
        p.age += dt / 60;
        p.y -= scrollStep;
        if (p.mode === "floating") {
          p.x += p.vx * dt;
          p.spin += p.spinRate * 0.15 * dt;
        }
        const life = p.mode === "floating" ? FLOAT_FOR : REST_FOR;
        if (p.age > life || p.y < -40 || p.y > height + 40) respawn(p, "top");
      }
      p.hidden += ((text.covers(p.x, p.y) ? 1 : 0) - p.hidden) * Math.min(1, 0.2 * dt);
    }

    lastEndTop = endBox.top;
    for (const r of ripples) {
      r.age += dt / 60;
      r.y -= scrollStep;
    }
    for (let i = ripples.length - 1; i >= 0; i -= 1) if (ripples[i].age > RIPPLE_FOR) ripples.splice(i, 1);

    ctx.clearRect(0, 0, width, height);
    const inksAt = (y: number): typeof ON_PLUM => (pinkGround > 0.5 && y < contactTop ? ON_PINK : ON_PLUM);
    for (const p of petals) {
      const fade =
        p.mode === "floating"
          ? 1 - Math.max(0, p.age - FLOAT_FADE) / (FLOAT_FOR - FLOAT_FADE)
          : p.mode === "resting"
            ? 1 - Math.max(0, p.age - REST_FADE) / (REST_FOR - REST_FADE)
            : 1;
      const alpha = shown * (1 - p.hidden) * fade;
      if (alpha < 0.01) continue;
      const flip = p.mode === "falling" ? Math.cos(p.tumble) : 1;
      const cos = Math.cos(p.spin);
      const sin = Math.sin(p.spin);
      const inks = inksAt(p.y);
      ctx.globalAlpha = alpha;
      for (const heart of [false, true]) {
        ctx.beginPath();
        for (const [lx, ly, r, isHeart] of p.shape) {
          if (isHeart !== heart) continue;
          const fx = lx * p.size * flip;
          const fy = ly * p.size;
          traceDiamond(ctx, p.x + fx * cos - fy * sin, p.y + fx * sin + fy * cos, r * p.size * 0.62);
        }
        ctx.fillStyle = heart ? inks.heart : inks.body;
        ctx.fill();
      }
    }
    for (const r of ripples) {
      if (r.age < 0) continue;
      const t = r.age / RIPPLE_FOR;
      const radius = 3 * unit + r.reach * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = shown * 0.75 * (1 - t);
      ctx.fillStyle = inksAt(r.y).body;
      ctx.beginPath();
      const dots = 20;
      for (let i = 0; i < dots; i += 1) {
        const a = (i / dots) * Math.PI * 2;
        traceDiamond(ctx, r.x + Math.cos(a) * radius, r.y + Math.sin(a) * radius * 0.4, Math.max(0.8, 1.1 * unit));
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!document.hidden) raf = requestAnimationFrame(tick);
  };

  const wake = (): void => {
    if (raf || document.hidden) return;
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
    const burst = 160 * unit;
    for (const p of petals) {
      if (p.mode !== "falling") continue;
      const dx = p.x - e.clientX;
      const dy = p.y - e.clientY;
      const d = Math.hypot(dx, dy) || 1;
      if (d > burst) continue;
      p.vx += (dx / d) * (1 - d / burst) * 6 * unit;
      p.vy += (dy / d) * (1 - d / burst) * 6 * unit;
    }
  };
  const onResize = (): void => {
    layout();
    wake();
  };

  layout();
  wake();
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", wake);

  return () => {
    cancelAnimationFrame(raf);
    offPalette();
    window.removeEventListener("scroll", wake);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", wake);
  };
}
