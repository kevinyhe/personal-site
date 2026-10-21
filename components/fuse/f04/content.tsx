"use client";

import { type JSX, type ReactNode, useId, useState } from "react";

import { projects, type Project } from "@/components/profile";
import { EMAIL } from "@/components/siteContent";

import s from "./f04.module.css";

/**
 * What the television says on each channel, in lanceyan.com's voice: short
 * first-person paragraphs, organisations named inline after a tiny mark,
 * a timeline whose rows open, a list, a ruled quote. Every fact is from the
 * résumé (and components/profile, which is drawn from it). Years, not ages.
 */

export const CHANNELS = ["About", "Timeline", "Work", "Contact"] as const;

/** A tiny square with one letter, standing in for an organisation's logo. */
function Mark({ letter, bg, fg }: { letter: string; bg: string; fg: string }): JSX.Element {
  return (
    <span aria-hidden="true" className={s.mark} style={{ background: bg, color: fg }}>
      {letter}
    </span>
  );
}

/** An organisation named inline, after its mark. The mark and the first
 *  word never part at a line end. */
function Org({ letter, bg, fg, children }: { letter: string; bg: string; fg: string; children: string }): JSX.Element {
  const cut = children.indexOf(" ");
  const head = cut < 0 ? children : children.slice(0, cut);
  const rest = cut < 0 ? "" : children.slice(cut);
  return (
    <span className={s.org}>
      <span className={s.orgHead}>
        <Mark bg={bg} fg={fg} letter={letter} />
        {head}
      </span>
      {rest}
    </span>
  );
}

/** A phrase that changes channel, underlined like lanceyan's. An anchor
 *  rather than a button so it wraps with the sentence. */
function Tune({ to, onTune, children }: { to: number; onTune: (ch: number) => void; children: ReactNode }): JSX.Element {
  return (
    <a
      className={s.inline}
      href={`#channel-${to + 1}`}
      onClick={(e) => {
        e.preventDefault();
        onTune(to);
      }}
    >
      {children}
    </a>
  );
}

export function About({ onTune }: { onTune: (ch: number) => void }): JSX.Element {
  return (
    <div className={s.prose}>
      <p>
        I&rsquo;m the co-founder and CTO of{" "}
        <Org bg="#f9b9dc" fg="#2a0d1e" letter="A">
          The Actually Company
        </Org>
        , a local-first AI speaking coach. I spent the summer building it in San Francisco at{" "}
        <Org bg="#fffafc" fg="#1a0812" letter="F">
          Founders, Inc.
        </Org>{" "}
        as one of 100 builders picked from 10K+ applicants.
      </p>
      <p>
        I study computer engineering at{" "}
        <Org bg="#1e3765" fg="#fffafc" letter="U">
          the University of Toronto
        </Org>
        , and I&rsquo;m president of{" "}
        <Org bg="#b8174f" fg="#fffafc" letter="S">
          STL Robotics
        </Org>
        , where I&rsquo;ve been lead programmer for VEX team 82855Z since 2022.
      </p>
      <p>
        I build systems that bring ideas to life. Here&rsquo;s{" "}
        <Tune onTune={onTune} to={1}>
          what I&rsquo;ve done so far
        </Tune>
        ,{" "}
        <Tune onTune={onTune} to={2}>
          what I&rsquo;ve built
        </Tune>
        , and{" "}
        <Tune onTune={onTune} to={3}>
          where to find me
        </Tune>
        .
      </p>
    </div>
  );
}

type Row = { when: string; title: string; lines: string[] };

const TIMELINE: Row[] = [
  {
    when: "Now",
    title: "Present",
    lines: [
      "Studying computer engineering at the University of Toronto, BASc and PEY Co-op, expected 2031",
      "Co-founder and CTO of The Actually Company",
      "President of STL Robotics",
    ],
  },
  {
    when: "2026",
    title: "Founders, Inc. Off Season II",
    lines: ["One of 100 builders picked from 10K+ applicants", "Built the product in San Francisco from June to August, on $50,000 in credits"],
  },
  {
    when: "2026",
    title: "Co-founded The Actually Company",
    lines: [
      "A local-first AI speaking coach: record a pitch, get timestamped notes on filler words, pacing, delivery, posture and gestures",
      "Next.js, React, Electron, FastAPI, FFmpeg, faster-whisper and MediaPipe, with 150+ automated tests",
      "$1k MRR, 200+ active users",
    ],
  },
  {
    when: "2026",
    title: "Won EurekaHacks",
    lines: ["1st overall with King of the Ring", "A boxing game played by swinging your phone: punches, blocks and dodges read from its motion sensors"],
  },
  {
    when: "2026",
    title: "Graduated high school",
    lines: ["St. Theresa of Lisieux Catholic High School, Richmond Hill", "4.0/4.0 GPA, Advanced Placement, Honour Roll"],
  },
  {
    when: "2025",
    title: "Hack the North finalist",
    lines: ["S-KBD67: a Nerf blaster wired into a first-person shooter, with an IMU, Kalman filtering and UDP", "One of 12 finalists from 1,200+ hackers"],
  },
  {
    when: "2025",
    title: "Became president of STL Robotics",
    lines: [
      "56 members and a $140,000 annual budget",
      "Mentored six teams to six Provincial and four World Championship qualifications",
      "Founded a free robotics outreach program",
      "2025 Ontario Provincial Build Award",
    ],
  },
  {
    when: "2022",
    title: "Joined VEX team 82855Z",
    lines: [
      "Team captain and lead programmer",
      "C++ controls: odometry, feedback control, motion profiling, particle-filter localisation",
      "Contributed to a VEX High Stakes world-record autonomous routine; 80th in global Skills of about 20,000 teams",
    ],
  },
  {
    when: "2021",
    title: "Built Saturn",
    lines: ["A Discord bot for moderation, logging and server management", "Used by 40,000+ people across several communities"],
  },
];

export function Timeline(): JSX.Element {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const id = useId();
  const toggle = (i: number): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div>
      <p className={s.lead}>Here&rsquo;s a rough timeline of what I&rsquo;ve done so far:</p>
      <ol className={s.rows}>
        {TIMELINE.map((r, i) => {
          const isOpen = open.has(i);
          const panel = `${id}-row-${i}`;
          return (
            <li className={s.row} key={`${r.when}-${r.title}`}>
              <button aria-controls={panel} aria-expanded={isOpen} className={s.rowHead} onClick={() => toggle(i)} type="button">
                <span className={s.when}>{r.when}</span>
                <span className={s.what}>{r.title}</span>
                <svg aria-hidden="true" className={s.chev} data-open={isOpen} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div aria-hidden={!isOpen} className={s.rowBody} data-open={isOpen} id={panel}>
                <div>
                  <div className={s.rowPad}>
                    {r.lines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const byTitle = (t: string): Project | undefined => projects.find((p) => p.title.replace(/‑/g, "-") === t);

/** The work list, newest first, with a short note on each. */
type WorkItem = { project: Project; note: string };

const WORK_NOTES: [string, string][] = [
  ["The Actually Company", "co-founder and CTO"],
  ["King of the Ring", "1st overall, EurekaHacks"],
  ["S-KBD67", "finalist, Hack the North"],
  ["mclib", "VEX V5 controls library"],
  ["Saturn", "Discord bot"],
];

export const WORK: WorkItem[] = WORK_NOTES.flatMap(([t, note]) => {
  const project = byTitle(t);
  return project ? [{ project, note }] : [];
});

export function Work({ active, onPick }: { active: number; onPick: (i: number) => void }): JSX.Element {
  const shown = WORK[active]?.project;
  return (
    <div>
      <p className={s.lead}>A few things I&rsquo;ve built:</p>
      <ul className={s.list}>
        {WORK.map((w, i) => {
          const title = w.project.title.replace(/‑/g, "-");
          const body = (
            <>
              <span className={s.itemTitle}>{title}</span>
              <span className={s.itemNote}>
                {" "}
                &mdash; {w.note}, {w.project.year}
              </span>
            </>
          );
          const common = {
            className: s.item,
            "data-active": i === active,
            onFocus: () => onPick(i),
            onMouseEnter: () => onPick(i),
          };
          return (
            <li key={w.project.title}>
              {w.project.href ? (
                <a {...common} href={w.project.href} rel="noreferrer" target="_blank">
                  {body}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <button {...common} onClick={() => onPick(i)} type="button">
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shown ? <p className={s.caption}>{shown.tagline}</p> : null}
    </div>
  );
}

export function Contact(): JSX.Element {
  return (
    <div className={s.prose}>
      <p>I&rsquo;m based in Toronto. What I keep coming back to:</p>
      <blockquote className={s.quote}>&ldquo;I build systems that bring ideas to life.&rdquo;</blockquote>
      <p>
        Write to me at{" "}
        <a className={s.inline} href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
