"use client";

import { useEffect, useRef } from "react";
import { fitCanvas } from "@/components/halftone";

/**
 * Petals shed by the pointer, and petals thrown by a click.
 *
 * The hero is a cherry tree in a dither and the page below it was flat
 * type. This puts the tree's own material on the reader's cursor: move
 * quickly and you knock a petal or two loose behind your hand, the way
 * brushing a branch does. Move slowly and nothing happens at all — a petal
 * per pixel would be a mouse trail, which is a different and much worse
 * effect.
 *
 * The same layer takes bursts from elsewhere on the page (see burstPetals
 * below), so pressing "Copy it", the back-to-top button or a social link
 * blooms where the press landed.
 *
 * Everything is drawn as squares on one 2D canvas, because that is what the
 * hero's halftone does — a petal here is ~24 dots arranged on the same
 * obcordate outline the 3D petals use, so it reads as the same object seen
 * through the same screen. Dots are bucketed by (tone, alpha) exactly like
 * components/halftone.ts does it, so a frame costs 18 fillStyle changes no
 * matter how many petals are in the air.
 *
 * Nothing here is hit-testable and nothing here is required: under reduced
 * motion the component renders nothing and burstPetals() is a no-op.
 */

// ---------------------------------------------------------------------------
// The emitter other components call.
// ---------------------------------------------------------------------------

type BurstOptions = {
  /** Petals to throw. Clamped to what the viewport's budget allows. */
  count?: number;
  /** Launch speed multiplier. 1 is a button press; 1.6 throws them wider. */
  power?: number;
};

type EmitFn = (x: number, y: number, options?: BurstOptions) => void;

// One mounted layer at a time. A second mount replaces the first, and an
// unmount only clears the slot if it still owns it — otherwise a remount
// during React's strict-mode double effect would leave the page with no
// emitter at all.
let activeEmit: EmitFn | null = null;

/**
 * Throw a small burst of petals at a point in viewport coordinates.
 *
 * Fire and forget: safe on the server, safe before the layer mounts, safe
 * under reduced motion. All three cases do nothing.
 */
export function burstPetals(x: number, y: number, options?: BurstOptions) {
  activeEmit?.(x, y, options);
}

/**
 * The same, aimed at the middle of an element — what a click handler on a
 * button wants, since the press may have come from the keyboard and have no
 * coordinates of its own.
 */
export function burstFromElement(
  element: Element | null | undefined,
  options?: BurstOptions,
) {
  if (!element || !activeEmit) return;
  const box = element.getBoundingClientRect();
  activeEmit(box.left + box.width / 2, box.top + box.height / 2, options);
}

// ---------------------------------------------------------------------------
// The petal, as dots.
// ---------------------------------------------------------------------------

const DOT_COLS = 4;
const DOT_ROWS = 6;
const DOTS_PER_PETAL = DOT_COLS * DOT_ROWS;

/** Tones, base -> edge, from the hero's sakura palette (BareThreeCanvas). */
const TONES: [number, number, number][] = [
  [231, 156, 200], // PETAL_BASE_COLOR  #e79cc8
  [247, 207, 230], // PETAL_MID_COLOR   #f7cfe6
  [253, 239, 248], // PETAL_EDGE_COLOR  #fdeff8
];
/** Alpha buckets. Six is enough that a fade reads as continuous. */
const ALPHA_STEPS = 6;
const MAX_ALPHA = 0.82;

const COLOURS: string[] = [];
for (let tone = 0; tone < TONES.length; tone += 1) {
  for (let step = 0; step < ALPHA_STEPS; step += 1) {
    const [r, g, b] = TONES[tone];
    const alpha = (((step + 0.5) / ALPHA_STEPS) * MAX_ALPHA).toFixed(3);
    COLOURS.push(`rgba(${r},${g},${b},${alpha})`);
  }
}

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * The obcordate sakura outline, ported from sakuraPetalOutline() in
 * BareThreeCanvas: narrow claw at the base, widest about two thirds out,
 * two rounded tip lobes with a notch between them. Same constants, so the
 * petal on the cursor is the petal on the tree.
 */
function petalOutline(uu: number, vv: number) {
  const xu = uu * 2 - 1;
  const widthProfile = Math.pow(Math.sin(Math.PI * (0.06 + 0.62 * vv)), 0.9);
  const notch =
    0.21 *
    Math.pow(Math.max(0, 1 - Math.abs(xu) * 1.7), 2) *
    smoothstep(0.68, 1, vv);
  const cornerRound = 0.17 * Math.pow(Math.abs(xu), 3) * smoothstep(0.6, 1, vv);
  return { lateral: xu * widthProfile, radial: vv - notch - cornerRound, xu };
}

// The petal template, in units of petal length. Built once at module load:
// every petal in the air is this list of points rotated, squashed and
// scaled, which is why a petal costs no allocation and no trigonometry per
// dot.
const TEMPLATE_X = new Float32Array(DOTS_PER_PETAL);
const TEMPLATE_Y = new Float32Array(DOTS_PER_PETAL);
const TEMPLATE_TONE = new Uint8Array(DOTS_PER_PETAL);
{
  // Half the petal's width relative to its length — the hero's flowers are
  // a little wider than half as wide as they are long.
  const HALF_WIDTH = 0.44;
  let index = 0;
  for (let row = 0; row < DOT_ROWS; row += 1) {
    const vv = (row + 0.5) / DOT_ROWS;
    for (let col = 0; col < DOT_COLS; col += 1, index += 1) {
      const uu = (col + 0.5) / DOT_COLS;
      const { lateral, radial, xu } = petalOutline(uu, vv);
      TEMPLATE_X[index] = lateral * HALF_WIDTH;
      // Screen y grows downward and the petal's tip points up at spin 0.
      TEMPLATE_Y[index] = -radial;
      // getPetalVertexColor's gradient, quantised to three tones: dark at
      // the claw, pale at the rim and the tip lobes.
      const edgePush = clamp01(
        Math.pow(Math.abs(xu), 2.2) * 0.55 + smoothstep(0.8, 1, vv) * 0.35,
      );
      const light = clamp01(vv * 0.72 + edgePush * 0.6);
      TEMPLATE_TONE[index] = light < 0.34 ? 0 : light < 0.68 ? 1 : 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Motion.
// ---------------------------------------------------------------------------

/**
 * CPU mirror of arborGust() in the hero's wind shader (see
 * BareThreeCanvas: arborGustEnvelope). Three sines at unrelated rates,
 * pushed through a smoothstep so the result sits near zero and occasionally
 * surges. Keeping the same formula is the point: a petal shed by the cursor
 * gusts at the same moments the tree above it does.
 */
function gustEnvelope(t: number, phase: number) {
  const n =
    Math.sin(t * 0.36 + phase * 0.1) +
    0.6 * Math.sin(t * 0.83 + 1.7 + phase * 0.05) +
    0.35 * Math.sin(t * 0.11 + 4.2);
  return 0.2 + 1.02 * smoothstep(-1.9, 1.75, n);
}

/** Steady drift, px/s. The hero's petals cross the frame the same way. */
const BASE_WIND = 9;
/** How much of the lateral speed the gust adds on top, px/s. */
const GUST_WIND = 30;
/** Flutter: the side-to-side rock of a petal that is not quite falling flat. */
const FLUTTER_SPEED = 2.35;
const FLUTTER_AMPLITUDE = 24;
/** Terminal fall speed, px/s, before the per-petal scale. */
const FALL_SPEED = 58;
/** How fast a petal gives up its launch speed for the wind's. Per second. */
const WIND_TAKEOVER = 2.1;
const FALL_TAKEOVER = 1.5;

/** Pointer speed, px/s, below which the wake sheds nothing. */
const WAKE_SPEED = 620;
/** Minimum seconds between shed petals, whatever the pointer is doing. */
const WAKE_INTERVAL = 0.085;

type Petal = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds lived, and the age at which it is gone. */
  age: number;
  ttl: number;
  /** Petal length in px. */
  scale: number;
  /** In-plane rotation, and the out-of-plane roll that squashes its width. */
  spin: number;
  spinRate: number;
  roll: number;
  rollRate: number;
  /** Its own place in the gust, and how hard the wind gets hold of it. */
  phase: number;
  sway: number;
  fall: number;
};

export default function BloomCursor({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const holder = holderRef.current;
    if (!canvas || !holder) return undefined;
    // No motion means no layer at all. The resting state of a petal you
    // never shed is an empty sky, and that is a correct picture of the page.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // Budget by viewport area: a 1440x900 screen gets ~28 petals, a phone
    // about 10. The page is already running two WebGL scenes and a dot
    // field, so this is a garnish and is sized like one.
    const maxPetals = Math.max(
      10,
      Math.min(30, Math.round((width * height) / 46000)),
    );

    const petals: Petal[] = Array.from({ length: maxPetals }, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      ttl: 0,
      scale: 0,
      spin: 0,
      spinRate: 0,
      roll: 0,
      rollRate: 0,
      phase: 0,
      sway: 1,
      fall: 1,
    }));
    let liveCount = 0;

    // Dot buckets, one per (tone, alpha) pair, allocated once at the worst
    // case so a steady frame allocates nothing.
    const capacity = maxPetals * DOTS_PER_PETAL;
    const bucketX = COLOURS.map(() => new Float32Array(capacity));
    const bucketY = COLOURS.map(() => new Float32Array(capacity));
    const bucketSize = COLOURS.map(() => new Float32Array(capacity));
    const bucketCount = new Int32Array(COLOURS.length);

    const takePetal = () => {
      for (let i = 0; i < petals.length; i += 1) {
        if (!petals[i].alive) return petals[i];
      }
      // Everything is in the air: reuse the oldest rather than refusing, so
      // a burst always shows something.
      let oldest = petals[0];
      for (let i = 1; i < petals.length; i += 1) {
        if (petals[i].age > oldest.age) oldest = petals[i];
      }
      return oldest;
    };

    const spawn = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      scale: number,
    ) => {
      const p = takePetal();
      if (!p.alive) liveCount += 1;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.age = 0;
      p.ttl = 5.5 + Math.random() * 3.5;
      p.scale = scale;
      p.spin = Math.random() * Math.PI * 2;
      p.spinRate = (Math.random() * 2 - 1) * 2.4;
      p.roll = Math.random() * Math.PI * 2;
      p.rollRate = 1.4 + Math.random() * 2.6;
      p.phase = Math.random() * 60;
      p.sway = 0.6 + Math.random() * 0.85;
      p.fall = 0.75 + Math.random() * 0.5;
    };

    const petalScale = () => 11 + Math.random() * 7;

    // --- the pointer -------------------------------------------------------
    // A pointer that hovers and is precise. A finger has no wake to leave
    // and reporting the last tap as one would be wrong; taps still get
    // their bursts through burstPetals().
    const canWake =
      window.matchMedia("(hover: hover)").matches &&
      window.matchMedia("(pointer: fine)").matches;

    // The handler writes numbers and nothing else — no allocation, no work
    // that scales with how fast the mouse is moving. The loop decides
    // whether any of it turns into a petal.
    let pointerX = 0;
    let pointerY = 0;
    let pointerVX = 0;
    let pointerVY = 0;
    let pointerSeen = false;
    let pointerStamp = 0;
    let lastWake = -1;

    const onPointerMove = (event: PointerEvent) => {
      if (!canWake || event.pointerType === "touch") return;
      const now = event.timeStamp / 1000;
      if (pointerSeen) {
        const dt = now - pointerStamp;
        if (dt > 0.0005 && dt < 0.25) {
          // Smoothed, so one jittery sample cannot fire the wake on its own.
          const k = 0.45;
          pointerVX += ((event.clientX - pointerX) / dt - pointerVX) * k;
          pointerVY += ((event.clientY - pointerY) / dt - pointerVY) * k;
        }
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerStamp = now;
      pointerSeen = true;
    };

    // --- frame -------------------------------------------------------------
    let frame = 0;
    let running = false;
    let visible = true;
    let last = 0;
    let clock = 0;

    const measure = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      fitCanvas(canvas, width, height, 1);
    };

    const draw = (time: number) => {
      frame = 0;
      const seconds = time / 1000;
      // First frame after a stop has no meaningful delta, and a tab that
      // was hidden for a minute must not advance the sim by a minute.
      const dt = last ? Math.min(0.05, Math.max(0, seconds - last)) : 0.016;
      last = seconds;
      clock += dt;

      // Shed. Speed is read from the smoothed pointer velocity, and only
      // while the pointer is actually moving now — a stale sample from a
      // second ago is a hand that has stopped.
      if (
        canWake &&
        pointerSeen &&
        seconds - pointerStamp < 0.12 &&
        clock - lastWake > WAKE_INTERVAL &&
        liveCount < maxPetals - 4
      ) {
        const speed = Math.hypot(pointerVX, pointerVY);
        if (speed > WAKE_SPEED) {
          lastWake = clock;
          // Behind the hand, not under it: the petal comes off the air the
          // pointer just left.
          const back = 14 / speed;
          // A fraction of the pointer's own speed, capped, so a flick
          // across the screen does not fire a petal off it.
          const carry = Math.min(0.16, 90 / speed);
          const shed = speed > WAKE_SPEED * 2.4 ? 2 : 1;
          for (let i = 0; i < shed; i += 1) {
            spawn(
              pointerX - pointerVX * back + (Math.random() * 26 - 13),
              pointerY - pointerVY * back + (Math.random() * 26 - 13),
              pointerVX * carry + (Math.random() * 40 - 20),
              pointerVY * carry * 0.5 + (Math.random() * 30 - 10),
              petalScale(),
            );
          }
        }
      }

      bucketCount.fill(0);
      let live = 0;

      for (let i = 0; i < petals.length; i += 1) {
        const p = petals[i];
        if (!p.alive) continue;
        p.age += dt;

        const gust = gustEnvelope(clock, p.phase);
        const flutter =
          Math.sin(clock * FLUTTER_SPEED + p.phase) * FLUTTER_AMPLITUDE;
        const targetVX = (BASE_WIND + gust * GUST_WIND + flutter) * p.sway;
        const targetVY = FALL_SPEED * p.fall * (0.7 + gust * 0.35);

        // Ease toward the wind rather than snapping to it: that is what
        // keeps the launch impulse of a burst readable for the half second
        // it should last, and then lets the drift field take over.
        p.vx += (targetVX - p.vx) * Math.min(1, dt * WIND_TAKEOVER);
        p.vy += (targetVY - p.vy) * Math.min(1, dt * FALL_TAKEOVER);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += p.spinRate * dt;
        p.roll += p.rollRate * dt;

        if (
          p.age > p.ttl ||
          p.y > height + 40 ||
          p.x < -80 ||
          p.x > width + 80
        ) {
          p.alive = false;
          continue;
        }
        live += 1;

        // In and out. The fade-in is short enough that a burst still reads
        // as instant; the fade-out is long so nothing pops.
        const alpha =
          smoothstep(0, 0.18, p.age) * (1 - smoothstep(p.ttl - 1.6, p.ttl, p.age));
        if (alpha <= 0.02) continue;
        const alphaStep = Math.min(
          ALPHA_STEPS - 1,
          Math.floor(alpha * ALPHA_STEPS),
        );

        // The tumble: the in-plane spin is a real rotation, the out-of-plane
        // roll only squashes the width. Two axes are enough — at |cos| near
        // zero the petal is edge-on and nearly a line, which is the moment
        // that sells it as a thin thing turning over in the air.
        const cos = Math.cos(p.spin);
        const sin = Math.sin(p.spin);
        const squash = 0.18 + 0.82 * Math.abs(Math.cos(p.roll));
        const sx = p.scale * squash;
        const sy = p.scale;
        // Dot size follows the squash, so an edge-on petal thins out
        // instead of turning into a dotted line with gaps in it.
        const size = Math.max(1, p.scale * 0.19 * (0.55 + 0.45 * squash));
        const half = size * 0.5;

        for (let d = 0; d < DOTS_PER_PETAL; d += 1) {
          const lx = TEMPLATE_X[d] * sx;
          const ly = TEMPLATE_Y[d] * sy;
          const bucket = TEMPLATE_TONE[d] * ALPHA_STEPS + alphaStep;
          const slot = bucketCount[bucket];
          bucketCount[bucket] = slot + 1;
          bucketX[bucket][slot] = p.x + lx * cos - ly * sin - half;
          bucketY[bucket][slot] = p.y + lx * sin + ly * cos - half;
          bucketSize[bucket][slot] = size;
        }
      }

      liveCount = live;

      ctx.clearRect(0, 0, width, height);
      for (let bucket = 0; bucket < COLOURS.length; bucket += 1) {
        const count = bucketCount[bucket];
        if (!count) continue;
        ctx.fillStyle = COLOURS[bucket];
        const xs = bucketX[bucket];
        const ys = bucketY[bucket];
        const sizes = bucketSize[bucket];
        for (let i = 0; i < count; i += 1) {
          ctx.fillRect(xs[i], ys[i], sizes[i], sizes[i]);
        }
      }

      // Idle costs nothing: with an empty sky the loop stops and the next
      // shed or burst starts it again.
      if (live === 0 && !(canWake && seconds - pointerStamp < 0.12)) {
        running = false;
        last = 0;
        return;
      }
      frame = requestAnimationFrame(draw);
    };

    const run = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      last = 0;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      running = false;
      last = 0;
    };

    const wakeLoop = (event: PointerEvent) => {
      onPointerMove(event);
      if (!running) run();
    };

    const emit: EmitFn = (x, y, options) => {
      const power = options?.power ?? 1;
      // Scaled by the same budget the wake uses, so a phone gets a smaller
      // bloom rather than the same one on a quarter of the pixels.
      const count = Math.max(
        3,
        Math.min(
          Math.round(maxPetals * 0.3),
          Math.round((options?.count ?? 7) * (maxPetals / 28)),
        ),
      );
      for (let i = 0; i < count; i += 1) {
        // A cone opening upward: the petals leave the press, arc over and
        // then fall. Straight out in all directions reads as an explosion,
        // which is not what a flower does.
        const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.15;
        const speed = (95 + Math.random() * 105) * power;
        spawn(
          x + (Math.random() * 14 - 7),
          y + (Math.random() * 14 - 7),
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          petalScale(),
        );
      }
      run();
    };

    measure();
    activeEmit = emit;

    const onResize = () => measure();
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (liveCount > 0) run();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", wakeLoop, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    // The layer is fixed and viewport-sized, so it is on screen whenever the
    // document is. The observer is here for the case where a parent hides
    // the mount point (display:none, a closed section) — the loop must stop
    // with it, not keep running against a canvas nobody can see.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) stop();
        else if (liveCount > 0) run();
      },
      { threshold: 0 },
    );
    observer.observe(holder);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", wakeLoop);
      document.removeEventListener("visibilitychange", onVisibility);
      if (activeEmit === emit) activeEmit = null;
    };
  }, []);

  return (
    // Fixed and viewport-sized, never hit-testable. The default z-[2] puts
    // it above the sticky dot field (z-0) and the sections (z-[1]) of the
    // page below the hero — a burst fired from a button inside the cream
    // Contact panel has to be visible, and that panel is opaque. Pass a
    // className to move it somewhere else in the stack.
    <div
      aria-hidden="true"
      className={
        className ?? "pointer-events-none fixed inset-0 z-[2]"
      }
      ref={holderRef}
    >
      <canvas className="h-full w-full" ref={canvasRef} />
    </div>
  );
}
