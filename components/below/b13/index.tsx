"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import PetalReveal from "@/components/PetalReveal";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import {
  cameraPos,
  CONTACT_SCENE,
  corners,
  css,
  EMAIL_SIZE,
  faceFor,
  GAP_VW,
  GROUP,
  GUTTER_VW,
  HEAD_VH,
  INDEX_VW,
  META_VW,
  NAMES_VW,
  project,
  ROW_PAD_VH,
  SCENES,
  SLIDE_VW,
  splitAmp,
  TITLE,
  TRACK_EM,
} from "./layout";
import type { Stage } from "./stage";

/**
 * Design 13, Index. The work, the skills and the email are three lists of
 * very large names, one row each, set alternately in the display serif
 * and in Inter light. Behind the type, one full-screen picture: a small
 * 3D scene for the row under the cursor, redrawn as blossom bars on the
 * plum ground (the valley's bars, the other way round). Moving to another
 * row thins the bars to nothing and grows the next scene's. Clicking a
 * project opens it in place.
 *
 * Row ids for the scene and the dev handle: 0..4 the projects, 5..9 the
 * skill groups, 10 the email.
 */

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const HAIR = "rgba(249, 185, 220, 0.3)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

// Hover slides the row's words and dims its neighbours. Under reduced
// motion the rows stay plain: no slide, no dimming, no transitions.
const CSS = `
.b13-row { transition: opacity 0.45s ease; }
.b13-slide { display: block; transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1), color 0.4s ease; }
.b13-list[data-hover="true"] .b13-row:not([data-on="true"]) { opacity: 0.32; }
.b13-row[data-on="true"] .b13-slide { transform: translateX(${SLIDE_VW}vw); color: #ffffff; }
@media (prefers-reduced-motion: reduce) {
  .b13-row, .b13-slide { transition: none; }
  .b13-list[data-hover="true"] .b13-row:not([data-on="true"]) { opacity: 1; }
  .b13-row[data-on="true"] .b13-slide { transform: none; }
}
`;

const GRID_WORK = { gridTemplateColumns: `${INDEX_VW}vw 1fr ${META_VW}vw`, columnGap: `${GAP_VW}vw` };
const GRID_SKILLS = { gridTemplateColumns: `${INDEX_VW}vw 1fr ${NAMES_VW}vw`, columnGap: `${GAP_VW}vw` };
const ROW_PAD = { paddingTop: `${ROW_PAD_VH}vh`, paddingBottom: `${ROW_PAD_VH}vh` };

/** A line of large type in the face its row takes; "&" in a serif line is set in Inter. */
function Big({ text, row, size }: { text: string; row: number; size: string }): JSX.Element {
  const face = faceFor(text, row);
  const style = { fontSize: size, lineHeight: 1, letterSpacing: `${TRACK_EM}em` };
  if (face === "sans") {
    return (
      <span className="font-sans font-light" style={style}>
        {text}
      </span>
    );
  }
  return (
    <span className="font-serif-display italic" style={style}>
      {splitAmp(text).map((p, i) =>
        p.amp ? (
          <span className="font-sans font-light not-italic" key={i}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

function webglWorks(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Keeps the bar canvas under 2560 device px wide: drawn smaller, scaled up in CSS. */
function capBars(stageEl: HTMLElement, barEl: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const s = Math.max(1, (stageEl.clientWidth * dpr) / 2560);
  barEl.style.width = `${100 / s}%`;
  barEl.style.height = `${100 / s}%`;
  barEl.style.transform = s > 1 ? `scale(${s})` : "none";
}

export default function B13(): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const monoRef = useRef<HTMLParagraphElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Stage | null>(null);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);

  // The scene: started once in the browser. If it cannot start, the lists
  // stand on the plain plum ground.
  useEffect(() => {
    const stageEl = stageRef.current;
    const barEl = barRef.current;
    if (!stageEl || !barEl || !webglWorks()) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const monoFamily = monoRef.current ? getComputedStyle(monoRef.current).fontFamily : "monospace";
    const onResize = (): void => capBars(stageEl, barEl);
    capBars(stageEl, barEl);
    let stage: Stage | null = null;
    let cancelled = false;
    // Loaded on demand so three.js stays out of the page's first script.
    import("./stage")
      .then(({ startStage }) => {
        if (cancelled) return;
        try {
          stage = startStage(stageEl, barEl, { still, monoFamily });
          sceneRef.current = stage;
        } catch {
          // No scene; the words carry the page.
        }
      })
      .catch(() => {});
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      stage?.destroy();
      sceneRef.current = null;
    };
  }, []);

  // Which scene: the row under the cursor, else the open project, else none.
  useEffect(() => {
    sceneRef.current?.setTarget(hover >= 0 ? hover : open);
  }, [hover, open]);

  const enter = useCallback((i: number) => () => setHover(i), []);
  const leave = useCallback((i: number) => () => setHover((h) => (h === i ? -1 : h)), []);

  // Development only: a handle for the capture harness.
  const hoverRef = useRef(hover);
  const openRef = useRef(open);
  hoverRef.current = hover;
  openRef.current = open;
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return undefined;
    const w = window as unknown as { __b13?: unknown };
    w.__b13 = {
      hover: (i: number) => setHover(i),
      open: (i: number) => setOpen(i),
      get state() {
        const s = sceneRef.current?.state() ?? null;
        const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []).map((el) => {
          const r = el.getBoundingClientRect();
          return { row: Number(el.dataset.row), x: r.left, y: r.top, w: r.width, h: r.height };
        });
        let subject = null;
        if (s) {
          const spec = SCENES[s.scene];
          const aspect = window.innerWidth / Math.max(1, window.innerHeight);
          const pts = corners(spec.box).map((c) => project(c, cameraPos(spec), spec.target, aspect));
          subject = {
            x0: Math.min(...pts.map((p) => p.x)),
            x1: Math.max(...pts.map((p) => p.x)),
            y0: Math.min(...pts.map((p) => p.y)),
            y1: Math.max(...pts.map((p) => p.y)),
          };
        }
        return { hover: hoverRef.current, open: openRef.current, scene: s, subject, rows };
      },
    };
    return () => {
      delete w.__b13;
    };
  }, []);

  const workHover = hover >= 0 && hover < projects.length;
  const skillHover = hover >= projects.length && hover < CONTACT_SCENE;

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The picture, pinned behind the lists for as long as they are on screen. */}
      <div
        aria-hidden
        className="pointer-events-none sticky top-0 z-0 w-full overflow-hidden"
        ref={stageRef}
        style={{ height: SCREEN, marginBottom: `calc(${SCREEN} * -1)` }}
      >
        <canvas className="absolute left-0 top-0 block h-full w-full" ref={barRef} style={{ transformOrigin: "0 0" }} />
      </div>
      {/* The band above is this plum; the first screen starts on it with no bars. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[14vh]"
        style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 25%, rgba(42, 13, 30, 0) 100%)` }}
      />

      <section className="relative z-10" id="work" style={{ minHeight: SCREEN, padding: `${HEAD_VH}vh ${GUTTER_VW}vw 8vh` }}>
        <div className="absolute top-[5vh] flex items-baseline justify-between" style={{ left: `${GUTTER_VW}vw`, right: `${GUTTER_VW}vw` }}>
          <h2 className={`${LABEL} opacity-70`}>Work</h2>
          <p className={`${LABEL} opacity-70`} ref={monoRef}>
            Point at a row. Click one to open it.
          </p>
        </div>
        <ol className="b13-list" data-hover={workHover} style={{ borderTop: `0.1rem solid ${HAIR}` }}>
          {projects.map((p, i) => {
            const isOpen = open === i;
            return (
              <li
                className="b13-row"
                data-on={hover === i || (hover < 0 && isOpen)}
                data-row={i}
                key={p.title}
                onPointerEnter={enter(i)}
                onPointerLeave={leave(i)}
                style={{ borderBottom: `0.1rem solid ${HAIR}` }}
              >
                <h3>
                  <button
                    aria-controls={`b13-p${i}`}
                    aria-expanded={isOpen}
                    className="grid w-full cursor-pointer items-baseline text-left"
                    onBlur={leave(i)}
                    onClick={() => setOpen((o) => (o === i ? -1 : i))}
                    onFocus={enter(i)}
                    style={{ ...GRID_WORK, ...ROW_PAD }}
                    type="button"
                  >
                    <span className="font-mono text-[1.4rem] tabular-nums opacity-70">{pad2(i + 1)}</span>
                    <span className="b13-slide whitespace-nowrap">
                      <Big row={i} size={css(TITLE)} text={p.title} />
                    </span>
                    <span className="b13-slide text-right font-mono text-[1.4rem] uppercase tracking-[0.16em] opacity-80">
                      {p.year}
                      <br />
                      {KIND[p.kind]}
                    </span>
                  </button>
                </h3>
                {isOpen ? (
                  <PetalReveal className="grid pb-[4vh]" id={`b13-p${i}`} petals={9} seed={p.title} style={GRID_WORK}>
                    <span />
                    <div className="max-w-[92rem] px-[2rem] py-[2.4rem]" style={{ backgroundColor: "rgba(42, 13, 30, 0.9)" }}>
                      <p className="font-sans text-[2.4rem] font-light leading-[1.4] text-white">{p.tagline}</p>
                      <ul className="mt-[2rem] space-y-[1rem]">
                        {p.bullets.map((b) => (
                          <li className="flex gap-[1.2rem] font-sans text-[1.8rem] font-light leading-[1.5]" key={b}>
                            <span aria-hidden className="mt-[0.9rem] h-[0.5rem] w-[0.5rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
                            {b}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-[2rem] font-mono text-[1.4rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
                      {p.award ? <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.6] opacity-80">{p.award}</p> : null}
                      {p.href ? (
                        <a
                          className="mt-[1.2rem] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]"
                          href={p.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {hostOf(p.href)}
                        </a>
                      ) : null}
                    </div>
                    <span />
                  </PetalReveal>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="relative z-10" id="skills" style={{ padding: `${HEAD_VH}vh ${GUTTER_VW}vw 8vh` }}>
        <h2 className={`absolute top-[5vh] ${LABEL} opacity-70`} style={{ left: `${GUTTER_VW}vw` }}>
          Skills
        </h2>
        <ol className="b13-list" data-hover={skillHover} style={{ borderTop: `0.1rem solid ${HAIR}` }}>
          {skillGroups.map((g, i) => {
            const id = projects.length + i;
            return (
              <li
                className="b13-row grid items-baseline"
                data-on={hover === id}
                data-row={id}
                key={g.label}
                onPointerEnter={enter(id)}
                onPointerLeave={leave(id)}
                style={{ ...GRID_SKILLS, ...ROW_PAD, borderBottom: `0.1rem solid ${HAIR}` }}
              >
                <span className="font-mono text-[1.4rem] tabular-nums opacity-70">{pad2(i + 1)}</span>
                <h3 className="b13-slide whitespace-nowrap">
                  <Big row={i} size={css(GROUP)} text={g.label} />
                </h3>
                <p className="b13-slide font-mono text-[1.4rem] leading-[1.6] opacity-90">{g.skills.map((s) => s.name).join(", ")}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="relative z-10" id="contact" style={{ padding: `${HEAD_VH}vh ${GUTTER_VW}vw 14vh` }}>
        <h2 className={`absolute top-[5vh] ${LABEL} opacity-70`} style={{ left: `${GUTTER_VW}vw` }}>
          Contact
        </h2>
        <div
          className="b13-row"
          data-on={hover === CONTACT_SCENE}
          data-row={CONTACT_SCENE}
          onPointerEnter={enter(CONTACT_SCENE)}
          onPointerLeave={leave(CONTACT_SCENE)}
          style={{ ...ROW_PAD, borderTop: `0.1rem solid ${HAIR}`, borderBottom: `0.1rem solid ${HAIR}` }}
        >
          <a
            className="b13-slide whitespace-nowrap"
            href={`mailto:${EMAIL}`}
            onBlur={leave(CONTACT_SCENE)}
            onFocus={enter(CONTACT_SCENE)}
          >
            <span className="font-sans font-light" style={{ fontSize: css(EMAIL_SIZE), lineHeight: 1, letterSpacing: `${TRACK_EM}em` }}>
              {EMAIL}
            </span>
          </a>
        </div>
        <ul className="mt-[5vh] flex flex-wrap gap-x-[3.5vw] gap-y-[2vh] font-mono text-[1.5rem]">
          {elsewhere.map((l) => (
            <li key={l.href}>
              <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                <span className="block text-[1.2rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
                <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
