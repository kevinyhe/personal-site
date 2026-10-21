import { createBloomField } from "@/components/bloomField";
import { createDotField } from "@/components/dotField";

import { createClip, FH, FW } from "./clip";

/**
 * The picture behind the Garden pages: one diamond field (dotField) over
 * the whole screen, showing a flower at a different stage on each page.
 *
 *   01  a bud: the band's flower clip from its first second and a half,
 *       rising from the foot of the screen when the page opens.
 *   02  a branch: bloomField's sakura spray, grown as far as the timeline
 *       says (each open row grows it further).
 *   03  full bloom: the clip's last frame, the flowers open, shedding
 *       petals. Pointing at a project sends petals off the flower to
 *       gather beside its name.
 *   04  night: a moon low on the right, a branch across it, petals
 *       falling and settling on a dark ground.
 *
 * Everything is painted in greys onto a small canvas, one pixel per
 * diamond; dotField turns brightness into the site's palette. The canvas
 * is shown with `mix-blend-mode: screen`, so its black is see-through and
 * the site's aurora shows between the diamonds.
 *
 * Changing page is a gust: the old picture is pulled sideways in strips
 * and breaks into petals that blow across the screen, while the new one
 * settles in from the other side. The petals are one shared set across
 * all four pages, so a gust carries the last page's petals onto the next.
 *
 * With reduced motion there is no loop: each page is drawn once, still,
 * and pages change without the gust.
 */

const RAMP: [number, string][] = [
  [0, "#2a0d1e"],
  [0.3, "#6a1d44"],
  [0.5, "#b8174f"],
  [0.72, "#f9b9dc"],
  [1, "#fffafc"],
];
const FPS = 30;
/** Seconds a page change's gust lasts. */
const GUST = 1.6;
/** Seconds the bud takes to rise when page 01 opens. */
const BUD_RISE = 2.6;
/** The bud: from a shoot to the moment before it opens (shares of the clip). */
const BUD_FROM = 0.08;
const BUD_TO = 0.31;
/** The bloomField picture's size, px. */
const SPRAY_W = 600;
const SPRAY_H = 760;
const MAX_PETALS = 520;

export type Point = { x: number; y: number };

export type Garden = {
  /** Shows page n (0..3). `dir` is the way the wind blows, 1 or -1. */
  go(n: number, dir: number, instant?: boolean): void;
  /** How far the branch on page 02 has grown, 0..1. */
  grow(t: number): void;
  /** Where page 03's petals gather, in CSS px, read every frame; null lets them go. */
  aim(at: (() => Point | null) | null): void;
  resize(): void;
  dispose(): void;
};

type Petal = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  spin: number;
  flip: number;
  flipV: number;
  ph: number;
  age: number;
  life: number;
  /** 0 falling, 1 gathering at the aim, 2 lying on the ground. */
  mode: 0 | 1 | 2;
  ox: number;
  oy: number;
  b: number;
};

type Box = { x: number; y: number; w: number; h: number };

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createGarden(canvas: HTMLCanvasElement, reduced: boolean): Garden | null {
  const narrowAt = (): boolean => canvas.clientWidth < 1024;
  let dots: ReturnType<typeof createDotField> = null;
  try {
    dots = createDotField(canvas, {
      cols: narrowAt() ? 180 : 280,
      threshold: 0.12,
      brightness: 1,
      size: 0.85,
      hue: 0,
      ground: "#000000",
      ramp: RAMP,
    });
  } catch {
    dots = null;
  }
  if (!dots) return null;
  const field = dots;

  // --- State ---------------------------------------------------------------------
  let page = 0;
  let prev = 0;
  let dir = 1;
  let tr0 = -1e9; // when the current gust started, seconds
  let budStart = 0;
  let growTarget = 0.2;
  let growCur = 0;
  let aimAt: (() => Point | null) | null = null;
  let aimSince = 0;
  let time = 0;
  let C = 1;
  let R = 1;
  const rand = seeded(20261003);
  const petals: Petal[] = [];
  /** Bright cells of the page shown, for petals to leave from. */
  let bright: Point[] = [];
  let brightAt = -1;

  const invalidate = (): void => {
    if (reduced) requestDraw();
  };
  const clip = createClip(invalidate);
  const spray = createBloomField({ width: SPRAY_W, height: SPRAY_H, still: reduced, tilt: 0.16, seed: 23 });

  // One small canvas per page, cols x rows, painted in greys.
  const layers = Array.from({ length: 4 }, () => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    return { c, ctx };
  });
  const sizeLayers = (): void => {
    for (const l of layers) {
      if (l.c.width !== C || l.c.height !== R) {
        l.c.width = C;
        l.c.height = R;
      }
    }
  };

  // Night: stars, the branch across the moon, in moon-radius units.
  const stars = Array.from({ length: 90 }, () => ({ x: rand(), y: rand() * 0.72, a: 0.35 + rand() * 0.65, f: 0.5 + rand() * 2 }));
  type Bough = { pts: Point[]; w: number };
  const boughs: Bough[] = [];
  const buds: Point[] = [];
  const growBough = (x: number, y: number, a: number, len: number, w: number, level: number): void => {
    const pts: Point[] = [{ x, y }];
    let cx = x;
    let cy = y;
    let ang = a;
    for (let i = 0; i < 7; i += 1) {
      ang += (rand() - 0.5) * 0.34;
      cx += Math.cos(ang) * (len / 7);
      cy += Math.sin(ang) * (len / 7);
      pts.push({ x: cx, y: cy });
    }
    boughs.push({ pts, w });
    for (let k = 0; k < 4; k += 1) {
      const p = pts[2 + Math.floor(rand() * 5)];
      buds.push({ x: p.x + (rand() - 0.5) * 0.35, y: p.y + (rand() - 0.5) * 0.35 });
    }
    buds.push({ x: cx, y: cy });
    if (level < 2) {
      for (let k = 0; k < 3; k += 1) {
        const p = pts[2 + k * 2];
        const side = k % 2 === 0 ? 1 : -1;
        growBough(p.x, p.y, ang + side * (0.5 + rand() * 0.5), len * (0.36 + rand() * 0.18), w * 0.5, level + 1);
      }
    }
  };
  growBough(3.6, -2.2, Math.PI - 0.62, 5.4, 0.2, 0);

  // Wind strips: how far each row of the picture is pulled by a gust.
  const stripPull = (y: number): number => 0.55 + 0.25 * Math.sin(y * 0.13 + 1) + 0.2 * Math.sin(y * 0.41 + 2.3);

  // --- Where things go, in cells -----------------------------------------------------
  const frameBox = (cx: number, bottom: number, hMax: number, wMax: number, aspect: number): Box => {
    const h = Math.min(hMax, wMax / aspect);
    const w = h * aspect;
    return { x: cx - w / 2, y: bottom - h, w, h };
  };
  const place = () => {
    const n = narrowAt();
    const a = FW / FH;
    const sa = SPRAY_W / SPRAY_H;
    return {
      bud: n ? frameBox(0.72 * C, 0.97 * R, 0.5 * R, 0.8 * C, a) : frameBox(0.74 * C, 0.99 * R, 0.86 * R, 0.46 * C, a),
      spray: n ? frameBox(0.58 * C, 1.0 * R, 0.5 * R, 0.8 * C, sa) : frameBox(0.72 * C, 1.0 * R, 0.98 * R, 0.5 * C, sa),
      bloom: n ? frameBox(0.66 * C, 1.0 * R, 0.6 * R, 0.98 * C, a) : frameBox(0.73 * C, 1.04 * R, 1.04 * R, 0.52 * C, a),
      moon: n
        ? { x: 0.74 * C, y: 0.62 * R, r: Math.min(0.16 * C, 0.08 * R) }
        : { x: 0.77 * C, y: 0.27 * R, r: Math.min(0.095 * C, 0.17 * R) },
      ground: n ? 0.9 : 0.86,
    };
  };
  const groundY = (x: number, base: number): number => {
    const u = x / C;
    return R * (base + 0.025 * Math.sin(u * 5.1 + 1) + 0.012 * Math.sin(u * 13 + 2) - 0.05 * smooth(0.55, 1, u));
  };

  // --- The pictures -------------------------------------------------------------------
  const sway = (h: number): number => {
    if (reduced) return 0;
    const arm = Math.pow(1 - h, 1.6);
    return arm * (5 * Math.sin(time * 0.9) + 2 * Math.sin(time * 1.7 + 1.1)) + Math.pow(1 - h, 4) * Math.sin(time * 6 + h * 9);
  };

  const paintBud = (x: CanvasRenderingContext2D): void => {
    const box = place().bud;
    const rise = reduced ? 1 : smooth(0, 1, (time - budStart) / BUD_RISE);
    const at = BUD_FROM + (BUD_TO - BUD_FROM) * rise;
    clip.draw(x, clip.slot(at), box.x, box.y, box.w, box.h, sway);
  };

  const paintSpray = (x: CanvasRenderingContext2D): void => {
    const box = place().spray;
    spray.set(growCur);
    spray.source.update?.(time, 1 / FPS);
    x.drawImage(spray.source.canvas, box.x, box.y, box.w, box.h);
  };

  const paintBloom = (x: CanvasRenderingContext2D): void => {
    const box = place().bloom;
    // A faint halo of dim diamonds round the heads.
    const g = x.createRadialGradient(box.x + box.w / 2, box.y + box.h * 0.3, 0, box.x + box.w / 2, box.y + box.h * 0.3, box.h * 0.62);
    g.addColorStop(0, "rgba(54,54,54,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, C, R);
    clip.draw(x, clip.last, box.x, box.y, box.w, box.h, sway);
  };

  const paintNight = (x: CanvasRenderingContext2D): void => {
    const p = place();
    const m = p.moon;
    // Haze rising off the ground, more to the right, so the dark ground
    // has something to stand against.
    const haze = x.createRadialGradient(0.82 * C, p.ground * R, 0, 0.82 * C, p.ground * R, 0.75 * C);
    haze.addColorStop(0, "rgba(70,70,70,1)");
    haze.addColorStop(0.5, "rgba(34,34,34,1)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = haze;
    x.fillRect(0, 0, C, R);
    for (const s of stars) {
      const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(time * s.f + s.x * 40);
      const v = Math.round(190 * s.a * tw);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(Math.floor(s.x * C), Math.floor(s.y * R), 1, 1);
    }
    // The moon and its ring of light.
    const halo = x.createRadialGradient(m.x, m.y, m.r * 0.9, m.x, m.y, m.r * 3);
    halo.addColorStop(0, "rgba(80,80,80,1)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = halo;
    x.fillRect(0, 0, C, R);
    const disc = x.createRadialGradient(m.x - m.r * 0.25, m.y - m.r * 0.25, 0, m.x, m.y, m.r);
    disc.addColorStop(0, "rgb(236,236,236)");
    disc.addColorStop(1, "rgb(170,170,170)");
    x.fillStyle = disc;
    x.beginPath();
    x.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    x.fill();
    // The branch, black against the moon, swaying a little.
    const bend = reduced ? 0 : Math.sin(time * 0.6) * 0.04;
    const at = (q: Point): Point => ({ x: m.x + (q.x + bend * (3.6 - q.x) * 0.3) * m.r, y: m.y + q.y * m.r });
    x.strokeStyle = "#000";
    x.lineCap = "round";
    x.lineJoin = "round";
    for (const b of boughs) {
      x.lineWidth = Math.max(1, b.w * m.r);
      x.beginPath();
      const s = at(b.pts[0]);
      x.moveTo(s.x, s.y);
      for (let i = 1; i < b.pts.length; i += 1) {
        const q = at(b.pts[i]);
        x.lineTo(q.x, q.y);
      }
      x.stroke();
    }
    // Blossom on the branch, catching the moonlight.
    for (let i = 0; i < buds.length; i += 1) {
      const q = at(buds[i]);
      const v = 120 + ((i * 37) % 70);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.beginPath();
      x.arc(q.x, q.y, Math.max(0.8, m.r * 0.09), 0, Math.PI * 2);
      x.fill();
    }
    // The ground.
    x.fillStyle = "#000";
    x.beginPath();
    x.moveTo(0, R);
    for (let i = 0; i <= 64; i += 1) {
      const gx = (i / 64) * C;
      x.lineTo(gx, groundY(gx, p.ground));
    }
    x.lineTo(C, R);
    x.closePath();
    x.fill();
  };

  const paint = [paintBud, paintSpray, paintBloom, paintNight];

  // --- Petals ---------------------------------------------------------------------
  /** A petal's radius in cells: about the same size on screen at any width. */
  const petalR = (): number => {
    const W = Math.max(1, canvas.clientWidth);
    const cell = W / C;
    const px = Math.max(5, Math.min(13, W * 0.0058));
    return Math.max(1.1, (px / cell) * (0.75 + rand() * 0.6));
  };
  const spawn = (x: number, y: number, vx: number, vy: number, mode: 0 | 1 | 2 = 0): Petal | null => {
    if (petals.length >= MAX_PETALS) return null;
    const p: Petal = {
      x,
      y,
      vx,
      vy,
      r: petalR(),
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 3,
      flip: rand() * Math.PI * 2,
      flipV: 1.5 + rand() * 3,
      ph: rand() * 10,
      age: 0,
      life: 9 + rand() * 9,
      mode,
      ox: 0,
      oy: 0,
      b: 0.82 + rand() * 0.18,
    };
    petals.push(p);
    return p;
  };

  /** Cells of a layer bright enough to be petals or flowers. */
  const brightOf = (n: number): Point[] => {
    const l = layers[n];
    if (!l.ctx || C < 2 || R < 2) return [];
    const d = l.ctx.getImageData(0, 0, C, R).data;
    const out: Point[] = [];
    for (let y = 0; y < R; y += 1) {
      for (let x = 0; x < C; x += 1) {
        if (d[(y * C + x) * 4] > 150) out.push({ x, y });
      }
    }
    return out;
  };
  const pick = (list: Point[]): Point | null => (list.length ? list[Math.floor(rand() * list.length)] : null);

  /** The gust's strength now, 0..1. */
  const gust = (): number => {
    const k = (time - tr0) / GUST;
    return k > 0 && k < 1 ? Math.pow(Math.sin(Math.PI * k), 1.4) : 0;
  };

  let carry = 0;
  const emit = (dt: number): void => {
    const narrow = narrowAt();
    let rate = 0;
    if (page === 0) rate = 0.35;
    else if (page === 1) rate = 2.4 * Math.max(0, growCur - 0.45);
    else if (page === 2) rate = 1.2;
    else rate = narrow ? 3.5 : 6.5;
    carry += rate * dt;
    while (carry >= 1) {
      carry -= 1;
      if (page === 0) {
        spawn(C + 2, R * (0.08 + rand() * 0.5), -C * 0.03, R * 0.01);
      } else if (page === 3) {
        const m = place().moon;
        if (rand() < 0.6) {
          const b = buds[Math.floor(rand() * buds.length)];
          const p = spawn(m.x + b.x * m.r, m.y + b.y * m.r, -C * 0.01, R * 0.01);
          if (p) p.life = 34;
        } else {
          const p = spawn(rand() * C * 1.2, -2, -C * 0.01, R * 0.02);
          if (p) p.life = 34;
        }
      } else {
        const q = pick(bright);
        if (q) spawn(q.x, q.y, 0, 0);
      }
    }
    // Page 03: petals leave the flower for whatever is pointed at.
    if (page === 2 && aimAt && !reduced) {
      const seekers = petals.reduce((s, p) => s + (p.mode === 1 ? 1 : 0), 0);
      const r = time - aimSince < 1.1 ? 16 : 3;
      if (seekers < 46 && rand() < r * dt) {
        const q = pick(bright);
        if (q) {
          const p = spawn(q.x, q.y, -C * 0.05, -R * 0.02, 1);
          if (p) {
            const cell = canvas.clientWidth / C;
            p.ox = (8 + rand() * 72) / cell;
            p.oy = ((rand() - 0.5) * 26) / cell;
            p.life = 40;
          }
        }
      }
    }
  };

  const step = (dt: number): void => {
    const w = gust();
    const p0 = place();
    const fall = R * 0.055;
    const base = -C * 0.012;
    const aim = page === 2 && aimAt ? aimAt() : null;
    const cell = canvas.clientWidth / C;
    const ax = aim ? aim.x / cell : 0;
    const ay = aim ? aim.y / cell : 0;
    const vmax = C * 0.7;
    for (let i = petals.length - 1; i >= 0; i -= 1) {
      const p = petals[i];
      p.age += dt;
      if (p.mode === 2) {
        if (w > 0.12) {
          p.mode = 0;
          p.vy = -R * 0.03 * rand();
        } else {
          if (p.age > p.life) petals.splice(i, 1);
          continue;
        }
      }
      if (p.mode === 1) {
        if (!aim) {
          p.mode = 0;
          p.life = p.age + 6 + rand() * 4;
        } else {
          const tx = ax + p.ox + Math.sin(time * 1.1 + p.ph) * 1.2;
          const ty = ay + p.oy + Math.cos(time * 1.4 + p.ph) * 0.8;
          p.vx += ((tx - p.x) * 3.2 - p.vx * 2.4) * dt;
          p.vy += ((ty - p.y) * 3.2 - p.vy * 2.4) * dt;
          p.vx += dir * w * C * 2 * dt;
        }
      }
      if (p.mode === 0) {
        const tvx = base + Math.sin(time * 0.8 + p.ph) * C * 0.012 + dir * w * C * 0.95;
        const tvy = fall * (0.7 + 0.5 * p.b) - w * R * 0.05 + Math.cos(time * 1.3 + p.ph) * R * 0.01;
        const kx = Math.min(1, dt * (w > 0 ? 3 : 1.4));
        p.vx += (tvx - p.vx) * kx;
        p.vy += (tvy - p.vy) * Math.min(1, dt * 1.2);
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > vmax) {
        p.vx *= vmax / sp;
        p.vy *= vmax / sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt * (1 + w * 4);
      p.flip += p.flipV * dt * (1 + w * 3);
      // Night: a petal that reaches the ground lies there a while.
      if (page === 3 && p.mode === 0 && w < 0.05 && p.y >= groundY(p.x, p0.ground) - 0.3) {
        p.mode = 2;
        p.y = groundY(p.x, p0.ground) - 0.2 - rand() * 0.6;
        p.vx = 0;
        p.vy = 0;
        p.life = p.age + 30 + rand() * 25;
      }
      if (p.age > p.life || p.x < -14 || p.x > C + 14 || p.y > R + 8 || p.y < -R * 0.6) petals.splice(i, 1);
    }
  };

  const drawPetals = (x: CanvasRenderingContext2D): void => {
    for (const p of petals) {
      const a = Math.min(1, p.age / 0.35) * clamp01((p.life - p.age) / 1.2);
      if (a <= 0) continue;
      const fl = Math.abs(Math.cos(p.flip));
      const resting = p.mode === 2;
      const v = Math.round(255 * p.b * (resting ? 0.62 : 0.55 + 0.42 * fl));
      x.globalAlpha = a;
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.beginPath();
      x.ellipse(p.x, p.y, p.r, p.r * (resting ? 0.38 : 0.22 + 0.42 * fl), resting ? p.ph : p.rot, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
  };

  /** Reduced motion's still night: petals in the air and on the ground. */
  const stillNight = (): void => {
    petals.length = 0;
    const r2 = seeded(7);
    const base = place().ground;
    for (let i = 0; i < 150; i += 1) {
      const x = r2() * C;
      const onGround = i % 2 === 0;
      const y = onGround ? groundY(x, base) - 0.2 - r2() * 0.6 : r2() * groundY(x, base);
      const p = spawn(x, y, 0, 0, onGround ? 2 : 0);
      if (p) {
        p.age = 1;
        p.life = 1e9;
        p.ph = r2() * 6;
      }
    }
  };

  // --- The frame -------------------------------------------------------------------
  const frame = (): void => {
    field.render((ctx, cols, rows) => {
      if (cols !== C || rows !== R) {
        C = cols;
        R = rows;
        sizeLayers();
        if (reduced && page === 3) stillNight();
      }
      const k = (time - tr0) / GUST;
      const moving = k > 0 && k < 1;
      const show = moving && prev !== page ? [prev, page] : [page];
      for (const s of show) {
        const l = layers[s].ctx;
        if (!l) continue;
        l.globalAlpha = 1;
        l.globalCompositeOperation = "source-over";
        l.fillStyle = "#000";
        l.fillRect(0, 0, C, R);
        paint[s](l);
      }
      ctx.globalCompositeOperation = "lighter";
      if (moving && prev !== page) {
        const pullOut = Math.pow(k, 2.3) * C * 1.25;
        const inK = smooth(0.38, 1, k);
        const pullIn = Math.pow(1 - inK, 2) * C * 0.22;
        const band = 2;
        for (let y = 0; y < R; y += band) {
          const n = stripPull(y);
          const bh = Math.min(band, R - y);
          ctx.globalAlpha = 1 - smooth(0.15, 0.75, k);
          if (ctx.globalAlpha > 0.01) ctx.drawImage(layers[prev].c, 0, y, C, bh, dir * pullOut * n, y, C, bh);
          ctx.globalAlpha = inK;
          if (inK > 0.01) ctx.drawImage(layers[page].c, 0, y, C, bh, -dir * pullIn * n, y, C, bh);
        }
      } else {
        ctx.drawImage(layers[page].c, 0, 0);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      drawPetals(ctx);
    });
  };

  // --- The loop ------------------------------------------------------------------
  let raf = 0;
  let last = -1;
  let lastNow = 0;
  const t0 = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const f = Math.floor((now - t0) / (1000 / FPS));
    if (f === last) return;
    last = f;
    const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 1 / FPS);
    lastNow = now;
    time = (now - t0) / 1000;
    if (page === 1 || prev === 1) growCur += (growTarget - growCur) * (1 - Math.exp(-dt * 1.5));
    if ((page === 1 || page === 2) && time - brightAt > 0.7 && (time - tr0) / GUST > 1) {
      bright = brightOf(page);
      brightAt = time;
    }
    emit(dt);
    step(dt);
    frame();
  };
  let pending = 0;
  function requestDraw(): void {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      growCur = growTarget;
      frame();
    });
  }

  if (reduced) requestDraw();
  else raf = requestAnimationFrame(tick);

  return {
    go: (n, d, instant = false) => {
      if (n === page && !instant) return;
      const from = page;
      page = n;
      dir = d >= 0 ? 1 : -1;
      if (n === 0) budStart = time;
      if (n === 1) growCur = reduced ? growTarget : 0;
      bright = [];
      brightAt = -1;
      if (reduced) {
        prev = n;
        if (n === 3) stillNight();
        else petals.length = 0;
        requestDraw();
        return;
      }
      if (instant || from === n) {
        prev = n;
        tr0 = -1e9;
        return;
      }
      prev = from;
      tr0 = time;
      // The old picture comes apart into petals that the gust carries off.
      const parts = brightOf(from);
      const count = Math.min(narrowAt() ? 120 : 200, Math.floor(parts.length / 6));
      for (let i = 0; i < count; i += 1) {
        const q = pick(parts);
        if (q) spawn(q.x, q.y, dir * C * 0.04, 0);
      }
      // And more come in on the wind from upwind.
      for (let i = 0; i < (narrowAt() ? 50 : 90); i += 1) {
        const p = spawn(dir > 0 ? -rand() * C * 0.4 : C + rand() * C * 0.4, rand() * R, dir * C * (0.3 + rand() * 0.4), 0);
        if (p) p.life = 5 + rand() * 3;
      }
    },
    grow: (t) => {
      growTarget = clamp01(t);
      if (reduced) requestDraw();
    },
    aim: (at) => {
      if (at !== aimAt) aimSince = time;
      aimAt = at;
    },
    resize: () => {
      field.resize();
      if (reduced) requestDraw();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      clip.dispose();
      spray.dispose();
      field.dispose();
      for (const l of layers) {
        l.c.width = 1;
        l.c.height = 1;
      }
    },
  };
}
