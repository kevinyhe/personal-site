"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import * as L from "./layout";
import { type MapMode, startMap } from "./map";

/**
 * Design 12, Map. An illustrated valley seen from above: a river, rice
 * fields, clumps of sakura, and five shrine precincts, one per project,
 * each put together from the valley's own shrine builders. It is drawn
 * through the bar shader, plum bars on blossom, like the valley plates
 * higher up the page.
 *
 * Scrolling walks the camera from precinct to precinct along a dashed
 * path that fills in behind it; a card beside the map gives the project.
 * Then the camera rises over the whole valley, where 42 lanterns stand in
 * five villages, one village per group of skills. Last it follows the
 * river off the north edge of the map to a blossom margin with the email.
 *
 * Layouts:
 *   journey  the pinned walk.
 *   still    the whole map, still, with the five cards beside it. For a
 *            visitor who asked for less motion, and for narrow screens.
 *   plain    the words alone. What the server sends, and what is left if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | MapMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.3rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: Project): string => (p.award ? `${p.year}. ${p.award}` : p.year);
/** The display serif draws a watermark for digits and these; such titles go in sans. */
const serifSafe = (t: string): boolean => !/[0-9'"$&@\-!()*+/=#%]/.test(t);

// The small map's lines, in map units: x east, z south.
const RIVER_D = (() => {
  const pts: string[] = [];
  for (let z = L.HALF; z >= -L.HALF; z -= 3) pts.push(`${L.riverX(z).toFixed(1)} ${z.toFixed(1)}`);
  return `M${pts.join("L")}`;
})();
const WALK_D = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 80; i += 1) {
    const p = L.walkAt((i / 80) * 4);
    pts.push(`${p[0].toFixed(1)} ${p[1].toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
})();

/** Can this browser draw both the scene (WebGL2) and the bars (WebGL)? Asked of spare canvases, let go at once. */
function webglWorks(): boolean {
  try {
    const gl2 = document.createElement("canvas").getContext("webgl2");
    if (!gl2) return false;
    gl2.getExtension("WEBGL_lose_context")?.loseContext();
    const gl1 = document.createElement("canvas").getContext("webgl");
    if (!gl1) return false;
    gl1.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function Title({ p }: { p: Project }): JSX.Element {
  return serifSafe(p.title) ? (
    <h3 className="font-serif-display text-[6.4rem] italic leading-[1] tracking-[-0.02em]">{p.title}</h3>
  ) : (
    <h3 className="font-sans text-[5.2rem] font-light leading-[1.05] tracking-[-0.03em]">{p.title}</h3>
  );
}

function ProjectBody({ p, i }: { p: Project; i: number }): JSX.Element {
  return (
    <>
      <p className="font-mono text-[1.4rem] tabular-nums tracking-[0.12em]">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
      <div className="mb-[2rem] mt-[1.2rem] h-[0.15rem] w-full" style={{ backgroundColor: BAND }} />
      <Title p={p} />
      <p className="mt-[1.8rem] font-sans text-[2.1rem] font-light leading-[1.45]">{p.tagline}</p>
      <p className="mt-[1.8rem] font-mono text-[1.4rem] leading-[1.6]">{p.stack.join(", ")}</p>
      <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.6] opacity-75">{metaOf(p)}</p>
      {p.href ? (
        <a className="mt-[0.6rem] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
          {hostOf(p.href)}
        </a>
      ) : null}
    </>
  );
}

function SkillGroups({ tight }: { tight: boolean }): JSX.Element {
  return (
    <div className={tight ? "mt-[2.4rem] space-y-[2.2rem]" : "mt-[4rem] space-y-[3.4rem]"}>
      {skillGroups.map((g, i) => (
        <div key={g.label}>
          <h3 className={LABEL}>
            <span className="tabular-nums opacity-60">{pad2(i + 1)}</span>
            <span className="ml-[1.2rem]">{g.label}</span>
            <span className="ml-[1.2rem] tabular-nums opacity-60">{g.skills.length}</span>
          </h3>
          <ul className="mt-[0.8rem] flex flex-wrap gap-x-[1.8rem] gap-y-[0.4rem] font-sans text-[2rem] font-light leading-[1.45]">
            {g.skills.map((s) => (
              <li key={s.name}>{s.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Links({ className }: { className: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.5rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.2rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Email({ size }: { size: string }): JSX.Element {
  return (
    <a className={`block break-all font-sans font-light leading-none tracking-[-0.035em] ${size}`} href={`mailto:${EMAIL}`}>
      {EMAIL}
    </a>
  );
}

/** A numbered pin, its point at the spot it marks. Placed by the map. */
function Pin({ i }: { i: number }): JSX.Element {
  return (
    <div aria-hidden className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center" data-pin={i} style={{ opacity: 0, visibility: "hidden" }}>
      <span
        className="flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full font-mono text-[1.6rem] tabular-nums"
        style={{ backgroundColor: BAND, color: BLOSSOM, boxShadow: `0 0 0 0.3rem ${BLOSSOM}` }}
      >
        {pad2(i + 1)}
      </span>
      <span className="h-[3.2rem] w-[0.3rem]" style={{ backgroundColor: BAND }} />
      <span className="h-[0.9rem] w-[0.9rem] rounded-full" style={{ backgroundColor: BAND }} />
    </div>
  );
}

function VillageLabel({ i }: { i: number }): JSX.Element {
  const g = skillGroups[i];
  return (
    <p
      aria-hidden
      className={`absolute -translate-x-1/2 whitespace-nowrap px-[0.8rem] py-[0.3rem] ${LABEL} text-[1.1rem]`}
      data-village={i}
      style={{ backgroundColor: BLOSSOM, color: BAND, opacity: 0, visibility: "hidden" }}
    >
      {`${pad2(i + 1)} ${g.label}`}
    </p>
  );
}

function MiniMap(): JSX.Element {
  return (
    <div
      className="absolute"
      data-chrome
      style={{ left: `${L.MINIMAP.left * 100}vw`, bottom: `${L.MINIMAP.bottom * 100}vh`, width: `${L.MINIMAP.size}rem`, height: `${L.MINIMAP.size}rem` }}
    >
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox={`${-L.HALF} ${-L.HALF} ${2 * L.HALF} ${2 * L.HALF}`}>
        <rect fill={BLOSSOM} height={2 * L.HALF} stroke={BAND} strokeWidth={1.6} width={2 * L.HALF} x={-L.HALF} y={-L.HALF} />
        <path d={RIVER_D} fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth={4} />
        <path d={WALK_D} fill="none" stroke={BAND} strokeDasharray="3 2.4" strokeWidth={1.2} />
        {L.VILLAGES.map((v, i) => (
          <circle cx={v.x} cy={v.z} fill="none" key={i} r={3.4} stroke={BAND} strokeWidth={0.9} />
        ))}
        <circle data-mm-dot fill="none" r={6} stroke={BAND} strokeWidth={1.6} cx={L.PRECINCTS[0].x} cy={L.PRECINCTS[0].z} />
      </svg>
      {L.PRECINCTS.map((p, i) => (
        <button
          aria-label={`Go to ${projects[i].title}`}
          className="absolute flex h-[2.6rem] w-[2.6rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[0.15rem] font-mono text-[1.1rem] tabular-nums aria-[current=step]:bg-[#2a0d1e] aria-[current=step]:text-[#f9b9dc]"
          data-mm-stop={i}
          key={i}
          style={{ left: `${((p.x + L.HALF) / (2 * L.HALF)) * 100}%`, top: `${((p.z + L.HALF) / (2 * L.HALF)) * 100}%`, borderColor: BAND, backgroundColor: BLOSSOM }}
          type="button"
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function Journey(): JSX.Element {
  const card = L.CARD;
  const panel = L.SKILLS_PANEL;
  const mail = L.EMAIL_BOX;
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BLOSSOM }}>
        <canvas aria-hidden className="absolute left-0 top-0 block h-full w-full" data-bars />
        <div className="pointer-events-none absolute inset-0">
          {projects.map((p, i) => (
            <Pin i={i} key={p.title} />
          ))}
          {skillGroups.map((g, i) => (
            <VillageLabel i={i} key={g.label} />
          ))}
        </div>
        <MiniMap />
        <p className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap ${LABEL} opacity-80`} data-chrome>
          Scroll to walk the path. Numbers on the small map jump.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className="absolute font-serif-display text-[5.2rem] italic leading-none" data-chrome style={{ left: `${card.x0 * 100}vw`, top: `${(card.y0 - 0.065) * 100}vh` }}>
            Work
          </h2>
          {projects.map((p, i) => (
            <article
              className="absolute flex flex-col justify-center px-[3.6rem] py-[3rem]"
              data-card={i}
              key={p.title}
              style={{
                left: `${card.x0 * 100}vw`,
                width: `${(card.x1 - card.x0) * 100}vw`,
                top: `calc(${SCREEN} * ${card.y0})`,
                height: `calc(${SCREEN} * ${card.y1 - card.y0})`,
                backgroundColor: BLOSSOM,
                boxShadow: `inset 0 0 0 0.2rem ${BAND}`,
                opacity: i === 0 ? 1 : 0,
                visibility: i === 0 ? "visible" : "hidden",
                pointerEvents: "none",
              }}
            >
              <ProjectBody i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <div
            className="absolute overflow-hidden px-[3.6rem] py-[3rem]"
            style={{
              left: `${panel.x0 * 100}vw`,
              width: `${(panel.x1 - panel.x0) * 100}vw`,
              top: `calc(${SCREEN} * ${panel.y0})`,
              maxHeight: `calc(${SCREEN} * ${panel.y1 - panel.y0})`,
              backgroundColor: BLOSSOM,
              boxShadow: `inset 0 0 0 0.2rem ${BAND}`,
            }}
          >
            <h2 className="font-serif-display text-[5.2rem] italic leading-none">Skills</h2>
            <p className={`mt-[1.2rem] ${LABEL} opacity-70`}>
              {skillGroups.reduce((n, g) => n + g.skills.length, 0)} lanterns, five villages
            </p>
            <SkillGroups tight />
          </div>
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="contact" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" data-contact-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <div
            className="absolute text-center"
            style={{ left: `${mail.x0 * 100}vw`, width: `${(mail.x1 - mail.x0) * 100}vw`, top: `calc(${SCREEN} * ${mail.y0})` }}
          >
            <h2 className="font-serif-display text-[5.2rem] italic leading-none">Contact</h2>
            <div className="mt-[4vh]">
              <Email size="text-[6vw]" />
            </div>
            <Links className="mt-[5vh] flex justify-center gap-[3.5vw] text-left" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Still({ narrow }: { narrow: boolean }): JSX.Element {
  return (
    <div>
      <div
        className="grid"
        style={{ gridTemplateColumns: narrow ? "1fr" : "58vw 1fr" }}
      >
        <div
          className={narrow ? "relative overflow-hidden" : "sticky top-0 overflow-hidden"}
          data-stage
          style={{ height: narrow ? `calc(${SCREEN} * 0.6)` : SCREEN, alignSelf: "start" }}
        >
          <canvas aria-hidden className="absolute left-0 top-0 block h-full w-full" data-bars />
          <div className="pointer-events-none absolute inset-0">
            {projects.map((p, i) => (
              <Pin i={i} key={p.title} />
            ))}
            {skillGroups.map((g, i) => (
              <VillageLabel i={i} key={g.label} />
            ))}
          </div>
        </div>
        <section className="px-[4.5vw] pb-[8vh] pt-[14vh]" id="work">
          <h2 className="font-serif-display text-[5.2rem] italic leading-none">Work</h2>
          <div className="mt-[5vh] space-y-[7vh]">
            {projects.map((p, i) => (
              <article key={p.title}>
                <ProjectBody i={i} p={p} />
              </article>
            ))}
          </div>
        </section>
      </div>
      <Words withWork={false} />
    </div>
  );
}

/** The skills and the email as ordinary blocks; the work too, when asked. */
function Words({ withWork }: { withWork: boolean }): JSX.Element {
  return (
    <>
      {withWork ? (
        <section className="px-[4.5vw] pb-[8vh] pt-[22vh]" id="work">
          <h2 className="font-serif-display text-[5.2rem] italic leading-none">Work</h2>
          <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
            {projects.map((p, i) => (
              <article key={p.title}>
                <ProjectBody i={i} p={p} />
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className="font-serif-display text-[5.2rem] italic leading-none">Skills</h2>
        <div className="max-w-[150rem]">
          <SkillGroups tight={false} />
        </div>
      </section>
      <section className="px-[4.5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className="font-serif-display text-[5.2rem] italic leading-none">Contact</h2>
        <div className="mt-[5vh]">
          <Email size="text-[6.4vw]" />
        </div>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </>
  );
}

export default function B12(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // A map with a card beside it needs a wide screen. In a media query an
    // em is the browser's own 16, so 56em is 896 wide.
    const thin = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      setNarrow(thin.matches);
      if (!webglWorks()) setMode("plain");
      else setMode(less.matches || thin.matches ? "still" : "journey");
    };
    pick();
    less.addEventListener("change", pick);
    thin.addEventListener("change", pick);
    return () => {
      less.removeEventListener("change", pick);
      thin.removeEventListener("change", pick);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || (mode !== "journey" && mode !== "still")) return undefined;
    try {
      return startMap(root, mode);
    } catch {
      // The map could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode, narrow]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BLOSSOM, color: BAND }}>
      {mode === "journey" ? <Journey /> : mode === "still" ? <Still narrow={narrow} /> : <Words withWork />}
      {/* The band above is plum. The design starts in the band's own plum
          and fades to the blossom ground the map lies on. It scrolls away
          with the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[18vh]"
        style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
      />
    </div>
  );
}
