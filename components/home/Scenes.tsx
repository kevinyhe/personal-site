"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";

import { AURORA_RAMP, PLUM_WASH } from "@/components/bandColours";
import { createDotField, type DotField } from "@/components/dotField";
import { SCENES } from "@/components/fuse/f01/content";
import { serif } from "@/components/fuse/f01/fonts";
import { dissolve, dissolveNoise, loadMedia, type Media, paintScene, sceneVideos, smooth } from "@/components/fuse/f01/paint";
import { Arrow, FOCUS, FooterBar, Links } from "@/components/fuse/f01/parts";
import { Intro, Timeline, Work } from "@/components/fuse/f01/scenes";

/**
 * The home page after the statement band: concept F01 ("Scenes",
 * components/fuse/f01) folded into the page's own scroll.
 *
 * Three of lanceyan.com's scenes on one pinned screen: 01 who I am, over
 * the fir tree with petals falling; 02 the timeline by year, over drifting
 * clouds; 03 the work, where the picture is the project you are on. The
 * scroll picks the scene (SCENE_SCREENS of scroll each); between scenes the
 * diamonds dissolve out and back in. The fourth is the mountain at the end
 * of the page (Ending), so the pager here counts to 04 and its last step,
 * like "Contact" in the footer, scrolls on to it.
 *
 * Everything else is F01's own: lanceyan's serif block top left (name,
 * "0N / 04 →", short paragraphs, his row of links), his left-dark gradient,
 * lukebaffait's hairline footer. Not its name lockup: the hero already sets
 * "Kevin He." that size. The diamonds are drawn on a see-through canvas in
 * the aurora's own colours (AURORA_RAMP), so the light behind the page
 * shows between them.
 *
 * Pulled up a screen over the band's end on a wide screen (app/page.tsx),
 * so its first screen has no ground: the band's flowers are still going
 * down behind it.
 */

const FPS = 30;
const OUT = 260;
const IN = 460;
/** Scenes on this screen; the fourth is Ending. */
const HERE = 3;
const TOTAL = 4;
/** Screens of scroll each scene holds. */
const SCENE_SCREENS = 1.1;

export default function Scenes(): JSX.Element {
  const [page, setPage] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState(0);
  const pageRef = useRef(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef({ from: 0, to: 0, at: 0 });
  const kickRef = useRef<() => void>(() => {});

  /** Scrolls to scene `n` (0..2), or on to the mountain for 3. */
  const go = useCallback((n: number) => {
    const root = rootRef.current;
    if (!root) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let y: number;
    if (n >= HERE) {
      const end = document.getElementById("contact");
      if (!end) return;
      y = end.getBoundingClientRect().top + window.scrollY;
    } else {
      const top = root.getBoundingClientRect().top + window.scrollY;
      y = top + (Math.max(0, n) * SCENE_SCREENS + 0.05) * window.innerHeight;
    }
    const lenis = (window as unknown as { __lenis?: { scrollTo: (y: number, o?: object) => void } }).__lenis;
    if (lenis && !still) lenis.scrollTo(y, { duration: 1.2 });
    else window.scrollTo({ top: y, behavior: still ? "auto" : "smooth" });
  }, []);

  const onProject = useCallback((i: number) => {
    const p = projectRef.current;
    if (i === p.to) return;
    p.from = p.to;
    p.to = i;
    p.at = performance.now();
    setActive(i);
    kickRef.current();
  }, []);

  // The scene, from how far the pinned screen has been scrolled.
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let raf = 0;
    const read = (): void => {
      raf = 0;
      const root = rootRef.current;
      if (!root) return;
      const s = -root.getBoundingClientRect().top / Math.max(1, window.innerHeight);
      const next = Math.max(0, Math.min(HERE - 1, Math.floor(s / SCENE_SCREENS)));
      if (next !== pageRef.current) {
        pageRef.current = next;
        setPage(next);
        scrollRef.current?.scrollTo({ top: 0 });
        kickRef.current();
      }
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    read();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // The dot field: one canvas for all three scenes, running only while the
  // section is on screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.innerWidth < 1024;

    let field: DotField | null = null;
    try {
      field = createDotField(canvas, {
        cols: phone ? 180 : 280,
        threshold: 0.13,
        brightness: 1,
        size: 0.85,
        hue: 0,
        ground: "#000000",
        ramp: AURORA_RAMP,
        transparent: true,
      });
    } catch {
      field = null;
    }
    if (!field) {
      canvas.style.display = "none";
      return undefined;
    }
    const dots = field;

    let raf = 0;
    let onScreen = false;
    let last = -1;
    const start = performance.now();
    let shown = pageRef.current;
    // 0 idle, 1 dissolving out, 2 coming back.
    let phase = 0;
    let phaseAt = 0;
    let noise: Float32Array = new Float32Array(0);
    let playing: HTMLVideoElement[] = [];
    let media: Media | null = null;

    const play = (): void => {
      if (!media) return;
      const want = still || document.hidden || !onScreen ? [] : sceneVideos(media, shown);
      for (const v of playing) if (!want.includes(v)) v.pause();
      for (const v of want) void v.play().catch(() => {});
      playing = want;
    };

    const draw = (now: number): void => {
      if (!media) return;
      const target = pageRef.current;
      let f = 0;
      if (still) {
        if (shown !== target) {
          shown = target;
          play();
        }
      } else {
        if (target !== shown && phase === 0) {
          phase = 1;
          phaseAt = now;
        } else if (target !== shown && phase === 2) {
          const f0 = 1 - smooth(0, 1, (now - phaseAt) / IN);
          phase = 1;
          phaseAt = now - f0 * OUT;
        }
        if (phase === 1) {
          const p = (now - phaseAt) / OUT;
          f = smooth(0, 1, p);
          if (p >= 1) {
            shown = target;
            phase = 2;
            phaseAt = now;
            play();
          }
        } else if (phase === 2) {
          const p = (now - phaseAt) / IN;
          f = 1 - smooth(0, 1, p);
          if (p >= 1) phase = 0;
        }
      }
      const pr = projectRef.current;
      const m = media;
      dots.render((x, W, H) => {
        paintScene(shown, x, W, H, {
          media: m,
          t: still ? 0 : (now - start) / 1000,
          reduced: still,
          from: pr.from,
          to: pr.to,
          mix: still ? 1 : smooth(0, 1, (now - pr.at) / 520),
        });
        if (f > 0) {
          if (noise.length !== W * H) noise = dissolveNoise(W, H);
          dissolve(x, W, H, f, noise);
        }
      });
    };

    const tick = (now: number): void => {
      raf = 0;
      if (!onScreen || still || document.hidden) return;
      // lanceyan caps its redraw at 30 fps; so does this.
      const fr = Math.floor((now - start) / (1000 / FPS));
      if (fr !== last) {
        last = fr;
        draw(now);
      }
      raf = requestAnimationFrame(tick);
    };
    const once = (): void => {
      if (!raf) {
        raf = requestAnimationFrame((now) => {
          raf = 0;
          draw(now);
        });
      }
    };
    const run = (): void => {
      play();
      if (still) once();
      else if (onScreen && !document.hidden && !raf) raf = requestAnimationFrame(tick);
    };

    const loaded = loadMedia(() => {
      if (still) once();
    });
    media = loaded.media;
    kickRef.current = still ? once : () => {};

    const seen = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      run();
    });
    seen.observe(root);
    document.addEventListener("visibilitychange", run);
    const sized = new ResizeObserver(() => {
      dots.resize();
      draw(performance.now());
    });
    sized.observe(canvas);
    draw(performance.now());

    return () => {
      onScreen = false;
      cancelAnimationFrame(raf);
      kickRef.current = () => {};
      seen.disconnect();
      document.removeEventListener("visibilitychange", run);
      sized.disconnect();
      for (const v of playing) v.pause();
      loaded.dispose();
      dots.dispose();
    };
  }, []);

  const n = String(page + 1).padStart(2, "0");

  return (
    <section
      aria-label="Who I am, a timeline and the work"
      className={`relative text-white ${serif.className}`}
      data-scenes
      ref={rootRef}
      style={{ height: `${100 + HERE * SCENE_SCREENS * 100}vh`, backgroundColor: PLUM_WASH }}
    >
      <style>{`
        @media (min-width: 1024px) {
          [data-scenes] { background: linear-gradient(transparent 100vh, ${PLUM_WASH} 100vh) !important; }
        }
        @keyframes f01-in { from { opacity: 0; transform: translateY(1.2rem); } to { opacity: 1; transform: none; } }
        @keyframes f01-brush { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .f01-in { animation: f01-in 620ms cubic-bezier(0.2, 0.7, 0.1, 1) 220ms both; }
        .f01-brush { animation: f01-brush 700ms cubic-bezier(0.6, 0, 0.2, 1) both; }
        @media (prefers-reduced-motion: reduce) { .f01-in, .f01-brush { animation: none; } }
      `}</style>

      {/* Where the hero's "Work" link lands: the start of scene 03. */}
      <div aria-hidden="true" className="absolute left-0" id="work" style={{ top: `${(2 * SCENE_SCREENS + 0.05) * 100}vh` }} />

      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* The diamonds, on a see-through canvas: the aurora shows between
            them. Faded in at the top while the screen rises over the band. */}
        <canvas
          aria-hidden="true"
          className="absolute inset-0 block h-full w-full"
          ref={canvasRef}
          style={{ maskImage: "linear-gradient(transparent, #000 22vh)", WebkitMaskImage: "linear-gradient(transparent, #000 22vh)" }}
        />
        {/* lanceyan's gradient: dark behind the words, the left on a wide
            screen, the top on a phone, and a little at the foot. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.8),rgba(0,0,0,0.62)_55%,rgba(0,0,0,0)_88%)] lg:bg-[linear-gradient(90deg,rgba(0,0,0,0.6),rgba(0,0,0,0.25)_38%,rgba(0,0,0,0)_62%)]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[30vh] bg-[linear-gradient(0deg,rgba(0,0,0,0.5),rgba(0,0,0,0))]" />

        <div className="absolute inset-0 z-10 flex flex-col">
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(2.4rem,16px)] pb-[max(3.2rem,24px)] pt-[max(9.8rem,56px)] [scrollbar-width:none] lg:pl-[11.4rem] [&::-webkit-scrollbar]:hidden"
            data-lenis-prevent=""
            ref={scrollRef}
          >
            <div className="max-w-[64rem]">
              <div className="mb-[max(3.2rem,22px)] flex items-center justify-between gap-[1.6rem]">
                <h2 className="text-[max(3.6rem,28px)] font-bold leading-[1.15]">Kevin He</h2>
                <button
                  aria-label={`Scene ${page + 1} of ${TOTAL}. Next scene`}
                  className={`-mr-[0.8rem] inline-flex min-h-[44px] items-center gap-[0.8rem] px-[0.8rem] text-[max(1.4rem,12px)] tracking-[0.06em] text-white/70 transition-colors hover:text-white ${FOCUS}`}
                  onClick={() => go(page + 1)}
                  type="button"
                >
                  <span className="whitespace-nowrap tabular-nums">
                    {n} / 0{TOTAL}
                  </span>
                  <Arrow className="h-[1.3em] w-[1.3em]" />
                </button>
              </div>

              <section aria-label={SCENES[page].label} className="f01-in text-[max(1.8rem,15px)] leading-[1.68] text-white/80" key={page}>
                {page === 0 && <Intro go={go} />}
                {page === 1 && <Timeline />}
                {page === 2 && <Work active={active} onActive={onProject} reduced={reduced} />}
                <Links />
              </section>
            </div>
          </div>
          <FooterBar go={go} page={page} />
        </div>
      </div>
    </section>
  );
}
