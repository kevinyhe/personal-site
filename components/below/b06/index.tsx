"use client";

import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { DEEP, skillsRow, titleLines } from "./layout";
import { startStrips } from "./stage";

/**
 * Design 06, Strips. A dark page with a row of tall narrow strips across
 * the middle of the screen, two for each project, each one a slice of a
 * moving picture made for that project. Scroll or drag slides the row
 * sideways, and it bends as it goes. The strip under the cursor opens to
 * show its whole picture, with the project's title beside it. A second,
 * finer row holds the 42 skills. At the end the first row stands up as a
 * fence under the email.
 *
 * The page has three layouts.
 *   journey  the pinned scene, with the words laid over it.
 *   still    for a visitor who asked for less motion: one frame of the
 *            row at rest with the first strip open, then the words as
 *            ordinary blocks.
 *   plain    the words as ordinary blocks. It is what the server sends
 *            and what is left if WebGL cannot start.
 */

type Mode = "boot" | "journey" | "still" | "plain";

const SCREEN = "var(--arbor-screen-h)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: (typeof projects)[number]): string => (p.award ? `${p.year}. ${p.award}` : p.year);

const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const CORNER = `absolute left-[2.4vw] top-[5vh] opacity-70 ${SMALL}`;
const CAPS = "font-sans font-bold uppercase leading-[0.86] tracking-[-0.04em] text-white";
/** The ground: the band's plum at the very top, deep plum a screen down. */
const GROUND: CSSProperties = {
  backgroundColor: DEEP,
  backgroundImage: `linear-gradient(to bottom, ${BAND} 0, ${BAND} 5vh, ${DEEP} 115vh)`,
  backgroundRepeat: "no-repeat",
  color: BLOSSOM,
};

const ROW = skillsRow(skillGroups.map((g) => g.skills.length));

/** Can this browser give us the kind of canvas three needs? Asked of a
 *  spare canvas, which is let go again at once. */
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

/**
 * The words that stand beside an opened strip. The stage moves the whole
 * column and sets the title's size. data-on and data-held, which the
 * stage sets, bring the parts in: the title rises line by line out of
 * its own line box, the small print fades in, and the bullets and link
 * come only when the strip is held open.
 */
function Info({ index }: { index: number }): JSX.Element {
  const p = projects[index];
  const lines = titleLines(p.title);
  return (
    <article className="group absolute left-0 top-0 w-[30%]" data-held="false" data-info={index} data-on="false">
      <h3 className={CAPS} data-title style={{ fontSize: "5vw" }}>
        {lines.map((line, k) => (
          <span className="block overflow-hidden" key={line}>
            <span
              className="inline-block translate-y-[108%] whitespace-nowrap transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform group-data-[on=true]:translate-y-0 group-data-[on=true]:delay-[var(--wait)] group-data-[on=true]:duration-700 motion-reduce:transition-none"
              data-line
              style={{ "--wait": `${120 + k * 90}ms` } as CSSProperties}
            >
              {k < lines.length - 1 ? `${line} ` : line}
            </span>
          </span>
        ))}
      </h3>
      <div className="mt-[2.4rem] font-mono text-[1.5rem] leading-[1.5] opacity-0 transition-opacity duration-200 group-data-[on=true]:opacity-100 group-data-[on=true]:delay-300 group-data-[on=true]:duration-500 motion-reduce:transition-none">
        <p>{p.tagline}</p>
        <p className="mt-[1.2rem] text-white">{p.stack.join(", ")}</p>
        <p className="mt-[1.2rem] opacity-80">{metaOf(p)}</p>
      </div>
      <div className="pointer-events-none mt-[2rem] font-mono text-[1.5rem] leading-[1.5] opacity-0 transition-opacity duration-300 group-data-[held=true]:pointer-events-auto group-data-[held=true]:opacity-100 motion-reduce:transition-none">
        <ul>
          {p.bullets.map((b) => (
            <li className="mt-[0.8rem]" key={b}>
              {b}
            </li>
          ))}
        </ul>
        {p.href ? (
          <a
            className="mt-[1.2rem] inline-block text-white underline underline-offset-[0.35em]"
            href={p.href}
            rel="noreferrer"
            target="_blank"
          >
            {hostOf(p.href)}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Links(): JSX.Element {
  return (
    <>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group pointer-events-auto block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </>
  );
}

function Journey(): JSX.Element {
  return (
    <div className="relative select-none" data-journey style={{ touchAction: "pan-y" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden" data-stage>
        <div className="absolute inset-0" data-canvas />
        <p
          aria-hidden
          className="absolute right-[2.4vw] top-[5vh] font-mono text-[1.4rem] tabular-nums tracking-[0.2em] text-white"
          data-counter
          data-mono
        >
          {`01 / ${pad2(projects.length)}`}
        </p>
        <p
          className={`absolute bottom-[3.5vh] left-1/2 w-max -translate-x-1/2 transition-opacity duration-500 ${SMALL}`}
          data-hint
          style={{ opacity: 0.6 }}
        >
          Drag or scroll. Hover to open.
        </p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 3)` }}
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden" data-work-layer>
          <h2 className={CORNER}>Work</h2>
          {projects.map((p, i) => (
            <Info index={i} key={p.title} />
          ))}
          {/* Under each pair of strips while the row is closed. The
              titles are read from the columns above, so these are for
              the eye only. */}
          {projects.map((p, i) => (
            <p aria-hidden className="absolute left-0 top-0 w-[7.2%] font-mono text-[1.1rem] leading-[1.35]" data-caption={i} key={p.title}>
              <span className="block text-white">{pad2(i + 1)}</span>
              <span className="block opacity-70">{p.title}</span>
            </p>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2.5)` }}>
        <div className="sticky top-0 h-screen w-full overflow-hidden" data-skills-layer>
          <h2 className={CORNER}>Skills</h2>
          <p
            aria-hidden
            className="absolute left-0 top-0 w-max font-sans text-[3.2rem] font-bold uppercase leading-none tracking-[-0.03em] text-white"
            data-skill-name
            style={{ opacity: 0 }}
          />
          {skillGroups.map((g, i) => (
            <div className="absolute left-0 top-0" data-group={i} key={g.label} style={{ width: `${ROW.groups[i].width}%` }}>
              <h3 className="font-mono text-[1.3rem] uppercase tracking-[0.2em] text-white">{g.label}</h3>
              <p className="mt-[0.8rem] font-mono text-[1.2rem] leading-[1.5] opacity-70">{g.skills.map((s) => s.name).join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10 h-screen w-full" id="contact">
        <h2 className={CORNER}>Contact</h2>
        <a
          className="pointer-events-auto absolute left-[4.8vw] top-[24vh] font-sans text-[5.6vw] font-bold leading-none tracking-[-0.04em] text-white"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <ul className="absolute left-[4.8vw] top-[44vh] flex gap-[3.5vw] font-mono text-[1.6rem]">
          <Links />
        </ul>
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative h-screen w-full overflow-hidden" data-stage>
          <div className="absolute inset-0" data-canvas />
          <p
            aria-hidden
            className="absolute right-[2.4vw] top-[5vh] font-mono text-[1.4rem] tabular-nums tracking-[0.2em] text-white"
            data-mono
          >
            {`01 / ${pad2(projects.length)}`}
          </p>
          {/* The same words stand in the list below, so a reader is not
              told them twice. */}
          <div aria-hidden>
            <Info index={0} />
          </div>
        </div>
      ) : null}

      <section className="px-[4.8vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-70 ${SMALL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[9vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article className="border-l-[0.15rem] pl-[2.4rem]" key={p.title} style={{ borderColor: BLOSSOM }}>
              <p className="font-mono text-[1.4rem] tracking-[0.2em] opacity-70">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <h3 className={`mt-[1.2rem] text-[7rem] ${CAPS}`}>{p.title}</h3>
              <p className="mt-[2rem] max-w-[62rem] font-mono text-[1.6rem] leading-[1.5]">{p.tagline}</p>
              <p className="mt-[1.2rem] font-mono text-[1.5rem] leading-[1.5] text-white">{p.stack.join(", ")}</p>
              <p className="mt-[0.8rem] font-mono text-[1.5rem] leading-[1.5] opacity-80">{metaOf(p)}</p>
              <ul className="mt-[1.2rem] max-w-[62rem] font-mono text-[1.4rem] leading-[1.5] opacity-80">
                {p.bullets.map((b) => (
                  <li className="mt-[0.8rem]" key={b}>
                    {b}
                  </li>
                ))}
              </ul>
              {p.href ? (
                <a
                  className="mt-[1.2rem] inline-block font-mono text-[1.5rem] text-white underline underline-offset-[0.35em]"
                  href={p.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {hostOf(p.href)}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.8vw] py-[10vh]" id="skills">
        <h2 className={`opacity-70 ${SMALL}`}>Skills</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[6vh] md:grid-cols-2">
          {skillGroups.map((g) => (
            <div className="border-l-[0.15rem] pl-[2.4rem]" key={g.label} style={{ borderColor: BLOSSOM }}>
              <h3 className={`text-[3.6rem] ${CAPS}`}>{g.label}</h3>
              <p className="mt-[1.4rem] max-w-[62rem] font-mono text-[1.6rem] leading-[1.6]">{g.skills.map((s) => s.name).join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[4.8vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-70 ${SMALL}`}>Contact</h2>
        <a className="mt-[5vh] block font-sans text-[5.6vw] font-bold leading-none tracking-[-0.04em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <ul className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh] font-mono text-[1.6rem]">
          <Links />
        </ul>
      </section>
    </div>
  );
}

export default function B06(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting while the page is open.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pick = (): void => setMode(webglWorks() ? (less.matches ? "still" : "journey") : "plain");
    pick();
    less.addEventListener("change", pick);
    return () => less.removeEventListener("change", pick);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || (mode !== "journey" && mode !== "still")) return undefined;
    try {
      return startStrips(root, mode === "still");
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={GROUND}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
    </div>
  );
}
