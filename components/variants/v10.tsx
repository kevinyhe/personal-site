"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(ScrollTrigger);

/**
 * 10 PINNED. After the Lenis showcase (lenis.darkroom.engineering): a
 * near-black ground, huge outlined caps that fill with ink as the page
 * starts to move, hairlines, mono captions, one pink.
 *
 * Three of its moves, rebuilt on Kevin's content:
 * - Work is a track of five cards that slides sideways while the page
 *   scrolls five screens. The track is `position: sticky` and a scrubbed
 *   ScrollTrigger on the tall section drives its x.
 * - Info is three statements on full-height sticky panels in a 300vh
 *   box, so each one slides up over the last; the covered one shrinks
 *   and dims as the next arrives.
 * - The hero's outline fills from the left, driven by Lenis's scroll.
 *
 * Under reduced motion the cards stack, the statements flow, the type
 * is solid.
 */
const GROUND = "#0e0e0e";
const INK = "#efefef";
const ACCENT = "#ff98a2";
const LINE = "rgba(239,239,239,0.16)";

const MONO = "font-mono text-[0.72rem] uppercase tracking-[0.16em]";
const pad = (i: number) => String(i + 1).padStart(2, "0");

/** The three lines of the Info stack, from the profile. */
const STATEMENTS = [
  `Computer engineering at the ${education.school}.`,
  `Co‑founder and CTO of ${experience[0].org}.`,
  "Robot autonomy, embedded firmware, and the tooling between them.",
];

/**
 * Scoped styles. Outlined type is `-webkit-text-stroke` on transparent
 * text; the fills are a gradient clipped to the glyphs, so a CSS variable
 * (or a hover) can move the edge. The reduced-motion block undoes the pin
 * and the stack so the same markup reads top to bottom.
 */
const CSS = `
/* A screen's height: the site's dynamic-viewport value where the browser
   has it, so a phone's toolbar does not cover the bottom of a pinned box. */
.v10-root { --v10-vh: var(--arbor-screen-h, 100vh); }
.v10-outline {
  color: transparent;
  -webkit-text-stroke: 0.08rem var(--ink);
}
.v10-hero-title {
  --v10-fill: 0%;
  color: transparent;
  -webkit-text-stroke: 0.08rem var(--ink);
  background-image: linear-gradient(
    90deg,
    var(--ink) max(0%, calc(var(--v10-fill) - 3%)),
    transparent calc(var(--v10-fill) + 3%)
  );
  -webkit-background-clip: text;
  background-clip: text;
}
.v10-arrow { animation: v10-bob 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes v10-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(0.7rem); }
}

.v10-work { height: calc(${projects.length} * var(--v10-vh)); }
.v10-pin {
  position: sticky;
  top: 0;
  height: var(--v10-vh);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12vh 0 6vh;
}
.v10-track {
  display: flex;
  gap: 4vw;
  padding: 0 3vw;
  will-change: transform;
}
.v10-card { flex: none; width: 72vw; }

.v10-stack { position: relative; height: calc(${STATEMENTS.length} * var(--v10-vh)); }
.v10-panel {
  position: sticky;
  top: 0;
  display: flex;
  height: var(--v10-vh);
  align-items: center;
  padding: 0 3vw;
  background: var(--ground);
}
.v10-mark {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--v10-vh);
  pointer-events: none;
}

.v10-email {
  color: transparent;
  -webkit-text-stroke: 0.08rem var(--ink);
  background: linear-gradient(var(--ink), var(--ink)) no-repeat 0 0 / 0% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  transition: background-size 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  overflow-wrap: anywhere;
}
.v10-email:hover, .v10-email:focus-visible { background-size: 100% 100%; }

@media (prefers-reduced-motion: reduce) {
  .v10-hero-title { --v10-fill: 100%; background-image: none; color: var(--ink); }
  .v10-arrow { animation: none; }
  .v10-work { height: auto; }
  .v10-pin { position: static; height: auto; overflow: visible; padding: 12vh 0 0; }
  .v10-track { flex-direction: column; gap: 10vh; transform: none !important; }
  .v10-card { width: auto; transform: none !important; }
  .v10-progress { display: none; }
  .v10-stack { height: auto; }
  .v10-panel { position: static; height: auto; padding: 14vh 3vw 0; }
  .v10-mark { display: none; }
  .v10-email { transition: none; }
}
`;

export default function V10(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // The hero's fill. Lenis's `scroll` is the eased, sub-pixel position,
  // so the edge glides with the page; the window's own scroll is the
  // fallback for when Lenis is off (reduced motion turns it off, and then
  // the CSS above makes the type solid anyway).
  useEffect(() => {
    const title = titleRef.current;
    if (!title) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    // Full by 70% of a screen: the title's last line leaves the viewport
    // around 80%, so a fill that ran the whole screen would finish unseen.
    const setFill = (scroll: number) => {
      const p = Math.min(1, Math.max(0, scroll / (window.innerHeight * 0.7)));
      title.style.setProperty("--v10-fill", `${(p * 100).toFixed(2)}%`);
    };
    const onWindowScroll = () => setFill(window.scrollY);
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    setFill(window.scrollY);

    // Lenis is mounted by the layout, whose effect runs after this one, so
    // it is looked for a frame later rather than at mount.
    let offLenis: (() => void) | null = null;
    const frame = requestAnimationFrame(() => {
      const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
      if (!lenis) return;
      window.removeEventListener("scroll", onWindowScroll);
      offLenis = lenis.on("scroll", (l) => setFill(l.scroll));
      setFill(lenis.scroll);
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onWindowScroll);
      offLenis?.();
    };
  }, []);

  // The pinned track, the stacking statements and the chip reveals: all
  // ScrollTriggers, all in one context so one revert takes them down.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const ctx = gsap.context(() => {
      // 1. Work: the track's x follows the tall section's progress. Card
      //    scale, the progress rule and the counter are derived from the
      //    same progress each update, so nothing drifts.
      const work = root.querySelector<HTMLElement>(".v10-work");
      const pin = root.querySelector<HTMLElement>(".v10-pin");
      const track = root.querySelector<HTMLElement>(".v10-track");
      const bar = root.querySelector<HTMLElement>(".v10-progress-bar");
      const counter = root.querySelector<HTMLElement>(".v10-counter");
      const cards = Array.from(root.querySelectorAll<HTMLElement>(".v10-card"));
      if (work && pin && track && bar && counter && cards.length) {
        let distance = 0;
        let centres: number[] = [];
        const measure = () => {
          distance = Math.max(0, track.scrollWidth - pin.clientWidth);
          centres = cards.map((c) => c.offsetLeft + c.offsetWidth / 2);
          return distance;
        };
        const setScale = cards.map((c) => gsap.quickSetter(c, "scale"));
        const setBar = gsap.quickSetter(bar, "scaleX");
        const place = (progress: number) => {
          const x = -distance * progress;
          const mid = pin.clientWidth / 2;
          let nearest = 0;
          cards.forEach((_, i) => {
            const off = Math.abs(centres[i] + x - mid);
            // A card at the centre is full size; one a half-screen or
            // more away is 0.94, the showcase's step.
            setScale[i](1 - 0.06 * Math.min(1, off / mid));
            if (off < Math.abs(centres[nearest] + x - mid)) nearest = i;
          });
          setBar(progress);
          counter.textContent = `${pad(nearest)} / ${pad(cards.length - 1)}`;
        };
        gsap.to(track, {
          x: () => -measure(),
          ease: "none",
          scrollTrigger: {
            trigger: work,
            start: "top top",
            end: "bottom bottom",
            scrub: true,
            invalidateOnRefresh: true,
            onRefresh: (self) => {
              measure();
              place(self.progress);
            },
            onUpdate: (self) => place(self.progress),
          },
        });
      }

      // 2. Info: as panel i+1 slides up (its marker crossing the screen),
      //    statement i shrinks and dims underneath it. The markers are
      //    absolutely placed so the triggers measure flow positions, not
      //    wherever a stuck panel happens to be at refresh.
      const stmts = Array.from(root.querySelectorAll<HTMLElement>(".v10-stmt"));
      const marks = Array.from(root.querySelectorAll<HTMLElement>(".v10-mark"));
      stmts.forEach((stmt, i) => {
        const next = marks[i + 1];
        if (!next) return;
        gsap.to(stmt, {
          scale: 0.9,
          opacity: 0.4,
          ease: "none",
          scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true },
        });
      });

      // 3. Skills: each row's chips rise in once, 0.04 s apart.
      root.querySelectorAll<HTMLElement>(".v10-row").forEach((row) => {
        const chips = row.querySelectorAll<HTMLElement>(".v10-chip");
        if (!chips.length) return;
        gsap.from(chips, {
          autoAlpha: 0,
          y: "1rem",
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.04,
          scrollTrigger: { trigger: row, start: "top 88%", once: true },
        });
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={10}>
      <style>{CSS}</style>
      <div className="v10-root" ref={rootRef}>
        <section className="flex min-h-[var(--v10-vh)] flex-col justify-between px-[3vw] pb-[5vh] pt-[16vh]">
          <h1 className="v10-hero-title text-[14vw] font-bold uppercase leading-[0.86] tracking-[-0.04em]" ref={titleRef}>
            Software
            <br />
            for things
            <br />
            that move
          </h1>
          <div className={`mt-[4vh] flex items-end justify-between ${MONO} opacity-70`}>
            <p>
              Kevin He · Toronto · <span style={{ color: ACCENT }}>scroll</span>
            </p>
            <svg aria-hidden="true" className="v10-arrow h-[2.2rem] w-[1.2rem]" fill="none" stroke={INK} strokeWidth="1" viewBox="0 0 12 22">
              <path d="M6 0v21M1 16l5 5 5-5" />
            </svg>
          </div>
        </section>

        <section className="v10-work" id="work">
          <div className="v10-pin">
            <div className={`flex items-baseline justify-between px-[3vw] ${MONO} opacity-55`}>
              <p>01 Work</p>
              <p>
                {projects.length} projects · {projects[projects.length - 1].year} to {projects[0].year}
              </p>
            </div>
            <div className="v10-track">
              {projects.map((p, i) => (
                <article className="v10-card border-t pt-[1.4rem]" key={p.title} style={{ borderColor: LINE }}>
                  <div className="flex items-start justify-between">
                    <span className="v10-outline text-[12vw] font-bold leading-[0.85] tracking-[-0.05em]">{pad(i)}</span>
                    <div className={`pt-[0.6rem] text-right ${MONO}`}>
                      <p className="opacity-55">{p.year}</p>
                      {p.award ? (
                        <p className="mt-[0.4rem]" style={{ color: ACCENT }}>
                          {p.award}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <h3 className="mt-[2.4rem] text-[4vw] font-bold leading-[0.95] tracking-[-0.04em]">{p.title}</h3>
                  <p className="mt-[1.2rem] overflow-hidden text-ellipsis whitespace-nowrap text-[1.2rem] font-light opacity-80">{p.tagline}</p>
                  <div className={`mt-[1.6rem] flex items-baseline justify-between gap-[2rem] border-t pt-[1rem] ${MONO}`} style={{ borderColor: LINE }}>
                    <p className="opacity-55">{p.stack.join(" / ")}</p>
                    {p.href ? (
                      <a className="shrink-0 transition-colors hover:text-[var(--accent)]" href={p.href} rel="noreferrer" target="_blank">
                        Open {"↗"}
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="v10-progress px-[3vw]">
              <div className={`flex items-baseline justify-between ${MONO} opacity-55`}>
                <span className="v10-counter tabular-nums">
                  01 / {pad(projects.length - 1)}
                </span>
                <span>Scroll</span>
              </div>
              <div className="mt-[0.8rem] h-[0.125rem] w-full" style={{ backgroundColor: LINE }}>
                <div className="v10-progress-bar h-full w-full origin-left" style={{ backgroundColor: ACCENT, transform: "scaleX(0)" }} />
              </div>
            </div>
          </div>
        </section>

        <section id="info">
          <div className="v10-stack">
            {STATEMENTS.map((s, i) => (
              <div className="v10-panel" key={s}>
                <div className="v10-stmt w-full origin-center">
                  <p className={`${MONO} opacity-55`}>
                    02 Info · {pad(i)} / {pad(STATEMENTS.length - 1)}
                  </p>
                  <p className="mt-[2rem] max-w-[92vw] text-[6vw] font-medium leading-[1] tracking-[-0.03em]">{s}</p>
                </div>
              </div>
            ))}
            {STATEMENTS.map((s, i) => (
              <div aria-hidden="true" className="v10-mark" key={s} style={{ top: `calc(${i} * var(--v10-vh))` }} />
            ))}
          </div>

          <div className="px-[3vw] pb-[12vh] pt-[14vh]">
            <p className={`${MONO} opacity-55`} data-reveal>
              Experience
            </p>
            <ol className="mt-[2rem] border-t" style={{ borderColor: LINE }}>
              {experience.map((e) => (
                <li className="grid grid-cols-[12rem_1fr_10rem] gap-x-[3vw] border-b py-[1.8rem]" data-reveal key={e.org} style={{ borderColor: LINE }}>
                  <p className={`${MONO} opacity-55`}>{e.when}</p>
                  <div>
                    <p className="text-[1.8rem] font-medium leading-[1] tracking-[-0.02em]">{e.org}</p>
                    <p className="mt-[0.6rem] text-[0.95rem] opacity-60">{e.role}</p>
                    <ul className="mt-[1rem] max-w-[70ch] space-y-[0.4rem] text-[0.9rem] font-light leading-[1.55] opacity-70">
                      {e.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                  <p className={`${MONO} text-right opacity-55`}>{e.where}</p>
                </li>
              ))}
              <li className="grid grid-cols-[12rem_1fr_10rem] gap-x-[3vw] border-b py-[1.8rem]" data-reveal style={{ borderColor: LINE }}>
                <p className={`${MONO} opacity-55`}>{education.when}</p>
                <div>
                  <p className="text-[1.8rem] font-medium leading-[1] tracking-[-0.02em]">{education.school}</p>
                  <p className="mt-[0.6rem] text-[0.95rem] opacity-60">{education.degree}</p>
                </div>
                <p className={`${MONO} text-right opacity-55`}>Toronto</p>
              </li>
            </ol>
            <div className={`mt-[1.8rem] flex flex-wrap gap-x-[2.4rem] gap-y-[0.6rem] ${MONO} opacity-55`} data-reveal>
              <span>Selected</span>
              {awards.map((a) => (
                <span key={a.title}>
                  {a.title} <span className="tabular-nums" style={{ color: ACCENT }}>{a.year}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="px-[3vw] py-[12vh]" id="skills">
          <p className={`${MONO} opacity-55`} data-reveal>
            03 Skills
          </p>
          <div className="mt-[2rem] border-t" style={{ borderColor: LINE }}>
            {skillGroups.map((g) => (
              <div className="v10-row grid grid-cols-[22rem_1fr] gap-x-[4vw] border-b py-[2rem]" key={g.label} style={{ borderColor: LINE }}>
                <div>
                  <p className={`${MONO} opacity-55`}>{g.label}</p>
                  <p className="mt-[0.7rem] text-[0.82rem] font-light leading-[1.5] opacity-50">{g.blurb}</p>
                </div>
                <ul className="flex flex-wrap content-start gap-x-[2rem] gap-y-[0.9rem]">
                  {g.skills.map((s) => (
                    <li className="v10-chip flex items-center gap-[0.6rem] text-[1.15rem] font-light" key={s.name}>
                      <SkillMark size="1rem" skill={s} />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="px-[3vw] pb-[14vh] pt-[12vh]" id="contact">
          <p className={`${MONO} opacity-55`} data-reveal>
            04 Contact · hover
          </p>
          <a className="v10-email mt-[2rem] block text-[6.8vw] font-bold leading-[1] tracking-[-0.04em]" data-reveal href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <div className={`mt-[3rem] flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem] ${MONO}`} data-reveal>
            {elsewhere.map((l) => (
              <a className="opacity-60 transition-opacity hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                {l.label} <span className="normal-case tracking-normal opacity-60">{l.handle}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </VariantShell>
  );
}
