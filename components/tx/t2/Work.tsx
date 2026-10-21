"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { INK, Serif } from "@/components/luke/theme";
import { resultOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";

gsap.registerPlugin(ScrollTrigger);

/**
 * Copy of components/luke/WorkIndex.tsx for /t/2. The koi are not drawn
 * here: they live in the Scene's screen layer, where the flower's petals
 * gather into them.
 *
 * The work section. Nothing is held: the page scrolls straight through it.
 *
 * At the top, its header, "Work", large in the band's italic display serif.
 * Then the project names down the right half, one under another, also in
 * the serif. Each is full pink and full size as it passes the middle of
 * the screen and dims and shrinks a little away from it (lukebaffait's
 * active row, done by position rather than by holding the screen), with
 * its one result under it.
 *
 * Behind the names, two big koi swim down the left (koi.ts), in the same
 * pink bars as the band's flower. Their layer is a full-screen canvas that
 * stays put while the section goes by; they move only with the scroll.
 *
 * It follows the statement band. Its first screen comes up through the
 * hole in the band's wall of bars (StatementSection), and it is set in the
 * band's scheme: "Work" on the sentence's column at one and a half times
 * the sentence's size, at the same leading, a quarter of the way down so it
 * lands where the sentence stood. Under it all, a faint still horizon of
 * the wall's own bars.
 *
 * Every project name opens its link in a new tab (Saturn has none).
 *
 * Reduced motion: the names are all full size; the koi still go with the
 * scroll, since that is the scroll itself.
 */

function RowLink({ p, className, children }: { p: Project; className: string; children: ReactNode }): JSX.Element {
  if (!p.href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const horizonRef = useRef<HTMLCanvasElement | null>(null);

  // The horizon, drawn once per size: one bar per wall cell (8px wide, 6
  // on a phone, as StatementSection's wall), rising from the bottom to a
  // ragged line about a third of the way up, widest at the foot and fading
  // upward. 5% pink at most, so it is a texture under the names, never a
  // shape that competes with them.
  useEffect(() => {
    const canvas = horizonRef.current;
    if (!canvas) return undefined;
    const draw = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cell = w < 1024 ? 6 : 8;
      const fade = g.createLinearGradient(0, h * 0.6, 0, h);
      fade.addColorStop(0, "rgba(249,185,220,0)");
      fade.addColorStop(1, "rgba(249,185,220,0.05)");
      g.fillStyle = fade;
      for (let x = 0, i = 0; x < w; x += cell, i += 1) {
        const n = 0.5 + 0.3 * Math.sin(i * 0.071 + 1.3) + 0.2 * Math.sin(i * 0.23 + 0.4);
        const top = h * (0.66 + 0.08 * n);
        const bw = 1 + 2.4 * Math.abs(Math.sin(i * 1.7) * Math.sin(i * 0.37));
        g.fillRect(x + (cell - bw) / 2, top, bw, h - top);
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  // Each name by its distance from the middle of the screen: full there,
  // dimmer and a little smaller away from it. One scroll listener, one
  // frame per scroll.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0;
    const paint = (): void => {
      raf = 0;
      const mid = window.innerHeight / 2;
      for (const row of rowRefs.current) {
        if (!row) continue;
        const r = row.getBoundingClientRect();
        const d = Math.min(1, Math.abs(r.top + r.height / 2 - mid) / (window.innerHeight * 0.38));
        row.style.opacity = String(1 - 0.72 * d);
        row.style.transform = `translateX(${(d * d * 2.2).toFixed(2)}vw) scale(${(1 - 0.12 * d).toFixed(3)})`;
      }
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      aria-labelledby="work-title"
      className="relative"
      id="work"
      ref={sectionRef}
      style={{ color: INK }}
    >
      {/* The ground the wall opened onto: a still horizon of the wall's own
          upright bars, faint, low on the screen, held while the section
          goes by. Behind the koi and the names. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas className="sticky top-0 block h-screen w-full" ref={horizonRef} />
      </div>
      <div className="relative px-[6vw] pb-[40vh] pt-[24vh] lg:pl-[50vw] lg:pr-[8vw]">
        <h2 className="pb-[0.1em] pr-[0.1em] text-[18vw] leading-[1.02] tracking-[-0.03em] lg:text-[min(24vh,9.3vw)]" id="work-title">
          <Serif text="Work" />
        </h2>
        <ol className="mt-[14vh] flex flex-col gap-[16vh]">
          {projects.map((p, i) => (
            <li
              className="origin-left will-change-transform"
              key={p.title}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
            >
              <RowLink
                className="block w-fit rounded-sm pb-[0.1em] pr-[0.12em] text-[clamp(34px,9.5vw,60px)] leading-[1.1] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:text-[clamp(40px,4.6vw,170px)]"
                p={p}
              >
                <Serif text={p.title} />
              </RowLink>
              <p className="mt-[max(0.6rem,6px)] font-sans text-[clamp(12px,0.85vw,28px)] opacity-60">{resultOf(p) ?? p.year}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
