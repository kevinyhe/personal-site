"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { mountHeroRobot, type HeroRobot } from "@/components/heroRobot";
import { awards, education, experience, projects, skillGroups, type Skill } from "@/components/profile";
import { scrollToSection } from "@/components/SectionLink";
import { EMAIL, elsewhere } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";
import { createBarCanvas, hexToRgb, type BarCanvas } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * 15 TEAR. After meermohsin.me: a full-screen hero with one figure in the
 * middle (here the robot, dithered into the accent's bars), a ring cursor
 * that grows over links, and sections that tear open like paper as they
 * arrive. Work is five numbered cards, skills a 3×3 grid, the process four
 * stages, and the contact section pins for two screens while the closing
 * line grows and the ground goes to black.
 */
const GROUND = "#0a0a0a";
const INK = "#f5f5f5";
const ACCENT = "#f9b9dc";
/** A second dark, so a tear from one dark section into the next shows. */
const DEEP = "#141414";
/** The one light section: the process, on paper. */
const PAPER = "#f5f5f5";
const LINE = "rgba(245,245,245,0.14)";
const LINE_ON_PAPER = "rgba(10,10,10,0.16)";

/** Every skill in one list, for the marks on the work cards. */
const ALL_SKILLS = skillGroups.flatMap((g) => g.skills);
function findSkill(name: string): Skill | undefined {
  return ALL_SKILLS.find((s) => s.name === name) ?? ALL_SKILLS.find((s) => s.name.startsWith(name));
}

/** The 3×3: a category, one line, and which skills carry its marks. */
const TILES: { label: string; line: string; names: string[] }[] = [
  { label: "Autonomy", line: "odometry, controls, particle filters", names: ["Odometry", "Controls", "Particle filters", "Motion profiling"] },
  { label: "Firmware", line: "ESP32, RTOS, sensor fusion", names: ["ESP32 / ESP8266", "RTOS", "IMUs & sensor fusion", "Arduino"] },
  { label: "Web", line: "React, Next.js, Three.js", names: ["React", "Next.js", "Three.js", "Node.js"] },
  { label: "Tooling", line: "Git, CMake, Vitest", names: ["Git", "CMake", "Vitest", "Linux"] },
  { label: "Data", line: "NumPy, OpenCV, MediaPipe", names: ["NumPy", "OpenCV", "MediaPipe", "pandas"] },
  { label: "CAD", line: "Fusion 360", names: ["Fusion 360"] },
  { label: "Networking", line: "UDP, WebSockets, REST", names: ["UDP", "WebSockets", "REST", "FastAPI"] },
  { label: "Languages", line: "C++, Python, TypeScript", names: ["C++", "Python", "TypeScript", "JavaScript"] },
  { label: "Robots", line: "VEX V5, PROS", names: ["VEX V5", "PROS", "ROS"] },
];

/** The reference's four stages, said for engineering. */
const STAGES: { name: string; line: string }[] = [
  { name: "Discovery", line: "Read the problem in the sensors first: what moves, how fast, and what has to answer in time." },
  { name: "Direction", line: "Set the numbers before the code: the latency budget, the update rate, what happens when a reading is wrong." },
  { name: "Craft", line: "Build it on the real hardware, with tests round every part the eye cannot check." },
  { name: "Launch", line: "Put it on the floor, measure it there, and keep the fix loop short." },
];

/** A stable pseudo-random in 0..1 from an integer, so a tear's edge is the
 *  same on every render and every visit. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The torn edge: 36 points across a 1000×100 box, a slow wave with
 *  jitter on it, closed along the bottom. The band is the top two thirds. */
function tearPoints(seed: number): string {
  const N = 36;
  const pts: string[] = ["0,100"];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * 1000;
    const wave = 34 + 16 * Math.sin(i * 0.9 + seed * 1.7);
    const jitter = (hash(seed * 101 + i) - 0.5) * 30;
    const y = Math.min(66, Math.max(6, wave + jitter));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  pts.push("1000,100");
  return pts.join(" ");
}

/**
 * The seam between two sections: the NEXT section's ground, with a torn
 * top edge, standing up into the section before. Two copies: the paper
 * itself, and behind it the edge, lifted 0.6vh, which is the thickness of
 * the sheet. A scrubbed trigger tears it open as it comes up the screen.
 */
function Tear({ colour, edge, seed }: { colour: string; edge: string; seed: number }): JSX.Element {
  const points = useMemo(() => tearPoints(seed), [seed]);
  return (
    <div aria-hidden="true" className="v15-tear" data-tear>
      <svg className="v15-tear-edge" preserveAspectRatio="none" viewBox="0 0 1000 100">
        <polygon fill={edge} points={points} />
      </svg>
      <svg preserveAspectRatio="none" viewBox="0 0 1000 100">
        <polygon fill={colour} points={points} />
      </svg>
    </div>
  );
}

function Head({ children, n, onPaper = false }: { children: string; n: string; onPaper?: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline gap-[1.4rem]" data-reveal>
      <span className="text-[0.72rem] uppercase tracking-[0.3em]" style={{ color: onPaper ? GROUND : ACCENT, opacity: onPaper ? 0.6 : 1 }}>
        {n}
      </span>
      <h2 className="font-serif-display text-[clamp(2.4rem,4.6vw,5rem)] italic leading-none tracking-[-0.02em]">{children}</h2>
    </div>
  );
}

/** The marks for a project's stack; a tool with no entry in the profile is
 *  set as a small chip instead. */
function StackMarks({ names }: { names: string[] }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-[0.7rem]">
      {names.map((name) => {
        const s = findSkill(name);
        return s ? (
          <span className="inline-flex" key={name} title={name}>
            <SkillMark size="1.15rem" skill={s} />
          </span>
        ) : (
          <span className="rounded-full border px-[0.6rem] py-[0.15rem] text-[0.62rem] uppercase tracking-[0.14em] opacity-60" key={name} style={{ borderColor: LINE }}>
            {name}
          </span>
        );
      })}
    </div>
  );
}

export default function V15(): JSX.Element {
  const heroRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shadeRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // The hero: the robot through the bar shader, turning slowly, and the
  // shade behind it drifting against the cursor and slower than the page.
  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    const shade = shadeRef.current;
    if (!canvas || !hero || !shade) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const robot: HeroRobot | null = mountHeroRobot({
      url: "/models/hero.glb",
      offscreen: { width: 1600, height: 1000 },
      shaded: true,
      fill: 0.7,
      endX: 800,
    });
    let bar: BarCanvas | null = null;
    let tick: ((time: number) => void) | null = null;
    let stopped = false;
    // The turn only runs while the hero is on screen; a shaded render every
    // frame for a robot nobody can see is a fan running for nothing.
    let inView = true;
    const watch = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
    });
    watch.observe(hero);
    if (robot) {
      // Parked from the first frame; the drive-in is not this page's.
      robot.ready.then(() => {
        if (stopped) return;
        robot.seek(1);
        if (reduced) return;
        // A slow continuous turn, one circle every ~18 s.
        tick = (time) => {
          if (inView) robot.yaw(time * 0.35);
        };
        gsap.ticker.add(tick);
      });
      bar = createBarCanvas(
        canvas,
        [
          {
            type: "canvas",
            source: robot.source,
            config: {
              x: "0%", y: "0%", width: "100%", height: "100%",
              // Read upside down so a lit face is a wide bar, with a hard
              // grade: over 190 grey is a full bar, under 70 none. The cap
              // under the cell keeps a white face a run of lines.
              blackPoint: 190, whitePoint: 70, threshold: 255,
              xSquares: 240, ySquares: 150, maxSquareWidth: "64%", bgOpacity: 0, fillOpacity: 1,
            },
          },
        ],
        {
          colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(ACCENT) }),
          defaults: { bgOpacity: 0 },
          fps: 30,
        },
      );
    }

    let onMove: ((e: MouseEvent) => void) | null = null;
    const ctx = gsap.context(() => {
      if (reduced) return;
      const toX = gsap.quickTo(shade, "x", { duration: 0.8, ease: "power3" });
      const toY = gsap.quickTo(shade, "y", { duration: 0.8, ease: "power3" });
      onMove = (e) => {
        // Against the cursor, by up to 4% of the screen each way.
        toX(-(e.clientX / window.innerWidth - 0.5) * 0.08 * window.innerWidth);
        toY(-(e.clientY / window.innerHeight - 0.5) * 0.08 * window.innerHeight);
      };
      window.addEventListener("mousemove", onMove);
      gsap.to(shade, {
        yPercent: -20,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
      });
    }, hero);

    return () => {
      stopped = true;
      watch.disconnect();
      if (onMove) window.removeEventListener("mousemove", onMove);
      if (tick) gsap.ticker.remove(tick);
      ctx.revert();
      bar?.destroy();
      robot?.dispose();
    };
  }, []);

  // The cursor: a ring that lags the pointer and a dot that does not.
  // Nothing until the first move, nothing on touch, nothing under reduced
  // motion, so the native cursor is never taken away from someone who has
  // nothing to replace it with.
  useEffect(() => {
    const ring = ringRef.current;
    const dot = dotRef.current;
    const page = pageRef.current;
    if (!ring || !dot || !page) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (window.matchMedia("(hover: none)").matches) return undefined;
    const root = page.closest<HTMLElement>(".v15-root");

    // Centred on the pointer through GSAP's own percent offsets: a CSS
    // translate would be replaced by the first x/y GSAP writes.
    gsap.set([ring, dot], { xPercent: -50, yPercent: -50 });
    const ringX = gsap.quickTo(ring, "x", { duration: 0.35, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.35, ease: "power3" });
    let shown = false;
    let hot = false;
    const onMove = (e: MouseEvent) => {
      if (!shown) {
        shown = true;
        gsap.set([ring, dot], { x: e.clientX, y: e.clientY });
        gsap.to([ring, dot], { opacity: 1, duration: 0.3 });
        root?.classList.add("v15-cursor-on");
      }
      ringX(e.clientX);
      ringY(e.clientY);
      gsap.set(dot, { x: e.clientX, y: e.clientY });
    };
    // One listener for the whole page: anything clickable grows the ring.
    const onOver = (e: MouseEvent) => {
      const t = e.target as Element | null;
      const next = !!t?.closest("a, button, [data-cursor='grow']");
      if (next === hot) return;
      hot = next;
      gsap.to(ring, {
        width: hot ? "4rem" : "1.6rem",
        height: hot ? "4rem" : "1.6rem",
        backgroundColor: hot ? "rgba(249,185,220,0.15)" : "rgba(249,185,220,0)",
        duration: 0.3,
        ease: "power3.out",
        overwrite: "auto",
      });
    };
    const onLeave = () => gsap.to([ring, dot], { opacity: 0, duration: 0.25 });
    const onEnter = () => {
      if (shown) gsap.to([ring, dot], { opacity: 1, duration: 0.25 });
    };
    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.documentElement.addEventListener("mouseenter", onEnter);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.removeEventListener("mouseenter", onEnter);
      root?.classList.remove("v15-cursor-on");
      gsap.killTweensOf([ring, dot]);
    };
  }, []);

  // The tears and the footer, both scrubbed. The DOM is authored at rest —
  // tears open, footer finished — and the tweens run FROM the closed state,
  // so under reduced motion skipping them leaves the right page.
  useEffect(() => {
    const page = pageRef.current;
    const contact = contactRef.current;
    if (!page || !contact) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = gsap.context(() => {
      for (const tear of Array.from(page.querySelectorAll<HTMLElement>("[data-tear]"))) {
        gsap.fromTo(
          tear,
          { yPercent: 40, scaleY: 0.4, transformOrigin: "50% 100%" },
          {
            yPercent: 0,
            scaleY: 1,
            ease: "none",
            scrollTrigger: { trigger: tear, start: "top 100%", end: "top 55%", scrub: 0.5 },
          },
        );
      }

      const inner = contact.querySelector<HTMLElement>("[data-footer]");
      const line = contact.querySelector<HTMLElement>("[data-footer-line]");
      const email = contact.querySelector<HTMLElement>("[data-footer-email]");
      const vignette = contact.querySelector<HTMLElement>("[data-footer-vignette]");
      const links = Array.from(contact.querySelectorAll<HTMLElement>("[data-footer-link]"));
      if (!inner || !line || !email || !vignette) return;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: contact, start: "top top", end: "bottom bottom", scrub: 0.5 },
      });
      tl.fromTo(line, { scale: 0.7, opacity: 0.3 }, { scale: 1, opacity: 1, duration: 0.6 }, 0)
        .fromTo(inner, { backgroundColor: GROUND }, { backgroundColor: "#000000", duration: 1 }, 0)
        .fromTo(vignette, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 1 }, 0)
        .fromTo(email, { y: "6rem", opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.3)
        .fromTo(links, { y: "1.5rem", opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, stagger: 0.03 }, 0.72);
    }, page);

    // The section is three screens tall and finished only at its end, so a
    // "Contact" link that lands at its top would show a dim line and no
    // email. The links go to the end of the pin instead.
    const endOfPin = () => contact.offsetTop + contact.offsetHeight - window.innerHeight;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href="#contact"]');
      if (!a) return;
      e.preventDefault();
      history.replaceState(null, "", "#contact");
      scrollToSection(endOfPin(), 1.6);
    };
    document.addEventListener("click", onClick);
    if (window.location.hash === "#contact") scrollToSection(endOfPin(), 0);

    return () => {
      document.removeEventListener("click", onClick);
      ctx.revert();
    };
  }, []);

  // Opening or closing a case changes the page's height under every
  // trigger below it.
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [open]);

  return (
    <VariantShell accent={ACCENT} className="v15-root" ground={GROUND} ink={INK} n={15}>
      <style>{`
        .v15-root.v15-cursor-on, .v15-root.v15-cursor-on a, .v15-root.v15-cursor-on button { cursor: none; }
        .v15-cursor { position: fixed; left: 0; top: 0; z-index: 60; pointer-events: none; border-radius: 50%; opacity: 0; }
        .v15-ring { width: 1.6rem; height: 1.6rem; border: 0.1rem solid ${ACCENT}; background: rgba(249,185,220,0); }
        .v15-dot { width: 0.4rem; height: 0.4rem; background: ${ACCENT}; }
        @media (hover: none), (prefers-reduced-motion: reduce) { .v15-cursor { display: none; } }
        .v15-shade { position: absolute; left: 50%; top: 50%; width: 110vw; height: 110vw; margin: -55vw 0 0 -55vw; pointer-events: none;
          background: radial-gradient(circle, rgba(249,185,220,0.2) 0%, rgba(249,185,220,0.06) 28%, rgba(249,185,220,0) 58%); }
        .v15-robot { display: block; width: min(64vw, 124vh); aspect-ratio: 16 / 10; }
        @keyframes v15-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.7); } }
        .v15-live { animation: v15-pulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .v15-live { animation: none; } }
        .v15-tear { position: absolute; left: 0; right: 0; top: -9vh; height: 9vh; pointer-events: none; transform-origin: 50% 100%; }
        .v15-tear svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .v15-tear-edge { transform: translateY(-0.6vh); }
        .v15-card { transition: border-color 0.3s ease; }
        .v15-card:hover { border-color: rgba(249,185,220,0.5) !important; }
        .v15-pill { border: 0.08rem solid ${ACCENT}; color: ${ACCENT}; transition: background-color 0.25s ease, color 0.25s ease; }
        .v15-pill:hover { background: ${ACCENT}; color: ${GROUND}; }
        .v15-tile { transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.35s ease; }
        /* !important: the reveal hook leaves an inline transform on the tile. */
        .v15-tile:hover { transform: translateY(-0.5rem) !important; border-color: rgba(249,185,220,0.6) !important; }
        @media (prefers-reduced-motion: reduce) { .v15-tile:hover { transform: none !important; } }
        .v15-contact { height: 300vh; }
        @media (prefers-reduced-motion: reduce) { .v15-contact { height: auto; } }
      `}</style>

      <div aria-hidden="true" className="v15-cursor v15-ring" ref={ringRef} />
      <div aria-hidden="true" className="v15-cursor v15-dot" ref={dotRef} />

      <div ref={pageRef}>
        {/* HERO. The robot in the middle where the reference has a portrait. */}
        <section className="relative flex h-screen items-center justify-center overflow-hidden" ref={heroRef}>
          <div className="v15-shade" ref={shadeRef} />
          <canvas className="v15-robot relative" ref={canvasRef} />
          <div className="absolute inset-x-0 top-[15vh] flex justify-center">
            <div className="flex items-center gap-[0.7rem] rounded-full border px-[1.1rem] py-[0.45rem] text-[0.7rem] uppercase tracking-[0.28em]" data-reveal style={{ borderColor: "rgba(249,185,220,0.4)", color: ACCENT }}>
              <span className="v15-live inline-block h-[0.5rem] w-[0.5rem] rounded-full" style={{ backgroundColor: ACCENT }} />
              Online
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-[12vh] text-center" data-reveal>
            <h1 className="font-serif-display text-[clamp(2.6rem,5.2vw,5.8rem)] italic leading-none tracking-[-0.02em]">Software for things that move.</h1>
            <p className="mt-[1.2rem] text-[0.72rem] uppercase tracking-[0.3em] opacity-55">Kevin He · Toronto · Computer engineering, UofT</p>
          </div>
        </section>

        {/* WORK. Five numbered cards; the first takes the whole row. */}
        <section className="relative px-[3vw] pb-[16vh] pt-[14vh]" id="work" style={{ backgroundColor: DEEP }}>
          <Tear colour={DEEP} edge="#2a2a2a" seed={1} />
          <Head n="01">Work</Head>
          <div className="mt-[3rem] grid grid-cols-2 gap-[1.6rem]">
            {projects.map((p, i) => {
              const isOpen = open === i;
              return (
                <article
                  className={`v15-card flex flex-col rounded-[1.2rem] border p-[2.2rem] ${i === 0 || isOpen ? "col-span-2" : ""}`}
                  data-reveal
                  key={p.title}
                  style={{ borderColor: LINE, backgroundColor: GROUND }}
                >
                  <div className="flex items-start justify-between gap-[2rem]">
                    <div>
                      <p className="text-[clamp(2.4rem,4.4vw,5rem)] font-medium leading-none tracking-[-0.04em]" style={{ color: ACCENT }}>
                        {String(i + 1).padStart(2, "0")}
                      </p>
                      <h3 className="mt-[1.2rem] text-[clamp(1.6rem,2.6vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em]">{p.title}</h3>
                      <p className="mt-[0.8rem] max-w-[52ch] text-[1rem] font-light leading-[1.5] opacity-80">{p.tagline}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-[0.9rem] text-right">
                      <span className="text-[0.7rem] uppercase tracking-[0.22em] opacity-50">{p.year}</span>
                      {p.award ? <span className="text-[0.7rem] uppercase tracking-[0.2em]" style={{ color: ACCENT }}>{p.award}</span> : null}
                    </div>
                  </div>
                  <div className="mt-[2rem] flex items-center justify-between gap-[1.5rem] border-t pt-[1.2rem]" style={{ borderColor: LINE }}>
                    <StackMarks names={p.stack} />
                    <button
                      aria-expanded={isOpen}
                      className="v15-pill shrink-0 rounded-full px-[1.2rem] py-[0.45rem] text-[0.68rem] uppercase tracking-[0.24em]"
                      onClick={() => setOpen(isOpen ? null : i)}
                      type="button"
                    >
                      {isOpen ? "Close" : "View"}
                    </button>
                  </div>
                  {isOpen ? (
                    <ol className="mt-[2.4rem] border-t" style={{ borderColor: LINE }}>
                      {p.bullets.map((b, k) => (
                        <li className="grid grid-cols-[8rem_1fr] items-start gap-[2rem] border-b py-[1.8rem]" key={b} style={{ borderColor: LINE }}>
                          <span className="text-[clamp(2.6rem,4.8vw,5.4rem)] font-medium leading-none tracking-[-0.04em]" style={{ color: ACCENT }}>
                            {String(k + 1).padStart(2, "0")}
                          </span>
                          <p className="max-w-[60ch] text-[1.1rem] font-light leading-[1.55]">{b}</p>
                        </li>
                      ))}
                      {p.href ? (
                        <li className="flex justify-end pt-[1.4rem]">
                          <a className="text-[0.72rem] uppercase tracking-[0.24em] underline underline-offset-[0.4em]" href={p.href} rel="noreferrer" target="_blank">
                            Open ↗
                          </a>
                        </li>
                      ) : null}
                    </ol>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {/* SKILLS. A 3×3 of categories, each with its marks in the corner. */}
        <section className="relative px-[3vw] pb-[16vh] pt-[14vh]" id="skills" style={{ backgroundColor: GROUND }}>
          <Tear colour={GROUND} edge="#262626" seed={2} />
          <Head n="02">Skills</Head>
          <div className="mt-[3rem] grid grid-cols-3 gap-[1.2rem]">
            {TILES.map((t) => (
              <div className="v15-tile relative flex min-h-[22vh] flex-col justify-end rounded-[1.2rem] border p-[1.8rem]" data-reveal key={t.label} style={{ borderColor: LINE, backgroundColor: DEEP }}>
                <div className="absolute right-[1.4rem] top-[1.4rem] flex gap-[0.6rem]">
                  {t.names.map((name) => {
                    const s = findSkill(name);
                    return s ? (
                      <span className="inline-flex opacity-80" key={name} title={name}>
                        <SkillMark size="1rem" skill={s} />
                      </span>
                    ) : null;
                  })}
                </div>
                <p className="text-[clamp(1.3rem,2vw,2.2rem)] font-medium leading-none tracking-[-0.03em]">{t.label}</p>
                <p className="mt-[0.7rem] text-[0.9rem] font-light leading-[1.4] opacity-65">
                  <span style={{ color: ACCENT }}>/</span> {t.line}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* PROCESS. Four stages, on paper. */}
        <section className="relative px-[3vw] pb-[16vh] pt-[14vh]" style={{ backgroundColor: PAPER, color: GROUND }}>
          <Tear colour={PAPER} edge="#d4d4d4" seed={3} />
          <Head n="03" onPaper>
            Process
          </Head>
          <div className="mt-[3rem] grid grid-cols-4 gap-[1.2rem]">
            {STAGES.map((s, i) => (
              <div className="flex min-h-[28vh] flex-col justify-between rounded-[1.2rem] border p-[1.8rem]" data-reveal key={s.name} style={{ borderColor: LINE_ON_PAPER }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.7rem] uppercase tracking-[0.3em] opacity-55">Stage {String(i + 1).padStart(2, "0")}</span>
                  {i < STAGES.length - 1 ? <span className="text-[0.9rem] opacity-40">→</span> : null}
                </div>
                <div>
                  <p className="text-[clamp(1.5rem,2.4vw,2.6rem)] font-medium leading-none tracking-[-0.03em]">{s.name}</p>
                  <p className="mt-[0.9rem] text-[0.92rem] font-light leading-[1.5] opacity-75">{s.line}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* INFO. Experience rows, then education and awards. */}
        <section className="relative px-[3vw] pb-[16vh] pt-[14vh]" id="info" style={{ backgroundColor: DEEP }}>
          <Tear colour={DEEP} edge="#2a2a2a" seed={4} />
          <Head n="04">Info</Head>
          <div className="mt-[3rem] grid grid-cols-[1.6fr_1fr] gap-[4vw]">
            <div>
              {experience.map((e) => (
                <div className="grid grid-cols-[10rem_1fr] gap-[2rem] border-t py-[1.8rem]" data-reveal key={e.org} style={{ borderColor: LINE }}>
                  <div className="text-[0.72rem] uppercase tracking-[0.2em] opacity-55">
                    <p>{e.when}</p>
                    <p className="mt-[0.4rem]">{e.where}</p>
                  </div>
                  <div>
                    <h3 className="text-[1.4rem] font-medium leading-tight tracking-[-0.02em]">{e.org}</h3>
                    <p className="mt-[0.3rem] text-[0.9rem]" style={{ color: ACCENT }}>{e.role}</p>
                    <ul className="mt-[0.9rem] space-y-[0.4rem] text-[0.92rem] font-light leading-[1.55] opacity-75">
                      {e.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[10rem_1fr] gap-[2rem] border-y py-[1.8rem]" data-reveal style={{ borderColor: LINE }}>
                <p className="text-[0.72rem] uppercase tracking-[0.2em] opacity-55">{education.when}</p>
                <div>
                  <h3 className="text-[1.4rem] font-medium leading-tight tracking-[-0.02em]">{education.school}</h3>
                  <p className="mt-[0.3rem] text-[0.9rem] opacity-75">{education.degree}</p>
                </div>
              </div>
            </div>
            <div data-reveal>
              <p className="text-[0.72rem] uppercase tracking-[0.3em] opacity-55">Awards</p>
              <ul className="mt-[1.2rem]">
                {awards.map((a) => (
                  <li className="flex items-baseline justify-between gap-[1rem] border-t py-[1rem] text-[0.98rem]" key={a.title} style={{ borderColor: LINE }}>
                    <span>{a.title}</span>
                    <span className="text-[0.72rem] tracking-[0.15em] opacity-55">{a.year}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* CONTACT. Pinned for two screens: the line grows, the email rises,
            the ground goes to black and the links come last. */}
        <section className="v15-contact relative" id="contact" ref={contactRef} style={{ backgroundColor: GROUND }}>
          <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-[3vw] text-center" data-footer style={{ backgroundColor: GROUND }}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              data-footer-vignette
              style={{ background: "radial-gradient(ellipse at 50% 55%, rgba(249,185,220,0.22) 0%, rgba(249,185,220,0.06) 35%, rgba(249,185,220,0) 65%)" }}
            />
            <p className="relative text-[0.72rem] uppercase tracking-[0.3em]" style={{ color: ACCENT }}>
              05 · Contact
            </p>
            <h2 className="relative mt-[1.6rem] max-w-[14ch] font-serif-display text-[clamp(3.2rem,7.6vw,8.6rem)] italic leading-[0.95] tracking-[-0.03em]" data-footer-line>
              Let’s build something that moves.
            </h2>
            <a className="relative mt-[3rem] text-[clamp(1.2rem,2.2vw,2.4rem)] font-light tracking-[-0.02em] underline underline-offset-[0.35em]" data-footer-email href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <div className="relative mt-[4rem] flex flex-wrap justify-center gap-x-[2.6rem] gap-y-[1rem] text-[0.75rem] uppercase tracking-[0.22em]">
              {elsewhere.map((l) => (
                <a className="opacity-70 transition-opacity hover:opacity-100" data-footer-link href={l.href} key={l.label} rel="noreferrer" target="_blank">
                  {l.label} <span className="opacity-50">{l.handle}</span>
                </a>
              ))}
            </div>
          </div>
          <Tear colour={GROUND} edge="#262626" seed={5} />
        </section>
      </div>
    </VariantShell>
  );
}
