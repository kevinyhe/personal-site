"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups, type SkillGroup } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(ScrollTrigger);

/**
 * 07 HUD, after danielkiss.hu. Black ground, caps sans for the headings,
 * mono for every number, one pink accent. A numbered anchor list under the
 * bar (01 Introduce … 05 Contact), a poster tagline that scrambles once on
 * load, projects one at a time behind prev/next, and the move the page is
 * named for: a fixed readout in the bottom-left corner that never hides —
 * `x:0000 y:0000 p:001% s:work` — the cursor, the scroll progress and the
 * section under it, live.
 */
const GROUND = "#0b0b0b";
const INK = "#f2f2f2";
const ACCENT = "#f9b9dc";
const LINE = "rgba(242,242,242,0.14)";

const TAGLINE = ["I WRITE SOFTWARE", "FOR THINGS THAT MOVE"];

/** The reference's five stops. Awards is a block inside #info's tail. */
const NAV = [
  { n: "01", label: "Introduce", id: "info" },
  { n: "02", label: "Skills", id: "skills" },
  { n: "03", label: "Works", id: "work" },
  { n: "04", label: "Awards", id: "awards" },
  { n: "05", label: "Contact", id: "contact" },
] as const;

type SectionId = (typeof NAV)[number]["id"];

/** The skill groups in the order the page numbers them. */
const SKILL_ORDER = ["Embedded & robotics", "Software & networking", "DevOps & tooling", "Languages", "CAD & data"];

const pad = (n: number, width: number) => String(Math.max(0, Math.min(n, 10 ** width - 1))).padStart(width, "0");
const two = (n: number) => String(n).padStart(2, "0");
const yearOf = (when: string) => when.match(/\d{4}/)?.[0] ?? "";

/** Random characters the tagline flickers through before it settles. */
const POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/&";

function Label({ children, className = "" }: { children: string; className?: string }): JSX.Element {
  return (
    <span className={`font-mono text-[0.72rem] uppercase tracking-[0.16em] ${className}`} style={{ color: ACCENT }}>
      {children}
    </span>
  );
}

function Head({ n, children }: { n: string; children: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-[1.2rem]" data-reveal>
      <Label>{n}</Label>
      <h2 className="text-[clamp(1.8rem,3.4vw,3.8rem)] font-bold uppercase leading-none tracking-[-0.02em]">{children}</h2>
    </div>
  );
}

export default function V07(): JSX.Element {
  const heroRef = useRef<HTMLHeadingElement | null>(null);
  const xRef = useRef<HTMLSpanElement | null>(null);
  const yRef = useRef<HTMLSpanElement | null>(null);
  const pRef = useRef<HTMLSpanElement | null>(null);
  const sRef = useRef<HTMLSpanElement | null>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<SectionId | null>(null);
  const [idx, setIdx] = useState(0);
  const dirRef = useRef(1);
  const shownIdx = useRef(0);

  const toolCount = skillGroups.reduce((n, g) => n + g.skills.length, 0);
  const groups = SKILL_ORDER.map((label) => skillGroups.find((g) => g.label === label)).filter((g): g is SkillGroup => g !== undefined);
  // The career as a row of stops in the résumé's order reversed, the degree last.
  const stops = [...experience]
    .reverse()
    .map((e) => ({ year: yearOf(e.when), org: e.org.split(",")[0], role: e.role.split(";")[0] }))
    .concat({ year: yearOf(education.when), org: education.school.replace("University of Toronto", "U of T"), role: education.degree.split(",")[1]?.trim() ?? "" });

  const step = useCallback((dir: 1 | -1) => {
    dirRef.current = dir;
    setIdx((i) => (i + dir + projects.length) % projects.length);
  }, []);

  // The tagline's letters flicker through random characters once, each for
  // 40–120 ms, all inside the first 0.6 s. Written straight to the spans;
  // React never sees the intermediate characters.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const plan = Array.from(hero.querySelectorAll<HTMLElement>("[data-v07-glyph]"))
      .map((el) => {
        const start = Math.random() * 480;
        return { el, real: el.textContent ?? "", start, end: start + 40 + Math.random() * 80 };
      })
      .filter((g) => g.real.trim() !== "");
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - t0;
      let live = false;
      for (const g of plan) {
        if (t < g.start) {
          live = true;
        } else if (t < g.end) {
          g.el.textContent = POOL[Math.floor(Math.random() * POOL.length)];
          live = true;
        } else if (g.el.textContent !== g.real) {
          g.el.textContent = g.real;
        }
      }
      frame = live ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      plan.forEach((g) => {
        g.el.textContent = g.real;
      });
    };
  }, []);

  // The readout. Cursor from mousemove, one write per frame; progress from
  // one ScrollTrigger over the whole document; section from an observer
  // over the sections, the most visible one winning. It is information,
  // so it keeps updating under reduced motion too — there is nothing here
  // to tween.
  useEffect(() => {
    let mx = 0;
    let my = 0;
    let frame = 0;
    const write = () => {
      frame = 0;
      if (xRef.current) xRef.current.textContent = pad(mx, 4);
      if (yRef.current) yRef.current.textContent = pad(my, 4);
    };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!frame) frame = requestAnimationFrame(write);
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          if (pRef.current) pRef.current.textContent = pad(Math.round(self.progress * 100), 3);
        },
      });
    });

    const seen = new Map<HTMLElement, number>();
    let current: SectionId | "intro" | null = null;
    const apply = (id: SectionId | "intro") => {
      if (id === current) return;
      current = id;
      // Awards sits inside Introduce; the readout names the section.
      if (sRef.current) sRef.current.textContent = id === "awards" ? "info" : id;
      setActive(id === "intro" ? null : id);
    };
    const pick = () => {
      let best: HTMLElement | null = null;
      let bestRatio = -1;
      // Ties go to the later entry: the one that came into view last.
      for (const [el, ratio] of seen) {
        if (ratio >= bestRatio) {
          best = el;
          bestRatio = ratio;
        }
      }
      if (best) apply(best.id as SectionId);
      else if (window.scrollY < window.innerHeight * 0.5) apply("intro");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            seen.delete(el);
            seen.set(el, entry.intersectionRatio);
          } else {
            seen.delete(el);
          }
        });
        pick();
      },
      // 0.3 is the floor; the steps above it keep each ratio fresh while a
      // section stays in view, so "most visible" is measured, not remembered.
      { threshold: [0.3, 0.5, 0.7, 0.9, 1] },
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    apply("intro");

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
      ctx.revert();
      observer.disconnect();
    };
  }, []);

  // Left and right arrows page the works, like the buttons, while the
  // works are on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const box = sectionRefs.current.work?.getBoundingClientRect();
      if (!box || box.bottom < 0 || box.top > window.innerHeight) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // A new project slides in from the side it was paged from. Not on the
  // first render (the ref, not a flag: StrictMode runs this twice), and not
  // under reduced motion. The panels differ in height, so the page's end
  // moves and the progress readout is re-measured.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || shownIdx.current === idx) return undefined;
    shownIdx.current = idx;
    ScrollTrigger.refresh();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const tween = gsap.fromTo(
      panel,
      { autoAlpha: 0, x: `${dirRef.current * 2}rem` },
      { autoAlpha: 1, x: 0, duration: 0.45, ease: "power3.out", clearProps: "transform" },
    );
    return () => {
      tween.kill();
    };
  }, [idx]);

  const project = projects[idx];
  const register = (id: SectionId) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={7}>
      <style>{`
        .v07-glyph { display: inline-block; }
        .v07-hud { user-select: none; font-variant-numeric: tabular-nums; }
        .v07-nav a { text-decoration-color: ${ACCENT}; text-underline-offset: 0.45em; }
        .v07-btn { border-color: ${LINE}; transition: border-color 200ms ease, color 200ms ease; }
        .v07-btn:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
        @media (prefers-reduced-motion: reduce) { .v07-btn { transition: none; } }
      `}</style>

      {/* The numbered anchor list, under the bar. The active stop is underlined by the same observer the readout uses. */}
      <nav aria-label="Sections" className="v07-nav flex flex-wrap gap-x-[2.4rem] gap-y-[0.6rem] px-[3vw] pt-[1.2rem] font-mono text-[0.72rem] uppercase tracking-[0.16em]">
        {NAV.map((item) => (
          <a
            aria-current={active === item.id ? "location" : undefined}
            className={active === item.id ? "underline" : "opacity-55 transition-opacity hover:opacity-100"}
            href={`#${item.id}`}
            key={item.id}
          >
            <span style={{ color: ACCENT }}>{item.n}</span> {item.label}
          </a>
        ))}
      </nav>

      <section className="px-[3vw] pb-[12vh] pt-[16vh]">
        <h1 aria-label={TAGLINE.join(" ")} className="text-[6.6vw] font-bold uppercase leading-[0.92] tracking-[-0.03em]" ref={heroRef}>
          {TAGLINE.map((line) => (
            <span aria-hidden="true" className="block" key={line}>
              {Array.from(line).map((ch, i) => (
                <span className="v07-glyph" data-v07-glyph key={`${line}-${i}`}>
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <p className="mt-[2rem] text-[clamp(1.4rem,2.6vw,3rem)] font-bold uppercase leading-none tracking-[0.04em]" data-reveal style={{ color: ACCENT }}>
          Code / Motion / Hardware
        </p>
        <p className="mt-[2.4rem] font-mono text-[0.78rem] uppercase tracking-[0.16em] opacity-70" data-reveal>
          {toolCount} tools · {projects.length} projects · {awards.length} awards
        </p>
        <p className="mt-[0.6rem] font-mono text-[0.78rem] uppercase tracking-[0.16em] opacity-70" data-reveal>
          A world-record autonomous routine · 80th of ~20,000
        </p>
      </section>

      <section className="border-t px-[3vw] py-[10vh]" id="info" ref={register("info")} style={{ borderColor: LINE }}>
        <Head n="01">Introduce</Head>
        <p className="mt-[2.4rem] max-w-[62ch] text-[clamp(1.1rem,1.5vw,1.7rem)] leading-[1.4]" data-reveal>
          Kevin He, Toronto. Co-founder and CTO of The Actually Company, a local-first speaking coach: 150+ tests, $1k
          MRR, 200+ active users. Built in San Francisco at Founders, Inc., one of 100 from 10,000+ applicants. Before
          that, four years as captain and lead programmer of VEX 82855Z: a world-record autonomous routine, 80th of
          ~20,000 teams in global Skills. Computer engineering at the University of Toronto from 2026.
        </p>

        <div className="relative mt-[6rem]" data-reveal>
          <div aria-hidden="true" className="absolute inset-x-0 top-[0.35rem] border-t" style={{ borderColor: LINE }} />
          <ol className="relative grid grid-cols-4">
            {stops.map((s) => (
              <li className="pr-[2vw]" key={`${s.year}-${s.org}`}>
                <span aria-hidden="true" className="block h-[0.7rem] w-[0.7rem] rounded-full" style={{ backgroundColor: ACCENT }} />
                <p className="mt-[1.2rem] font-mono text-[0.78rem] tracking-[0.16em]" style={{ color: ACCENT }}>
                  {s.year}
                </p>
                <p className="mt-[0.5rem] text-[clamp(1rem,1.3vw,1.5rem)] font-bold uppercase leading-[1.05] tracking-[-0.01em]">{s.org}</p>
                <p className="mt-[0.4rem] text-[0.84rem] leading-[1.4] opacity-60">{s.role}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-[6rem]" id="awards" ref={register("awards")}>
          <Head n="04">Awards</Head>
          <ul className="mt-[2rem] flex flex-wrap gap-[0.8rem]" data-reveal>
            {awards.map((a) => (
              <li className="flex items-baseline gap-[0.9rem] rounded-full border px-[1.3rem] py-[0.65rem] text-[0.9rem]" key={a.title} style={{ borderColor: LINE }}>
                <span>{a.title}</span>
                <span className="font-mono text-[0.72rem] tracking-[0.12em]" style={{ color: ACCENT }}>
                  {a.year}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t px-[3vw] py-[10vh]" id="skills" ref={register("skills")} style={{ borderColor: LINE }}>
        <Head n="02">Skills</Head>
        <div className="mt-[3rem] grid grid-cols-2 gap-[1.5vw]">
          {groups.map((g, i) => (
            <div className={`border-t pt-[1.4rem] ${i === groups.length - 1 && groups.length % 2 ? "col-span-2" : ""}`} data-reveal key={g.label} style={{ borderColor: LINE }}>
              <div className="flex items-baseline gap-[1rem]">
                <Label>{two(i + 1)}</Label>
                <h3 className="text-[clamp(1.1rem,1.6vw,1.8rem)] font-bold uppercase leading-none tracking-[-0.01em]">{g.label}</h3>
              </div>
              <p className="mt-[0.8rem] max-w-[52ch] text-[0.84rem] leading-[1.5] opacity-60">{g.blurb}</p>
              <ul className="mt-[1.4rem] flex flex-wrap gap-x-[1.6rem] gap-y-[0.8rem]">
                {g.skills.map((s) => (
                  <li className="flex items-center gap-[0.55rem] text-[0.9rem]" key={s.name}>
                    <SkillMark size="1rem" skill={s} />
                    <span>{s.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t px-[3vw] py-[10vh]" id="work" ref={register("work")} style={{ borderColor: LINE }}>
        <div className="flex items-end justify-between gap-[2rem]">
          <Head n="03">Works</Head>
          <div className="flex items-center gap-[1rem]" data-reveal>
            <span className="v07-hud font-mono text-[0.78rem] tracking-[0.16em]" style={{ color: ACCENT }}>
              {two(idx + 1)} / {two(projects.length)}
            </span>
            <button aria-label="Previous project" className="v07-btn flex h-[2.6rem] w-[2.6rem] border items-center justify-center rounded-full font-mono text-[0.9rem]" onClick={() => step(-1)} type="button">
              {"←"}
            </button>
            <button aria-label="Next project" className="v07-btn flex h-[2.6rem] w-[2.6rem] border items-center justify-center rounded-full font-mono text-[0.9rem]" onClick={() => step(1)} type="button">
              {"→"}
            </button>
          </div>
        </div>

        <div className="mt-[3rem] border-t pt-[2.4rem]" data-reveal style={{ borderColor: LINE }}>
          <div className="grid grid-cols-12 gap-x-[1.5vw]" ref={panelRef}>
            <div className="col-span-7">
              <p className="flex items-baseline gap-[1.2rem]">
                <span className="font-mono text-[clamp(1.4rem,2.6vw,3rem)] leading-none" style={{ color: ACCENT }}>
                  {two(idx + 1)}
                </span>
                <span className="text-[clamp(2.2rem,4.6vw,5.2rem)] font-bold uppercase leading-[0.95] tracking-[-0.03em]">{project.title}</span>
              </p>
              <p className="mt-[1.6rem] max-w-[48ch] text-[clamp(1rem,1.3vw,1.5rem)] leading-[1.4] opacity-85">{project.tagline}</p>
              <ul className="mt-[1.6rem] max-w-[64ch] space-y-[0.6rem] text-[0.9rem] leading-[1.55] opacity-65">
                {project.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <dl className="col-span-5 grid grid-cols-[6rem_1fr] gap-y-[0.7rem] self-start border-t pt-[1rem] text-[0.86rem]" style={{ borderColor: LINE }}>
              <dt>
                <Label>Year</Label>
              </dt>
              <dd className="font-mono tabular-nums">{project.year}</dd>
              <dt>
                <Label>Stack</Label>
              </dt>
              <dd>{project.stack.join(" / ")}</dd>
              {project.award ? (
                <>
                  <dt>
                    <Label>Award</Label>
                  </dt>
                  <dd>{project.award}</dd>
                </>
              ) : null}
              {project.href ? (
                <>
                  <dt>
                    <Label>Link</Label>
                  </dt>
                  <dd>
                    <a className="underline underline-offset-[0.3em] opacity-80 hover:opacity-100" href={project.href} rel="noreferrer" target="_blank">
                      {project.href.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
        <p className="mt-[1.6rem] font-mono text-[0.68rem] uppercase tracking-[0.16em] opacity-40">Arrow keys page too.</p>
      </section>

      <section className="border-t px-[3vw] pb-[16vh] pt-[10vh]" id="contact" ref={register("contact")} style={{ borderColor: LINE }}>
        <Head n="05">Contact</Head>
        <a className="mt-[2.4rem] block text-[clamp(1.8rem,4.4vw,5rem)] font-bold leading-none tracking-[-0.03em]" data-reveal href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <div className="mt-[2rem] flex gap-[2.4rem]" data-reveal>
          {elsewhere.map((l) => (
            <a className="font-mono text-[0.78rem] uppercase tracking-[0.16em] opacity-60 hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
              {l.label} {"↗"}
            </a>
          ))}
        </div>
      </section>

      {/* The readout. Fixed, never hidden, written by refs. */}
      <div aria-live="off" className="v07-hud pointer-events-none fixed bottom-[1.4rem] left-[3vw] z-50 font-mono text-[0.72rem] tracking-[0.1em]" style={{ color: ACCENT }}>
        x:<span ref={xRef}>0000</span> y:<span ref={yRef}>0000</span> p:<span ref={pRef}>000</span>% s:<span ref={sRef}>intro</span>
      </div>
    </VariantShell>
  );
}
