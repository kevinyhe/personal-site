"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";

import { createDotField, type DotField } from "@/components/dotField";
import { SCENES } from "./content";
import { serif } from "./fonts";
import { dissolve, dissolveNoise, loadMedia, type Media, paintScene, sceneVideos, smooth } from "./paint";
import { Arrow, FOCUS, FooterBar, Links, Lockup } from "./parts";
import { Contact, Intro, Timeline, Work } from "./scenes";

/**
 * Concept 01, "Scenes": lanceyan.com's four paged screens, in this site's
 * worlds, with lukebaffait's name and footer on the first.
 *
 * The page does not scroll. It is four full-screen scenes, one at a time,
 * changed by the wheel, a swipe, the arrow keys (and Page Up/Down, Home,
 * End), the "01 / 04 →" pager beside the name (which goes round from 04 to
 * 01), or the scene names in the footer. The scene is kept in the address
 * as #1 to #4, so a link can open on any of them.
 *
 * Every scene is lanceyan's layout: a serif text block at the top left
 * (the name in bold, the pager at the right of its row, short paragraphs,
 * his row of small underlined links) over a full-screen picture drawn as
 * overlapping diamonds, with a gradient darkening the left (the top on a
 * phone). The pictures are this site's, all painted into one dot field
 * (components/dotField) in the site's palette, swapped scene to scene:
 *
 *   01  the fir tree with sakura petals falling past it; lukebaffait's huge
 *       "Kevin He." across the bottom over his hairline footer
 *   02  the timeline by year, over drifting clouds; rows open to facts
 *   03  the five projects in place of lanceyan's books; the picture is the
 *       project you are on, and a rose brush stroke marks its row
 *   04  the night peak with birds (components/Ending.tsx), and how to
 *       reach me
 *
 * Between scenes the dots dissolve: they drop out in a ragged sweep, the
 * picture changes while the screen is empty, and they come back. The
 * dot field's canvas is screen-blended over the site's plum aurora, so its
 * black ground lets the aurora through and only the diamonds add light.
 *
 * Reduced motion: no dissolve, no sliding text, no video; each scene is
 * one still frame, drawn again only when something it shows arrives.
 */

const FPS = 30;
const OUT = 260;
const IN = 460;
const COUNT = 4;

const hashScene = (): number => {
  const n = parseInt(window.location.hash.replace("#", ""), 10);
  return n >= 1 && n <= COUNT ? n - 1 : 0;
};

/** Can the scroll box under `el` still scroll in direction `dy`? */
function boxTakes(el: EventTarget | null, dy: number): boolean {
  const box = el instanceof Element ? el.closest<HTMLElement>("[data-f01-scroll]") : null;
  if (!box || box.scrollHeight <= box.clientHeight + 1) return false;
  if (dy > 0) return box.scrollTop + box.clientHeight < box.scrollHeight - 1;
  return box.scrollTop > 0;
}

export default function F01(): JSX.Element {
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState(0);
  const pageRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef({ from: 0, to: 0, at: 0 });
  const kickRef = useRef<() => void>(() => {});
  const lockRef = useRef(0);

  /** Goes to scene `n`. `wrap` lets the pager go round from 04 to 01. */
  const go = useCallback((n: number, wrap = false) => {
    const next = wrap ? ((n % COUNT) + COUNT) % COUNT : Math.max(0, Math.min(COUNT - 1, n));
    if (next === pageRef.current) return;
    pageRef.current = next;
    setPage(next);
    lockRef.current = performance.now() + 800;
    window.history.replaceState(window.history.state, "", `#${next + 1}`);
    scrollRef.current?.scrollTo({ top: 0 });
    kickRef.current();
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

  // The scene in the address, read once on arrival and whenever it is
  // edited by hand or the back button changes it.
  useEffect(() => {
    const read = (): void => {
      const n = hashScene();
      pageRef.current = n;
      setPage(n);
      kickRef.current();
    };
    read();
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setReady(true);
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // Wheel, swipe and keys.
  useEffect(() => {
    let acc = 0;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent): void => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (boxTakes(e.target, dy)) return;
      const now = performance.now();
      // A trackpad's glide keeps sending events long after the flick; the
      // lock holds until they stop, so one flick is one scene.
      if (now < lockRef.current) {
        lockRef.current = Math.max(lockRef.current, now + 160);
        acc = 0;
        return;
      }
      if (now - lastWheel > 240) acc = 0;
      lastWheel = now;
      acc += dy;
      if (Math.abs(acc) > 40) {
        go(pageRef.current + Math.sign(acc));
        acc = 0;
      }
    };

    let y0 = 0;
    let x0 = 0;
    let top0 = 0;
    let box: HTMLElement | null = null;
    const onTouchStart = (e: TouchEvent): void => {
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      box = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-f01-scroll]") : null;
      top0 = box?.scrollTop ?? 0;
    };
    const onTouchEnd = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      const dy = y0 - t.clientY;
      const dx = x0 - t.clientX;
      if (Math.abs(dy) < 60 || Math.abs(dx) > Math.abs(dy)) return;
      // The words scrolled under the finger: that swipe was for them.
      if (box && Math.abs(box.scrollTop - top0) > 2) return;
      if (box && boxTakes(box, dy)) return;
      go(pageRef.current + Math.sign(dy));
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const box = scrollRef.current;
      const step: Record<string, number> = { ArrowDown: 1, PageDown: 1, ArrowRight: 1, ArrowUp: -1, PageUp: -1, ArrowLeft: -1 };
      if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(COUNT - 1);
      } else if (step[e.key]) {
        const d = step[e.key];
        // Up and down scroll the words first when they overflow.
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && box && boxTakes(box, d)) return;
        e.preventDefault();
        go(pageRef.current + d);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [go]);

  // The dot field: one canvas for all four scenes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
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
        ramp: [
          [0, "#2a0d1e"],
          [0.3, "#6a1d44"],
          [0.5, "#b8174f"],
          [0.72, "#f9b9dc"],
          [1, "#fffafc"],
        ],
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
    let running = false;
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
      const want = still || document.hidden ? [] : sceneVideos(media, shown);
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
          // Changed again on the way back in: go out from where it is.
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
      if (!running) return;
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

    const loaded = loadMedia(() => {
      if (still) once();
    });
    media = loaded.media;
    kickRef.current = still ? once : () => {};

    const onVisible = (): void => {
      running = !still && !document.hidden;
      play();
      if (running && !raf) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisible);
    const sized = new ResizeObserver(() => {
      dots.resize();
      draw(performance.now());
    });
    sized.observe(canvas);
    onVisible();
    draw(performance.now());

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      kickRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisible);
      sized.disconnect();
      loaded.dispose();
      dots.dispose();
    };
  }, []);

  const n = String(page + 1).padStart(2, "0");

  return (
    <main className={`relative h-[100svh] text-white ${serif.className}`}>
      <style>{`
        @keyframes f01-in { from { opacity: 0; transform: translateY(1.2rem); } to { opacity: 1; transform: none; } }
        @keyframes f01-rise { from { opacity: 0; transform: translateY(0.25em); } to { opacity: 1; transform: none; } }
        @keyframes f01-brush { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .f01-in { animation: f01-in 620ms cubic-bezier(0.2, 0.7, 0.1, 1) 220ms both; }
        .f01-rise { animation: f01-rise 1100ms cubic-bezier(0.2, 0.7, 0.1, 1) 260ms both; }
        .f01-brush { animation: f01-brush 700ms cubic-bezier(0.6, 0, 0.2, 1) both; }
        @media (prefers-reduced-motion: reduce) { .f01-in, .f01-rise, .f01-brush { animation: none; } }
      `}</style>

      {/* The diamonds, screen-blended so their black ground shows the
          aurora behind. No wrapper above it may make a stacking context,
          or the blend would have nothing to blend with. */}
      <canvas aria-hidden="true" className="fixed inset-0 block h-full w-full" ref={canvasRef} style={{ mixBlendMode: "screen" }} />

      {/* lukebaffait's glow, warmest on the first scene. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 transition-opacity duration-700 motion-reduce:transition-none"
        style={{
          background: "radial-gradient(55% 45% at 58% -6%, rgba(184,23,79,0.5), rgba(184,23,79,0.12) 55%, transparent 80%)",
          opacity: page === 0 ? 1 : 0.45,
        }}
      />
      {/* lanceyan's gradient: dark behind the words, the left on a wide
          screen, the top on a phone; and a little at the foot, under the
          footer. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.72),rgba(0,0,0,0.42)_45%,rgba(0,0,0,0)_75%)] lg:bg-[linear-gradient(90deg,rgba(0,0,0,0.7),rgba(0,0,0,0.3)_38%,rgba(0,0,0,0)_62%)]"
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 h-[30vh] bg-[linear-gradient(0deg,rgba(0,0,0,0.55),rgba(0,0,0,0))]" />

      <div className="fixed inset-0 z-10 flex flex-col transition-opacity duration-500" style={{ opacity: ready ? 1 : 0 }}>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(2.4rem,16px)] pb-[max(3.2rem,24px)] pt-[max(9.8rem,56px)] [scrollbar-width:none] lg:pl-[11.4rem] [&::-webkit-scrollbar]:hidden"
          data-f01-scroll=""
          data-lenis-prevent=""
          ref={scrollRef}
        >
          <div className="max-w-[64rem]">
            <div className="mb-[max(3.2rem,22px)] flex items-center justify-between gap-[1.6rem]">
              <h1 className="text-[max(3.6rem,28px)] font-bold leading-[1.15]">Kevin He</h1>
              <button
                aria-label={`Scene ${page + 1} of ${COUNT}. Next scene`}
                className={`-mr-[0.8rem] inline-flex min-h-[44px] items-center gap-[0.8rem] px-[0.8rem] text-[max(1.4rem,12px)] tracking-[0.06em] text-white/70 transition-colors hover:text-white ${FOCUS}`}
                onClick={() => go(page + 1, true)}
                type="button"
              >
                <span className="whitespace-nowrap tabular-nums">
                  {n} / 0{COUNT}
                </span>
                <Arrow className="h-[1.3em] w-[1.3em]" />
              </button>
            </div>

            <section
              aria-label={SCENES[page].label}
              className="f01-in text-[max(1.8rem,15px)] leading-[1.68] text-white/80"
              key={page}
            >
              {page === 0 && <Intro go={go} />}
              {page === 1 && <Timeline />}
              {page === 2 && <Work active={active} onActive={onProject} reduced={reduced} />}
              {page === 3 && <Contact />}
              <Links />
            </section>
          </div>
        </div>

        <p aria-live="polite" className="sr-only">
          {ready ? `Scene ${page + 1} of ${COUNT}: ${SCENES[page].label}` : ""}
        </p>
        {page === 0 && <Lockup />}
        <FooterBar go={go} page={page} />
      </div>
    </main>
  );
}
