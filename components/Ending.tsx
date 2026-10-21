"use client";

import { type JSX, type MouseEvent, useEffect, useRef } from "react";

import { AURORA_RAMP } from "@/components/bandColours";
import { createDotField, type DotField } from "@/components/dotField";
import { ACCENT, GROUND, INK } from "@/components/luke/theme";
import { scrollToSection } from "@/components/SectionLink";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { useTvUp } from "@/components/tvUp";

/**
 * The end of the page, laid out like the last page of lukebaffait.fr.
 *
 * Behind everything is the dotted mountain from before: a night sky with
 * stars wheeling, a glow low on the right, one dark peak with light caught
 * on it, and sondaven's birds crossing now and then. It is painted each
 * frame at one pixel per cell and redrawn as overlapping diamonds by
 * dotField (280 cells across, 180 on a phone), read through the aurora's
 * colours (AURORA_RAMP). It is drawn at 0.6 brightness so the type reads
 * over it, the way his Michelangelo hands sit faint behind his.
 *
 * On top, his layout:
 * - Across the top, three columns of small uppercase sans. Left: the email
 *   and the year. Middle (starting at the centre of the page): GitHub,
 *   LinkedIn, X. Right: Work, Info, Contact, which scroll the page. On a
 *   phone the email takes the first row and the two link lists share the
 *   second. Each link's letters roll up to a copy of themselves on hover.
 * - Across the bottom, the name: "Kevin" in the sans, "He" in the italic
 *   display serif from the centre of the page, and a rose full stop. The
 *   words rise up out of their own bottom edge when the section comes into
 *   view. Under prefers-reduced-motion they are simply there, and the
 *   mountain is one still frame.
 *
 * The section is a little taller than one screen, and the screen stays
 * pinned for that last bit, so the page ends on it with nothing after.
 */

const ASSETS = "/sonda";
const FPS = 30;

/** Seeded random, so the stars and the peak are the same every visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The peak's outline, as heights (share of the frame from the top) at
 *  evenly spaced x across the frame: one summit a little right of middle,
 *  a long ridge to the left, a lower shoulder to the right, craggy all
 *  along. Measured off lanceyan's frame and roughened. */
function ridge(n: number, rand: () => number): Float32Array {
  const keys: [number, number][] = [
    [0, 0.93], [0.08, 0.91], [0.2, 0.87], [0.3, 0.8], [0.38, 0.76], [0.43, 0.7],
    [0.48, 0.68], [0.52, 0.645], [0.55, 0.66], [0.6, 0.73], [0.63, 0.82],
    [0.67, 0.85], [0.74, 0.84], [0.8, 0.9], [0.84, 1.02], [1, 1.1],
  ];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i / (n - 1);
    let k = 0;
    while (k < keys.length - 2 && x > keys[k + 1][0]) k += 1;
    const [x0, y0] = keys[k];
    const [x1, y1] = keys[k + 1];
    const t = (x - x0) / Math.max(1e-3, x1 - x0);
    out[i] = y0 + (y1 - y0) * t + (rand() - 0.5) * 0.012;
  }
  return out;
}

/**
 * A label whose letters roll up on hover, his way: each letter sits in a
 * box one line tall holding the letter twice, one above the other, and on
 * hover (or keyboard focus) the pair slides up a line, each letter a
 * little after the one before. Nothing moves under reduced motion. The
 * letters are hidden from screen readers; the link carries the label.
 */
function Roll({ text }: { text: string }): JSX.Element {
  return (
    <span aria-hidden="true" className="inline-flex">
      {Array.from(text).map((c, i) => {
        const ch = c === " " ? " " : c;
        return (
          <span className="inline-block h-[1.2em] overflow-hidden leading-[1.2]" key={i}>
            <span
              className="block transition-transform duration-[450ms] ease-[cubic-bezier(0.7,0,0.2,1)] group-hover:-translate-y-1/2 group-focus-visible:-translate-y-1/2 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-focus-visible:translate-y-0"
              style={{ transitionDelay: `${i * 18}ms` }}
            >
              <span className="block">{ch}</span>
              <span className="block">{ch}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

const LINK = "group inline-flex min-h-[2.4em] items-center outline-none focus-visible:underline sm:min-h-0";

/** GitHub, LinkedIn, X, in that order (his GITHUB / LINKEDIN / BEHANCE). */
const SOCIALS = (["GitHub", "LinkedIn", "X"] as const)
  .map((label) => elsewhere.find((l) => l.label === label))
  .filter((l): l is (typeof elsewhere)[number] => Boolean(l));

/** Where WORK / INFO / CONTACT go. CONTACT goes to the contact panel when
 *  the page has one, otherwise to the top of this section. */
const PAGES = [
  { id: "work", label: "Work" },
  { id: "info", label: "Info" },
  { id: "contact", label: "Contact" },
] as const;

/** Each word of the name in its own box. No clip: a clipping box cut the
 *  italic's overhang, so the word fades up into place instead. */
const WORD_BOX = "inline-block pb-[0.1em] pr-[0.14em] pl-[0.06em] -ml-[0.06em] -mb-[0.1em]";
/** The rise: a little low and see-through while the section is "armed",
 *  in place when it is "in". Only ever armed when motion is allowed. */
const WORD_RISE =
  "inline-block transition-[transform,opacity,filter] duration-[1300ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[rise=armed]/end:translate-y-[18%] group-data-[rise=armed]/end:opacity-0 group-data-[rise=armed]/end:blur-[8px]";

export default function Ending(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const tvUp = useTvUp();
  // Waits for the hero (tvUp.ts) so it does not slow the TV loading.
  useEffect(() => {
    if (!tvUp) return undefined;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.innerWidth < 1024;

    // The name rises when most of the section is on screen, and parks again
    // only once the section has gone back off the bottom of the screen, so
    // scrolling about inside it does not replay the rise.
    const rise = new IntersectionObserver(
      ([e]) => {
        if (reduced) return;
        if (e.intersectionRatio >= 0.4) root.dataset.rise = "in";
        else if (!e.isIntersecting && e.boundingClientRect.top > 0) root.dataset.rise = "armed";
      },
      { threshold: [0, 0.4] },
    );
    rise.observe(root);

    let field: DotField | null = null;
    try {
      field = createDotField(canvas, {
        cols: phone ? 180 : 280,
        threshold: 0.13,
        // Dimmer than before so the type reads over it.
        brightness: 0.6,
        size: 0.85,
        hue: 0,
        // The same ground as the sections above, so there is no edge.
        ground: GROUND,
        ramp: AURORA_RAMP,
      });
    } catch {
      field = null;
    }
    if (!field) {
      return () => rise.disconnect();
    }
    const dots = field;

    const birds = document.createElement("video");
    birds.src = `${ASSETS}/birds_04.mp4`;
    birds.muted = true;
    birds.loop = true;
    birds.playsInline = true;
    birds.preload = "auto";

    const rand = seeded(20261002);
    const stars = Array.from({ length: 120 }, () => ({ x: rand(), y: rand() * 0.8, a: 0.35 + rand() * 0.65, f: 0.4 + rand() * 1.8 }));
    const peak = ridge(256, rand);
    // Light caught on the rock: scattered points under the ridge line.
    // Most of them near the ridge, thinning out lower down, as on lanceyan's.
    const glints = Array.from({ length: 900 }, () => ({ x: rand() * 0.84, d: Math.pow(rand(), 1.8) * 0.3, a: 0.3 + rand() * 0.7 }));

    const paint = (t: number) => (x: CanvasRenderingContext2D, W: number, H: number) => {
      // The sky: black at the top left, the light coming up from the lower
      // right in a broad band, brightest at the horizon behind the shoulder.
      const breathe = reduced ? 0 : 0.04 * Math.sin(t * 0.25);
      const band = x.createLinearGradient(0, 0, W, H);
      band.addColorStop(0, "rgba(0,0,0,1)");
      band.addColorStop(0.42, "rgba(40,40,40,1)");
      band.addColorStop(0.75, `rgba(${Math.round(150 + 60 * breathe)},150,150,1)`);
      band.addColorStop(1, "rgba(235,235,235,1)");
      x.fillStyle = band;
      x.fillRect(0, 0, W, H);
      const glow = x.createRadialGradient(W * 0.98, H * 0.86, 0, W * 0.98, H * 0.86, W * (0.55 + breathe));
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.35, "rgba(200,200,200,0.55)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = glow;
      x.fillRect(0, 0, W, H);
      // The top left stays dark, behind the email.
      const shade = x.createRadialGradient(0, 0, 0, 0, 0, W * 0.55);
      shade.addColorStop(0, "rgba(0,0,0,0.9)");
      shade.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = shade;
      x.fillRect(0, 0, W, H);

      // Stars, wheeling slowly up and to the right, as in a timelapse.
      const drift = reduced ? 0 : t * 0.004;
      for (const s of stars) {
        const sx = (s.x + drift) % 1;
        const sy = (s.y - drift * 0.5 + 1) % 1;
        const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * s.f + s.x * 40);
        const v = Math.round(255 * s.a * tw);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.floor(sx * W), Math.floor(sy * H), 1, 1);
      }

      // Birds cross now and then: one pass every 22 seconds, low over the
      // peak from left to right.
      if (birds.readyState >= 2) {
        const cyc = (t % 22) / 22;
        if (cyc < 0.5) {
          const bw = W * 0.12;
          x.globalCompositeOperation = "screen";
          x.drawImage(birds, -bw + (W + bw) * (cyc / 0.5), H * 0.36, bw, bw);
          x.globalCompositeOperation = "source-over";
        }
      }

      // The peak: black rock in front of everything, with a little light.
      x.fillStyle = "#000";
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i < peak.length; i += 1) x.lineTo((i / (peak.length - 1)) * W, peak[i] * H);
      x.lineTo(W, H);
      x.closePath();
      x.fill();
      for (const g of glints) {
        const i = Math.min(peak.length - 1, Math.round(g.x * (peak.length - 1)));
        const v = Math.round(150 * g.a * (reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.7 + g.x * 30)));
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.floor(g.x * W), Math.floor((peak[i] + 0.01 + g.d) * H), 1, 1);
      }
    };

    let raf = 0;
    let running = false;
    let last = -1;
    let start = performance.now();
    const draw = (now: number): void => {
      dots.render(paint(reduced ? 0 : (now - start) / 1000));
    };
    const tick = (now: number): void => {
      raf = 0;
      if (!running) return;
      // Redrawn at most 30 times a second, as lanceyan does.
      const f = Math.floor((now - start) / (1000 / FPS));
      if (f !== last) {
        last = f;
        draw(now);
      }
      raf = requestAnimationFrame(tick);
    };
    // Runs only while the section is on screen; under reduced motion it
    // draws one still frame instead.
    const seen = new IntersectionObserver(([e]) => {
      running = e.isIntersecting && !reduced;
      if (running) {
        void birds.play().catch(() => {});
        if (!raf) raf = requestAnimationFrame(tick);
      } else {
        birds.pause();
        if (reduced && e.isIntersecting) draw(0);
      }
    });
    seen.observe(root);
    const sized = new ResizeObserver(() => {
      dots.resize();
      draw(performance.now());
    });
    sized.observe(canvas);
    start = performance.now();
    draw(start);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      rise.disconnect();
      seen.disconnect();
      sized.disconnect();
      birds.pause();
      birds.removeAttribute("src");
      birds.load();
      dots.dispose();
    };
  }, [tvUp]);

  /** Scrolls to a section through Lenis when it is running. CONTACT falls
   *  back to this section when there is no contact panel. */
  const go = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById(id) ?? (id === "contact" ? rootRef.current : null);
    if (!target) return;
    event.preventDefault();
    scrollToSection(target, 1.6);
  };

  return (
    <section className="group/end relative h-[100vh]" id="end" ref={rootRef} style={{ backgroundColor: GROUND, color: INK }}>
      <div className="sticky top-0 h-[100vh] w-full overflow-hidden">
        <canvas
          aria-hidden="true"
          className="absolute inset-0 z-0 block h-full w-full"
          ref={canvasRef}
          // The diamonds thin out towards the top edge, so the section's
          // edge never shows against the one above.
          style={{ maskImage: "linear-gradient(transparent, #000 18vh)", WebkitMaskImage: "linear-gradient(transparent, #000 18vh)" }}
        />
        {/* Darkens the bottom a little so the name reads over the glow. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{ background: `linear-gradient(to top, ${GROUND}b3 0%, ${GROUND}40 30%, transparent 55%)` }}
        />

        <div className="relative z-10 flex h-full flex-col px-[max(3vw,20px)] pb-[max(1.5vw,16px,env(safe-area-inset-bottom))] pt-[max(2.5vw,20px)]">
          {/* The top row. Two halves, the right half split between the
              socials and the pages, so the socials start at the centre of
              the page like his. On a phone: the email on its own row, the
              two lists under it. */}
          <div className="grid grid-cols-2 gap-y-[2.4rem] font-sans text-[max(1.7rem,12px)] font-medium uppercase leading-[1.2] tracking-[0.01em]">
            <div className="col-span-2 flex flex-col sm:col-span-1">
              <a aria-label={EMAIL} className={`${LINK} normal-case`} href={`mailto:${EMAIL}`}>
                <Roll text={EMAIL} />
              </a>
              <p>{"©"} 2026</p>
            </div>
            <div className="contents sm:flex sm:justify-between">
              <ul className="flex flex-col">
                {SOCIALS.map((l) => (
                  <li key={l.label}>
                    <a aria-label={l.label} className={LINK} href={l.href} rel="noreferrer" target="_blank">
                      <Roll text={l.label.toUpperCase()} />
                    </a>
                  </li>
                ))}
              </ul>
              <ul className="flex flex-col justify-self-end">
                {PAGES.map((p) => (
                  <li key={p.id}>
                    <a aria-label={p.label} className={LINK} href={`#${p.id}`} onClick={go(p.id)}>
                      <Roll text={p.label.toUpperCase()} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex-1" />

          {/* The name, his "Luke Baffait." Two halves again: "Kevin" from the
              left edge, "He." from the centre. Sized so "Kevin" (about 2.3
              times its font size wide) fills most of its half, capped by
              the screen's height. The display serif is a DEMO cut: only
              letters and the full stop go in it. */}
          <h2
            aria-label="Kevin He."
            className="grid grid-cols-2 items-end text-[min(calc((100vw_-_40px)/5.2),40vh)] leading-[0.9] sm:text-[min(18vw,40vh)]"
          >
            <span aria-hidden="true" className={WORD_BOX}>
              <span className={`${WORD_RISE} font-sans font-light tracking-[-0.05em]`}>Kevin</span>
            </span>
            <span aria-hidden="true" className={`${WORD_BOX} justify-self-start`}>
              <span className={`${WORD_RISE} font-serif-display italic tracking-[-0.02em] delay-100`}>
                <span>He</span>
                <span style={{ color: ACCENT }}>.</span>
              </span>
            </span>
          </h2>
        </div>
      </div>
    </section>
  );
}
