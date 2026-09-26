"use client";

import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent, type RefObject } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { Flip } from "gsap/Flip";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { education, experience, projects, skillGroups, type Skill } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(Draggable, Flip);

/**
 * 14 CHAIN. After brandonyasin.com: a neutral, quiet page where the work
 * is an index of rows, and a row opens as a full case study in place, right
 * under the index. Each case ends with "Next case", so the five projects
 * read as one chain that wraps round. Two of the reference's small
 * pleasures are kept: a live clock in the header that can be switched
 * between the places on the résumé, and a "Write to me" pill that can be
 * dragged anywhere and springs back to its corner.
 */
const GROUND = "#f5f4f1";
const INK = "#141414";
const ACCENT = "#8a5a3c";
const RULE = "rgba(20,20,20,0.14)";

/** The places the clock knows. Richmond Hill shares Toronto's zone; it is
 *  on the list because the robotics team is there, not for the time. */
const PLACES = [
  { city: "Toronto", org: "The Actually Company", zone: "America/Toronto" },
  { city: "San Francisco", org: "Founders, Inc.", zone: "America/Los_Angeles" },
  { city: "Richmond Hill", org: "STL Robotics", zone: "America/Toronto" },
] as const;

const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

/** How the work gets done, from the profile: sensors in, motion out, tests
 *  behind it. One sentence per stage, in the order the stages happen. */
const STAGES: [string, string][] = [
  ["Look", "Watch the machine before writing anything: what the sensors report, where the noise is, what the floor does to a wheel."],
  ["Model", "Put the motion in numbers: odometry, a filter over the IMU, a profile for the move. A wrong model is wrong code, sooner."],
  ["Prototype", "The smallest thing that closes the loop: a blaster streaming packets to a laptop, a phone swinging in a browser tab."],
  ["Build", "C++ where the answer has to arrive on time, Python and TypeScript round it. Mechanisms drawn in Fusion 360 before they are cut."],
  ["Tune", "Gains, thresholds and timings set against logs from the real machine. Deterministic pipelines with 150+ tests, so a tune stays tuned."],
  ["Ship", "Into hands: a match, a demo day, 200+ users. Then back to Look."],
];

const PILLARS: [string, string][] = [
  ["Real hardware", "An IMU in a Nerf blaster. VEX robots with a world-record autonomous routine and an 80th-place global Skills ranking among ~20,000 teams."],
  ["Real time", "Kalman-filtered motion streamed over UDP and decoded into mouse and keyboard events. Odometry, motion profiling and particle-filter localisation in C++."],
  ["Real users", "200+ active users and $1k MRR at The Actually Company, behind 150+ tests. Saturn, deployed to 40,000+ Discord users."],
];

const ALL_SKILLS = skillGroups.flatMap((g) => g.skills);

/** A project's stack entry as a Skill, so it can carry a mark. Exact name
 *  first, then a skill whose name starts with it ("ESP32" is listed as
 *  "ESP32 / ESP8266"), else letters cut from the name. */
function skillFor(name: string): Skill {
  const exact = ALL_SKILLS.find((s) => s.name === name);
  if (exact) return exact;
  const partial = ALL_SKILLS.find((s) => s.name.startsWith(name));
  if (partial) return { ...partial, name };
  const words = name.split(/\s+/);
  const mark = words.length > 1 ? words.map((w) => w[0]).join("").toUpperCase() : name.slice(0, 3).toUpperCase();
  return { name, mark, depth: 1 };
}

function groupSkills(label: string, names?: string[]): Skill[] {
  const g = skillGroups.find((x) => x.label === label);
  if (!g) return [];
  return names ? names.map((n) => g.skills.find((s) => s.name === n)).filter((s): s is Skill => Boolean(s)) : g.skills;
}

/** The five skill groups as seven areas, the way the reference lists
 *  services. The two big groups are split where they naturally split. */
const AREAS: { title: string; line: string; skills: Skill[] }[] = [
  { title: "Languages", line: skillGroups[0].blurb, skills: groupSkills("Languages") },
  {
    title: "Embedded firmware",
    line: "Microcontrollers and robot brains. The part of the stack that touches the floor.",
    skills: groupSkills("Embedded & robotics", ["ESP32 / ESP8266", "Arduino", "VEX V5", "PROS", "RTOS", "ROS"]),
  },
  {
    title: "Controls & localisation",
    line: "Sensors in, motion out: odometry, filters, motion profiles and the loop that closes them.",
    skills: groupSkills("Embedded & robotics", ["IMUs & sensor fusion", "Odometry", "Controls", "Motion profiling", "Particle filters"]),
  },
  {
    title: "Web & desktop",
    line: "The web when it has to talk to hardware, in a tab or in an Electron window.",
    skills: groupSkills("Software & networking", ["Node.js", "React", "Next.js", "Three.js", "Electron", "FastAPI", "Flask"]),
  },
  {
    title: "Networking",
    line: "The wire between the device and the program: sockets, packets, an API when one fits.",
    skills: groupSkills("Software & networking", ["WebSockets", "UDP", "REST"]),
  },
  { title: "Tooling & DevOps", line: skillGroups[3].blurb, skills: groupSkills("DevOps & tooling") },
  { title: "CAD & data", line: skillGroups[4].blurb, skills: groupSkills("CAD & data") },
];

type LenisLike = { scrollTo: (target: HTMLElement, options?: { offset?: number; duration?: number }) => void };

/** Brings a case heading to the top of the screen, under the two bars.
 *  Through Lenis when it is running; the plain jump honours the heading's
 *  scroll-margin the same way. */
function scrollToHeading(el: HTMLElement): void {
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (lenis) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    lenis.scrollTo(el, { offset: -7 * rem, duration: 1 });
  } else {
    el.scrollIntoView({ block: "start" });
  }
}

/** True once mounted, unless the visitor asked for reduced motion. False on
 *  the server, so the first paint is the still version and hydration agrees. */
function useMotion(): boolean {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return motion;
}

function Label({ children, className = "" }: { children: string; className?: string }): JSX.Element {
  return <span className={`font-mono text-[0.68rem] uppercase tracking-[0.22em] opacity-55 ${className}`}>{children}</span>;
}

/* ---------------------------------------------------------------- header */

function Clock({ place }: { place: number }): JSX.Element {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      second: "2-digit",
      timeZone: PLACES[place].zone,
    });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [place]);
  return (
    <span className="font-mono text-[0.78rem] uppercase tracking-[0.2em] tabular-nums">
      {PLACES[place].city} <span className="ml-[0.6em]">{time ?? "--:--:--"}</span>
    </span>
  );
}

function Strip(): JSX.Element {
  const [place, setPlace] = useState(0);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline border-b px-[3vw] py-[1rem]" style={{ borderColor: RULE }}>
      <span className="text-[0.85rem] font-medium">Kevin He</span>
      <div className="flex flex-col items-center gap-[0.3rem]">
        <Clock place={place} />
        <Label>{PLACES[place].org}</Label>
      </div>
      <button
        className="v14-link justify-self-end font-mono text-[0.68rem] uppercase tracking-[0.22em]"
        onClick={() => setPlace((p) => (p + 1) % PLACES.length)}
        type="button"
      >
        Time travel {"→"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- work */

function Case({
  i,
  headingRef,
  bodyRef,
  onNext,
  onClose,
}: {
  i: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  onNext: () => void;
  onClose: () => void;
}): JSX.Element {
  const p = projects[i];
  const next = projects[(i + 1) % projects.length];
  return (
    <article className="mt-[6vh] border-t pt-[3rem]" style={{ borderColor: RULE }}>
      <div className="flex items-baseline justify-between">
        <div className="flex gap-[2.4rem]">
          <Label>{`Case ${String(i + 1).padStart(2, "0")}`}</Label>
          <Label>{KIND[p.kind]}</Label>
          <Label>{p.year}</Label>
        </div>
        <button className="v14-link font-mono text-[0.68rem] uppercase tracking-[0.22em]" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <h2
        className="v14-heading mt-[1.6rem] w-fit text-[clamp(2.6rem,5vw,5.6rem)] font-medium leading-[1] tracking-[-0.03em]"
        data-flip-id={`v14-case-${i}`}
        ref={headingRef}
      >
        {p.title}
      </h2>
      <div ref={bodyRef}>
        <p className="mt-[1.6rem] max-w-[46ch] text-[1.2rem] leading-[1.45]">{p.tagline}</p>
        <ol className="mt-[4rem]">
          {p.bullets.map((b, k) => (
            <li className="grid grid-cols-[8rem_1fr] gap-x-[2rem] border-t py-[2rem]" key={b} style={{ borderColor: RULE }}>
              <span className="font-mono text-[1.4rem] tabular-nums" style={{ color: ACCENT }}>
                {String(k + 1).padStart(2, "0")}
              </span>
              <p className="max-w-[62ch] text-[1.05rem] leading-[1.55]">{b}</p>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-[8rem_1fr] gap-x-[2rem] border-t py-[2rem]" style={{ borderColor: RULE }}>
          <Label className="pt-[0.3rem]">Stack</Label>
          <ul className="flex flex-wrap gap-x-[2rem] gap-y-[1rem]">
            {p.stack.map((name) => {
              const s = skillFor(name);
              return (
                <li className="flex items-center gap-[0.6rem] text-[0.9rem]" key={name}>
                  <SkillMark onDark={false} size="1.3rem" skill={s} />
                  {name}
                </li>
              );
            })}
          </ul>
        </div>
        {p.award || p.href ? (
          <div className="grid grid-cols-[8rem_1fr] gap-x-[2rem] border-t py-[2rem] text-[0.9rem]" style={{ borderColor: RULE }}>
            <Label className="pt-[0.2rem]">Notes</Label>
            <div className="flex gap-[2.4rem]">
              {p.award ? <span>{p.award}</span> : null}
              {p.href ? (
                <a className="v14-link underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank" style={{ color: ACCENT }}>
                  Open {"↗"}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        <button className="v14-next group mt-[6vh] block w-full border-t pt-[2.4rem] text-left" onClick={onNext} style={{ borderColor: RULE }} type="button">
          <Label>Next case</Label>
          <span className="mt-[0.8rem] flex items-baseline gap-[1.2rem] text-[clamp(2.4rem,4.4vw,5rem)] font-medium leading-[1] tracking-[-0.03em]">
            <span className="v14-arrow" style={{ color: ACCENT }}>
              {"→"}
            </span>
            {next.title}
          </span>
        </button>
      </div>
    </article>
  );
}

function Work({ motion }: { motion: boolean }): JSX.Element {
  const [open, setOpen] = useState(-1);
  const titleRefs = useRef<(HTMLElement | null)[]>([]);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // What the next commit should Flip: the captured box, where it lands, and
  // which `open` value it belongs to. "case" is the case heading; a number
  // is that row's title, for closing. It is kept, not consumed, so a
  // StrictMode re-run of the effect below plays the same flip again.
  const pending = useRef<{ state: Flip.FlipState; to: "case" | number; forOpen: number } | null>(null);

  const go = (i: number) => {
    const from = titleRefs.current[i];
    pending.current = motion && from ? { state: Flip.getState(from), to: "case", forOpen: i } : null;
    setOpen(i);
  };
  const close = () => {
    pending.current = motion && headingRef.current ? { state: Flip.getState(headingRef.current), to: open, forOpen: -1 } : null;
    setOpen(-1);
  };

  // Runs after the case has been put in (or taken out of) the DOM and before
  // it paints, so the heading can start at the row's box and travel to its
  // own. Cleaned up on the next change too, so a quick Next, Next does not
  // stack two flips on one heading.
  useLayoutEffect(() => {
    const p = pending.current;
    if (open >= 0 && headingRef.current) scrollToHeading(headingRef.current);
    if (!p || p.forOpen !== open) return undefined;
    const target = p.to === "case" ? headingRef.current : titleRefs.current[p.to];
    if (!target) return undefined;
    const ctx = gsap.context(() => {
      Flip.from(p.state, { targets: target, duration: 0.6, ease: "power3.inOut", scale: true });
      if (p.to === "case" && bodyRef.current) {
        gsap.fromTo(bodyRef.current, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.3, ease: "power3.out" });
      }
    });
    return () => ctx.revert();
  }, [open]);

  return (
    <section className="px-[3vw] py-[10vh]" id="work">
      <div className="flex items-baseline justify-between" data-reveal>
        <Label>Work</Label>
        <Label>{`${projects.length} cases`}</Label>
      </div>
      <ol className="mt-[1.4rem] border-b" style={{ borderColor: RULE }}>
        {projects.map((p, i) => (
          <li className="border-t" data-reveal key={p.title} style={{ borderColor: RULE }}>
            <button
              aria-expanded={open === i}
              className="v14-row grid w-full grid-cols-[3rem_1fr_auto_auto] items-baseline gap-x-[2rem] py-[1.5rem] text-left"
              onClick={() => (open === i ? close() : go(i))}
              type="button"
            >
              <span className="font-mono text-[0.72rem] tabular-nums opacity-45">{String(i + 1).padStart(2, "0")}</span>
              <span
                className="w-fit text-[clamp(1.5rem,2.3vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.02em]"
                data-flip-id={`v14-case-${i}`}
                ref={(el) => {
                  titleRefs.current[i] = el;
                }}
                style={{ visibility: open === i ? "hidden" : undefined }}
              >
                {p.title}
              </span>
              <span className="w-[8rem] font-mono text-[0.72rem] uppercase tracking-[0.2em] opacity-55">{KIND[p.kind]}</span>
              <span className="w-[6rem] text-right font-mono text-[0.72rem] tabular-nums opacity-55">{p.year}</span>
            </button>
          </li>
        ))}
      </ol>
      {open >= 0 ? (
        <Case bodyRef={bodyRef} headingRef={headingRef} i={open} onClose={close} onNext={() => go((open + 1) % projects.length)} />
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- pill */

function Pill({ motion }: { motion: boolean }): JSX.Element {
  const ref = useRef<HTMLButtonElement | null>(null);
  const mailto = `mailto:${EMAIL}`;

  useEffect(() => {
    const el = ref.current;
    if (!motion || !el) return undefined;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    // Rotation follows the drag's horizontal speed, a few degrees either
    // way, so the pill feels held rather than glued to the pointer.
    const rot = gsap.quickTo(el, "rotation", { duration: 0.3, ease: "power2.out" });
    let sx = 0;
    let sy = 0;
    let dragged = false;
    const [d] = Draggable.create(el, {
      type: "x,y",
      inertia: false,
      onPress() {
        // Only the spring-back. The rotation quickTo owns its own tween and
        // stops working if it is killed under it.
        gsap.killTweensOf(el, "x,y");
        sx = d.x;
        sy = d.y;
        dragged = false;
        // The pill is fixed, so its box is in viewport coordinates while
        // `bounds: window` would be in document ones; after a scroll the two
        // disagree by scrollY and the pill would be clamped off screen. The
        // limits are worked out here, in the pill's own x/y, from where it
        // rests (its box less whatever travel it is mid-way through).
        const r = el.getBoundingClientRect();
        const left = r.left - d.x;
        const top = r.top - d.y;
        d.applyBounds({ minX: -left, maxX: window.innerWidth - left - r.width, minY: -top, maxY: window.innerHeight - top - r.height });
      },
      onDragStart() {
        dragged = true;
      },
      onDrag() {
        rot(gsap.utils.clamp(-4, 4, d.deltaX * 0.4));
      },
      onRelease() {
        rot(0);
        // A press that never became a drag and barely moved is a click, and
        // the pill is a mail link. (isDragging is already false here.)
        const moved = Math.hypot(d.x - sx, d.y - sy);
        if (!dragged && moved < 0.3 * rem) window.location.href = mailto;
        gsap.to(el, { x: 0, y: 0, rotation: 0, duration: 0.9, ease: "elastic.out(1, 0.45)" });
      },
    });
    return () => {
      d.kill();
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: "transform" });
    };
  }, [motion, mailto]);

  const cls =
    "v14-pill fixed bottom-[2.4rem] right-[3vw] z-30 flex items-center gap-[0.8rem] rounded-full px-[1.6rem] py-[0.9rem] text-[0.85rem] font-medium";
  if (!motion) {
    return (
      <a className={cls} href={mailto} style={{ backgroundColor: INK, color: GROUND }}>
        <span className="block h-[0.5rem] w-[0.5rem] rounded-full" style={{ backgroundColor: ACCENT }} />
        Write to me
      </a>
    );
  }
  return (
    <button
      aria-label={`Write to me, ${EMAIL}`}
      className={cls}
      // Draggable handles the pointer. This is for Enter and Space on the
      // focused pill, which arrive as clicks with no pointer behind them.
      onClick={(e: MouseEvent) => {
        if (e.detail === 0) window.location.href = mailto;
      }}
      ref={ref}
      style={{ backgroundColor: INK, color: GROUND }}
      type="button"
    >
      <span className="block h-[0.5rem] w-[0.5rem] rounded-full" style={{ backgroundColor: ACCENT }} />
      Write to me
    </button>
  );
}

/* ---------------------------------------------------------------- page */

export default function V14(): JSX.Element {
  const motion = useMotion();
  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={14}>
      <style>{`
        .v14-link { opacity: 0.7; transition: opacity 0.25s ease, color 0.25s ease; }
        .v14-link:hover { opacity: 1; color: ${ACCENT}; }
        .v14-row { transition: color 0.3s ease; }
        .v14-row:hover { color: ${ACCENT}; }
        .v14-heading { scroll-margin-top: 7rem; }
        .v14-mail { transition: color 0.25s ease; }
        .v14-mail:hover { color: ${ACCENT}; }
        .v14-arrow { display: inline-block; transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
        .v14-next:hover .v14-arrow { transform: translateX(0.4em); }
        .v14-pill { touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; box-shadow: 0 0.6rem 2rem rgba(20,20,20,0.18); will-change: transform; }
        .v14-pill:active { cursor: grabbing; }
        .v14-stage { transition: border-color 0.3s ease; }
        .v14-stage:hover { border-color: ${ACCENT} !important; }
        @media (prefers-reduced-motion: reduce) {
          .v14-link, .v14-mail, .v14-row, .v14-arrow, .v14-stage { transition: none; }
          .v14-pill { cursor: pointer; }
        }
      `}</style>

      <Strip />

      <section className="px-[3vw] pb-[10vh] pt-[16vh]">
        <Label>Kevin He, Toronto</Label>
        <h1 className="mt-[1.6rem] max-w-[13ch] font-serif-display text-[clamp(3.4rem,6vw,7rem)] leading-[1] tracking-[-0.02em]" data-reveal>
          I build robots and the software that drives them.
        </h1>
        <p className="mt-[2.6rem] max-w-[42ch] text-[1.05rem] leading-[1.5] opacity-80" data-reveal>
          Computer engineering at the University of Toronto, co{"‑"}founder and CTO of The Actually Company, and
          lead programmer of VEX team 82855Z. Firmware, controls and the web on top of them.
        </p>
      </section>

      <Work motion={motion} />

      <section className="px-[3vw] py-[10vh]" id="info">
        <div className="flex items-baseline justify-between" data-reveal>
          <Label>Info</Label>
          <Label>How a project goes</Label>
        </div>
        <ol className="mt-[1.4rem] grid grid-cols-6 gap-[1.2rem]">
          {STAGES.map(([name, line], i) => (
            <li className="v14-stage border-t pt-[1.2rem]" data-reveal key={name} style={{ borderColor: RULE }}>
              <span className="font-mono text-[0.72rem] tabular-nums" style={{ color: ACCENT }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-[1.6rem] text-[1.5rem] font-medium leading-[1.05] tracking-[-0.02em]">{name}</p>
              <p className="mt-[0.9rem] text-[0.88rem] leading-[1.5] opacity-75">{line}</p>
            </li>
          ))}
        </ol>

        <div className="mt-[12vh] grid grid-cols-3 gap-[3vw]">
          {PILLARS.map(([title, fact]) => (
            <div className="border-t pt-[1.4rem]" data-reveal key={title} style={{ borderColor: RULE }}>
              <p className="text-[clamp(1.8rem,2.6vw,3rem)] font-medium leading-[1] tracking-[-0.03em]">{title}</p>
              <p className="mt-[1.4rem] max-w-[36ch] text-[0.95rem] leading-[1.5] opacity-75">{fact}</p>
            </div>
          ))}
        </div>

        <div className="mt-[12vh]">
          <Label>Experience</Label>
          <ol className="mt-[1.4rem] border-b" style={{ borderColor: RULE }}>
            {experience.map((e) => (
              <li className="grid grid-cols-[1fr_1fr_1fr] gap-x-[3vw] border-t py-[1.8rem]" data-reveal key={e.org} style={{ borderColor: RULE }}>
                <div>
                  <p className="text-[1.3rem] font-medium leading-[1.1] tracking-[-0.02em]">{e.org}</p>
                  <p className="mt-[0.5rem] text-[0.85rem] opacity-70">
                    {e.role}, {e.where}
                  </p>
                </div>
                <ul className="space-y-[0.5rem] text-[0.88rem] leading-[1.5] opacity-80">
                  {e.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <Label className="justify-self-end tabular-nums">{e.when}</Label>
              </li>
            ))}
            <li className="grid grid-cols-[1fr_1fr_1fr] gap-x-[3vw] border-t py-[1.8rem]" data-reveal style={{ borderColor: RULE }}>
              <p className="text-[1.3rem] font-medium leading-[1.1] tracking-[-0.02em]">{education.school}</p>
              <p className="text-[0.88rem] leading-[1.5] opacity-80">{education.degree}</p>
              <Label className="justify-self-end tabular-nums">{education.when}</Label>
            </li>
          </ol>
        </div>
      </section>

      <section className="px-[3vw] py-[10vh]" id="skills">
        <div className="flex items-baseline justify-between" data-reveal>
          <Label>Skills</Label>
          <Label>{`${AREAS.length} areas`}</Label>
        </div>
        <ol className="mt-[1.4rem] grid grid-cols-3 gap-x-[3vw] gap-y-[4rem]">
          {AREAS.map((a, i) => (
            <li className="border-t pt-[1.4rem]" data-reveal key={a.title} style={{ borderColor: RULE }}>
              <div className="flex items-baseline gap-[1.2rem]">
                <span className="font-mono text-[0.72rem] tabular-nums" style={{ color: ACCENT }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[1.5rem] font-medium leading-[1.05] tracking-[-0.02em]">{a.title}</p>
              </div>
              <p className="mt-[0.9rem] max-w-[40ch] text-[0.88rem] leading-[1.5] opacity-70">{a.line}</p>
              <ul className="mt-[1.4rem] flex flex-wrap gap-x-[1.4rem] gap-y-[0.8rem]">
                {a.skills.map((s) => (
                  <li className="flex items-center gap-[0.5rem] text-[0.85rem]" key={s.name}>
                    <SkillMark onDark={false} size="1.1rem" skill={s} />
                    {s.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-[3vw] pb-[14vh] pt-[10vh]" id="contact">
        <Label>Contact</Label>
        <a
          className="v14-mail mt-[1.4rem] block w-fit text-[clamp(2.4rem,5vw,5.8rem)] font-medium leading-[1] tracking-[-0.04em]"
          data-reveal
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <div className="mt-[2.4rem] flex gap-[2.4rem]" data-reveal>
          {elsewhere.map((l) => (
            <a className="v14-link font-mono text-[0.72rem] uppercase tracking-[0.22em]" href={l.href} key={l.label} rel="noreferrer" target="_blank">
              {l.label}
            </a>
          ))}
        </div>
      </section>

      <Pill motion={motion} />
    </VariantShell>
  );
}
