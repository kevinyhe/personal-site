"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups, type Project } from "@/components/profile";
import { EMAIL, elsewhere } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { LIGHT_FROM } from "./palette";
import { CONTACT_VH, SKILLS_VH, STOP_P, WORK_VH } from "./plan";
import { createFlight, type FlightView } from "./scene";

/**
 * Design 04, Flight. After atmos.leeroy.ca: scroll is distance along a
 * path through a sky, and what there is to read hangs in the air beside
 * it. The sky, the clouds, the dart and the words are this site's own.
 *
 * Three ways to be on the page:
 *  - "plain", the page as text on a gradient. What the server sends, and
 *    what stays if WebGL cannot start.
 *  - "still", for reduced motion: one frame of the sky, then the text.
 *  - "flight", the pinned scene.
 */
type Mode = "plain" | "still" | "flight";

const PLUM = BAND;
const PALE = "#fdeaf1";

const host = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** "2025, Finalist, Hack The North 2025" says the year twice. */
const meta = (p: Project): string => (p.award ? (p.award.includes(p.year) ? p.award : `${p.year} · ${p.award}`) : p.year);

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export default function B04(): JSX.Element {
  const [mode, setMode] = useState<Mode>("plain");
  /** False until the first effect has chosen. Only the server's copy waits to show. */
  const [chosen, setChosen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const stopRefs = useRef<(HTMLElement | null)[]>([]);
  const groupRefs = useRef<(HTMLElement | null)[]>([]);
  const skillRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    setMode(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "still" : "flight");
    setChosen(true);
  }, []);

  useEffect(() => {
    if (mode === "plain") return undefined;
    const root = rootRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!root || !stage || !canvas) return undefined;

    let rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let w = stage.clientWidth;
    let h = stage.clientHeight;
    const measure = (): void => {
      rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      w = stage.clientWidth;
      h = stage.clientHeight;
    };
    window.addEventListener("resize", measure);

    // What each label last showed, so a frame only writes what changed.
    const stopOn = projects.map(() => false);
    const groupOn = skillGroups.map(() => false);
    let veilAt = -1;
    const place = (el: HTMLElement, x: number, y: number, show: number, rise: number): void => {
      el.style.opacity = show.toFixed(3);
      el.style.transform = `translate3d(${((x * w) / rem).toFixed(2)}rem, ${((y * h) / rem + (1 - show) * rise).toFixed(2)}rem, 0)`;
    };
    const hide = (el: HTMLElement): void => {
      el.style.opacity = "0";
      el.style.visibility = "hidden";
    };

    const onFrame = (view: FlightView): void => {
      const veil = 1 - smooth(0.004, 0.04, view.p);
      if (Math.abs(veil - veilAt) > 0.002) {
        veilAt = veil;
        if (veilRef.current) veilRef.current.style.opacity = veil.toFixed(3);
        if (hintRef.current) hintRef.current.style.opacity = veil.toFixed(3);
      }
      for (let i = 0; i < projects.length; i += 1) {
        const el = stopRefs.current[i];
        if (!el) continue;
        const show = view.stops[i * 3 + 2];
        if (show <= 0.002) {
          if (stopOn[i]) hide(el);
          stopOn[i] = false;
          continue;
        }
        if (!stopOn[i]) el.style.visibility = "visible";
        stopOn[i] = true;
        place(el, view.stops[i * 3], view.stops[i * 3 + 1], show, 2);
      }
      let n = 0;
      for (let g = 0; g < skillGroups.length; g += 1) {
        const count = skillGroups[g].skills.length;
        const label = groupRefs.current[g];
        const show = view.groups[g * 3 + 2];
        if (show <= 0.002) {
          if (groupOn[g]) {
            if (label) hide(label);
            for (let k = n; k < n + count; k += 1) {
              const el = skillRefs.current[k];
              if (el) hide(el);
            }
          }
          groupOn[g] = false;
        } else {
          if (!groupOn[g]) {
            if (label) label.style.visibility = "visible";
            for (let k = n; k < n + count; k += 1) {
              const el = skillRefs.current[k];
              if (el) el.style.visibility = "visible";
            }
          }
          groupOn[g] = true;
          if (label) place(label, view.groups[g * 3], view.groups[g * 3 + 1], show, 0);
          for (let k = n; k < n + count; k += 1) {
            const el = skillRefs.current[k];
            if (el) place(el, view.skills[k * 2], view.skills[k * 2 + 1], show, 0);
          }
        }
        n += count;
      }
    };

    let flight: { dispose: () => void } | null = null;
    try {
      flight = createFlight(canvas, stage, {
        still: mode === "still",
        stillAt: 0.1,
        progress: () => {
          const r = root.getBoundingClientRect();
          return -r.top / Math.max(r.height - window.innerHeight, 1);
        },
        onFrame,
      });
    } catch {
      // No WebGL here. The text stands on its own.
      setMode("plain");
    }
    return () => {
      window.removeEventListener("resize", measure);
      flight?.dispose();
    };
  }, [mode]);

  if (mode !== "flight") {
    return (
      <div
        ref={rootRef}
        // The server's copy waits a moment before showing, so a browser
        // about to switch to the flight never flashes the text version.
        style={{ backgroundColor: BAND, animation: chosen ? undefined : "b04-late 0.4s 1.4s both" }}
      >
        <style>{"@keyframes b04-late { from { opacity: 0 } to { opacity: 1 } }"}</style>
        {mode === "still" && (
          <div aria-hidden="true" className="relative h-screen w-full overflow-hidden" ref={stageRef}>
            <canvas className="block h-full w-full" ref={canvasRef} />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[45vh]" style={{ background: `linear-gradient(${BAND}, transparent)` }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30vh]" style={{ background: `linear-gradient(transparent, ${BAND})` }} />
          </div>
        )}
        <section className="px-[8vw] pb-[14vh] pt-[16vh] text-white" id="work" style={{ background: `linear-gradient(${BAND}, #3a122d 60%, #5c1d4a)` }}>
          <h2 className="font-mono text-[1.5rem] uppercase tracking-[0.18em]" style={{ color: BLOSSOM }}>
            Work
          </h2>
          <div className="mt-[8vh] flex flex-col gap-[10vh]">
            {projects.map((p) => (
              <article className="grid grid-cols-1 gap-x-[4vw] gap-y-[2rem] md:grid-cols-[1fr_1fr]" key={p.title}>
                <h3 className="font-sans text-[6.4rem] font-bold leading-[0.98] tracking-[-0.035em]">{p.title}</h3>
                <div className="max-w-[62rem]">
                  <p className="font-mono text-[1.5rem] uppercase tracking-[0.14em]" style={{ color: BLOSSOM }}>
                    {meta(p)}
                  </p>
                  <p className="mt-[1.6rem] font-sans text-[2.6rem] font-light leading-[1.25]">{p.tagline}</p>
                  <p className="mt-[1.6rem] font-mono text-[1.5rem] leading-[1.6]" style={{ color: BLOSSOM }}>
                    {p.stack.join(" · ")}
                  </p>
                  {p.href && (
                    <a className="mt-[1.6rem] inline-block font-mono text-[1.5rem] underline underline-offset-[0.4em]" href={p.href} rel="noreferrer" target="_blank">
                      {host(p.href)}
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <div aria-hidden="true" className="h-[40vh]" style={{ background: `linear-gradient(#5c1d4a, #b04a84 45%, ${BLOSSOM})` }} />
        <section className="px-[8vw] pb-[14vh] pt-[8vh]" id="skills" style={{ background: `linear-gradient(${BLOSSOM}, #fbd0e6)`, color: PLUM }}>
          <h2 className="font-mono text-[1.5rem] uppercase tracking-[0.18em]">Skills</h2>
          <div className="mt-[8vh] grid grid-cols-1 gap-x-[4vw] gap-y-[8vh] md:grid-cols-2">
            {skillGroups.map((g) => (
              <div key={g.label}>
                <h3 className="font-sans text-[3.2rem] font-medium leading-[1.1] tracking-[-0.02em]">{g.label}</h3>
                <ul className="mt-[2.4rem] flex flex-wrap gap-x-[2.8rem] gap-y-[1.6rem] font-mono text-[1.5rem]">
                  {g.skills.map((s) => (
                    <li className="flex items-center gap-[0.9rem]" key={s.name}>
                      <SkillMark onDark={false} size="2rem" skill={s} tinted={false} />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
        <section className="flex min-h-screen flex-col justify-end px-[8vw] pb-[14vh] pt-[16vh]" id="contact" style={{ background: `linear-gradient(#fbd0e6, ${PALE} 40%)`, color: PLUM }}>
          <Contact />
        </section>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef} style={{ backgroundColor: BAND }}>
      <div aria-hidden="true" className="sticky top-0 h-screen w-full overflow-hidden" ref={stageRef} style={{ backgroundColor: BAND }}>
        <canvas className="block h-full w-full" ref={canvasRef} />
        {/* The band above is plum to its last row. So is the top of this, until the flight is under way. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[45vh]" ref={veilRef} style={{ background: `linear-gradient(${BAND}, ${BAND} 12%, transparent)` }} />
        <p className="pointer-events-none absolute inset-x-0 bottom-[7vh] text-center font-mono text-[1.5rem] uppercase tracking-[0.2em]" ref={hintRef} style={{ color: BLOSSOM }}>
          Scroll to fly
        </p>
      </div>

      <section className="relative" id="work" style={{ height: `${WORK_VH}vh`, marginTop: "calc(var(--arbor-screen-h) * -1)" }}>
        <div className="pointer-events-none sticky top-0 h-screen w-full overflow-hidden">
          <h2 className="sr-only">Work</h2>
          {projects.map((p, i) => {
            const light = STOP_P[i] > LIGHT_FROM;
            return (
              <article
                className="absolute left-0 top-0 w-[66rem] pt-[1.2rem] opacity-0 will-change-transform"
                key={p.title}
                ref={(el) => {
                  stopRefs.current[i] = el;
                }}
                style={{ color: light ? PLUM : "#fff", visibility: "hidden" }}
              >
                {/* The title itself is drawn in the scene, where this text hangs from. */}
                <h3 className="sr-only">{p.title}</h3>
                <p className="font-mono text-[1.5rem] uppercase tracking-[0.14em]" style={{ color: light ? PLUM : BLOSSOM }}>
                  {meta(p)}
                </p>
                <p className="mt-[1.6rem] font-sans text-[3rem] leading-[1.22]" style={{ fontWeight: light ? 400 : 300 }}>
                  {p.tagline}
                </p>
                <p className="mt-[1.6rem] font-mono text-[1.5rem] leading-[1.6]" style={{ color: light ? PLUM : BLOSSOM }}>
                  {p.stack.join(" · ")}
                </p>
                {p.href && (
                  <a className="pointer-events-auto mt-[1.6rem] inline-block font-mono text-[1.5rem] underline underline-offset-[0.4em]" href={p.href} rel="noreferrer" target="_blank">
                    {host(p.href)}
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="relative" id="skills" style={{ height: `${SKILLS_VH}vh`, color: PLUM }}>
        <div className="pointer-events-none sticky top-0 h-screen w-full overflow-hidden">
          <h2 className="sr-only">Skills</h2>
          {skillGroups.map((g, gi) => {
            const before = skillGroups.slice(0, gi).reduce((n, x) => n + x.skills.length, 0);
            return (
              <div key={g.label}>
                <h3
                  className="absolute left-0 top-0 whitespace-nowrap font-sans text-[4.4rem] font-medium leading-none tracking-[-0.02em] opacity-0 will-change-transform"
                  ref={(el) => {
                    groupRefs.current[gi] = el;
                  }}
                  style={{ visibility: "hidden" }}
                >
                  <span className="block -translate-y-full">{g.label}</span>
                </h3>
                <ul>
                  {g.skills.map((s, k) => (
                    <li
                      className="absolute left-0 top-0 opacity-0 will-change-transform"
                      key={s.name}
                      ref={(el) => {
                        skillRefs.current[before + k] = el;
                      }}
                      style={{ visibility: "hidden" }}
                    >
                      <span className="block -translate-x-1/2 whitespace-nowrap font-mono text-[1.5rem] leading-none">{s.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative flex flex-col justify-end px-[6vw] pb-[12vh]" id="contact" style={{ height: `${CONTACT_VH}vh`, color: PLUM }}>
        <Contact />
      </section>
    </div>
  );
}

/** The email, large, and the links in mono. The same in every mode. */
function Contact(): JSX.Element {
  return (
    <>
      <h2 className="font-mono text-[1.5rem] uppercase tracking-[0.18em]">Contact</h2>
      <a className="mt-[2.4rem] block w-fit font-sans text-[min(7.2vw,13rem)] font-medium leading-[1] tracking-[-0.04em]" href={`mailto:${EMAIL}`}>
        {EMAIL}
      </a>
      <ul className="mt-[4.8rem] flex flex-wrap gap-x-[4.8rem] gap-y-[1.6rem] font-mono text-[1.6rem]">
        {elsewhere.map((l) => (
          <li key={l.label}>
            <a className="underline-offset-[0.4em] hover:underline" href={l.href} rel="noreferrer" target="_blank">
              <span className="uppercase tracking-[0.14em] opacity-60">{l.label}</span> {l.handle}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
