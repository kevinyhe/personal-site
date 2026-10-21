"use client";

import { type JSX, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { AURORA_RAMP } from "@/components/bandColours";
import { createDotField, type DotField } from "@/components/dotField";
import { BLOSSOM, GROUND, INK } from "@/components/luke/theme";

gsap.registerPlugin(ScrollTrigger);

/**
 * The first section under the statement band, after lukebaffait.fr's
 * opening: a small framed picture in the middle of the screen opens up to
 * fill it while the page holds still, and then one small line sits in the
 * middle of it ("Basically, I build systems.", all in the italic display
 * serif, as his is).
 *
 * lukebaffait slides his name apart around the picture. The name is
 * already huge in this site's hero, so here the picture opens on its own.
 *
 * The picture is the VEX 82855Z robot (public/work/mclib.jpg), drawn
 * through the site's dot field (components/dotField: a grid of diamonds on
 * the GPU, coloured by brightness through the aurora's plum-to-blossom
 * ramp), so it matches the rest of the page. The grid is the size of the
 * screen the whole time; the frame is a clip-path cut out of it, with the
 * robot fitted into whatever the frame shows, so it grows with the frame
 * and the canvas is never resized while scrolling.
 *
 * Scroll: the section is 260vh tall and the stage inside it is sticky, so
 * it holds for 1.6 screens. Over that: the frame opens from about a third
 * of the screen with rounded corners to full bleed with square ones (the
 * "+" ticks ride its corners), the line comes up from blurred to sharp,
 * and in the last stretch the bottom darkens into the next section.
 *
 * The dot field redraws at 30 fps, and only while the section is on screen.
 * With reduced motion the section is one screen tall, the picture is full
 * bleed with the line on it, and nothing moves.
 */

const FPS = 30;
const PICTURE = "/work/mclib.jpg";

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** How far in from the screen's edges the frame starts (CSS px). A wide
 *  frame of about 36% of the screen on a desktop (lukebaffait's is 580 by
 *  330 at 1600 by 900); 72% of the width, a little under square, on a
 *  phone. */
function startInset(W: number, H: number): { x: number; y: number } {
  if (W < H) {
    const w = W * 0.72;
    return { x: (W - w) / 2, y: Math.max(H * 0.2, (H - w * 0.84) / 2) };
  }
  const w = W * 0.36;
  return { x: (W - w) / 2, y: Math.max(H * 0.2, (H - w * 0.6) / 2) };
}

/** The picture with a little more contrast, done once, so the brown floor
 *  sinks back and the robot's white frame stands out in the diamonds. */
function prepare(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d");
  if (!x) return c;
  if ("filter" in x) x.filter = "contrast(1.3) brightness(0.88) saturate(1.2)";
  x.drawImage(img, 0, 0);
  return c;
}

export default function Opening(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const ticksRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLParagraphElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    const ticks = ticksRef.current;
    const line = lineRef.current;
    const fade = fadeRef.current;
    if (!root || !canvas || !frame || !ticks || !line || !fade) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.innerWidth < 1024;

    // The one scrubbed number: 0 (small frame) to 1 (full bleed, line on).
    let p = reduced ? 1 : 0;
    // The frame's opening, 0..1, after the ease. The paint reads it.
    let k = reduced ? 1 : 0;

    const apply = (): void => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      k = easeInOut(clamp01(p / 0.62));
      const s = startInset(W, H);
      const ix = s.x * (1 - k);
      const iy = s.y * (1 - k);
      const r = Math.max(W * 0.016, 14) * (1 - k) * (1 - k);
      frame.style.clipPath = `inset(${iy.toFixed(1)}px ${ix.toFixed(1)}px round ${r.toFixed(1)}px)`;
      // The ticks sit just inside the frame's corners, and a little further
      // in once it is full screen, as lukebaffait's do.
      const pad = Math.max(W * 0.012, 12) + k * Math.max(W * 0.012, 8);
      ticks.style.inset = `${(iy + pad).toFixed(1)}px ${(ix + pad).toFixed(1)}px`;
      const a = smooth(0.66, 0.86, p);
      line.style.opacity = a.toFixed(3);
      line.style.filter = a > 0.995 ? "none" : `blur(${((1 - a) * 9).toFixed(2)}px)`;
      line.style.transform = `translate3d(0, ${((1 - a) * 14).toFixed(1)}px, 0)`;
      fade.style.opacity = smooth(0.9, 1, p).toFixed(3);
    };

    const img = new Image();
    img.decoding = "async";
    let pic: HTMLCanvasElement | null = null;

    let field: DotField | null = null;
    try {
      field = createDotField(canvas, {
        cols: phone ? 120 : 240,
        threshold: 0.15,
        brightness: 1.05,
        size: 0.85,
        hue: 0.28,
        ground: GROUND,
        ramp: AURORA_RAMP,
      });
    } catch {
      field = null;
    }

    const paint = (t: number) => (x: CanvasRenderingContext2D, cols: number, rows: number) => {
      x.fillStyle = "#000";
      x.fillRect(0, 0, cols, rows);
      if (!pic) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const s = startInset(W, H);
      // The part of the grid the frame shows, in cells.
      const x0 = ((s.x * (1 - k)) / W) * cols;
      const y0 = ((s.y * (1 - k)) / H) * rows;
      const w = cols - 2 * x0;
      const h = rows - 2 * y0;
      // Fill it, pushing in a little as it opens and breathing slowly.
      const z = (1.04 + 0.06 * k) * (1 + (reduced ? 0 : 0.012 * Math.sin(t * 0.35)));
      const sc = Math.max(w / pic.width, h / pic.height) * z;
      const dw = pic.width * sc;
      const dh = pic.height * sc;
      // Held a little above centre: the robot stands in the top of the
      // render, its shadow below.
      x.imageSmoothingQuality = "high";
      x.drawImage(pic, x0 + (w - dw) * 0.5, y0 + (h - dh) * 0.4, dw, dh);
      // A soft light drifting across it, so the still has some life.
      if (!reduced) {
        const lx = x0 + w * (0.5 + 0.32 * Math.sin(t * 0.22));
        const ly = y0 + h * (0.34 + 0.06 * Math.cos(t * 0.17));
        const g = x.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.32);
        g.addColorStop(0, "rgba(255,255,255,0.12)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.globalCompositeOperation = "lighter";
        x.fillStyle = g;
        x.fillRect(x0, y0, w, h);
        x.globalCompositeOperation = "source-over";
      }
      // Darker toward the frame's edges.
      const cx = x0 + w / 2;
      const cy = y0 + h * 0.45;
      const v = x.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.max(w, h) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      x.fillStyle = v;
      x.fillRect(x0, y0, w, h);
    };

    let raf = 0;
    let running = false;
    let last = -1;
    const start = performance.now();
    const draw = (now: number): void => {
      field?.render(paint((now - start) / 1000));
    };
    const tick = (now: number): void => {
      raf = 0;
      if (!running) return;
      const f = Math.floor((now - start) / (1000 / FPS));
      if (f !== last) {
        last = f;
        draw(now);
      }
      raf = requestAnimationFrame(tick);
    };

    img.onload = () => {
      pic = prepare(img);
      draw(performance.now());
    };
    img.src = PICTURE;

    const seen = new IntersectionObserver(([e]) => {
      running = e.isIntersecting && !reduced && Boolean(field);
      if (running && !raf) raf = requestAnimationFrame(tick);
    });
    seen.observe(root);
    const sized = new ResizeObserver(() => {
      field?.resize();
      apply();
      draw(performance.now());
    });
    sized.observe(canvas);

    const context = gsap.context(() => {
      apply();
      if (reduced) return;
      ScrollTrigger.create({
        trigger: root,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
        onUpdate: (self) => {
          p = self.progress;
          apply();
        },
      });
    }, root);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      context.revert();
      img.onload = null;
      field?.dispose();
    };
  }, []);

  const tick = "absolute font-sans text-[max(1.4vw,14px)] font-light leading-none text-white/70";

  return (
    <section
      className="relative h-[260vh] motion-reduce:h-[100vh]"
      ref={rootRef}
      style={{ backgroundColor: GROUND }}
    >
      <div className="sticky top-0 h-[100vh] w-full overflow-hidden">
        {/* The frame: the full-screen dot field, cut down by a clip-path.
            The starting cut is set here too so the first paint matches. */}
        <div
          className="absolute inset-0 [clip-path:inset(31vh_32vw_round_1.6vw)] motion-reduce:[clip-path:none] max-lg:[clip-path:inset(34vh_14vw_round_14px)]"
          ref={frameRef}
          role="img"
          aria-label="The VEX 82855Z robot, drawn in dots"
          style={{ backgroundColor: GROUND }}
        >
          <canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" ref={canvasRef} />
        </div>

        {/* The "+" ticks at the frame's corners, and two tiny labels between
            the bottom pair. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-[33vh_33vw] motion-reduce:inset-[3vh_3vw]" ref={ticksRef}>
          <span className={`${tick} left-0 top-0 -translate-x-1/2 -translate-y-1/2`}>+</span>
          <span className={`${tick} right-0 top-0 -translate-y-1/2 translate-x-1/2`}>+</span>
          <span className={`${tick} bottom-0 left-0 -translate-x-1/2 translate-y-1/2`}>+</span>
          <span className={`${tick} bottom-0 right-0 translate-x-1/2 translate-y-1/2`}>+</span>
          <span className="absolute bottom-0 left-[max(1.4vw,14px)] translate-y-1/2 font-sans text-[max(0.62vw,9px)] uppercase leading-none tracking-[0.12em] text-white/55">
            VEX 82855Z
          </span>
          <span className="absolute bottom-0 right-[max(1.4vw,14px)] translate-y-1/2 font-sans text-[max(0.62vw,9px)] uppercase leading-none tracking-[0.12em] text-white/55">
            Lead programmer
          </span>
        </div>

        {/* The line, small, in the middle of the picture. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[16px]">
          <p
            className="relative px-[0.2em] pb-[0.1em] text-center font-serif-display text-[max(3.6vw,30px)] italic leading-[1.2] tracking-[-0.01em] opacity-0 motion-reduce:opacity-100"
            ref={lineRef}
            style={{ color: INK }}
          >
            {/* A soft dark patch so the line reads over the robot. */}
            <span
              aria-hidden
              className="absolute -inset-x-[60%] -inset-y-[180%] -z-10"
              style={{ background: "radial-gradient(closest-side, rgba(19,6,15,0.82), rgba(19,6,15,0.5) 55%, rgba(19,6,15,0))" }}
            />
            Basically, I build <span style={{ color: BLOSSOM }}>systems</span>.
          </p>
        </div>

        {/* The bottom darkening into the next section as the hold ends. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[34vh] opacity-0"
          ref={fadeRef}
          style={{ background: `linear-gradient(to bottom, transparent, ${GROUND})` }}
        />
      </div>
    </section>
  );
}
