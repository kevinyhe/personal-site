"use client";

import { type JSX, useEffect, useRef } from "react";

import { BAND, BLOSSOM } from "@/components/bandColours";
import { createBrushColumn } from "@/components/brushColumn";
import { projects, skillGroups } from "@/components/profile";

/**
 * The work and the skills, set plainly on the band's plum, with brush
 * strokes painting down the right of the page as you scroll
 * (brushColumn). The words sit on the left and are the page; the
 * strokes are the movement.
 *
 * Titles with a digit or a hyphen are set in the sans: the display serif
 * is a DEMO cut and draws a watermark for those glyphs.
 */

const serifSafe = (t: string): boolean => !/[0-9\-‑'"&@!()/]/.test(t);

export default function BrushWork(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const col = createBrushColumn(canvas, 18, BLOSSOM);
    if (!col) return undefined;
    let raf = 0;
    let running = false;
    const frame = (): void => {
      raf = 0;
      const h = Math.max(1, window.innerHeight);
      const top = root.getBoundingClientRect().top;
      // Screens scrolled past the top of the section; a little ahead so
      // the first stroke is already painting as the section arrives.
      const screens = -top / h + 0.35;
      // Fade the strokes in as the section comes on and out at its end.
      const end = (root.offsetHeight - h) / h;
      const strength = Math.min(1, Math.max(0, (screens + 0.2) / 0.6)) * Math.min(1, Math.max(0, (end + 0.35 - screens) / 0.6));
      col.render(reduced ? 1 : screens, strength);
      if (running) raf = requestAnimationFrame(frame);
    };
    const seen = new IntersectionObserver(([e]) => {
      running = e.isIntersecting;
      if (running && !raf) raf = requestAnimationFrame(frame);
    });
    seen.observe(root);
    const onResize = (): void => col.resize();
    window.addEventListener("resize", onResize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      seen.disconnect();
      window.removeEventListener("resize", onResize);
      col.dispose();
    };
  }, []);

  return (
    <div className="relative" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <div className="pointer-events-none sticky top-0 h-[100vh] w-full" aria-hidden>
        <canvas className="absolute inset-0 block h-full w-full" ref={canvasRef} />
      </div>

      <div className="relative -mt-[100vh] px-[6vw] pb-[24vh] pt-[22vh]">
        <section id="work">
          <h2 className="font-mono text-[1.8rem] uppercase tracking-[0.22em] opacity-60">Work</h2>
          <ol className="mt-[8vh] grid gap-[16vh]">
            {projects.map((p, i) => (
              <li className="max-w-[52vw]" key={p.title}>
                <p className="font-mono text-[1.7rem] tabular-nums tracking-[0.14em] opacity-60">
                  {String(i + 1).padStart(2, "0")}
                  <span className="ml-[2rem]">{p.year}</span>
                </p>
                <h3
                  className={
                    serifSafe(p.title)
                      ? "mt-[1.6rem] font-serif-display text-[9rem] italic leading-[1] tracking-[-0.02em] text-white"
                      : "mt-[1.6rem] font-sans text-[8rem] font-light leading-[1.02] tracking-[-0.035em] text-white"
                  }
                >
                  {p.title}
                </h3>
                <p className="mt-[2.4rem] max-w-[56rem] font-sans text-[2.6rem] font-light leading-[1.45]">{p.tagline}</p>
                <p className="mt-[2rem] font-mono text-[1.6rem] uppercase leading-[1.7] tracking-[0.12em] opacity-75">{p.stack.join("  ·  ")}</p>
                {p.award ? <p className="mt-[0.6rem] font-mono text-[1.6rem] leading-[1.6] opacity-75">{p.award}</p> : null}
                {p.href ? (
                  <a className="mt-[1.4rem] inline-block font-mono text-[1.6rem] underline underline-offset-[0.35em] hover:text-white" href={p.href} rel="noreferrer" target="_blank">
                    {p.href.replace(/^https?:\/\//, "")}
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-[26vh]" id="skills">
          <h2 className="font-mono text-[1.8rem] uppercase tracking-[0.22em] opacity-60">Skills</h2>
          <div className="mt-[6vh] grid max-w-[56vw] grid-cols-2 gap-x-[5vw] gap-y-[6vh]">
            {skillGroups.map((g) => (
              <div key={g.label}>
                <h3 className="font-sans text-[2.8rem] font-normal text-white">{g.label}</h3>
                <p className="mt-[1.2rem] font-mono text-[1.7rem] leading-[1.8] opacity-80">{g.skills.map((s) => s.name).join("  ·  ")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
