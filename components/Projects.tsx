"use client";

import { type JSX, useEffect, useRef } from "react";

import { BAND, BLOSSOM } from "@/components/bandColours";
import { createStrokes } from "@/components/below/b27/strokes";
import { projects, skillGroups } from "@/components/profile";

/**
 * The work, one project a screen, then the skills.
 *
 * The screen holds still while you scroll through the five. On the left
 * the index: every title, the current one large and white, the rest small
 * and dim. On the right a brush stroke (design 20's brush) paints itself
 * in for the current project over its number, and the project's lines sit
 * under it. The first stroke starts painting while the section is still
 * coming up under the robot, so the page runs on into it.
 *
 * Titles with a digit or a hyphen are set in the sans: the display serif
 * is a DEMO cut and draws a watermark for those glyphs.
 */

const serifSafe = (t: string): boolean => !/[0-9\-‑'"&@!()/]/.test(t);
const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const N = projects.length;

export default function Projects(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-row]"));
    const details = Array.from(root.querySelectorAll<HTMLElement>("[data-detail]"));
    const numbers = Array.from(root.querySelectorAll<HTMLElement>("[data-number]"));
    const counter = root.querySelector<HTMLElement>("[data-counter]");
    // Every stroke goes in the same box, on the right half, round the number.
    const strokes = createStrokes(canvas, () => ({ x0: 0.5, y0: 0.12, x1: 0.95, y1: 0.8 }), BLOSSOM);

    let shown = -1;
    let raf = 0;
    let running = false;
    const frame = (): void => {
      raf = 0;
      const h = Math.max(1, window.innerHeight);
      // s: screens scrolled since the section's top reached the top of the screen.
      const s = reduced ? 0 : -root.getBoundingClientRect().top / h;
      const active = Math.max(0, Math.min(N - 1, Math.floor(s + 0.1)));
      if (active !== shown) {
        shown = active;
        rows.forEach((el, i) => el.toggleAttribute("data-on", i === active));
        details.forEach((el, i) => el.toggleAttribute("data-on", i === active));
        numbers.forEach((el, i) => el.toggleAttribute("data-on", i === active));
        if (counter) counter.textContent = `${String(active + 1).padStart(2, "0")} / ${String(N).padStart(2, "0")}`;
      }
      strokes?.render(
        // The first stroke paints in as the section comes up; each later
        // one as its screen arrives.
        (k) => (reduced ? (k === 0 ? 1 : 0) : k === 0 ? smooth((s + 0.7) / 0.9) : smooth((s - k + 0.25) / 0.6)),
        (k) => (reduced ? (k === 0 ? 0.9 : 0) : 0.9 * (1 - smooth((s - k - 0.7) / 0.3))),
      );
      if (running) raf = requestAnimationFrame(frame);
    };
    const seen = new IntersectionObserver(([e]) => {
      running = e.isIntersecting;
      if (running && !raf) raf = requestAnimationFrame(frame);
    });
    seen.observe(root);
    const onResize = (): void => strokes?.resize();
    window.addEventListener("resize", onResize);
    frame();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      seen.disconnect();
      window.removeEventListener("resize", onResize);
      strokes?.dispose();
    };
  }, []);

  return (
    <div style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <style>{`
        [data-row] { opacity: .32; transition: opacity .5s cubic-bezier(.22,1,.36,1); }
        [data-row] [data-title] { font-size: 3.4rem; transition: font-size .6s cubic-bezier(.22,1,.36,1), color .4s; }
        [data-row][data-on] { opacity: 1; }
        [data-row][data-on] [data-title] { font-size: 8.4rem; color: #fff; }
        [data-detail], [data-number] { opacity: 0; transform: translateY(1.6vh); transition: opacity .5s, transform .6s cubic-bezier(.22,1,.36,1); pointer-events: none; }
        [data-detail][data-on], [data-number][data-on] { opacity: 1; transform: none; pointer-events: auto; }
        @media (prefers-reduced-motion: reduce) { [data-row], [data-row] [data-title], [data-detail], [data-number] { transition: none; } }
      `}</style>

      <section className="relative" id="work" ref={rootRef} style={{ height: `${N * 100 + 40}vh` }}>
        <div className="sticky top-0 h-[100vh] w-full overflow-hidden">
          {/* The number behind the stroke, very large and faint. */}
          {projects.map((p, i) => (
            <p
              aria-hidden
              className="absolute right-[4vw] top-[8vh] font-sans text-[34vh] font-light leading-none tracking-[-0.06em] text-[#f9b9dc]/10"
              data-number
              key={p.title}
            >
              {String(i + 1).padStart(2, "0")}
            </p>
          ))}
          <canvas aria-hidden className="pointer-events-none absolute inset-0 block h-full w-full" ref={canvasRef} />

          <div className="absolute left-[6vw] top-[9vh] flex items-baseline gap-[3vw] font-mono text-[1.8rem] uppercase tracking-[0.22em]">
            <h2 className="opacity-60">Selected work</h2>
            <span className="tabular-nums opacity-60" data-counter>
              01 / 05
            </span>
          </div>

          {/* The index. */}
          <ol className="absolute left-[6vw] top-1/2 w-[44vw] -translate-y-1/2">
            {projects.map((p, i) => (
              <li className="py-[1.2vh]" data-row key={p.title}>
                <span className="mr-[1.6rem] align-top font-mono text-[1.6rem] tabular-nums tracking-[0.14em] opacity-70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3
                  className={
                    serifSafe(p.title)
                      ? "inline font-serif-display italic leading-[1.05] tracking-[-0.02em]"
                      : "inline font-sans font-light leading-[1.05] tracking-[-0.035em]"
                  }
                  data-title
                >
                  {p.title}
                </h3>
              </li>
            ))}
          </ol>

          {/* The current project's lines, under the stroke. */}
          {projects.map((p) => (
            <div className="absolute bottom-[9vh] left-[54vw] w-[38vw]" data-detail key={p.title}>
              <p className="font-mono text-[1.6rem] tabular-nums tracking-[0.14em] opacity-70">{p.year}</p>
              <p className="mt-[1.4rem] font-sans text-[2.6rem] font-light leading-[1.4] text-white">{p.tagline}</p>
              <p className="mt-[1.6rem] font-mono text-[1.5rem] uppercase leading-[1.7] tracking-[0.12em] opacity-75">{p.stack.join("  ·  ")}</p>
              {p.award ? <p className="mt-[0.4rem] font-mono text-[1.5rem] leading-[1.6] opacity-75">{p.award}</p> : null}
              {p.href ? (
                <a className="mt-[1.2rem] inline-block font-mono text-[1.5rem] underline underline-offset-[0.35em] hover:text-white" href={p.href} rel="noreferrer" target="_blank">
                  {p.href.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="px-[6vw] pb-[26vh] pt-[14vh]" id="skills">
        <h2 className="font-mono text-[1.8rem] uppercase tracking-[0.22em] opacity-60">Skills</h2>
        <div className="mt-[7vh] grid grid-cols-5 gap-x-[3vw]">
          {skillGroups.map((g) => (
            <div key={g.label}>
              <h3 className="font-sans text-[2.6rem] font-normal leading-[1.2] text-white">{g.label}</h3>
              <ul className="mt-[2rem] space-y-[0.6rem] font-mono text-[1.6rem] leading-[1.6] opacity-80">
                {g.skills.map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
