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
import { useTvUp } from "@/components/tvUp";
import { useIdea } from "@/components/ideas/idea";

gsap.registerPlugin(ScrollTrigger);

/**
 * One sentence, on a flat band.
 *
 * The reference does this between its scenes: it leaves the landscape and
 * gives a whole screen to its own page colour, with one thing drawn in it and
 * one line of type. The two colours are the landscape's own, inverted: the
 * ground here is what the bars up there were drawn ON, and the type is what
 * they were drawn IN.
 *
 * THE SEAM IS A HILL. Not a rule and not a row of bars: the band's top edge
 * is a crest, drawn in the band's own colour and standing up into the dark
 * the landscape ends in, so the country above simply carries on over it.
 *
 * There is no flock on this side of it. A second one was drawn here for a
 * round so the sheep would appear to come over the ridge; against a hard
 * colour boundary that cannot work, because the flock has to be pink on the
 * dark side and ink on the light one, and one canvas has one fill. Two sets
 * that nearly line up are worse than one set that stays where it belongs.
 *
 * THE FLOWER is the prologue's own — sondaven's prolog-r-c.mp4, the same file
 * standing beside the quote further down, through the same bar shader. It
 * plays once, and the scene is not built until the section is on screen, so
 * the bloom happens as you arrive rather than three screens earlier with
 * nobody watching.
 *
 * The line is set in the display serif's ITALIC, which is the cut the hero's
 * own "He." is in — so the one sentence on the page and the one word of the
 * name that is emphasised are said in the same voice.
 *
 * THE BIRDS: sondaven's line of five (their clip, public/sonda), through
 * the same bar shader, crossing the band from right to left high over the
 * sentence, one pass every BIRDS_EVERY seconds while the band is on screen
 * (the reference's looping tween on its hero flock, the other way round:
 * the layer is mirrored, so the birds fly to the left). Under reduced
 * motion they do not cross.
 *
 * THE LINE DOES NOT MOVE. The letters are out of focus and half there and
 * come to one at a time, scrubbed by the scroll — and the run FINISHES when
 * the sentence reaches the middle of the screen. Past that it is the thing
 * you are reading, and a word still resolving while you read it is a word
 * fighting you.
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

/** Below this there is no room beside the column for a stem to stand in,
 *  so the sentence goes to the top of the screen and the flower stands
 *  under it, on the band's foot (see FLOWER_WIDE). */
const NARROW = 1024;
/** The flower's box, width over height, as on a wide screen (half of it
 *  across, all of it down, 0.93 at 1888 by 1020): the frame is stretched to
 *  its box, so a box of another shape would be another flower. */
const FLOWER_WIDE = 0.9;
/** The birds' box under NARROW, a share of the width: a smaller flock,
 *  high enough to cross over the sentence, not through it. */
const BIRDS_W_NARROW = 25;

/** The birds: sondaven's line of five (their hero and about flock,
 *  public/sonda/birds_02-c.mp4, 480 x 480, 5 s), in their box (a third of
 *  the width, square) at their height; a crossing and the gap after it,
 *  in seconds, theirs too. */
const BIRDS_SRC = "/sonda/birds_02-c.mp4";
const BIRDS_W = 33.33;
const BIRDS_Y = "10%";
const BIRDS_CROSS = 5;
const BIRDS_EVERY = 10;

/** The introduction: the sans at reading size, under the sentence. */
const INTRO =
  "font-sans text-[1.75rem] font-light leading-[1.6] tracking-[0.01em] opacity-0 lg:text-[min(2.2vh,0.93vw)]";

const LINE_ROWS = ["I build systems", "that bring ideas", "to life."];

export default function StatementSection(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lineRef = useRef<HTMLParagraphElement | null>(null);

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
  const tvUp = useTvUp();
  // Idea 6's flock (ideas/i06) flies in this band's sky on a phone, so the line of five stays out of it there.
  const flockOnPhone = useIdea() === 6;
  // Waits for the hero (tvUp.ts) so it does not slow the TV loading.
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = canvasRef.current;
    const line = lineRef.current;
    if (!canvas || !line) return undefined;
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
    let ctx_cleanup: (() => void) | null = null;
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

    // Hanging down the right of the band, past the centred sentence, and
    // again down the left as its mirror.
    const WIDE_BOX = { x: "-2.5%", y: "2%", width: "50%", height: "100%" };
    // Under NARROW the flower stands under the introduction, its box the
    // wide screen's shape (FLOWER_WIDE), centred, its foot on the band's.
    // Read from the layout (offsets, so the introduction's slide-in does
    // not move it), again on every refresh: fonts and a turned phone both
    // move the introduction's foot.
    const narrow = window.innerWidth < NARROW;
    const box = (): typeof WIDE_BOX => {
      if (window.innerWidth >= NARROW) return WIDE_BOX;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const intros = rootRef.current?.querySelectorAll<HTMLElement>("[data-intro]") ?? [];
      const last = intros[intros.length - 1];
      const foot = last ? last.offsetTop + last.offsetHeight : 0.5 * H;
      const top = Math.max(0.5 * H, foot + 0.03 * H);
      const tall = H - top;
      const wide = Math.min(W, tall * FLOWER_WIDE);
      const pc = (v: number, of: number): string => `${((100 * v) / Math.max(1, of)).toFixed(2)}%`;
      return { x: pc((W - wide) / 2, W), y: pc(top, H), width: pc(wide, W), height: pc(tall, H) };
    };
    const config: BarLayerConfig = {
      ...box(),
      // The prologue's own grade, upside down: a BRIGHT petal draws a WIDE
      // bar, so the flower is solid ink on the blossom ground. The right way
      // up it is the stem that inks and the petals that vanish.
      blackPoint: 200, whitePoint: 25, threshold: 255,
      xSquares: 150, ySquares: 190, bgOpacity: 0, fillOpacity: 1,
    };
    // The birds: sondaven's own clip, their grade (255/0, bright draws
    // wide), mirrored to fly the other way, starting off the right edge;
    // the loop below carries the box across to the left.
    const birdsW = narrow ? BIRDS_W_NARROW : BIRDS_W;
    const birdsConfig: BarLayerConfig = {
      x: "100%", y: narrow ? "1%" : BIRDS_Y, width: `${birdsW}%`, height: `${birdsW}vw`,
      blackPoint: 255, whitePoint: 0, threshold: 255,
      bgOpacity: 0, fillOpacity: 1, mirrorX: true,
    };
    const layers: BarLayer[] = [
      { type: "canvas", source, config },
      ...(narrow && flockOnPhone
        ? []
        : [{ type: "video" as const, sources: [{ src: BIRDS_SRC, type: "video/mp4" }], config: birdsConfig }]),
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
      // The birds' crossing, right to left, over and over while the band
      // is on screen; paused off it, so a reader coming back does not meet
      // a flock mid-air that has been flying for nobody.
      const loop = gsap
        .timeline({ paused: true })
        .fromTo(
          birdsConfig,
          { x: "100%" },
          { x: `${-birdsW}%`, duration: BIRDS_CROSS, ease: "none", repeat: -1, repeatDelay: BIRDS_EVERY - BIRDS_CROSS },
          0,
        );
      const seen = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              if (loop.paused()) loop.play();
            } else if (!loop.paused()) loop.pause();
          }
        },
        { threshold: 0.01, rootMargin: "20% 0px 20% 0px" },
      );
      seen.observe(canvas);
      ctx_cleanup = () => {
        seen.disconnect();
        loop.kill();
      };
      ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.4,
        onRefresh: () => Object.assign(config, box()),
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
      ctx_cleanup?.();
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
  }, [tvUp, flockOnPhone]);
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
      // inside for the second: the hold is for reading, and the clouds (CloudPassage.tsx) roll in over its second half.
      className="relative z-10 min-h-[200vh]"
      data-statement
      id="info"
      ref={rootRef}
      style={{ color: INK, backgroundColor: BAND }}
    >
      <div className="sticky top-0 flex h-[100vh] items-center overflow-hidden" data-statement-stage>
      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
        data-statement-scene
        ref={canvasRef}
      />
      {/* The sentence and the introduction, held with the flower. */}
      {/* Under NARROW at the top, so the flower has the foot to stand in. */}
      <div className="relative z-[1] flex h-[100vh] w-full items-start pt-[14svh] lg:items-center lg:pt-0">
        {/* On the work section's column (half way across on a wide screen),
            flush, so "Work" lands where this sentence stood: large, in the
            display serif. */}
        <div className="mx-[6vw] lg:ml-[50vw] lg:mr-0" style={{ color: BLOSSOM_INK }}>
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
                      <span className="inline-block will-change-[filter,opacity]" data-letter key={at}>
                        {glyph}
                      </span>
                    ))}
                    {index < all.length - 1 ? "\u00a0" : ""}
                  </span>
                ))}
              </span>
            ))}
          </p>
          {/* Under the sentence, on the same column. */}
          <p className={`${INTRO} mt-[5vh] max-w-[46rem] lg:w-[22vw] lg:max-w-none`} data-intro>
            My name is Kevin. I{"’"}m a computer engineering student at the University of Toronto. I design and
            build software, hardware and robots, for the love of the craft and the people who use what I make.
          </p>
        </div>
      </div>
      </div>
    </section>
  );
}
