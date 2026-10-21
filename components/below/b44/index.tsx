"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { education, experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 44, Strip (after leoparpeix.com).
 *
 * First an intro: two short first-person paragraphs on the left in plain
 * sans, and a boxed label "ENGINEER, TORONTO" on the right. Then "Selected
 * projects" and a strip of large bar pictures, one per project, about 60vw
 * wide with the neighbours showing at the edges. The strip is pinned while
 * the page scrolls: scrolling down moves it sideways, one project at a time.
 * Under it one thin row of facts for the project in the middle, set in
 * columns across the whole width: number | title and kind (dim) | award or
 * "—" | year | stack, plus "Project link ↗". Clicking a picture opens that
 * project's detail over the page (Esc or Close shuts it). Last, the skills
 * and contact links in the same row of columns.
 *
 * The bar pictures draw on 2D canvases built in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes.
 *
 * Under reduced motion the strip is not pinned: it is a plain row you
 * scroll sideways, and the facts row follows the project in the middle.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const SCREEN = "var(--arbor-screen-h, 100vh)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Discord bot",
};

// The columns of the facts row, placed where leoparpeix.com places them:
// number at 1.4vw, title at 4.5vw, award at 26vw, year at 50.7vw, the rest
// at 75.4vw. Below lg the row folds to number | everything else.
const ROW = "grid grid-cols-[3.2rem_1fr] gap-x-[1rem] gap-y-[0.4rem] px-[1.6rem] lg:grid-cols-[3.1vw_21.5vw_24.7vw_24.7vw_1fr] lg:gap-x-0 lg:gap-y-0 lg:px-[1.4vw]";
const CELL = "col-start-2 min-w-0 lg:col-start-auto lg:pr-[1.6rem]";
const SMALL = "font-sans text-[1.5rem] leading-[1.3]";
const HEAD = "font-sans text-[clamp(2.6rem,2.25vw,4.4rem)] font-normal leading-[1.2] tracking-[-0.01em] text-white";

const now = experience[0];
const vex = experience.find((e) => e.org.includes("VEX"));
const INTRO_LEAD = "Hello,";
const INTRO = "I’m Kevin He, an engineer based in Toronto. I build systems that bring ideas to life.";
const INTRO_MORE = [
  `Now ${now.role} at ${now.org}, and studying ${education.degree.split(",")[1].trim()} at the ${education.school}.`,
  vex ? `Before that I led the programming for ${vex.org.split(", ")[1]}: a world-record autonomous routine and 80th of ~20,000 teams in global Skills.` : "",
].filter(Boolean);

const CSS = `
.b44-link { text-decoration: none; transition: color 0.2s ease; }
.b44-link:hover, .b44-link:focus-visible { color: #ffffff; }
.b44-under { background-image: linear-gradient(currentColor, currentColor); background-size: 100% 0.1rem; background-repeat: no-repeat; background-position: 0 100%; padding-bottom: 0.3rem; transition: background-size 0.3s ease, color 0.2s ease; }
.b44-under:hover, .b44-under:focus-visible { color: #ffffff; background-size: 0% 0.1rem; background-position: 100% 100%; }
.b44-card { transition: opacity 0.4s ease; }
.b44-facts { animation: b44-fade 0.4s ease; }
@keyframes b44-fade { from { opacity: 0; transform: translateY(0.6rem); } to { opacity: 1; transform: none; } }
.b44-dialog { animation: b44-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b44-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
.b44-scroll { scrollbar-width: none; }
.b44-scroll::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) {
  .b44-link, .b44-under, .b44-card { transition: none; }
  .b44-facts, .b44-dialog { animation: none; }
}
`;

/** How far apart the cards sit, in px. */
function stepOf(cards: (HTMLElement | null)[]): number {
  const a = cards[0];
  const b = cards[1];
  return a && b ? Math.max(1, b.offsetLeft - a.offsetLeft) : 1;
}

function stillMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The facts row for one project, in the page's five columns. */
function Facts({ i, onOpen }: { i: number; onOpen: (i: number) => void }): JSX.Element {
  const p = projects[i];
  return (
    <div className={`${ROW} b44-facts`}>
      <p className={`${SMALL} tabular-nums`}>{i + 1}</p>
      <div className={CELL}>
        <p className={SMALL}>
          <span className="text-white">{p.title}</span> <span className="opacity-50">{KIND[p.kind]}</span>
        </p>
        <p className={`${SMALL} mt-[1.2rem] flex flex-wrap gap-x-[2rem] gap-y-[0.6rem] lg:mt-[4.4rem]`}>
          {p.href ? (
            <a className="b44-under" href={p.href} rel="noreferrer" target="_blank">
              Project link <span className="opacity-60">↗</span>
            </a>
          ) : null}
          <button aria-haspopup="dialog" className="b44-under cursor-pointer" onClick={() => onOpen(i)} type="button">
            Details <span className="opacity-60">+</span>
          </button>
        </p>
      </div>
      <p className={`${CELL} ${SMALL}`}>{p.award ?? <span className="opacity-50">—</span>}</p>
      <p className={`${CELL} ${SMALL} tabular-nums`}>{p.year}</p>
      <div className={CELL}>
        <p className={`${SMALL} opacity-50`}>Stack</p>
        <p className={SMALL}>{p.stack.join(", ")}</p>
      </div>
    </div>
  );
}

function Detail({ i, source, onClose }: { i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const p = projects[i];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b44-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.95)", color: BLOSSOM }}
    >
      <div className="b44-dialog min-h-full pb-[6vh] pt-[3vh]" onClick={(e) => e.stopPropagation()}>
        <div className={`${ROW} items-baseline`}>
          <p className={`${SMALL} tabular-nums`}>{i + 1}</p>
          <p className={`${CELL} ${SMALL} lg:col-span-3`}>
            <span className="text-white" id="b44-detail-title">
              {p.title}
            </span>{" "}
            <span className="opacity-50">{KIND[p.kind]}</span>
          </p>
          <p className={`${CELL} ${SMALL} lg:text-right`}>
            <button className="b44-under cursor-pointer" onClick={onClose} ref={closeRef} type="button">
              Close ✕
            </button>
          </p>
        </div>

        <div className="mt-[2.4rem] grid gap-[3.2rem] px-[1.6rem] lg:grid-cols-[1.7fr_1fr] lg:gap-[4vw] lg:px-[1.4vw]">
          <div className="relative aspect-[16/10] w-full">
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" source={source} /> : null}
          </div>
          <div className="min-w-0">
            <p className="font-sans text-[clamp(2.2rem,1.7vw,3.2rem)] leading-[1.25] text-white">{p.tagline}</p>
            <ul className="mt-[2.4rem] space-y-[1rem]">
              {p.bullets.map((b) => (
                <li className={`${SMALL} flex gap-[1.2rem] leading-[1.45]`} key={b}>
                  <span aria-hidden className="opacity-50">
                    *
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-[2.8rem] grid grid-cols-[8rem_1fr] gap-y-[0.8rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              <dt className={`${SMALL} opacity-50`}>Year</dt>
              <dd className={`${SMALL} tabular-nums`}>{p.year}</dd>
              <dt className={`${SMALL} opacity-50`}>Award</dt>
              <dd className={`${SMALL} ${p.award ? "text-white" : "opacity-50"}`}>{p.award ?? "—"}</dd>
              <dt className={`${SMALL} opacity-50`}>Stack</dt>
              <dd className={SMALL}>{p.stack.join(", ")}</dd>
              {p.href || p.code ? (
                <>
                  <dt className={`${SMALL} opacity-50`}>Links</dt>
                  <dd className={`${SMALL} flex flex-wrap gap-x-[2rem] gap-y-[0.6rem]`}>
                    {p.href ? (
                      <a className="b44-under" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} <span className="opacity-60">↗</span>
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b44-under" href={p.code} rel="noreferrer" target="_blank">
                        Code <span className="opacity-60">↗</span>
                      </a>
                    ) : null}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B44(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [still, setStill] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(-1);
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => {
    setMounted(true);
    setStill(stillMotion());
  }, []);

  // Pictures, made once in the browser (Saturn's is drawn on a canvas).
  const sources = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

  // Pinned: the page's scroll through the tall section moves the strip sideways.
  useEffect(() => {
    if (!mounted || still) return undefined;
    let raf = 0;
    const update = (): void => {
      raf = 0;
      const sec = sectionRef.current;
      const frame = frameRef.current;
      const track = trackRef.current;
      if (!sec || !frame || !track) return;
      const travel = sec.offsetHeight - frame.offsetHeight;
      const p = travel > 0 ? Math.max(0, Math.min(1, -sec.getBoundingClientRect().top / travel)) : 0;
      const pos = p * (projects.length - 1);
      track.style.transform = `translate3d(${-pos * stepOf(cardRefs.current)}px, 0, 0)`;
      setActive(Math.round(pos));
    };
    const ask = (): void => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
    };
  }, [mounted, still]);

  // Not pinned: the strip scrolls sideways on its own; follow the middle card.
  useEffect(() => {
    if (!still) return undefined;
    const track = trackRef.current;
    if (!track) return undefined;
    track.style.transform = "";
    const onScroll = (): void => {
      const i = Math.round(track.scrollLeft / stepOf(cardRefs.current));
      setActive(Math.max(0, Math.min(projects.length - 1, i)));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [still]);

  // Tabbing to a card that is off to the side brings it to the middle.
  const bring = useCallback(
    (i: number, el: HTMLElement) => {
      if (still || !el.matches(":focus-visible")) return;
      const sec = sectionRef.current;
      const frame = frameRef.current;
      if (!sec || !frame) return;
      const travel = sec.offsetHeight - frame.offsetHeight;
      const top = window.scrollY + sec.getBoundingClientRect().top + (travel * i) / (projects.length - 1);
      window.scrollTo({ top, behavior: "auto" });
    },
    [still],
  );

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the picture that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      cardRefs.current[lastOpen.current]?.focus({ preventScroll: true });
      lastOpen.current = -1;
    }
  }, [open]);

  return (
    <div className="relative w-full font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Intro: the paragraphs on the left, the boxed label on the right. */}
      <section className="grid grid-cols-1 gap-y-[4.8rem] px-[1.6rem] pt-[10vh] lg:grid-cols-[1fr_24.5vw] lg:gap-x-[6vw] lg:pl-[9.6vw] lg:pr-[9.5vw] lg:pt-[10vh]">
        <div className="min-w-0">
          <p className={`${HEAD} max-w-[62rem] lg:max-w-[32vw]`}>
            {INTRO_LEAD}
            <br />
            {INTRO}
          </p>
          <div className="mt-[4.8rem] grid grid-cols-[3.2rem_1fr] lg:mt-[7vh] lg:grid-cols-[8vw_1fr]">
            <span aria-hidden className="font-sans text-[2.4rem] leading-[1] text-white">
              *
            </span>
            <div className="max-w-[44rem] space-y-[1.8rem] lg:max-w-[24vw]">
              {INTRO_MORE.map((t) => (
                <p className="font-sans text-[clamp(1.5rem,1.1vw,2rem)] leading-[1.35]" key={t}>
                  {t}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:pt-[12vh]">
          <div className="relative flex aspect-[1.6/1] w-full items-center justify-center px-[3.6rem]" style={{ backgroundColor: "rgba(42, 13, 30, 0.85)", border: LINE }}>
            <span aria-hidden className="absolute left-[0.8rem] top-1/2 -translate-y-1/2 text-[0.9rem] leading-[1] opacity-70">
              Kevin He
            </span>
            <p className="text-center font-sans text-[clamp(2.8rem,2.5vw,5.2rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-white">
              Engineer,
              <br />
              Toronto
            </p>
            <span aria-hidden className="absolute right-[0.8rem] top-1/2 -translate-y-1/2 text-[0.9rem] leading-[1] opacity-70">
              {education.when.slice(0, 4)}
            </span>
          </div>
        </div>
      </section>

      <h2 className={`${HEAD} mt-[10vh] px-[1.6rem] lg:mt-[12vh] lg:pl-[9.6vw]`}>Selected projects</h2>

      {/* The strip: a tall section with a pinned frame, or a plain sideways row. */}
      <section aria-label="Selected projects" ref={sectionRef} style={{ height: still ? "auto" : "150vh" }}>
        <div
          className="flex w-full flex-col justify-center overflow-hidden py-[4vh]"
          ref={frameRef}
          style={still ? undefined : { position: "sticky", top: 0, height: SCREEN }}
        >
          <div
            className={`flex gap-[1.6rem] px-[11vw] lg:gap-[1.25vw] lg:px-[20vw] ${still ? "b44-scroll snap-x snap-mandatory overflow-x-auto" : ""}`}
            ref={trackRef}
            style={{ willChange: still ? undefined : "transform" }}
          >
            {projects.map((p, i) => (
              <button
                aria-haspopup="dialog"
                aria-label={`${p.title}, open details`}
                className="b44-card relative h-[56vw] w-[78vw] shrink-0 cursor-pointer snap-center lg:h-[min(37.5vw,60vh)] lg:w-[60vw]"
                key={p.title}
                onClick={() => setOpen(i)}
                onFocus={(e) => bring(i, e.currentTarget)}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                style={{ opacity: active === i ? 1 : 0.55 }}
                type="button"
              >
                {sources ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" source={sources[i]} /> : null}
              </button>
            ))}
          </div>
          <div className="mt-[2rem] lg:mt-[2.8rem]">
            <Facts i={active} key={active} onOpen={setOpen} />
          </div>
        </div>
      </section>

      {/* Skills and contact, in the facts row's columns. */}
      <section className="pb-[10vh] pt-[6vh]">
        <h2 className={`${HEAD} px-[1.6rem] lg:pl-[9.6vw]`}>Skills &amp; contact</h2>
        <div className="mt-[4.8rem] space-y-[1.8rem] lg:space-y-[1.2rem]">
          {skillGroups.map((g, i) => (
            <div className={ROW} key={g.label}>
              <p className={`${SMALL} tabular-nums`}>{pad2(i + 1)}</p>
              <p className={`${CELL} ${SMALL} text-white`}>{g.label}</p>
              <p className={`${CELL} ${SMALL} lg:col-span-3`}>
                {g.skills.map((s, k) => (
                  <span key={s.name}>
                    {s.name}
                    {k < g.skills.length - 1 ? <span className="opacity-40">, </span> : null}
                  </span>
                ))}
              </p>
            </div>
          ))}
          <div className={`${ROW} pt-[2.4rem] lg:pt-[3.6rem]`}>
            <p className={`${SMALL} tabular-nums`}>{pad2(skillGroups.length + 1)}</p>
            <p className={`${CELL} ${SMALL} text-white`}>Contact</p>
            <p className={`${CELL} ${SMALL} lg:col-span-2`}>
              <a className="b44-under break-all" href={`mailto:${EMAIL}`}>
                {EMAIL} <span className="opacity-60">↗</span>
              </a>
            </p>
            <ul className={`${CELL} ${SMALL} space-y-[0.2rem]`}>
              {elsewhere.map((l) => (
                <li key={l.href}>
                  <a className="b44-link" href={l.href} rel="noreferrer" target="_blank">
                    {l.label} <span className="opacity-50">{l.handle}</span> <span className="opacity-60">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
