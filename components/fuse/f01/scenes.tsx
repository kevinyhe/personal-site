"use client";

import { type JSX, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { projects } from "@/components/profile";
import { EMAIL } from "@/components/siteContent";
import { TIMELINE } from "./content";
import { Arrow, Chevron, FOCUS, Org, SceneLink } from "./parts";

/**
 * The words under the name on each of the four scenes, in lanceyan's
 * terse first person. The name row and the links are drawn by index.tsx;
 * these are the paragraphs, the timeline and the work list between them.
 */

const P = "max-w-[57.6rem]";

/** lukebaffait's tiny bracketed number, set beside a lead line. */
function Count({ n }: { n: number }): JSX.Element {
  return <span className="ml-[0.5em] align-[0.5em] font-sans text-[0.55em] tabular-nums text-white/50">({String(n).padStart(2, "0")})</span>;
}

/** 01: who I am. */
export function Intro({ go }: { go: (n: number) => void }): JSX.Element {
  return (
    <div className="space-y-[max(2.4rem,18px)]">
      <p className={P}>
        I&rsquo;m the co&#8209;founder and CTO of <Org href="https://theactually.company" mark="A">The Actually Company</Org>, a local&#8209;first AI speaking coach. This summer I was
        one of 100 builders picked from 10,000+ applicants for <Org mark="F">Founders, Inc.</Org>, and built it in San Francisco.
      </p>
      <p className={P}>
        I study computer engineering at <Org mark="UT">the University of Toronto</Org>. I&rsquo;m president of <Org mark="S">STL Robotics</Org>, where I&rsquo;ve been captain and
        lead programmer of VEX team 82855Z since 2022. I was a finalist at <Org mark="H">Hack The North</Org> and first overall at <Org mark="E">EurekaHacks</Org>.
      </p>
      <p className="max-w-[54.4rem] border-l border-white/30 pl-[max(1.6rem,14px)] italic text-white/90">&ldquo;I build systems that bring ideas to life.&rdquo;</p>
      <p className={P}>
        Most of what I&rsquo;ve built is in <SceneLink go={go} to={2}>my work</SceneLink>. The rest is in{" "}
        <SceneLink go={go} to={1}>a rough timeline</SceneLink>.
      </p>
    </div>
  );
}

/** One row that opens to its facts: lanceyan's timeline row, reused by
 *  the work list. */
function Row({
  id,
  open,
  onToggle,
  left,
  title,
  titleClass,
  children,
  onActive,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  left: ReactNode;
  title: ReactNode;
  titleClass?: string;
  children: ReactNode;
  onActive?: () => void;
}): JSX.Element {
  return (
    <li className="border-b border-white/15" onMouseEnter={onActive}>
      <button
        aria-controls={`${id}-body`}
        aria-expanded={open}
        className={`grid min-h-[44px] w-full grid-cols-[max(9.6rem,64px)_1fr_auto] items-baseline gap-x-[max(1.6rem,12px)] py-[max(1.2rem,10px)] text-left ${FOCUS}`}
        id={`${id}-head`}
        onClick={onToggle}
        onFocus={onActive}
        type="button"
      >
        <span className="text-white/50">{left}</span>
        <span className={titleClass ?? "text-white"}>{title}</span>
        <span className="self-center">
          <Chevron open={open} />
        </span>
      </button>
      <div
        aria-labelledby={`${id}-head`}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        id={`${id}-body`}
        role="region"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        {/* The clip is for the closed state only; the padding inside keeps
            descenders and the last line clear of it when open. */}
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="pb-[max(1.6rem,12px)] pl-[calc(max(9.6rem,64px)+max(1.6rem,12px))]">{children}</div>
        </div>
      </div>
    </li>
  );
}

/** 02: the timeline, by year. One row open at a time, as lanceyan's. */
export function Timeline(): JSX.Element {
  const [open, setOpen] = useState<number>(-1);
  return (
    <div>
      <p className={P}>
        Here&rsquo;s a rough timeline of what I&rsquo;ve done so far:
        <Count n={TIMELINE.length} />
      </p>
      <ul className="mt-[max(2.4rem,16px)] max-w-[64rem] border-t border-white/15 text-[0.92em]">
        {TIMELINE.map((y, i) => (
          <Row id={`f01-year-${i}`} key={`${y.when}-${y.title}`} left={y.when} onToggle={() => setOpen((o) => (o === i ? -1 : i))} open={open === i} title={y.title}>
            <ul className="space-y-[0.35em] text-[0.88em] leading-[1.55] text-white/60">
              {y.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Row>
        ))}
      </ul>
    </div>
  );
}

/**
 * 03: the work, in place of lanceyan's books. Each row opens to its line,
 * its award, its stack and its links. The row you are on (hovered,
 * focused or opened) is white and the others dim, as on lukebaffait's
 * index, and a brush stroke in rose swings through it; the dotted picture
 * behind changes to that project.
 */
export function Work({ active, onActive, reduced }: { active: number; onActive: (i: number) => void; reduced: boolean }): JSX.Element {
  const [open, setOpen] = useState<number>(-1);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [mark, setMark] = useState<{ top: number; h: number } | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const row = list?.children[active] as HTMLElement | undefined;
    const head = row?.querySelector("button");
    if (!list || !row || !head) return;
    setMark({ top: row.offsetTop + head.offsetHeight / 2, h: head.offsetHeight });
  }, [active]);

  useLayoutEffect(measure, [measure, open]);
  useEffect(() => {
    // Rows open with a 300 ms transition; measure again once they settle.
    const id = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [measure, open]);

  return (
    <div>
      <p className={P}>
        A few things I&rsquo;ve built:
        <Count n={projects.length} />
      </p>
      <div className="relative mt-[max(2.4rem,16px)] max-w-[64rem]">
        {mark && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute right-[30%] z-0 w-[max(7.2rem,48px)] overflow-visible transition-[top] duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] motion-reduce:transition-none"
            style={{ top: mark.top - mark.h * 1.6, height: mark.h * 3.2 }}
            viewBox="0 0 60 200"
            preserveAspectRatio="none"
          >
            <path
              className={reduced ? "" : "f01-brush"}
              d="M8 6 C 46 34, 58 96, 44 150 S 22 192, 18 194"
              fill="none"
              key={active}
              opacity="0.9"
              pathLength={1}
              stroke="#b8174f"
              strokeDasharray="1"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: "max(1.8rem, 12px)" }}
            />
          </svg>
        )}
        <ul className="relative z-10 border-t border-white/15" ref={listRef}>
          {projects.map((p, i) => {
            const on = i === active;
            const links = [
              p.href ? { label: p.href.includes("devpost") ? "devpost" : "visit", href: p.href } : null,
              p.code ? { label: "code", href: p.code } : null,
            ].filter((l): l is { label: string; href: string } => Boolean(l));
            return (
              <Row
                id={`f01-work-${i}`}
                key={p.title}
                left={<span className="font-sans text-[0.72em] tabular-nums">({String(i + 1).padStart(2, "0")})</span>}
                onActive={() => onActive(i)}
                onToggle={() => {
                  onActive(i);
                  setOpen((o) => (o === i ? -1 : i));
                }}
                open={open === i}
                title={
                  <span className="flex flex-wrap items-baseline justify-between gap-x-[1em]">
                    <span className={`text-[1.22em] leading-[1.25] transition-colors duration-300 ${on ? "text-white" : "text-white/45"}`}>{p.title}</span>
                    <span className="font-sans text-[0.72em] tabular-nums text-white/50">{p.year}</span>
                  </span>
                }
              >
                <div className="space-y-[0.35em] text-[0.88em] leading-[1.55] text-white/60">
                  <p className="text-white/80">{p.tagline}</p>
                  {p.award && <p>{p.award}</p>}
                  {!p.href && p.bullets[0] && <p>{p.bullets[0]}</p>}
                  <p>{p.stack.join(" · ")}</p>
                  {links.length > 0 && (
                    <p className="flex flex-wrap gap-x-[1.4em] pt-[0.2em]">
                      {links.map((l) => (
                        <a
                          className={`inline-flex min-h-[32px] items-center gap-[0.35em] text-white/80 underline decoration-white/40 underline-offset-[0.3em] hover:text-white ${FOCUS}`}
                          href={l.href}
                          key={l.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {l.label}
                          <Arrow className="h-[0.9em] w-[0.9em] -rotate-45" />
                        </a>
                      ))}
                    </p>
                  )}
                </div>
              </Row>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** 04: how to reach me, under the night peak. */
export function Contact(): JSX.Element {
  return (
    <div className="space-y-[max(2.4rem,18px)]">
      <p className={P}>
        Email is the best way to reach me:{" "}
        <a className={`text-white [overflow-wrap:anywhere] underline decoration-white/35 underline-offset-[0.25em] hover:decoration-white ${FOCUS}`} href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        .
      </p>
      <p className={P}>
        I&rsquo;m in Toronto, studying at <Org mark="UT">the University of Toronto</Org> and building <Org href="https://theactually.company" mark="A">The Actually Company</Org>.
      </p>
    </div>
  );
}
