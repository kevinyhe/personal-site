"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
  createBarCanvas,
  hexToRgb,
  type BarCanvas,
  type BarLayer,
  type BarLayerConfig,
  type CanvasSource,
} from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * Transition 1: the statement band, leaving through its own type.
 *
 * The band as StatementSection draws it (the flower opened by the scroll,
 * the sentence coming into focus a letter at a time), held for two screens
 * instead of one. Over the second half of the hold the sentence grows about
 * the inside of the "o" in "to", and that inside is cut out of the band, so
 * the counter is a window and the work section is what is behind it.
 *
 * After the type-zoom openings on awwwards Sites of the Day (Locomotive's
 * and Immersive Garden's case-study intros: one word scaled until a letter's
 * counter fills the screen, the next scene inside it), done here with the
 * real glyph's counter rather than a circle laid over it.
 */

const LINE = "I build systems that bring ideas to life.";

/** Where the assets live. */
const ASSETS = "/sonda";

/**
 * Which slice of the clip the scroll is mapped onto.
 *
 * Measured, not guessed: sampling the file at twenty points and summing the
 * red channel gives 0, 1, 3, 5, 6, 11, 19, 35, 54, 76, 100, 119, 148, 184,
 * 222, 245, 251, 251, 250, 248, 248. So the first quarter of it is a black
 * frame with a bud in it and the last fifth is the same open flower over and
 * over — mapped end to end, the scroll spent most of itself on nothing and
 * then bloomed in a rush, which is the "pop". These two numbers are the part
 * where something is actually happening.
 */
const BLOOM_FROM = 0.0;
const BLOOM_TO = 0.8;

/**
 * How many frames of it are kept, and how big each one is.
 *
 * Forty over that span is about fourteen a second of the original, which is
 * more steps than a reader can scroll through one at a time. The size is set
 * by the grid the layer is sampled on — 150 x 190 cells — so 200 x 356 is
 * already finer than anything that survives the shader. The whole sheet is
 * 1600 x 1780, about eleven megabytes, held for the life of the page.
 */
const FRAMES = 64;
const SHEET_COLS = 8;
const FRAME_W = 200;
const FRAME_H = 356;

/**
 * The band, and the ink on it — the landscape's own two colours.
 *
 * BAND MUST STAY EQUAL TO ValleyTransition's BAR_FILL. That is what makes
 * the join above this section work with nothing drawn in it: the bottom of
 * the land plate grades to solid fill colour, so if this band is that same
 * colour the bars simply run out into it. It is the reference's own trick
 * and the reason its landscape needs no seam either. Change one and the
 * join becomes a line.
 */
const BAND = "#170a14";
const INK = "#f9b9dc";
/** The lines' colour: the same blossom the bars are drawn in, so the
 *  difference blend cancels to dark where they meet. */
const BLOSSOM_INK = INK;

/** Below this there is no room beside the column for a stem to stand in. */
const NARROW = 1024;

/** The introduction: the sans at reading size, under the sentence. */
const INTRO =
  "font-sans text-[1.75rem] font-light leading-[1.6] tracking-[0.01em] opacity-0 lg:text-[min(2.2vh,0.93vw)]";

const LINE_ROWS = ["I build systems", "that bring ideas", "to life."];
/** Where on the hold the line starts to grow, and how many times
 *  sharper than the type the counter's mask picture is drawn. */
const ZOOM_FROM = 0.4;
const RES = 8;
/** The window into Work: the "o" of "to" (row, word, letter). */
const WINDOW = [2, 0, 1] as const;

export default function StatementSection(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lineRef = useRef<HTMLParagraphElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);

  // The flower, opened BY THE SCROLL.
  //
  // THE CLIP IS DECODED ONCE, UP FRONT, INTO A SHEET OF FRAMES, and the
  // scroll then picks one of them. It is not seeked.
  //
  // Seeking was the obvious way and it does not work. Setting currentTime
  // repeatedly — which is what a scrubbed tween does, several times a second
  // — puts the browser into approximate seeking, where it answers with the
  // nearest KEYFRAME rather than the nearest frame. This clip has a handful
  // of those, so the flower went from bud to open in two or three steps
  // however smoothly you scrolled. Seeked slowly, one await at a time, the
  // same file gives 19 distinct frames out of 21 samples; seeked fast it
  // gives three. The fault was never in the scroll.
  //
  // So the video is played through once, off screen, at load — a hundred
  // kilobytes and five seconds, long before anyone reaches this section —
  // and every frame that lands in the span below is copied into a grid. From
  // then on the scroll is an index into that grid, and every step of it is a
  // real frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const line = lineRef.current;
    if (!canvas || !line) return undefined;
    if (window.innerWidth < NARROW) {
      // No pin and no flowers here: the introduction just stands.
      rootRef.current?.querySelectorAll<HTMLElement>("[data-intro]").forEach((el) => {
        el.style.opacity = "1";
      });
      return undefined;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const video = document.createElement("video");
    video.src = `${ASSETS}/prolog-r-c.mp4`;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    // The sheet: FRAMES cells in a grid, at a size the bar grid can use.
    // The layer is sampled on 150 x 190 cells, so a 200 x 356 frame is
    // already finer than anything that survives.
    const sheet = document.createElement("canvas");
    sheet.width = SHEET_COLS * FRAME_W;
    sheet.height = Math.ceil(FRAMES / SHEET_COLS) * FRAME_H;
    const sheetCtx = sheet.getContext("2d");

    // What the engine samples: one frame, blitted out of the sheet.
    const frame = document.createElement("canvas");
    frame.width = FRAME_W;
    frame.height = FRAME_H;
    const ctx = frame.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    }

    let bar: BarCanvas | null = null;
    let captured = 0;
    let want = 0;
    let shown = -1;
    let stopped = false;

    const slotTime = (i: number) => {
      const d = video.duration;
      return (BLOOM_FROM + ((BLOOM_TO - BLOOM_FROM) * i) / (FRAMES - 1)) * d;
    };

    // One pass of the player: copy whatever frame is up into every slot it
    // has reached. Driven by requestVideoFrameCallback where there is one,
    // since that fires once per decoded frame and nothing is missed.
    const grab = () => {
      if (stopped || !sheetCtx) return;
      while (captured < FRAMES && video.currentTime >= slotTime(captured)) {
        const col = captured % SHEET_COLS;
        const row = Math.floor(captured / SHEET_COLS);
        sheetCtx.drawImage(video, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
        captured += 1;
      }
      if (captured >= FRAMES) {
        stopped = true;
        video.pause();
        return;
      }
      schedule();
    };
    type WithRvfc = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const rvfc = (video as WithRvfc).requestVideoFrameCallback;
    const schedule = () => {
      if (stopped) return;
      if (rvfc) rvfc.call(video, grab);
      else requestAnimationFrame(grab);
    };

    const ready = new Promise<void>((resolve) => {
      const go = () => {
        schedule();
        void video.play().catch(() => {
          // Autoplay refused: fall back to one still of the open flower.
          stopped = true;
          video.currentTime = BLOOM_TO * video.duration;
          video.addEventListener(
            "seeked",
            () => {
              if (!sheetCtx) return;
              for (let i = 0; i < FRAMES; i += 1) {
                const col = i % SHEET_COLS;
                const row = Math.floor(i / SHEET_COLS);
                sheetCtx.drawImage(video, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
              }
              captured = FRAMES;
            },
            { once: true },
          );
        });
        resolve();
      };
      if (video.readyState >= 2) go();
      else {
        video.addEventListener("loadeddata", go, { once: true });
        video.addEventListener("error", () => resolve(), { once: true });
      }
    });

    // THE FLOWER MOVES. Not a frame nudged back and forth: the picture is
    // BENT, every frame, as a stem in a breeze bends. It is drawn in
    // horizontal strips, and each strip is slid sideways by an amount that
    // grows with its height above the foot — nothing at the foot, most at
    // the head — on two slow sines, with a faster, smaller flutter at the
    // top for the petals. The bloom is still the scroll's frame; the bend
    // is laid over whichever frame that is.
    const STRIPS = 36;
    const sway = (t: number, h: number) => {
      // h: 0 at the head, 1 at the foot. The lever arm is (1 - h)^1.6.
      const arm = Math.pow(1 - h, 1.6);
      const slow = 5.5 * Math.sin(t * 0.9) + 2.2 * Math.sin(t * 1.7 + 1.1);
      const flutter = 1.1 * Math.pow(1 - h, 4) * Math.sin(t * 6.3 + h * 9);
      return arm * slow + flutter;
    };
    const source: CanvasSource = {
      canvas: frame,
      animated: true,
      ready,
      update: (timeSec) => {
        if (!ctx || captured === 0) return false;
        // Never ahead of what has been decoded: early on, the scroll is
        // clamped to the last frame that exists.
        const i = Math.min(want, captured - 1);
        const still = reduced;
        if (still && i === shown) return false;
        shown = i;
        const col = i % SHEET_COLS;
        const row = Math.floor(i / SHEET_COLS);
        const sx = col * FRAME_W;
        const sy = row * FRAME_H;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, FRAME_W, FRAME_H);
        if (still) {
          ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
          return true;
        }
        const stripH = FRAME_H / STRIPS;
        for (let k = 0; k < STRIPS; k += 1) {
          const y = k * stripH;
          const h = (k + 0.5) / STRIPS;
          const dx = sway(timeSec, h);
          ctx.drawImage(sheet, sx, sy + y, FRAME_W, stripH + 1, dx, y, FRAME_W, stripH + 1);
        }
        return true;
      },
    };

    const config: BarLayerConfig = {
      // Hanging down the right of the band, past the centred sentence, and
      // again down the left as its mirror.
      x: "-2.5%", y: "2%", width: "50%", height: "100%",
      // The prologue's own grade, upside down: a BRIGHT petal draws a WIDE
      // bar, so the flower is solid ink on the blossom ground. The right way
      // up it is the stem that inks and the petals that vanish.
      blackPoint: 200, whitePoint: 25, threshold: 255,
      xSquares: 150, ySquares: 190, bgOpacity: 0, fillOpacity: 1,
    };
    const layers: BarLayer[] = [
      { type: "canvas", source, config },
    ];
    bar = createBarCanvas(canvas, layers, {
      colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(INK) }),
      defaults: { bgOpacity: 0 },
      fps: reduced ? 4 : 60,
    });

    // One reading off the scroll, while the stage is held:
    //   (before)     the flower opens from the moment the section shows
    //                over the fold, and the sentence writes in;
    //   0.00 - 0.14  the introduction comes in under the sentence.
    // The flower then stays open until the wall of bars (below) closes
    // over it.
    const lines = Array.from(
      (rootRef.current?.querySelectorAll<HTMLElement>("[data-intro]") ?? []),
    );
    const soft = gsap.parseEase("power2.out");
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    let openScroll = 0;
    let pinPx = 1;
    const apply = (p: number) => {
      const open = clamp01(openScroll);
      want = Math.round(open * (FRAMES - 1));
      config.fillOpacity = open <= 0.002 ? 0 : 1;
      for (const el of lines) {
        const q = soft(clamp01(p / 0.14));
        el.style.opacity = String(q);
        el.style.transform = `translateY(${(1 - q) * 28}px)`;
      }
    };

    const context = gsap.context(() => {
      if (reduced) {
        want = FRAMES - 1;
        for (const el of lines) el.style.opacity = "1";
        return;
      }
      const root = rootRef.current;
      ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.4,
        onUpdate: (self) => {
          const vh = window.innerHeight;
          const H = root?.offsetHeight ?? 4 * vh;
          const scrolled = self.progress * (H + vh);
          pinPx = Math.max(1, H - vh);
          const p = clamp01((scrolled - vh) / pinPx);
          // The flowers: open over the screen before the pin and the first
          // fifth of it.
          openScroll = clamp01(scrolled / (vh + 0.2 * pinPx));
          apply(p);
        },
      });
      apply(0);
    }, canvas);

    return () => {
      stopped = true;
      context.revert();
      bar?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      sheet.width = 1;
      sheet.height = 1;
      frame.width = 1;
      frame.height = 1;
    };
  }, []);

  // The way into Work: the "o" of "to" is a window. Its counter is found
  // by drawing the glyph and filling its inside (so the hole matches this
  // font, not a guess), the band is cut away inside it, and the sentence
  // grows around it until the counter is bigger than the screen.
  //
  // Reading off the stage's hold (0 = stage sticks, 1 = it lets go; the
  // work section rises under it over the second half):
  //   0.00 - ZOOM_FROM  the line is read; the introduction comes in;
  //   ZOOM_FROM - 1     the line grows about the counter, slow then fast,
  //                     while the counter slides to the middle of the
  //                     screen; the rest of the letters go past the edges
  //                     and the pink ring of the "o" sweeps off last.
  useEffect(() => {
    const stage = stageRef.current;
    const root = rootRef.current;
    const text = textRef.current;
    const line = lineRef.current;
    if (!stage || !root || !text || !line) return undefined;
    const glyph = line.querySelector<HTMLElement>("[data-window]");
    const mark = line.querySelector<HTMLElement>("[data-window-mark]");
    const wrap = text.querySelector<HTMLElement>("[data-intro-wrap]");
    const flower = canvasRef.current;
    if (!glyph || !mark) return undefined;
    const calm =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.innerWidth < NARROW;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const grow = gsap.parseEase("power2.in");
    const slide = gsap.parseEase("power2.inOut");

    // The counter, in the stage's coordinates with nothing transformed:
    // its centre and its half-width and half-height, and its exact shape as
    // a mask picture (opaque inside the counter), drawn at RES times the
    // type's size so it stays clean as it is blown up.
    let hole = { x: 0, y: 0, rx: 0, ry: 0 };
    let shape = "";
    // The text box's top left, for the transform origin.
    let box = { x: 0, y: 0 };
    let maxScale = 60;
    let last = 0;
    const measure = () => {
      text.style.transform = "";
      const st = stage.getBoundingClientRect();
      const g = glyph.getBoundingClientRect();
      const m = mark.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      box = { x: t.left - st.left, y: t.top - st.top };
      const cs = getComputedStyle(glyph);
      const size = parseFloat(cs.fontSize);
      const res = Math.min(RES, 1600 / size);
      const big = size * res;
      const pad = Math.ceil(big * 0.5);
      const W = Math.ceil(big * 2);
      const H = W;
      // Fallback: an ellipse in the middle of the x-height.
      hole = { x: (g.left + m.left) / 2 - st.left, y: m.bottom - st.top - size * 0.22, rx: size * 0.1, ry: size * 0.12 };
      shape = "";
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${big}px ${cs.fontFamily}`;
        ctx.fillStyle = "#000";
        const base = pad + big;
        ctx.fillText("o", pad, base);
        const a = ctx.getImageData(0, 0, W, H).data;
        const alpha = (i: number) => a[i * 4 + 3];
        let x0 = W;
        let x1 = -1;
        let y0 = H;
        let y1 = -1;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            if (alpha(y * W + x) < 128) continue;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
        const sx = Math.round((x0 + x1) / 2);
        const sy = Math.round((y0 + y1) / 2);
        if (x1 > x0 && alpha(sy * W + sx) < 128) {
          // Flood the inside from the middle of the ink. Pixels on the
          // ring's soft edge are taken too, at what the ink leaves of them.
          const inside = new Uint8Array(W * H);
          const stack = [sx + sy * W];
          inside[stack[0]] = 1;
          let cx0 = sx;
          let cx1 = sx;
          let cy0 = sy;
          let cy1 = sy;
          let open = false;
          while (stack.length) {
            const i = stack.pop() as number;
            const x = i % W;
            const y = (i - x) / W;
            cx0 = Math.min(cx0, x);
            cx1 = Math.max(cx1, x);
            cy0 = Math.min(cy0, y);
            cy1 = Math.max(cy1, y);
            if (x <= x0 || x >= x1 || y <= y0 || y >= y1) {
              open = true;
              break;
            }
            if (alpha(i) >= 128) continue;
            for (const n of [i - 1, i + 1, i - W, i + W]) {
              if (inside[n]) continue;
              inside[n] = 1;
              stack.push(n);
            }
          }
          if (!open) {
            const cw = cx1 - cx0 + 1;
            const ch = cy1 - cy0 + 1;
            const out = document.createElement("canvas");
            out.width = cw;
            out.height = ch;
            const o = out.getContext("2d");
            if (o) {
              const img = o.createImageData(cw, ch);
              for (let y = 0; y < ch; y += 1) {
                for (let x = 0; x < cw; x += 1) {
                  const i = (y + cy0) * W + x + cx0;
                  if (!inside[i]) continue;
                  img.data[(y * cw + x) * 4 + 3] = 255 - alpha(i);
                }
              }
              o.putImageData(img, 0, 0);
              shape = out.toDataURL("image/png");
            }
            hole = {
              x: g.left - st.left + ((cx0 + cx1 + 1) / 2 - pad) / res,
              y: m.bottom - st.top + ((cy0 + cy1 + 1) / 2 - base) / res,
              rx: cw / 2 / res,
              ry: ch / 2 / res,
            };
          }
        }
      }
      // Big enough that the counter's narrowest part, centred, clears the
      // corners (the inside of an "o" is about 0.7 of its box across).
      const corner = Math.hypot(st.width / 2, st.height / 2);
      maxScale = (corner / (0.7 * Math.min(hole.rx, hole.ry))) * 1.1;
    };

    const apply = (p: number) => {
      last = p;
      const st = stage.getBoundingClientRect();
      if (calm) {
        // A plain cross-fade as the work section comes up under the band.
        stage.style.opacity = String(1 - clamp01((p - 0.55) / 0.35));
        stage.style.visibility = p >= 0.999 ? "hidden" : "";
        return;
      }
      const z = clamp01((p - ZOOM_FROM) / (1 - ZOOM_FROM));
      if (z <= 0) {
        text.style.transform = "";
        stage.style.maskImage = "";
        stage.style.visibility = "";
        if (wrap) wrap.style.opacity = "";
        if (flower) flower.style.opacity = "";
        return;
      }
      const s = Math.exp(Math.log(maxScale) * grow(z));
      const k = slide(z);
      const tx = (st.width / 2 - hole.x) * k;
      const ty = (st.height / 2 - hole.y) * k;
      text.style.transformOrigin = `${(hole.x - box.x).toFixed(2)}px ${(hole.y - box.y).toFixed(2)}px`;
      text.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
      // The cut is the counter's own shape, carried with the glyph.
      const cx = hole.x + tx;
      const cy = hole.y + ty;
      const w = 2 * hole.rx * s;
      const h = 2 * hole.ry * s;
      const at = `${(cx - w / 2).toFixed(1)}px ${(cy - h / 2).toFixed(1)}px`;
      if (shape) {
        stage.style.maskImage = `url(${shape}), linear-gradient(#000, #000)`;
        stage.style.maskPosition = `${at}, 0 0`;
        stage.style.maskSize = `${w.toFixed(1)}px ${h.toFixed(1)}px, 100% 100%`;
        stage.style.maskRepeat = "no-repeat";
        stage.style.maskComposite = "exclude";
      } else {
        stage.style.maskImage = `radial-gradient(${(w / 2).toFixed(1)}px ${(h / 2).toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, transparent 98.5%, #000 100%)`;
      }
      stage.style.visibility = z >= 0.999 ? "hidden" : "";
      if (wrap) wrap.style.opacity = String(1 - clamp01(z / 0.12));
      if (flower) flower.style.opacity = String(1 - clamp01(z / 0.25));
    };

    let ctx: gsap.Context | null = null;
    let gone = false;
    void document.fonts.ready.then(() => {
      if (gone) return;
      measure();
      ctx = gsap.context(() => {
        ScrollTrigger.create({
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => apply(self.progress),
          onRefresh: (self) => {
            measure();
            apply(self.progress);
          },
        });
      }, root);
    });
    const onResize = () => {
      measure();
      apply(last);
    };
    window.addEventListener("resize", onResize);
    return () => {
      gone = true;
      window.removeEventListener("resize", onResize);
      ctx?.revert();
      text.style.transform = "";
      stage.style.maskImage = "";
    };
  }, []);

  // The line coming to, a letter at a time, done by the middle of the screen.
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return undefined;
    const letters = Array.from(line.querySelectorAll<HTMLElement>("[data-letter]"));
    if (!letters.length) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(letters, { opacity: 1, filter: "blur(0px)" });
      return undefined;
    }
    const context = gsap.context(() => {
      gsap.fromTo(
        letters,
        { opacity: 0.06, filter: "blur(7px)" },
        {
          opacity: 1,
          filter: "blur(0px)",
          ease: "none",
          duration: 1,
          stagger: 0.16,
          scrollTrigger: {
            // The SENTENCE is the trigger, not the section: it starts as the
            // line comes over the fold and is finished the moment the line
            // is centred, which is the moment it is meant to be read.
            trigger: line,
            start: "top bottom",
            end: "center center",
            scrub: 0.5,
          },
        },
      );
    }, line);
    return () => context.revert();
  }, []);

  return (
    <section
      // z-10 is load-bearing: the landscape's near canvas carries z-[2].
      // Two screens tall at every width, with a one-screen stage held
      // inside for the second: the hold is for reading, and the wall with
      // the hole in it comes over its second half.
      className="relative z-10 min-h-[300vh]"
      data-statement
      id="info"
      ref={rootRef}
      style={{ color: INK }}
    >
      <div
        className="sticky top-0 flex h-[100vh] items-center overflow-hidden"
        data-statement-stage
        ref={stageRef}
        style={{ backgroundColor: BAND }}
      >
      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
        data-statement-scene
        ref={canvasRef}
      />
      {/* The sentence and the introduction, held with the flower. */}
      <div className="relative z-[1] flex h-[100vh] w-full items-center">
        {/* On the work section's column (half way across on a wide screen),
            flush, so "Work" lands where this sentence stood: large, in the
            display serif. */}
        <div className="mx-[6vw] lg:ml-[50vw] lg:mr-0" ref={textRef} style={{ color: BLOSSOM_INK }}>
          <p
            aria-label={LINE}
            className="pb-[0.1em] font-serif-display italic text-[12vw] leading-[1.02] tracking-[-0.03em] lg:whitespace-nowrap lg:text-[min(16vh,6.2vw)]"
            ref={lineRef}
          >
            {LINE_ROWS.map((row, r) => (
              <span aria-hidden="true" className="block" key={r}>
                {row.split(" ").map((word, index, all) => (
                  // The word stays one box, and the letters inside it are
                  // what the scroll writes.
                  <span className="inline-block" key={index}>
                    {Array.from(word).map((glyph, at) => (
                      <span
                        className="inline-block will-change-[filter,opacity]"
                        data-letter
                        data-window={r === WINDOW[0] && index === WINDOW[1] && at === WINDOW[2] ? "" : undefined}
                        key={at}
                      >
                        {glyph}
                        {/* A zero-size box: its foot is the baseline and its
                            left is the glyph's advance. */}
                        {r === WINDOW[0] && index === WINDOW[1] && at === WINDOW[2] ? (
                          <i className="inline-block h-0 w-0" data-window-mark />
                        ) : null}
                      </span>
                    ))}
                    {index < all.length - 1 ? "\u00a0" : ""}
                  </span>
                ))}
              </span>
            ))}
          </p>
          {/* Under the sentence, on the same column. */}
          <div data-intro-wrap>
          <p className={`${INTRO} mt-[5vh] max-w-[46rem] lg:w-[22vw] lg:max-w-none`} data-intro>
            My name is Kevin. I{"’"}m a computer engineering student at the University of Toronto. I design and
            build software, hardware and robots, for the love of the craft and the people who use what I make.
          </p>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
