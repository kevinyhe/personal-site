"use client";

import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups, type Project } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(ScrollTrigger);

/**
 * 09 HOVER. After dennissnellenberg.com (Site of the Day, 2023): the name
 * as a rolling marquee, a location chip with a turning globe, a two-column
 * statement with a round blue button, then the project list where one
 * tile follows the cursor and slides between the projects' pictures as
 * the hover moves down the rows. The buttons are magnetic. The contact
 * section is the page inverted, and its top edge arrives as a curve that
 * flattens as it reaches the viewport.
 */
const GROUND = "#f4f2ee";
const INK = "#1c1d20";
const ACCENT = "#455ce9";
const LINE = "rgba(28,29,32,0.16)";
const LINE_ON_DARK = "rgba(244,242,238,0.2)";

/** The row's right-hand word for each project kind. */
const KIND: Record<Project["kind"], string> = {
  company: "Product",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

/** One ground and ink per project for the tile's stack of pictures. */
const TONES: { bg: string; fg: string }[] = [
  { bg: "#455ce9", fg: "#f4f2ee" },
  { bg: "#1c1d20", fg: "#f4f2ee" },
  { bg: "#d9c3a5", fg: "#1c1d20" },
  { bg: "#8b9bb4", fg: "#f4f2ee" },
  { bg: "#c9d4f0", fg: "#1c1d20" },
];

/** How far the contact curve stands up before it flattens, in viewBox units. */
const BULGE = 40;
const curvePath = (bulge: number) => `M0 100 Q 50 ${100 - 2 * bulge} 100 100 Z`;

function Label({ children }: { children: string }): JSX.Element {
  return (
    <p className="flex items-center gap-[0.7rem] text-[0.82rem]" data-reveal>
      <span className="block h-[0.5rem] w-[0.5rem] rounded-full bg-current" />
      {children}
    </p>
  );
}

/**
 * A round button that leans toward the cursor. Within 6rem of its edge
 * the button moves 0.35 of the cursor's offset from its centre and the
 * label another 0.15, so the label reads as sitting above the disc. Past
 * the edge it springs back. Skipped for reduced motion and for pointers
 * that cannot hover.
 */
function Magnet({ href, children, size, className = "", style }: { href: string; children: ReactNode; size: string; className?: string; style?: CSSProperties }): JSX.Element {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const label = labelRef.current;
    if (!el || !label) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (!window.matchMedia("(hover: hover)").matches) return undefined;
    let inside = false;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      // The rect already includes the button's current lean; take it back
      // out so the centre is the resting one and the pull does not feed on
      // itself.
      const cx = r.left + r.width / 2 - Number(gsap.getProperty(el, "x"));
      const cy = r.top + r.height / 2 - Number(gsap.getProperty(el, "y"));
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const reach = r.width / 2 + 6 * rem;
      if (Math.hypot(dx, dy) < reach) {
        inside = true;
        gsap.to(el, { x: dx * 0.35, y: dy * 0.35, duration: 0.3, ease: "power3", overwrite: "auto" });
        gsap.to(label, { x: dx * 0.15, y: dy * 0.15, duration: 0.3, ease: "power3", overwrite: "auto" });
      } else if (inside) {
        release();
      }
    };
    // Scrolling carries the button away from a still cursor, and the
    // pointer can leave the window while over it; both need the spring
    // back that only a mousemove would otherwise give.
    const release = () => {
      inside = false;
      gsap.to([el, label], { x: 0, y: 0, duration: 1, ease: "elastic.out(1, 0.3)", overwrite: "auto" });
    };
    const onLeave = () => {
      if (inside) release();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("scroll", onLeave, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onLeave);
      document.removeEventListener("mouseleave", onLeave);
      gsap.killTweensOf([el, label]);
      gsap.set([el, label], { clearProps: "transform" });
    };
  }, []);
  return (
    <a
      className={`inline-flex items-center justify-center rounded-full text-center text-[1rem] leading-[1.2] ${className}`}
      href={href}
      ref={ref}
      style={{ width: size, height: size, backgroundColor: ACCENT, color: "#f4f2ee", ...style }}
    >
      <span className="block" ref={labelRef}>
        {children}
      </span>
    </a>
  );
}

/** A globe: a circle, two meridians and the equator, turning once in 8 s. */
function Globe(): JSX.Element {
  return (
    <svg aria-hidden="true" className="v09-globe block h-[1.3rem] w-[1.3rem]" fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <ellipse cx="12" cy="12" rx="8" ry="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
    </svg>
  );
}

function LocalTime(): JSX.Element {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto", timeZoneName: "short" });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{time}</span>;
}

export default function V09(): JSX.Element {
  const listRef = useRef<HTMLUListElement | null>(null);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const tileInRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  // The cursor-following tile over the project list.
  useEffect(() => {
    const list = listRef.current;
    const tile = tileRef.current;
    const inner = tileInRef.current;
    const stack = stackRef.current;
    const badge = badgeRef.current;
    if (!list || !tile || !inner || !stack || !badge) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"));

    const ctx = gsap.context(() => {
      gsap.set([inner, badge], { scale: 0 });
      if (!reduced) gsap.set(tile, { xPercent: -50, yPercent: -50 });
    });
    // Under reduced motion the tile stays put at the right of the viewport
    // and only swaps picture; nothing follows the cursor.
    if (reduced) tile.classList.add("v09-tile--still");

    const toX = reduced ? null : gsap.quickTo(tile, "x", { duration: 0.6, ease: "power3" });
    const toY = reduced ? null : gsap.quickTo(tile, "y", { duration: 0.6, ease: "power3" });
    // The first move places the tile outright; otherwise it would sweep in
    // from the corner it was parked in.
    let placed = false;
    const place = (e: MouseEvent) => {
      if (reduced || placed) return;
      placed = true;
      gsap.set(tile, { x: e.clientX, y: e.clientY });
    };
    const move = (e: MouseEvent) => {
      if (!placed) {
        place(e);
        return;
      }
      toX?.(e.clientX);
      toY?.(e.clientY);
    };
    // mouseenter carries the cursor position too, and a row can arrive
    // under a still cursor (wheel scrolling) with no mousemove at all; the
    // tile has to be placed before it grows or it grows in the corner.
    const show = (e: MouseEvent, i: number) => {
      place(e);
      gsap.to(stack, { yPercent: -i * 100, duration: reduced ? 0 : 0.45, ease: "power3", overwrite: "auto" });
      gsap.to(inner, { scale: 1, duration: reduced ? 0 : 0.3, ease: "power3", overwrite: "auto" });
      gsap.to(badge, { scale: 1, duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.05, ease: "power3", overwrite: "auto" });
    };
    const hide = () => {
      gsap.to([inner, badge], { scale: 0, duration: reduced ? 0 : 0.3, ease: "power3", overwrite: "auto" });
    };
    const enters = rows.map((row, i) => {
      const fn = (e: MouseEvent) => show(e, i);
      row.addEventListener("mouseenter", fn);
      return fn;
    });
    list.addEventListener("mouseleave", hide);
    if (!reduced) list.addEventListener("mousemove", move);
    return () => {
      rows.forEach((row, i) => row.removeEventListener("mouseenter", enters[i]));
      list.removeEventListener("mouseleave", hide);
      list.removeEventListener("mousemove", move);
      tile.classList.remove("v09-tile--still");
      ctx.revert();
    };
  }, []);

  // The contact section's curved top, flattening as the section arrives.
  useEffect(() => {
    const section = contactRef.current;
    const path = pathRef.current;
    if (!section || !path) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      path.setAttribute("d", curvePath(0));
      return () => path.setAttribute("d", curvePath(BULGE));
    }
    const state = { bulge: BULGE };
    const ctx = gsap.context(() => {
      gsap.to(state, {
        bulge: 0,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "top 40%", scrub: true },
        onUpdate: () => path.setAttribute("d", curvePath(state.bulge)),
      });
    });
    return () => {
      ctx.revert();
      path.setAttribute("d", curvePath(BULGE));
    };
  }, []);

  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={9}>
      <style>{`
        .v09-globe { transform-origin: 50% 50%; animation: v09-spin 8s linear infinite; }
        @keyframes v09-spin { to { transform: rotate(360deg); } }
        .v09-row { transition: opacity 0.4s cubic-bezier(0.22,1,0.36,1); }
        .v09-list:hover .v09-row { opacity: 0.4; }
        .v09-list .v09-row:hover { opacity: 1; }
        .v09-row-title, .v09-row-kind { transition: transform 0.4s cubic-bezier(0.22,1,0.36,1); }
        .v09-row:hover .v09-row-title { transform: translateX(1rem); }
        .v09-row:hover .v09-row-kind { transform: translateX(-1rem); }
        .v09-tile { position: fixed; left: 0; top: 0; z-index: 30; pointer-events: none; }
        .v09-tile--still { left: auto; right: 3vw; top: 50%; transform: translateY(-50%); }
        .v09-pill { transition: background-color 0.3s, color 0.3s; }
        .v09-pill:hover { background-color: #f4f2ee; color: #1c1d20; }
        @media (hover: none) { .v09-tile { display: none; } }
        @media (prefers-reduced-motion: reduce) {
          .v09-globe { animation: none; }
          .v09-row, .v09-row-title, .v09-row-kind { transition: none; }
        }
      `}</style>

      {/* Hero: the chip and the three words, then the name rolling along the bottom. */}
      <section className="flex min-h-[86vh] flex-col justify-end">
        <div className="flex items-end justify-between px-[3vw] pb-[8vh]">
          <div className="inline-flex items-center gap-[1.2rem] rounded-full py-[0.5rem] pl-[1.6rem] pr-[0.5rem] text-[0.95rem]" data-reveal style={{ backgroundColor: INK, color: GROUND }}>
            <span>Located in Toronto</span>
            <span className="flex h-[2.6rem] w-[2.6rem] items-center justify-center rounded-full" style={{ backgroundColor: "#35363b" }}>
              <Globe />
            </span>
          </div>
          <div className="text-[1.6rem] leading-[1.25] tracking-[-0.02em]" data-reveal>
            <span aria-hidden="true" className="block text-[1.2rem] opacity-60">
              {"↓"}
            </span>
            <p>Engineer</p>
            <p>Founder</p>
            <p>Robots</p>
          </div>
        </div>
        <h1 aria-label="Kevin He" className="marquee flex overflow-hidden whitespace-nowrap text-[14vw] font-medium leading-[0.92] tracking-[-0.05em]" style={{ ["--marquee-s" as string]: "22s" }}>
          <div aria-hidden="true" className="flex shrink-0">
            {[0, 1].map((k) => (
              <span className="block pr-[0.25em]" key={k}>
                Kevin He {"—"} Kevin He {"—"} Kevin He {"—"}
              </span>
            ))}
          </div>
        </h1>
      </section>

      {/* Statement: the one line, and beside it who is saying it. */}
      <section className="grid grid-cols-[1.35fr_1fr] gap-[5vw] border-t px-[3vw] pb-[16vh] pt-[14vh]" style={{ borderColor: LINE }}>
        <p className="text-[4.6vw] font-normal leading-[1.08] tracking-[-0.035em]" data-reveal>
          I build the software that makes hardware <em className="font-serif-display italic">move.</em>
        </p>
        <div className="flex flex-col items-start gap-[3rem] pt-[1vw]">
          <p className="max-w-[34ch] text-[1.1rem] leading-[1.55]" data-reveal>
            Computer engineering at the {education.school}. Co{"‑"}founder and CTO of {experience[0].org}:{" "}
            {projects[0].tagline.charAt(0).toLowerCase() + projects[0].tagline.slice(1)} Before that, lead programmer of {experience[2].org}: the controls stack behind a
            world{"‑"}record autonomous routine.
          </p>
          <div data-reveal>
            <Magnet href="#info" size="12rem">
              About me
            </Magnet>
          </div>
        </div>
      </section>

      {/* Work: the rows, and one tile that follows the cursor across them. */}
      <section className="px-[3vw] pb-[12vh]" id="work">
        <Label>Recent work</Label>
        <ul className="v09-list mt-[3rem] border-b" data-reveal ref={listRef} style={{ borderColor: LINE }}>
          {projects.map((p) => {
            const inner = (
              <>
                <div>
                  <h2 className="v09-row-title text-[3.4vw] font-normal leading-[1] tracking-[-0.03em]">{p.title}</h2>
                  <p className="mt-[0.9rem] text-[0.95rem] opacity-60">{p.tagline}</p>
                </div>
                <div className="v09-row-kind text-right text-[0.95rem]">
                  <p style={{ fontVariant: "small-caps", letterSpacing: "0.06em" }}>{KIND[p.kind]}</p>
                  <p className="mt-[0.4rem] text-[0.82rem] tabular-nums opacity-60">{p.award ? `${p.award}, ${p.year}` : p.year}</p>
                </div>
              </>
            );
            const cls = "grid grid-cols-[1fr_auto] items-center gap-[3vw] px-[4vw] py-[2.8rem]";
            return (
              <li className="v09-row border-t" data-row key={p.title} style={{ borderColor: LINE }}>
                {p.href ? (
                  <a className={cls} href={p.href} rel="noreferrer" target="_blank">
                    {inner}
                  </a>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
        <div aria-hidden="true" className="v09-tile h-[18vw] w-[26vw]" ref={tileRef}>
          <div className="relative h-full w-full overflow-hidden rounded-[0.6rem]" ref={tileInRef}>
            <div className="h-full w-full" ref={stackRef}>
              {projects.map((p, i) => (
                <div className="flex h-full w-full flex-col justify-between p-[1.6rem]" key={p.title} style={{ backgroundColor: TONES[i % TONES.length].bg, color: TONES[i % TONES.length].fg }}>
                  <p className="text-[0.85rem] opacity-70" style={{ fontVariant: "small-caps", letterSpacing: "0.06em" }}>
                    {KIND[p.kind]}
                  </p>
                  <p className="text-[2.2vw] font-medium leading-[1] tracking-[-0.03em]">{p.title}</p>
                </div>
              ))}
            </div>
            <div className="absolute left-1/2 top-1/2 flex h-[6rem] w-[6rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[0.95rem]" ref={badgeRef} style={{ backgroundColor: ACCENT, color: GROUND }}>
              View
            </div>
          </div>
        </div>
      </section>

      {/* Info: experience, education and awards as rows against a label that stays put. */}
      <section className="px-[3vw] pb-[10vh]" id="info">
        <div className="grid grid-cols-[1fr_3fr] gap-[3vw] border-t pt-[3rem]" style={{ borderColor: LINE }}>
          <div className="sticky top-[7rem] self-start">
            <Label>Experience</Label>
          </div>
          <ol>
            {experience.map((e, i) => (
              <li className={`grid grid-cols-[1fr_1.2fr] gap-[3vw] py-[2.4rem] ${i ? "border-t" : ""}`} data-reveal key={e.org} style={{ borderColor: LINE }}>
                <div>
                  <p className="text-[1.9rem] font-normal leading-[1.05] tracking-[-0.03em]">{e.org}</p>
                  <p className="mt-[0.8rem] text-[0.95rem] opacity-70">{e.role}</p>
                  <p className="mt-[0.3rem] text-[0.85rem] tabular-nums opacity-50">
                    {e.where}, {e.when}
                  </p>
                </div>
                <ul className="space-y-[0.6rem] text-[0.95rem] leading-[1.5] opacity-80">
                  {e.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </li>
            ))}
            <li className="grid grid-cols-[1fr_1.2fr] gap-[3vw] border-t py-[2.4rem]" data-reveal style={{ borderColor: LINE }}>
              <div>
                <p className="text-[1.9rem] font-normal leading-[1.05] tracking-[-0.03em]">{education.school}</p>
                <p className="mt-[0.8rem] text-[0.95rem] opacity-70">{education.degree}</p>
                <p className="mt-[0.3rem] text-[0.85rem] tabular-nums opacity-50">{education.when}</p>
              </div>
              <p className="text-[0.95rem] leading-[1.5] opacity-80">Education</p>
            </li>
          </ol>
        </div>
        <div className="mt-[6vh] grid grid-cols-[1fr_3fr] gap-[3vw] border-t pt-[3rem]" style={{ borderColor: LINE }}>
          <div className="sticky top-[7rem] self-start">
            <Label>Awards</Label>
          </div>
          <ul>
            {awards.map((a, i) => (
              <li className={`flex items-baseline justify-between py-[1.2rem] text-[1.1rem] ${i ? "border-t" : ""}`} data-reveal key={a.title} style={{ borderColor: LINE }}>
                <span>{a.title}</span>
                <span className="tabular-nums opacity-50">{a.year}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Skills: each group a row of marks and names, against a label that stays put. */}
      <section className="px-[3vw] pb-[10vh]" id="skills">
        <div className="grid grid-cols-[1fr_3fr] gap-[3vw] border-t pt-[3rem]" style={{ borderColor: LINE }}>
          <div className="sticky top-[7rem] self-start">
            <Label>Skills</Label>
          </div>
          <ul>
            {skillGroups.map((g, i) => (
              <li className={`grid grid-cols-[1fr_2fr] gap-[3vw] py-[2.4rem] ${i ? "border-t" : ""}`} data-reveal key={g.label} style={{ borderColor: LINE }}>
                <div>
                  <p className="text-[1.5rem] leading-[1.1] tracking-[-0.02em]">{g.label}</p>
                  <p className="mt-[0.7rem] max-w-[30ch] text-[0.9rem] leading-[1.5] opacity-60">{g.blurb}</p>
                </div>
                <ul className="flex flex-wrap gap-[0.7rem] self-start">
                  {g.skills.map((s) => (
                    <li className="inline-flex items-center gap-[0.6rem] rounded-full border px-[1.1rem] py-[0.55rem] text-[0.92rem]" key={s.name} style={{ borderColor: LINE }}>
                      <SkillMark onDark={false} size="1rem" skill={s} />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact: the page inverted, arriving under a curve that flattens. */}
      <div className="relative mt-[10vw]">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 block h-[10vw] w-full" preserveAspectRatio="none" style={{ bottom: "calc(100% - 0.06rem)" }} viewBox="0 0 100 100">
          <path d={curvePath(BULGE)} fill={INK} ref={pathRef} />
        </svg>
        <section className="px-[3vw] pb-[4vh] pt-[6vh]" id="contact" ref={contactRef} style={{ backgroundColor: INK, color: GROUND }}>
          <p className="max-w-[12ch] text-[6vw] font-normal leading-[1] tracking-[-0.04em]" data-reveal>
            Let{"’"}s work <em className="font-serif-display italic">together</em>
          </p>
          <div className="relative mt-[5rem] border-t" data-reveal style={{ borderColor: LINE_ON_DARK }}>
            <div className="absolute right-[8vw] top-0 -translate-y-1/2">
              <Magnet href={`mailto:${EMAIL}`} size="12rem">
                Get in touch
              </Magnet>
            </div>
          </div>
          <div className="mt-[4rem] flex flex-wrap gap-[1.2rem]" data-reveal>
            <a className="v09-pill rounded-full border px-[2rem] py-[1.2rem] text-[1.05rem]" href={`mailto:${EMAIL}`} style={{ borderColor: LINE_ON_DARK }}>
              {EMAIL}
            </a>
            <a className="v09-pill rounded-full border px-[2rem] py-[1.2rem] text-[1.05rem]" href={elsewhere[0].href} rel="noreferrer" style={{ borderColor: LINE_ON_DARK }} target="_blank">
              {elsewhere[0].handle}
            </a>
          </div>
          <div className="mt-[14vh] flex items-end justify-between gap-[3vw] border-t pt-[1.6rem] text-[0.82rem]" data-reveal style={{ borderColor: LINE_ON_DARK }}>
            <div className="flex gap-[4vw]">
              <div>
                <p className="uppercase tracking-[0.18em] opacity-50">Version</p>
                <p className="mt-[0.5rem]">2026 {"©"} Edition</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.18em] opacity-50">Local time</p>
                <p className="mt-[0.5rem]">
                  <LocalTime />
                </p>
              </div>
            </div>
            <div>
              <p className="uppercase tracking-[0.18em] opacity-50">Elsewhere</p>
              <div className="mt-[0.5rem] flex gap-[1.8rem]">
                {elsewhere.map((l) => (
                  <a className="opacity-80 transition-opacity hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </VariantShell>
  );
}
