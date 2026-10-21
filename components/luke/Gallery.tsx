"use client";

import { type JSX, useEffect, useRef } from "react";

import BarPicture from "@/components/below/barPicture";
import { BLOSSOM, Count, Em, GROUND, INK, Rail } from "@/components/luke/theme";
import { PHONE_TILES, TILES, type Tile } from "@/components/luke/gallery-tiles";
import { useMedia } from "@/components/luke/work-data";

/**
 * The gallery, after lukebaffait.fr's: project pictures of different sizes
 * hang in 3D space around one sentence in the middle of the screen. The
 * screen holds still (sticky) while the page scrolls, and the pictures
 * drift toward the viewer: far ones come up out of the dark, near ones
 * slide out past the edges. The sentence fades in word by word as the
 * scroll goes on.
 *
 * The pictures are the four in public/work, drawn as bar pictures; the
 * same picture at another width-to-height ratio is another crop of it. One
 * scroll listener asks for one animation frame; that frame sets each
 * tile's transform and opacity and each word's reveal, nothing else.
 *
 * On a phone there are six tiles instead of ten. With reduced motion the
 * section is one still screen: tiles at rest, the sentence whole.
 */

/** The sentence, a word at a time. `em` words are set in the italic serif. */
const WORDS: { t: string; em?: boolean }[] = [
  { t: "From" },
  { t: "a" },
  { t: "Discord" },
  { t: "bot" },
  { t: "to" },
  { t: "a" },
  { t: "company", em: true },
];

/** Perspective, px. */
const EYE = 1000;
/** How far (px) every tile travels toward the viewer over the section. */
const TRAVEL = 4200;
/** Section height while scrolling, in vh. */
const HEIGHT_VH = 320;
/** Share of the section's scroll at which the words start and finish. */
const WORDS_FROM = 0.28;
const WORDS_TO = 0.56;
/** Where everything rests under reduced motion. */
const STILL_AT = 0.42;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function tileStyle(t: Tile, p: number): { transform: string; opacity: string } {
  const z = t.z0 + p * TRAVEL;
  // Come up out of the dark far away; fade before getting too close.
  const near = 1 - clamp01((z - 250) / 350);
  const far = clamp01((z + 4400) / 800);
  const turn = -t.x * 0.45;
  return {
    transform: `translate3d(calc(${t.x}vw - 50%), calc(${t.y}vh - 50%), ${z.toFixed(1)}px) rotateY(${turn.toFixed(2)}deg)`,
    opacity: (near * far).toFixed(3),
  };
}

export default function Gallery(): JSX.Element {
  const phone = useMedia("(max-width: 767px)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const tiles = phone ? PHONE_TILES : TILES;

  const sectionRef = useRef<HTMLElement | null>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;

    const apply = (p: number, words: number): void => {
      tiles.forEach((t, i) => {
        const el = tileRefs.current[i];
        if (!el) return;
        const s = tileStyle(t, p);
        el.style.transform = s.transform;
        el.style.opacity = s.opacity;
      });
      // Each word takes a little over its share and overlaps the next.
      const n = WORDS.length;
      wordRefs.current.forEach((el, i) => {
        if (!el) return;
        const k = clamp01(words * (n + 1.5) - i);
        const e = k * k * (3 - 2 * k);
        el.style.opacity = (0.08 + 0.92 * e).toFixed(3);
        el.style.filter = e >= 1 ? "none" : `blur(${((1 - e) * 10).toFixed(2)}px)`;
        el.style.transform = `translate3d(0, ${((1 - e) * 0.18).toFixed(3)}em, 0)`;
      });
    };

    if (still) {
      apply(STILL_AT, 1);
      return undefined;
    }

    let frame = 0;
    const tick = (): void => {
      frame = 0;
      const r = section.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < -vh || r.top > 2 * vh) return;
      // 0 when the section's top meets the bottom of the screen, 1 when its
      // bottom leaves the top, so the tiles are already drifting on entry.
      const p = clamp01((vh - r.top) / (r.height + vh));
      apply(p, clamp01((p - WORDS_FROM) / (WORDS_TO - WORDS_FROM)));
    };
    const ask = (): void => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tiles, still]);

  return (
    <section aria-label="Gallery" className="relative" ref={sectionRef} style={{ backgroundColor: GROUND, color: INK, height: still ? "100vh" : `${HEIGHT_VH}vh` }}>
      <div className="sticky top-0 h-screen overflow-clip">
        {/* The pictures, in depth. */}
        <div aria-hidden="true" className="absolute inset-0" style={{ perspective: `${EYE}px`, perspectiveOrigin: "50% 50%" }}>
          <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
            {tiles.map((t, i) => {
              const s = tileStyle(t, still ? STILL_AT : 0);
              return (
                <div
                  className="absolute left-1/2 top-1/2 overflow-hidden rounded-[max(0.6rem,5px)] bg-white/[0.035] will-change-transform"
                  key={`${t.src}-${i}`}
                  ref={(el) => {
                    tileRefs.current[i] = el;
                  }}
                  style={{ width: `${t.w}vw`, aspectRatio: String(t.ratio), transform: s.transform, opacity: s.opacity }}
                >
                  <BarPicture cell={4} ink={BLOSSOM} source={t.src} />
                </div>
              );
            })}
          </div>
        </div>

        {/* A dark well behind the sentence so a tile passing under it
            never takes the type with it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[46vh] w-[70vw] -translate-x-1/2 -translate-y-1/2"
          style={{ background: `radial-gradient(closest-side, ${GROUND}d9, ${GROUND}00)` }}
        />

        <p className="absolute left-1/2 top-1/2 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(32px,3.6vw,120px)] leading-[1.14] tracking-[-0.03em] md:w-[46vw] md:max-w-none">
          {WORDS.map((w, i) => (
            <span key={`${w.t}-${i}`}>
              <span
                className="inline-block"
                ref={(el) => {
                  wordRefs.current[i] = el;
                }}
                style={still ? undefined : { opacity: 0.08 }}
              >
                {w.em ? <Em>{w.t}</Em> : w.t}
                {i === WORDS.length - 1 ? "." : null}
              </span>
              {i < WORDS.length - 1 ? " " : null}
            </span>
          ))}
        </p>

        <Count className="absolute left-[max(3.2rem,16px)] top-1/2 hidden -translate-y-1/2 sm:block" n={tiles.length} />
        <Rail label="Gallery" />
      </div>
    </section>
  );
}
