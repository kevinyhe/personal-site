"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { EMAIL, elsewhere } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { mountDrive, type DriveHandle } from "./scene";
import { skillIcon } from "@/components/skillIcons";
import { APRICOT, DEEP, tooDark } from "./textures";

/**
 * Design 01, "Drive". The work is a floor and the visitor drives Kevin's
 * robot round it. Five project sites stand on the floor; driving into one
 * opens its card here in the page. The 42 skills are pucks the robot can
 * push. Left alone, the robot drives the loop itself.
 *
 * The scene is in scene.ts. This file is the page round it: the cards,
 * the list of names, the skills and the contact section, all as ordinary
 * text that is there with or without the canvas.
 */

const pad = (n: number): string => String(n + 1).padStart(2, "0");
const host = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

type LenisLike = { scrollTo: (target: HTMLElement, options?: { duration?: number; immediate?: boolean }) => void };

/** The floor's dots again, as a page background. */
const DOTS = {
  backgroundImage: `radial-gradient(circle, ${BLOSSOM} 0.22rem, transparent 0.26rem)`,
  backgroundSize: "5rem 5rem",
} as const;

export default function B01(): JSX.Element {
  const stage = useRef<HTMLElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const contact = useRef<HTMLElement>(null);
  const drive = useRef<DriveHandle | null>(null);

  /** The site whose card is open. */
  const [open, setOpen] = useState<number | null>(null);
  const [keys, setKeys] = useState(false);
  const [person, setPerson] = useState(false);
  const [ready, setReady] = useState(false);
  /** No WebGL: the cards are laid out as a plain list instead. */
  const [flat, setFlat] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const el = stage.current;
    const into = canvasHost.current;
    if (!el || !into) return undefined;
    // "?still" asks for the reduced-motion picture without changing the
    // system setting, so it can be looked at.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]still\b/.test(window.location.search);
    setStill(reduced);
    const css = getComputedStyle(el);
    const handle = mountDrive({
      host: into,
      stage: el,
      reduced,
      fonts: {
        mono: `${css.getPropertyValue("--font-mono").trim() || "ui-monospace"}, monospace`,
        sans: `${css.getPropertyValue("--font-inter").trim() || "system-ui"}, sans-serif`,
      },
      onSite: setOpen,
      onKeys: setKeys,
      onDriver: setPerson,
      onReady: () => setReady(true),
      onGate: () => {
        const to = contact.current;
        if (!to) return;
        const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
        if (lenis) lenis.scrollTo(to, { duration: 1.6 });
        else to.scrollIntoView({ behavior: "smooth" });
      },
    });
    if (!handle) {
      setFlat(true);
      return undefined;
    }
    drive.current = handle;
    return () => {
      drive.current = null;
      handle.dispose();
    };
  }, []);

  const send = useCallback((i: number) => {
    // Without the scene the name still opens its card.
    if (drive.current) drive.current.goTo(i);
    else setOpen(i);
  }, []);

  return (
    <div style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <section
        className={`relative overflow-hidden ${flat ? "px-[4vw] pb-[10vh] pt-[8vh]" : "h-[100vh]"}`}
        id="work"
        ref={stage}
        style={{ backgroundColor: BAND }}
      >
        {!flat && (
          <>
            <div
              className={`absolute inset-0 ${still ? "" : "transition-opacity duration-700"}`}
              ref={canvasHost}
              style={{ opacity: ready ? 1 : 0 }}
            />
            {/* The first rows are the band's own colour, so the join with
                the band above shows no line; then the floor comes through. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[22vh]"
              style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 4%, rgba(42,13,30,0.8) 28%, rgba(42,13,30,0.4) 62%, rgba(42,13,30,0) 100%)` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[16vh]"
              style={{ background: `linear-gradient(rgba(26,8,18,0) 0%, ${DEEP} 100%)` }}
            />
            {/* A thin frame while the stage has the keys. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-[1.2rem] rounded-[1.6rem] border-[0.15rem] ${still ? "" : "transition-opacity duration-300"}`}
              style={{ borderColor: BLOSSOM, opacity: keys && !still ? 0.35 : 0 }}
            />
          </>
        )}

        <h2 className={`font-serif-display text-[7rem] italic leading-[1] tracking-[-0.02em] ${flat ? "" : "absolute left-[4vw] top-[7vh]"}`}>Work</h2>

        {!flat && (
          <nav
            aria-label="Projects"
            className="absolute bottom-[10vh] left-[3vw] rounded-[1.4rem] border-[0.1rem] px-[2.4rem] py-[1.8rem]"
            style={{ backgroundColor: "rgba(26,8,18,0.72)", borderColor: "rgba(249,185,220,0.2)" }}
          >
            <ol className="flex flex-col gap-[0.5rem]">
              {projects.map((p, i) => (
                <li key={p.title}>
                  <button
                    aria-pressed={open === i}
                    className={`group flex items-baseline gap-[1.4rem] py-[0.5rem] text-left ${still ? "" : "transition-opacity duration-300"} ${open === i ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
                    onClick={() => send(i)}
                    type="button"
                  >
                    <span className="font-mono text-[1.3rem] tabular-nums" style={{ color: APRICOT }}>
                      {pad(i)}
                    </span>
                    <span className="font-sans text-[2.3rem] font-medium leading-[1.1] text-white">{p.title}</span>
                  </button>
                </li>
              ))}
              <li>
                <a className="flex items-baseline gap-[1.4rem] py-[0.5rem] opacity-60 transition-opacity duration-300 hover:opacity-100" href="#contact">
                  <span aria-hidden="true" className="font-mono text-[1.3rem]" style={{ color: APRICOT }}>
                    {"→"}
                  </span>
                  <span className="font-sans text-[2.3rem] font-medium leading-[1.1] text-white">Write to me</span>
                </a>
              </li>
            </ol>
          </nav>
        )}

        <div className={flat ? "mt-[6vh] grid grid-cols-2 gap-[3rem]" : "pointer-events-none absolute right-[4vw] top-[50%] w-[44rem]"}>
          {projects.map((p, i) => {
            const shown = flat || open === i;
            return (
              <article
                aria-hidden={!shown}
                className={`rounded-[1.4rem] border-[0.1rem] p-[3rem] ${flat ? "" : "absolute right-0 top-0 w-full"} ${still || flat ? "" : "transition-[opacity,transform] duration-500"}`}
                key={p.title}
                style={{
                  backgroundColor: "rgba(26,8,18,0.82)",
                  borderColor: "rgba(249,185,220,0.28)",
                  opacity: shown ? 1 : 0,
                  visibility: shown ? "visible" : "hidden",
                  transform: flat ? undefined : `translateY(-50%) translateX(${shown ? "0" : "3rem"})`,
                  pointerEvents: shown ? "auto" : "none",
                  // Hidden only after it has faded.
                  transitionProperty: still || flat ? undefined : "opacity, transform, visibility",
                }}
              >
                <p className="flex items-baseline justify-between font-mono text-[1.3rem] tabular-nums">
                  <span style={{ color: APRICOT }}>{pad(i)} / 05</span>
                  <span className="opacity-70">{p.year}</span>
                </p>
                <h3 className="mt-[1.6rem] font-sans text-[4.2rem] font-medium leading-[1.02] tracking-[-0.02em] text-white">{p.title}</h3>
                <p className="mt-[1.6rem] font-sans text-[2rem] font-light leading-[1.35] text-white/90">{p.tagline}</p>
                <p className="mt-[2.2rem] font-mono text-[1.25rem] uppercase leading-[1.7] tracking-[0.08em] opacity-80">{p.stack.join(" · ")}</p>
                {p.award && (
                  <p className="mt-[1.6rem] font-mono text-[1.3rem] uppercase tracking-[0.08em]" style={{ color: APRICOT }}>
                    {p.award}
                  </p>
                )}
                {p.href && (
                  <a
                    className="mt-[2.4rem] inline-block border-b-[0.12rem] pb-[0.3rem] font-mono text-[1.4rem] text-white transition-opacity hover:opacity-70"
                    href={p.href}
                    rel="noreferrer"
                    style={{ borderColor: BLOSSOM }}
                    tabIndex={shown ? 0 : -1}
                    target="_blank"
                  >
                    {host(p.href)} {"↗"}
                  </a>
                )}
              </article>
            );
          })}
        </div>

        {!flat && !still && (
          <p className="pointer-events-none absolute inset-x-0 bottom-[4.5vh] text-center font-mono text-[1.35rem] tracking-[0.04em]">
            <span className="mr-[1.6rem] uppercase tracking-[0.14em]" style={{ color: APRICOT }}>
              {person ? "You are driving" : "The robot is driving"}
            </span>
            <span className={keys ? "opacity-100" : "opacity-70"}>Click, then arrow keys or WASD. Esc to let go.</span>
          </p>
        )}
      </section>

      <section className="relative px-[4vw] pb-[14vh] pt-[12vh]" id="skills" style={{ backgroundColor: DEEP }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.1]" style={DOTS} />
        <h2 className="relative font-serif-display text-[7rem] italic leading-[1] tracking-[-0.02em]">Skills</h2>
        <div className="relative mt-[7vh]">
          {skillGroups.map((g) => (
            <div className="flex items-baseline gap-[3rem] border-t-[0.1rem] py-[2.6rem]" key={g.label} style={{ borderColor: "rgba(249,185,220,0.22)" }}>
              <h3 className="w-[34rem] shrink-0 font-mono text-[1.35rem] uppercase tracking-[0.14em]">{g.label}</h3>
              <ul className="flex flex-wrap gap-x-[3.4rem] gap-y-[1.6rem]">
                {g.skills.map((s) => (
                  <li className="flex items-center gap-[1rem] font-sans text-[1.9rem] text-white" key={s.name}>
                    {/* In its brand colour, unless that is too dark to see here. */}
                    <SkillMark size="2.2rem" skill={s} tinted={!tooDark(skillIcon(s.icon)?.hex ?? "ffffff")} />
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        className="relative flex min-h-[100vh] flex-col justify-between px-[4vw] pb-[12vh] pt-[12vh]"
        id="contact"
        ref={contact}
        style={{ backgroundColor: BLOSSOM, color: BAND }}
      >
        <h2 className="font-serif-display text-[7rem] italic leading-[1] tracking-[-0.02em]">Write to me</h2>
        <a className="mt-[10vh] block font-sans text-[10.5rem] font-light leading-[1] tracking-[-0.04em] transition-opacity hover:opacity-70" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <ul className="mt-[10vh] flex flex-wrap gap-x-[6rem] gap-y-[2rem] border-t-[0.1rem] pt-[3rem]" style={{ borderColor: "rgba(42,13,30,0.3)" }}>
          {elsewhere.map((l) => (
            <li key={l.label}>
              <a className="flex items-baseline gap-[1.2rem] transition-opacity hover:opacity-60" href={l.href} rel="noreferrer" target="_blank">
                <span className="font-sans text-[2.3rem] font-medium">{l.label}</span>
                <span className="font-mono text-[1.35rem] opacity-70">{l.handle}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
