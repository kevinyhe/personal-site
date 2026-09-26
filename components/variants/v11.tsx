"use client";

import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups, type Project } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(ScrollTrigger, Flip, MorphSVGPlugin);

/**
 * 11 GROW. After gionatannese.com: everything centred, type doing all the
 * work, and one drawing that grows with the page. A seed sits at the right
 * edge; as you scroll it becomes a bud, then a five-petal sakura, and it is
 * fully open exactly at the bottom. Scrolling can also make a sound, a
 * short low tick as each section arrives, but only once you switch it on.
 * The explorations open in place, the reference's "View case / Close".
 */
const GROUND = "#f6f4ef";
const INK = "#111111";
const ACCENT = "#cf5f9c";
const LINE = "rgba(17,17,17,0.14)";
const SOUND_KEY = "v11-sound";

// Three closed shapes in a 200×200 box, twenty cubic segments each so the
// morph has the same amount of curve to work with at every stage. Written
// out by a small generator (a teardrop; an egg pinched to a calyx with a
// dip at the top; five notched petals round a centre).
const SEED =
  "M100 48 C100.8 48 101 49 102.3 50.8 C103.7 52.7 105.9 55.6 108.2 59.1 C110.4 62.6 113.3 67.1 115.9 71.9 C118.5 76.7 121.4 82.4 123.6 88.1 C125.8 93.8 128 100 129.3 106 C130.6 112 131.5 118.2 131.4 123.9 C131.4 129.6 130.7 135.3 129.2 140.1 C127.7 144.9 125.3 149.4 122.5 152.9 C119.6 156.4 116 159.3 112.2 161.2 C108.5 163 104.1 164 100 164 C95.9 164 91.5 163 87.8 161.2 C84 159.3 80.4 156.4 77.5 152.9 C74.7 149.4 72.3 144.9 70.8 140.1 C69.3 135.3 68.6 129.6 68.6 123.9 C68.5 118.2 69.4 112 70.7 106 C72 100 74.2 93.8 76.4 88.1 C78.6 82.4 81.5 76.7 84.1 71.9 C86.7 67.1 89.6 62.6 91.8 59.1 C94.1 55.6 96.3 52.7 97.7 50.8 C99 49 99.2 48 100 48 Z";
const BUD =
  "M100 51 C104.8 51 110.1 49.4 114.4 49.8 C118.7 50.2 122.1 50.9 125.7 53.5 C129.3 56.2 134.1 60.9 136.2 65.6 C138.3 70.4 138.4 76.4 138.2 82.1 C138 87.8 136.1 94.1 134.9 100 C133.7 105.9 132.8 111.9 130.9 117.3 C129 122.7 126.2 128 123.7 132.5 C121.1 136.9 118.1 141 115.4 144.2 C112.7 147.3 110.2 149.9 107.6 151.5 C105 153.1 102.5 154 100 154 C97.5 154 95 153.1 92.4 151.5 C89.8 149.9 87.3 147.3 84.6 144.2 C81.9 141 78.9 136.9 76.3 132.5 C73.8 128 71 122.7 69.1 117.3 C67.2 111.9 66.3 105.9 65.1 100 C63.9 94.1 62 87.8 61.8 82.1 C61.6 76.4 61.7 70.4 63.8 65.6 C65.9 60.9 70.7 56.2 74.3 53.5 C77.9 50.9 81.3 50.2 85.6 49.8 C89.9 49.4 95.2 51 100 51 Z";
const FLOWER =
  "M91.6 86.4 C69.9 70.7 60.5 39.8 77.5 27.4 C85.5 15.2 95.6 26.1 100 34 C104.4 26.1 114.5 15.2 122.5 27.4 C139.5 39.8 130.1 70.7 110.4 87.8 C118.5 62.3 145.1 43.9 162.1 56.2 C176.1 60 168.9 73 162.8 79.6 C171.6 81.4 185.1 87.6 176 98.9 C169.5 118.9 137.1 119.6 114.8 106.1 C141.6 106 167.3 125.5 160.8 145.5 C161.6 160 147 157.2 138.8 153.4 C139.8 162.4 138 177.1 124.5 171.9 C103.5 171.9 92.8 141.4 98.7 116 C107.2 141.4 96.5 171.9 75.5 171.9 C62 177.1 60.2 162.4 61.2 153.4 C53 157.2 38.4 160 39.2 145.5 C32.7 125.5 58.4 106 84.4 103.7 C62.9 119.6 30.5 118.9 24 98.9 C14.9 87.6 28.4 81.4 37.2 79.6 C31.1 73 23.9 60 37.9 56.2 C54.9 43.9 81.5 62.3 91.6 86.4 Z";
// Five dots at the petal angles, radius 26 from the centre.
const DOTS = [0, 1, 2, 3, 4].map((k) => {
  const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
  return { cx: +(100 + 26 * Math.cos(a)).toFixed(1), cy: +(100 + 26 * Math.sin(a)).toFixed(1) };
});

const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

// The display serif is a DEMO cut and draws a flower for these characters.
// Anything in the serif goes through here so that "&" and "4" are set in
// the sans instead.
const FLOWER_CHARS = /(['"$&4@\-!()*+/=#%]+)/;
function Serif({ children }: { children: string }): ReactNode {
  return children.split(FLOWER_CHARS).map((part, i) => (i % 2 ? <span className="font-sans" key={i}>{part}</span> : part));
}

/**
 * One short tick: a sine sliding 180 → 60 Hz over 120 ms, fading out,
 * with a few milliseconds of noise on the front so it has an edge. `ratio`
 * shifts the pitch so each section has its own.
 */
function tick(ctx: AudioContext, ratio: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180 * ratio, t);
  osc.frequency.exponentialRampToValueAtTime(60 * ratio, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.14);

  const n = Math.floor(ctx.sampleRate * 0.025);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.025, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  noise.connect(noiseGain).connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.03);
}

function Caption({ children }: { children: string }): JSX.Element {
  return <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] opacity-50">{children}</p>;
}

function Heading({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="font-serif-display text-[clamp(2rem,3.2vw,3.6rem)] italic leading-none tracking-[-0.02em]" data-reveal>
      <Serif>{children}</Serif>
    </h2>
  );
}

const css = `
.v11-page { --line: ${LINE}; }
.v11-col { width: min(56vw, 100%); margin-inline: auto; }
.v11-link { text-decoration: underline; text-underline-offset: 0.35em; text-decoration-color: transparent; transition: text-decoration-color 0.3s, opacity 0.3s; }
.v11-link:hover { text-decoration-color: currentColor; }
.v11-tag { font-family: var(--font-inter), system-ui, sans-serif; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.24em; opacity: 0.55; }
.v11-toggle { display: inline-flex; align-items: center; gap: 0.6em; font-family: var(--font-mono), monospace; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.3em; }
.v11-toggle i { width: 0.5em; height: 0.5em; border-radius: 50%; border: 1px solid currentColor; transition: background-color 0.3s; }
.v11-toggle[aria-pressed="true"] i { background: ${ACCENT}; border-color: ${ACCENT}; }
.v11-case { border-top: 1px solid var(--line); }
.v11-case h3 a { transition: color 0.3s; }
.v11-case h3 a:hover { color: ${ACCENT}; }
.v11-ex { border-top: 1px solid var(--line); }
.v11-ex:last-child { border-bottom: 1px solid var(--line); }
.v11-ex button { font-family: var(--font-mono), monospace; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.3em; color: ${ACCENT}; white-space: nowrap; }
.v11-plant { position: fixed; right: 3vw; top: 50%; width: 18vw; height: 18vw; transform: translateY(-50%); pointer-events: none; z-index: 1; }
.v11-chip { display: inline-flex; align-items: center; gap: 0.5rem; border: 1px solid var(--line); border-radius: 9999px; padding: 0.45rem 0.9rem; font-size: 0.82rem; }
`;

const FEATURED = projects.slice(0, 4);
// The remaining project, then the featured hackathon and library ones as
// short entries: the case rows above carry only a line each, so the bullets
// and the stack live here, behind "View case".
const EXPLORATIONS: Project[] = [...projects.slice(4), ...FEATURED.filter((p) => p.kind === "hackathon" || p.kind === "library")];

// One pitch per section, low to high down the page.
const PITCH: Record<string, number> = { hero: 1, work: 1.25, info: 1.5, skills: 1.8, contact: 2.2 };

export default function V11(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const flipTween = useRef<gsap.core.Timeline | null>(null);
  const reduced = useRef(false);
  const [open, setOpen] = useState<number | null>(null);

  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  // The context is made on a click and never before one: browsers refuse
  // to start audio otherwise, and nothing here should play on its own.
  const ensureAudio = () => {
    if (!audioRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioRef.current = new AC();
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  };

  const toggleSound = () => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSound(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // Private mode or blocked storage: the toggle still works for the visit.
    }
    if (next) {
      const ctx = ensureAudio();
      if (ctx) tick(ctx, PITCH.hero);
    }
  };

  const toggleCase = (i: number) => {
    if (!reduced.current && listRef.current) {
      // A flip still running is finished first so it writes its final
      // styles back before the next state is captured.
      if (flipTween.current?.isActive()) flipTween.current.progress(1);
      flipState.current = Flip.getState(listRef.current.querySelectorAll("[data-flip]"));
    }
    setOpen((o) => (o === i ? null : i));
  };

  // The Flip: bounds captured before the state change, animated after it
  // has rendered. Bodies that appeared fade in behind the height change;
  // ones that went hide at once so the row can shrink cleanly.
  useLayoutEffect(() => {
    const state = flipState.current;
    flipState.current = null;
    if (!state) return;
    flipTween.current = Flip.from(state, {
      duration: 0.6,
      ease: "power3.inOut",
      nested: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.35, delay: 0.25, ease: "power2.out" }),
      onLeave: (els) => gsap.set(els, { opacity: 0 }),
      onComplete: () => ScrollTrigger.refresh(),
    });
  }, [open]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let stored = false;
    try {
      stored = window.localStorage.getItem(SOUND_KEY) === "on";
    } catch {
      stored = false;
    }
    soundRef.current = stored;
    setSound(stored);
    // Remembered "on" from an earlier visit: the context still waits for
    // the first press anywhere on the page.
    const wake = () => {
      if (soundRef.current) ensureAudio();
    };
    window.addEventListener("pointerdown", wake, { once: true });

    const ctx = gsap.context(() => {
      const shape = root.querySelector<SVGPathElement>("[data-shape]");
      const bud = root.querySelector<SVGPathElement>("[data-bud]");
      const flower = root.querySelector<SVGPathElement>("[data-flower]");
      const stem = root.querySelector<SVGLineElement>("[data-stem]");
      const dots = root.querySelectorAll<SVGCircleElement>("[data-dot]");
      if (!shape || !bud || !flower || !stem) return;

      if (reduced.current) {
        // No morph: the flower, open, from the start.
        gsap.set(shape, { opacity: 0 });
        gsap.set(flower, { opacity: 1 });
        gsap.set(stem, { scaleY: 1 });
        gsap.set(dots, { scale: 1 });
      } else {
        const canMorph = Boolean((gsap as unknown as { plugins?: Record<string, unknown> }).plugins?.morphSVG);
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.5 },
        });
        tl.fromTo(stem, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.5 }, 0);
        if (canMorph) {
          tl.to(shape, { morphSVG: { shape: BUD, shapeIndex: "auto" }, duration: 1 }, 0);
          tl.to(shape, { morphSVG: { shape: FLOWER, shapeIndex: "auto" }, duration: 1 }, 1);
        } else {
          // The plugin did not register: crossfade the three drawings instead.
          tl.to(shape, { opacity: 0, duration: 1 }, 0);
          tl.fromTo(bud, { opacity: 0 }, { opacity: 1, duration: 1 }, 0);
          tl.to(bud, { opacity: 0, duration: 1 }, 1);
          tl.fromTo(flower, { opacity: 0 }, { opacity: 1, duration: 1 }, 1);
        }
        // The five dots arrive in the last fifth of the page.
        tl.fromTo(dots, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.3, ease: "back.out(2)", stagger: 0.025 }, 1.6);
      }

      // A tick as each section takes the 65% line, going down or back up.
      // Silent while the switch is off or the context has not been made.
      root.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => {
        const ratio = PITCH[el.dataset.section ?? ""] ?? 1;
        const play = () => {
          if (!soundRef.current || !audioRef.current || audioRef.current.state !== "running") return;
          tick(audioRef.current, ratio);
        };
        ScrollTrigger.create({ trigger: el, start: "top 65%", end: "bottom 65%", onEnter: play, onEnterBack: play });
      });
    }, root);

    return () => {
      window.removeEventListener("pointerdown", wake);
      ctx.revert();
      flipTween.current?.kill();
      flipTween.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  return (
    <VariantShell accent={ACCENT} className="v11-page" ground={GROUND} ink={INK} n={11}>
      <style>{css}</style>
      <div className="relative z-[2] text-center" ref={rootRef}>
        {/* The plant, at the right edge, drawn in the accent. Fully open at the bottom of the page. */}
        <svg aria-hidden="true" className="v11-plant" fill={ACCENT} viewBox="0 0 200 200">
          <line data-stem stroke={ACCENT} strokeLinecap="round" strokeWidth="2.5" x1="100" x2="100" y1="150" y2="200" />
          <path d={BUD} data-bud opacity="0" />
          <path d={FLOWER} data-flower opacity="0" />
          <path d={SEED} data-shape />
          {DOTS.map((d) => (
            <circle cx={d.cx} cy={d.cy} data-dot fill={GROUND} key={`${d.cx},${d.cy}`} r="3.2" />
          ))}
        </svg>

        <section className="flex min-h-[86vh] flex-col items-center justify-center px-[3vw] pb-[10vh] pt-[6vh]" data-section="hero">
          <button aria-pressed={sound} className="v11-toggle mb-[7vh] opacity-70 transition-opacity hover:opacity-100" onClick={toggleSound} type="button">
            <i aria-hidden="true" />
            sound: {sound ? "on" : "off"}
          </button>
          <p className="font-mono text-[0.85rem] tracking-[0.55em] opacity-70" data-reveal>
            KH .E
          </p>
          <h1 className="mt-[2.5vh] font-serif-display text-[9vw] leading-[0.95] tracking-[-0.03em]" data-reveal>
            Kevin He
          </h1>
          <p className="mt-[3vh] max-w-[48ch] text-[1.05rem] font-light leading-[1.5]" data-reveal>
            Engineer in Toronto. Software for things that move.
          </p>
          <nav className="mt-[5vh] flex items-baseline gap-[1.2rem] text-[0.78rem] uppercase tracking-[0.22em]" data-reveal>
            <a className="v11-link" href="#work">Work</a>
            <span className="opacity-30">/</span>
            <a className="v11-link" href="#info">Info</a>
            <span className="opacity-30">/</span>
            <a className="v11-link" href="#skills">Skills</a>
          </nav>
        </section>

        <section className="px-[3vw] py-[12vh]" data-section="work" id="work">
          <div className="v11-col">
            <div data-reveal>
              <Caption>Selected work</Caption>
            </div>
            <ul className="mt-[3rem]">
              {FEATURED.map((p, i) => (
                <li className="v11-case py-[3.6rem]" data-reveal key={p.title}>
                  <p className="font-mono text-[0.68rem] tabular-nums tracking-[0.3em] opacity-45">
                    0{i + 1} · {p.year}
                  </p>
                  <h3 className="mt-[1rem] font-serif-display text-[clamp(2.2rem,3.6vw,4.2rem)] leading-[1] tracking-[-0.02em]">
                    {p.href ? (
                      <a href={p.href} rel="noreferrer" target="_blank">
                        <Serif>{p.title}</Serif>
                      </a>
                    ) : (
                      <Serif>{p.title}</Serif>
                    )}
                  </h3>
                  <p className="v11-tag mt-[1.1rem]">
                    {KIND[p.kind]} · {p.stack.slice(0, 3).join(" · ")}
                  </p>
                  <p className="mx-auto mt-[1.1rem] max-w-[46ch] text-[1rem] font-light leading-[1.5] opacity-85">{p.tagline}</p>
                  {p.award ? <p className="mt-[0.9rem] font-serif-display text-[1.05rem] italic" style={{ color: ACCENT }}>{p.award}</p> : null}
                </li>
              ))}
            </ul>

            <div className="mt-[8vh]">
              <Heading>Explorations</Heading>
            </div>
            <ul className="mt-[2.4rem]" ref={listRef}>
              {EXPLORATIONS.map((p, i) => {
                const isOpen = open === i;
                return (
                  <li className="v11-ex py-[1.5rem] text-left" data-flip key={`${p.title}-${i}`}>
                    <div className="flex items-baseline justify-between gap-[2rem]">
                      <div>
                        <p className="font-serif-display text-[1.7rem] leading-none tracking-[-0.01em]">
                          <Serif>{p.title}</Serif>
                        </p>
                        <p className="mt-[0.5rem] text-[0.86rem] font-light opacity-70">{p.award ?? p.tagline}</p>
                      </div>
                      <button aria-controls={`v11-ex-${i}`} aria-expanded={isOpen} onClick={() => toggleCase(i)} type="button">
                        {isOpen ? "Close" : "View case"}
                      </button>
                    </div>
                    <div className="pt-[1.4rem]" data-flip hidden={!isOpen} id={`v11-ex-${i}`}>
                      <ul className="max-w-[56ch] space-y-[0.55rem] text-[0.9rem] font-light leading-[1.55] opacity-80">
                        {p.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                      <p className="v11-tag mt-[1.2rem]">{p.stack.join(" · ")}</p>
                      {p.href ? (
                        <a className="v11-link mt-[1rem] inline-block text-[0.82rem]" href={p.href} rel="noreferrer" style={{ color: ACCENT }} target="_blank">
                          Open {"↗"}
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="px-[3vw] py-[12vh]" data-section="info" id="info">
          <div className="v11-col">
            <div data-reveal>
              <Caption>Info</Caption>
            </div>
            <div className="mt-[3rem] space-y-[4rem]">
              {experience.map((e) => (
                <div data-reveal key={e.org}>
                  <p className="font-mono text-[0.68rem] tracking-[0.3em] opacity-45">
                    {e.when} · {e.where}
                  </p>
                  <p className="mt-[0.9rem] font-serif-display text-[2.2rem] leading-none tracking-[-0.02em]">
                    <Serif>{e.org}</Serif>
                  </p>
                  <p className="mt-[0.7rem] text-[0.92rem] opacity-80">{e.role}</p>
                  <ul className="mx-auto mt-[1.1rem] max-w-[52ch] space-y-[0.5rem] text-[0.88rem] font-light leading-[1.55] opacity-70">
                    {e.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div data-reveal>
                <p className="font-mono text-[0.68rem] tracking-[0.3em] opacity-45">{education.when}</p>
                <p className="mt-[0.9rem] font-serif-display text-[2.2rem] leading-none tracking-[-0.02em]">
                  <Serif>{education.school}</Serif>
                </p>
                <p className="mt-[0.7rem] text-[0.92rem] opacity-80">{education.degree}</p>
              </div>
            </div>

            <div className="mt-[8vh]">
              <Heading>Awards</Heading>
            </div>
            <ul className="mt-[2rem] space-y-[0.7rem] text-[0.95rem] font-light" data-reveal>
              {awards.map((a) => (
                <li key={a.title}>
                  {a.title} <span className="ml-[0.5em] font-mono text-[0.7rem] tabular-nums opacity-45">{a.year}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-[3vw] py-[12vh]" data-section="skills" id="skills">
          <div className="v11-col">
            <div data-reveal>
              <Caption>Skills</Caption>
            </div>
            <div className="mt-[3rem] space-y-[3.6rem]">
              {skillGroups.map((g) => (
                <div data-reveal key={g.label}>
                  <p className="font-serif-display text-[1.9rem] italic leading-none">
                    <Serif>{g.label}</Serif>
                  </p>
                  <p className="mx-auto mt-[0.7rem] max-w-[48ch] text-[0.84rem] font-light leading-[1.5] opacity-60">{g.blurb}</p>
                  <ul className="mt-[1.4rem] flex flex-wrap justify-center gap-[0.6rem]">
                    {g.skills.map((s) => (
                      <li className="v11-chip" key={s.name}>
                        <SkillMark onDark={false} size="0.95rem" skill={s} />
                        {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-[3vw] pb-[16vh] pt-[12vh]" data-section="contact" id="contact">
          <div className="v11-col">
            <div data-reveal>
              <Caption>Contact</Caption>
            </div>
            <a
              className="mt-[2.4rem] inline-block font-sans text-[clamp(1.8rem,5vw,6rem)] font-light leading-none tracking-[-0.04em] transition-colors hover:text-[var(--accent)]"
              data-reveal
              href={`mailto:${EMAIL}`}
            >
              {EMAIL}
            </a>
            <div className="mt-[3rem] flex flex-wrap justify-center gap-[2rem] text-[0.82rem]" data-reveal>
              {elsewhere.map((l) => (
                <a className="v11-link opacity-70 hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>
    </VariantShell>
  );
}
