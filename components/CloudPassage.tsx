"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";

import { createBarCanvas, hexToRgb, type BarLayerConfig } from "@/components/valley/barShader";
import { GROUND, INK } from "@/components/luke/theme";
import { useTvUp } from "@/components/tvUp";
import { cloud as paletteCloud, css, ground as paletteGround, setPalette } from "@/components/cloudPalette";


/**
 * The passage from the statement into Work: a bank of cloud rolls in over
 * the sentence, the birds cross it, and the page takes the cloud's colours.
 * The bank then stays, settled and drifting with the scroll, as Work's
 * backdrop.
 *
 * Adapted from sondaven.com's hero and intro-bg scenes (initSceneHero,
 * initSceneHeroBg in its main.js). There the same two cloud clips,
 * claudes_02 and claudes_03, sit in the bar shader at different sizes and
 * slide sideways with the scroll (`x` tweened, scrub: true), and birds_04
 * crosses the frame from x = -size to 100%. Here:
 *
 *   - three depths of cloud. Far and small and faint, mid, and two near
 *     clouds three screens wide. Each depth moves at its own rate, so the
 *     bank has parallax. The near pair rise from below and meet over the
 *     middle;
 *   - the birds cross the closed bank, drawn dark on it;
 *   - while it is closed the colours turn over (palette.ts): the ground
 *     goes from plum to the cloud's pink, the type and the koi from pink to
 *     plum, and the clouds themselves to a deeper rose so they still read
 *     on the pink. The statement is taken away behind the bank;
 *   - the bank opens out to the sides and settles: its bars ease down to
 *     a lighter weight and it stays behind Work, drifting only with the
 *     scroll;
 *   - under Work's last project the colours turn back and the bank thins
 *     away, so the plum page below follows on with no seam.
 *
 * The clips are white cloud on black. Graded upside down (blackPoint 255,
 * whitePoint 70) a bright part of the cloud draws a wide bar and the greys
 * inside it draw narrower ones, so the closed bank keeps its billows rather
 * than going one flat colour.
 *
 * Bars are sized in screen widths, not pixels, so a big window looks like a
 * small one scaled up.
 *
 * Wide screens only, and not under reduced motion: there the statement
 * simply scrolls into Work in the band's colours.
 */

/** Below this the passage is not drawn. */
const NARROW = 1024;
/** Bars across the screen: 8px apart at 1920. */
const BARS_ACROSS = 240;
/** The cloud clips' frame, 1256 x 768. */
const CLIP_ASPECT = 768 / 1256;
/** Where the body of a cloud sits in its frame (measured on claudes_02). */
const CORE_X = 0.52;
const CORE_Y = 0.4;

type Key = [p: number, x: number, y: number];

/** A path through keyframes, smoothstepped between them. */
function along(keys: Key[], p: number): [number, number] {
  if (p <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i += 1) {
    const [p1, x1, y1] = keys[i];
    if (p <= p1) {
      const [p0, x0, y0] = keys[i - 1];
      const t = (p - p0) / (p1 - p0);
      const s = t * t * (3 - 2 * t);
      return [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s];
    }
  }
  const last = keys[keys.length - 1];
  return [last[1], last[2]];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 0 before a, 1 after b. */
const ramp = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

type Cloud = {
  src: string;
  mirror: boolean;
  /** Width in screen widths. */
  width: number;
  /** How solid the bars are: the far bank is fainter. */
  opacity: number;
  /** Centre of the cloud's body, in % of the screen, against the scroll. */
  path: Key[];
  /** Bars thicken in over [a, b]. */
  grow: [number, number];
  /** Bar weight once settled behind Work, as a share of the full weight. */
  rest: number;
  /** Drift once settled, in % of the screen's width per screen scrolled. */
  drift: number;
};

/**
 * Timing, on the passage's progress, which runs over the first two screens
 * of the track. The track starts 20vh into the statement, so the
 * statement's stage starts up the screen at 0.4 and Work's top reaches the
 * top of the screen at 0.9. Past 1 the bank only drifts.
 */
const CLOUDS: Cloud[] = [
  // Far: small, faint, drifting left slowly, as sondaven's hero cloud.
  { src: "claudes_03", mirror: false, width: 0.62, opacity: 0.4,
    path: [[0, 92, 30], [1, 20, 14]], grow: [0, 0.18], rest: 0.8, drift: -3 },
  // Mid: the other way and faster.
  { src: "claudes_02", mirror: true, width: 1.3, opacity: 0.7,
    path: [[0, 20, 110], [0.42, 46, 62], [0.85, 22, 78]], grow: [0.06, 0.3], rest: 0.7, drift: 5 },
  // Near: the pair that closes over the screen and opens to the sides.
  { src: "claudes_02", mirror: false, width: 3, opacity: 1,
    path: [[0.08, 18, 190], [0.42, 40, 52], [0.58, 36, 50], [0.85, -30, 92]], grow: [0.1, 0.34], rest: 0.55, drift: -8 },
  { src: "claudes_03", mirror: true, width: 3, opacity: 1,
    path: [[0.14, 92, 210], [0.46, 62, 58], [0.58, 66, 54], [0.85, 128, 6]], grow: [0.16, 0.4], rest: 0.55, drift: 8 },
];

/** The colours turn over between these, while the bank is closed. */
const TURN: [number, number] = [0.36, 0.6];
/** The bars ease from full weight to their resting weight between these. */
const SETTLE: [number, number] = [0.58, 0.88];
/** Over the track's last this-many screens the colours turn back to plum
 *  and the bank thins away, under Work's last project. */
const BACK = 0.8;
/** By here the near pair cover the whole screen. */
const CLOSED = 0.5;

/** One frame of a clip, CLOUD_AT seconds in, on a canvas. */
const CLOUD_AT = 3;
function stillOf(src: string): { canvas: HTMLCanvasElement; ready: Promise<void> } {
  const canvas = document.createElement("canvas");
  canvas.width = 1256;
  canvas.height = 768;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const ready = new Promise<void>((resolve) => {
    video.addEventListener(
      "loadeddata",
      () => {
        video.addEventListener(
          "seeked",
          () => {
            canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
            video.removeAttribute("src");
            video.load();
            resolve();
          },
          { once: true },
        );
        video.currentTime = CLOUD_AT;
      },
      { once: true },
    );
    video.addEventListener("error", () => resolve(), { once: true });
  });
  video.src = src;
  return { canvas, ready };
}

export default function Passage(): JSX.Element {
  const cloudsRef = useRef<HTMLCanvasElement | null>(null);
  const birdsRef = useRef<HTMLCanvasElement | null>(null);
  const groundRef = useRef<HTMLDivElement | null>(null);
  const tvUp = useTvUp();

  // Waits for the hero (tvUp.ts) so it does not slow the TV loading.
  useEffect(() => {
    if (!tvUp) return undefined;
    const cloudCanvas = cloudsRef.current;
    const birdCanvas = birdsRef.current;
    const groundEl = groundRef.current;
    const track = cloudCanvas?.parentElement?.parentElement;
    // The statement's stage, hidden while the bank is closed over it.
    const stage = track?.parentElement?.querySelector<HTMLElement>("[data-statement-stage]") ?? null;
    if (!cloudCanvas || !birdCanvas || !groundEl || !track) return undefined;
    if (window.innerWidth < NARROW) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cell = w / BARS_ACROSS;
    const configs = CLOUDS.map((c): BarLayerConfig => {
      const hPx = c.width * w * CLIP_ASPECT;
      return {
        x: "0%", y: "0%", width: `${c.width * 100}%`, height: `${(hPx / h) * 100}%`,
        blackPoint: 255, whitePoint: 70, threshold: 255,
        xSquares: Math.round((c.width * w) / cell), ySquares: Math.round(hPx / (1.5 * cell)),
        maxSquareWidth: "0%", bgOpacity: 0, fillOpacity: 0, mirrorX: c.mirror,
      };
    });
    // The second: big and dark, across the closed bank.
    const bigBirds: BarLayerConfig = {
      x: "-40%", y: "10%", width: "40%", height: "40vw",
      blackPoint: 255, whitePoint: 75, threshold: 255,
      xSquares: Math.round((0.4 * w) / (cell / 3)), ySquares: Math.round((0.4 * w) / (cell / 3)),
      bgOpacity: 0, fillOpacity: 0,
    };

    // The clouds are STILLS: one frame of each clip, moved only by the
    // scroll. Played, they flickered: every new video frame re-sized
    // thousands of bars at once, and the clip's loop point swapped the
    // cloud for another, so a slow scroll showed the bank boiling and
    // jumping rather than drifting. A still moved by its box moves its
    // bars with it, whole.
    const stills = Object.fromEntries(
      [...new Set(CLOUDS.map((c) => c.src))].map((src) => [src, stillOf(`/sonda/${src}.mp4`)]),
    );
    const clouds = createBarCanvas(
      cloudCanvas,
      [
        ...CLOUDS.map((c, i) => ({
          type: "canvas" as const,
          source: { canvas: stills[c.src].canvas, animated: false, ready: stills[c.src].ready },
          config: configs[i],
        })),
      ],
      { colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(INK) }), defaults: { bgOpacity: 0 } },
    );
    const birds = createBarCanvas(
      birdCanvas,
      [{ type: "video", sources: [{ src: "/sonda/birds_04.mp4", type: "video/mp4" }], config: bigBirds }],
      { colors: () => ({ bg: hexToRgb(INK), fill: hexToRgb(GROUND) }), defaults: { bgOpacity: 0 } },
    );

    const glide = gsap.parseEase("sine.inOut");
    // back: 0 until the last screen of the track, 1 at its end, where the
    // page below (Skills) carries on in plum.
    const apply = (p: number, extra: number, back = 0) => {
      if (stage) stage.style.visibility = p > CLOSED ? "hidden" : "";
      const t = glide(ramp(p, TURN[0], TURN[1])) * (1 - glide(back));
      setPalette(t);
      // The new ground: pink, faded in under the bank while it is closed.
      groundEl.style.backgroundColor = css(paletteGround(1));
      groundEl.style.opacity = String(t);
      clouds?.setColors(hexToRgb(GROUND), paletteCloud(t));
      const settle = glide(ramp(p, SETTLE[0], SETTLE[1]));
      // On the way back the bank is gone before the ground is half way:
      // a pink bar behind a name on a half-plum ground would not read.
      const gone = clamp01(back / 0.4);
      CLOUDS.forEach((c, i) => {
        const cfg = configs[i];
        const [cx, cy] = along(c.path, p);
        const wPct = c.width * 100;
        const hPct = parseFloat(String(cfg.height));
        cfg.x = `${cx + c.drift * extra - wPct * (c.mirror ? 1 - CORE_X : CORE_X)}%`;
        cfg.y = `${cy - hPct * CORE_Y}%`;
        const on = ramp(p, c.grow[0], c.grow[1]);
        const weight = on * on * (1 - (1 - c.rest) * settle) * (1 - gone);
        cfg.maxSquareWidth = `${(102 * weight).toFixed(1)}%`;
        cfg.fillOpacity = on > 0.002 ? c.opacity * (1 - gone) : 0;
      });
      // The clouds are stills, so nothing else redraws them.
      clouds?.redraw({ reupload: false });
      // The big flock, across the bank while it is closed, gone before
      // Work's header comes to rest.
      const b = glide(ramp(p, 0.3, 0.7));
      bigBirds.x = `${-40 + 140 * b}%`;
      bigBirds.y = `${26 - 22 * b}%`;
      bigBirds.fillOpacity = b > 0 && b < 1 ? 0.92 : 0;
    };
    apply(0, 0);

    // Measured off the track itself each time.
    const read = () => {
      const r = track.getBoundingClientRect();
      const vh = window.innerHeight;
      const px = -r.top;
      const len = r.height - vh;
      apply(clamp01(px / (2 * vh)), Math.max(0, px - 2 * vh) / vh, ramp(px, len - BACK * vh, len));
    };
    // A plain scroll listener, not a ScrollTrigger: the trigger's cached
    // range went stale as sections below loaded, and past its end it
    // stopped reporting, which left the colours half turned at the join.
    let raf = 0;
    const onScroll = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          read();
        });
      }
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (stage) stage.style.visibility = "";
      setPalette(0);
      clouds?.destroy();
      birds?.destroy();
    };
  }, [tvUp]);

  return (
    // The track: from 20vh into the statement to the end of Work, above the
    // statement and under Work's type. It never takes a click.
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[20vh] z-20">
      <div className="sticky top-0 h-[100vh] w-full">
        <div className="absolute inset-0 opacity-0" ref={groundRef} />
        <canvas className="absolute inset-0 block h-full w-full" ref={cloudsRef} />
        <canvas className="absolute inset-0 block h-full w-full" ref={birdsRef} />
      </div>
    </div>
  );
}
