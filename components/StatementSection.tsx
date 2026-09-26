"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { mountHeroRobot, type HeroRobot } from "@/components/heroRobot";
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
const BAND = "#2a0d1e";
const INK = "#f9b9dc";
/** The lines' colour: the same blossom the bars are drawn in, so the
 *  difference blend cancels to dark where they meet. */
const BLOSSOM_INK = INK;

/** Below this there is no room beside the column for a stem to stand in. */
const NARROW = 992;

/** The robot's numbers. Weight from the machine; drivetrain, speed and
 *  power from vexsim's six_motor_450 preset, which is what its Push Back
 *  scene drives (`python3 -m vexsim spec six_motor_450`); the pack from the
 *  V5 battery's datasheet. */
const AFTER =
  "whitespace-nowrap font-serif-display italic text-[min(22vh,9.4vw)] leading-[0.86] tracking-[-0.03em] opacity-0";
/** The introduction: the sans at reading size for a narrow column. */
const INTRO =
  "font-sans text-[min(2.8vh,1.15vw)] font-light leading-[1.55] tracking-[0.005em] opacity-0";
const STAIR = 5;

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
  useEffect(() => {
    const canvas = canvasRef.current;
    const line = lineRef.current;
    if (!canvas || !line) return undefined;
    if (window.innerWidth < NARROW) return undefined;

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
      x: "64%", y: "2%", width: "50%", height: "100%",
      // The prologue's own grade, upside down: a BRIGHT petal draws a WIDE
      // bar, so the flower is solid ink on the blossom ground. The right way
      // up it is the stem that inks and the petals that vanish.
      blackPoint: 200, whitePoint: 25, threshold: 255,
      xSquares: 150, ySquares: 190, bgOpacity: 0, fillOpacity: 1,
    };
    // THE ROBOT, on the same canvas, in the same bars.
    //
    // heroRobot draws it off screen — a white shape on nothing — and hands
    // the canvas over as a layer source, so the engine dithers it exactly
    // as it does the flower: one bar a cell, wide where the source is
    // bright. Read upside down (255 / 0) so white is a full bar, and the
    // robot is solid ink in the band's own marks. Transparent is discarded,
    // so nothing is drawn around it.
    const frame0 = rootRef.current;
    const sceneW = frame0?.clientWidth ?? window.innerWidth;
    const sceneH = window.innerHeight;
    const robotW = Math.min(1400, sceneW);
    const robotH = Math.round((robotW * sceneH) / sceneW);
    const robot: HeroRobot | null = mountHeroRobot({
      url: "/models/hero.glb",
      offscreen: { width: robotW, height: robotH },
      enterFrom: "left",
      // It parks in the middle of the screen, a little smaller than the
      // frame so its near side, which stands closer to the lens than its
      // box, still clears the top. Lit, not flat: the bar shader reads
      // brightness, so the shading comes out as bar width — lit faces wide,
      // shadowed faces thin — in the band's own two colours.
      endX: robotW * 0.5,
      fill: 0.7,
      shaded: true,
    });
    const robotConfig: BarLayerConfig = {
      x: "0%", y: "0%", width: "100%", height: "100%",
      // Upside down, so a lit face is a wide bar; and the white point up
      // off zero so the darkest faces keep a hairline rather than vanish.
      // A hard grade: anything over 190 grey is a full bar, anything under
      // 70 has none, so the lit faces are solid and the shadow is empty.
      blackPoint: 190, whitePoint: 70, threshold: 255,
      // The flower's density, carried across the full width — and the bar
      // capped under its cell, so a white shape stays a run of LINES
      // rather than filling to one solid mass. That cap is the effect.
      xSquares: 300, ySquares: 190, maxSquareWidth: "64%", bgOpacity: 0, fillOpacity: 1,
    };
    const configLeft: BarLayerConfig = { ...config, x: "-14%", mirrorX: true };
    const layers: BarLayer[] = [
      { type: "canvas", source, config },
      { type: "canvas", source, config: configLeft },
      ...(robot ? [{ type: "canvas" as const, source: robot.source, config: robotConfig }] : []),
    ];
    bar = createBarCanvas(canvas, layers, {
      colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(INK) }),
      defaults: { bgOpacity: 0 },
      fps: reduced ? 4 : 60,
    });

    // ONE TIMELINE OVER THE PIN, and everything reads off it:
    //   (before)     the flower opens from the moment the section shows
    //                over the fold, a whole screen before the pin, and is
    //                open by the time the robot sets off;
    //   0.22 - 0.72  the robot comes up from below the frame's bottom edge
    //                and stops in the middle, turning the whole way, and
    //                the flowers close over the same stretch — buds again
    //                by the time it is up;
    //   0.22 - 0.72  as its top rises past the sentence, the lines below
    //                it are gone: a clip from the bottom that follows it,
    //                and finishes over the last of the rise whatever the
    //                edge is doing;
    //   0.74 - 1.00  the two lines come in, then the introduction.
    // The turn runs from the moment it starts to rise until the section
    // has scrolled off the top, which is past the end of the pin: one full
    // circle, slow, as if on a turntable. One trigger runs the section's
    // whole pass, from its top clearing the fold to its bottom clearing
    // the top; `p` is the pin's share of it, and `openScroll` the flower's.
    const wipe = line.parentElement as HTMLElement;
    const lines = Array.from(
      (rootRef.current?.querySelectorAll<HTMLElement>("[data-after-line]") ?? []),
    );
    const climb = gsap.parseEase("power2.out");
    const soft = gsap.parseEase("power2.out");
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    let openFrames = 0;
    let spin = 0;
    let openScroll = 0;
    const apply = (p: number) => {
      // Closing: the clip run BACKWARDS over the rise, the whole of it —
      // the petals fold, the flower shuts to a bud, the stem sinks back
      // into the ground, and the first frame is empty. The sheet starts at
      // the clip's own start (BLOOM_FROM 0) for exactly this reason.
      const shut = p < 0.22 ? 0 : clamp01((p - 0.22) / 0.5);
      const open = p < 0.22 ? openScroll : 1 - shut;
      openFrames = clamp01(open) * (FRAMES - 1);
      want = Math.round(openFrames);
      // And they sink as they close: the box slides down the frame over
      // the rise, a whole frame's worth, so at the end the top of it has
      // just gone under the bottom edge — barely hidden, not switched off.
      for (const c of [config, configLeft]) {
        c.y = `${2 + 100 * shut}%`;
        c.fillOpacity = open <= 0.002 ? 0 : 1;
      }
      // Both pairs, top then bottom, one line after another.
      for (const [i, el] of lines.entries()) {
        const q = soft(clamp01((p - 0.72 - i * 0.04) / 0.1));
        el.style.opacity = String(q);
        el.style.transform = `translateY(${(1 - q) * 28}px)`;
      }
      if (!robot) return;
      const r = clamp01((p - 0.22) / 0.5);
      robot.yaw(spin);
      robot.rise(climb(r));
      // The wipe, from the bottom: the robot canvas is a scaled copy of
      // the frame, so its top edge scales back by the ratio.
      const scale = (frame0?.clientWidth ?? sceneW) / robotW;
      const box = wipe.getBoundingClientRect();
      const top = canvas.getBoundingClientRect().top + robot.topPx() * scale;
      const cut = r <= 0 ? 0 : box.bottom - top;
      const finish = box.height * soft(clamp01((r - 0.72) / 0.28));
      wipe.style.clipPath = `inset(0 0 ${Math.max(0, cut, finish)}px 0)`;
    };

    const context = gsap.context(() => {
      // Parked in the middle from the start; only its height and its turn
      // are the scroll's.
      let lastP = 0;
      robot?.ready.then(() => {
        robot?.seek(1);
        apply(lastP);
      });
      if (reduced) {
        want = FRAMES - 1;
        robot?.seek(1);
        for (const el of lines) el.style.opacity = "1";
        return;
      }
      const root = rootRef.current;
      // The section's whole pass, in px scrolled: from its top at the
      // fold to its bottom at the top of the screen. The pin is the middle
      // of that — one screen in, one screen short of the end.
      const RISE = 0.22;
      ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.4,
        onUpdate: (self) => {
          const vh = window.innerHeight;
          const H = root?.offsetHeight ?? 4 * vh;
          const scrolled = self.progress * (H + vh);
          const pinLen = Math.max(1, H - vh);
          const p = clamp01((scrolled - vh) / pinLen);
          // The flower: open over the screen before the pin and the first
          // fifth of it, so it is full as the robot sets off.
          openScroll = clamp01(scrolled / (vh + 0.2 * pinLen));
          // The turn: from the start of the rise to the end of the pass.
          const riseAt = vh + RISE * pinLen;
          spin = 2 * Math.PI * clamp01((scrolled - riseAt) / (H + vh - riseAt));
          lastP = p;
          apply(p);
        },
      });
      apply(0);
    }, canvas);

    return () => {
      stopped = true;
      context.revert();
      robot?.dispose();
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
      // z-10 is load-bearing: the crest below is drawn ABOVE this section's
      // own top edge, over the landscape, and the landscape's near canvas
      // carries z-[2]. Without a stated layer here that canvas paints over
      // the hill and the boundary goes back to being a straight rule.
      // Four screens tall on a wide screen, with a one-screen frame pinned
      // inside for the last three: the viewport holds on the sentence while
      // the flower opens, the robot crosses and parks in the middle, the
      // flower closes, and the four lines come in beside it.
      className="relative z-10 min-h-[100vh] lg:min-h-[500vh]"
      data-statement
      id="info"
      ref={rootRef}
      style={{ backgroundColor: BAND, color: INK }}
    >
      <div className="sticky top-0 flex h-[100vh] items-center">
      {/* NO seam device. The reference has none either, and the reason is
          worth keeping: the bottom of its land plate grades to solid FILL
          colour, and the section under it is painted that same colour, so
          the bars simply run out into it. Ours is the same arrangement —
          this band is BAR_FILL — so a drawn crest here was a hard edge
          invented on top of a join that already worked. */}

      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
        data-statement-scene
        ref={canvasRef}
      />

      {/* What is left once the sentence has gone: four lines on the left
          of the parked robot, all in the display serif at one size and
          each in a different cut: roman, italic, italic drawn hollow, bold
          italic. They come in one after another at the end of the
          pin; the timeline writes their opacity and lift directly. */}
      <div className="pointer-events-none absolute left-[3vw] top-[7vh] z-[1] hidden lg:block" style={{ color: BLOSSOM_INK }}>
        <p className={AFTER} data-after-line>
          I write software for
        </p>
        <p className={AFTER} data-after-line style={{ marginLeft: `${STAIR}vw` }}>
          things that move.
        </p>
      </div>
      {/* The introduction, in the clear on the right of the robot (it stands
          in the middle 35..65 of the width). lukebaffait.fr's info section
          does this after its tagline: a greeting, then a few plain lines in
          the first person saying who and what. */}
      <div
        className="pointer-events-none absolute right-[5vw] top-[56%] z-[1] hidden w-[22vw] -translate-y-1/2 lg:block"
        style={{ color: BLOSSOM_INK }}
      >
        <p className={INTRO} data-after-line>
          My name is Kevin. I{"\u2019"}m a computer engineering student in Toronto. What I make works in the
          real world, on real hardware, in real time.
        </p>
      </div>

      {/* The sentence, in the middle. The box round it is what the wipe
          clips as the robot rises through it; the flowers hang either side. */}
      <div className="relative z-[1] w-full px-6 sm:px-16">
        <p
          className="mx-auto max-w-[17ch] text-balance text-center font-serif-display italic text-[clamp(2.4rem,5.6vw,6rem)] leading-[0.98] tracking-[-0.025em]"
          ref={lineRef}
        >
          {LINE.split(" ").map((word, index, all) => (
            // The word stays one box so lines break between words, and the
            // letters inside it are what the scroll writes.
            <span className="inline-block" key={index}>
              {Array.from(word).map((glyph, at) => (
                <span
                  className="inline-block will-change-[filter,opacity]"
                  data-letter
                  key={at}
                >
                  {glyph}
                </span>
              ))}
              {index < all.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
      </div>
    </section>
  );
}
