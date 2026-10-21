"use client";

import { type FocusEvent, type JSX, type MouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { awards, experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { skillIcon } from "@/components/skillIcons";
import { groupPlate } from "./plates";

/**
 * Design 43, Ring. After jesperlandberg.com.
 *
 * One screen, no pinning. The cards stand side by side on the outside of a
 * big cylinder seen in perspective (CSS 3D, no WebGL): the one in front is
 * flat and full size, the ones to each side turn away and get smaller and
 * darker, and the ones round the back are hidden. A faint grid floor runs
 * under them to a fade. The ring turns slowly on its own; dragging turns
 * it and lets go with some speed left; a sideways wheel turns it while the
 * cursor is over it; pointing at a card stops the slow turn.
 *
 * Eight cards in Work: the five projects, the VEX team, the awards, and a
 * Skills card. Each is a bar picture with its name small at the lower
 * left. Four small labels sit in the corners: the name, Contact, the Work /
 * Skills switch (Skills swaps the ring for the five skill groups), and the
 * number of the card in front. Clicking a card opens its detail over the
 * page (Esc or Close shuts it). Under the stage, one row: the skill groups
 * and the contact links.
 *
 * Under 768px the ring flattens to a row you swipe. Under reduced motion
 * the ring does not turn on its own and stops when you let go.
 *
 * The bar pictures draw on canvases made in the browser, so the cards wait
 * for a mounted flag and the server render has an empty stage.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const CORNER = "font-sans text-[1.2rem] font-semibold uppercase leading-[1.2] tracking-[0.02em]";
const SMALL = "font-sans text-[1.2rem] uppercase leading-[1.5] tracking-[0.06em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};
const TEAM = experience.find((e) => e.org.includes("VEX"));
const DRIFT = -3; // degrees a second, leftward

const CSS = `
.b43-link { transition: color 0.2s ease, opacity 0.2s ease; }
.b43-link:hover, .b43-link:focus-visible { color: #ffffff; opacity: 1; }
.b43-card { outline: none; }
.b43-card:focus-visible { box-shadow: 0 0 0 0.2rem #ffffff; }
.b43-card .b43-go { transition: transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1), background-color 0.3s ease; }
.b43-card:hover .b43-go, .b43-card:focus-visible .b43-go { transform: scale(1.12); background-color: ${BLOSSOM}; color: ${BAND}; }
.b43-ring { animation: b43-in 0.6s ease both; }
.b43-dialog { animation: b43-up 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b43-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes b43-up { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
.b43-row { scrollbar-width: none; }
.b43-row::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) {
  .b43-link, .b43-card .b43-go { transition: none; }
  .b43-ring, .b43-dialog { animation: none; }
}
`;

type Sheet = { kind: "project"; i: number } | { kind: "group"; i: number } | { kind: "awards" } | { kind: "team" };

type Card = {
  key: string;
  name: string;
  source: BarSource | null;
  /** What clicking it does. */
  sheet: Sheet | "skills";
};

type Geo = { sw: number; sh: number; w: number; h: number; gap: number; r: number; p: number; step: number };

function stillMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** An angle folded into [-span/2, span/2). */
function wrap(a: number, span: number): number {
  return ((((a + span / 2) % span) + span) % span) - span / 2;
}

function geometry(sw: number, sh: number, n: number): Geo {
  const w = Math.min(sw * 0.42, sh * 0.52 * 1.45);
  const h = w / 1.45;
  const gap = sw * 0.012;
  const step = n >= 7 ? 36 : 45;
  const r = (w / 2 + gap) / Math.tan((step / 2) * (Math.PI / 180));
  return { sw, sh, w, h, gap, r, p: sw * 1.05, step };
}

/** The card face: bar picture, its name small at the lower left, a round arrow at the lower right. */
function Face({ card, cell, shadeRef }: { card: Card; cell: number; shadeRef?: (el: HTMLSpanElement | null) => void }): JSX.Element {
  return (
    <>
      {card.source ? <BarPicture alt="" cell={cell} className="absolute inset-0" source={card.source} /> : null}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%]" style={{ background: `linear-gradient(to top, ${BAND}, transparent)` }} />
      <span className="pointer-events-none absolute bottom-[7%] left-[4.5%] right-[16%] text-left font-sans text-[clamp(1.5rem,1.15vw,2.4rem)] font-medium leading-[1.15] tracking-[-0.01em] text-white">
        {card.name}
      </span>
      <span
        aria-hidden
        className="b43-go pointer-events-none absolute bottom-[7%] right-[4.5%] flex h-[2.8rem] w-[2.8rem] items-center justify-center rounded-full font-sans text-[1.3rem] text-white"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
      >
        →
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-black" ref={shadeRef} style={{ opacity: 0 }} />
    </>
  );
}

function Detail({ sheet, source, onClose }: { sheet: Sheet; source: BarSource | null; onClose: () => void }): JSX.Element {
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

  let kicker = "";
  let title = "";
  let lede = "";
  let body: JSX.Element | null = null;

  if (sheet.kind === "project") {
    const p = projects[sheet.i];
    kicker = `${p.year} · ${KIND[p.kind]}`;
    title = p.title;
    lede = p.tagline;
    body = (
      <>
        <ul className="mt-[2.4rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
          {p.bullets.map((b) => (
            <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
              <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
              {b}
            </li>
          ))}
        </ul>
        <dl className="mt-[2rem] grid grid-cols-[8rem_1fr] gap-y-[0.8rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
          <dt className={`${SMALL} opacity-60`}>Stack</dt>
          <dd className={`${SMALL} text-white`}>{p.stack.join(", ")}</dd>
          {p.award ? (
            <>
              <dt className={`${SMALL} opacity-60`}>Award</dt>
              <dd className={`${SMALL} text-white`}>{p.award}</dd>
            </>
          ) : null}
          {p.href || p.code ? (
            <>
              <dt className={`${SMALL} opacity-60`}>Links</dt>
              <dd className={`${SMALL} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]`}>
                {p.href ? (
                  <a className="b43-link text-white" href={p.href} rel="noreferrer" target="_blank">
                    {hostOf(p.href)} ↗
                  </a>
                ) : null}
                {p.code ? (
                  <a className="b43-link text-white" href={p.code} rel="noreferrer" target="_blank">
                    Code ↗
                  </a>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      </>
    );
  } else if (sheet.kind === "group") {
    const g = skillGroups[sheet.i];
    kicker = `Skills · ${pad2(sheet.i + 1)} / ${pad2(skillGroups.length)}`;
    title = g.label;
    lede = g.blurb;
    body = (
      <ul className="mt-[2.4rem] grid grid-cols-2 gap-x-[2rem] gap-y-[1.2rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
        {g.skills.map((s) => {
          const icon = skillIcon(s.icon);
          return (
            <li className="flex items-center gap-[1rem] font-sans text-[1.5rem] leading-[1.3]" key={s.name}>
              {icon ? (
                <svg aria-hidden className="h-[1.8rem] w-[1.8rem] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d={icon.path} />
                </svg>
              ) : (
                <span aria-hidden className="w-[1.8rem] shrink-0 text-center font-sans text-[0.9rem] font-bold">
                  {s.mark}
                </span>
              )}
              <span className="text-white">{s.name}</span>
            </li>
          );
        })}
      </ul>
    );
  } else if (sheet.kind === "awards") {
    kicker = "Recognition";
    title = "Awards";
    body = (
      <ul className="mt-[2.4rem]" style={{ borderTop: LINE }}>
        {awards.map((a) => (
          <li className="flex items-baseline justify-between gap-[1.6rem] py-[1rem] font-sans text-[1.5rem] leading-[1.4]" key={a.title} style={{ borderBottom: LINE }}>
            <span className="text-white">{a.title}</span>
            <span className="tabular-nums opacity-70">{a.year}</span>
          </li>
        ))}
      </ul>
    );
  } else if (TEAM) {
    kicker = `${TEAM.when} · ${TEAM.where}`;
    title = TEAM.org;
    lede = TEAM.role;
    body = (
      <ul className="mt-[2.4rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
        {TEAM.bullets.map((b) => (
          <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
            <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
            {b}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      aria-labelledby="b43-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[6vh] md:px-[5.3vw]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b43-dialog mx-auto max-w-[150rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-[2rem]">
          <p className={`${CORNER} opacity-70`}>{kicker}</p>
          <button className={`${CORNER} b43-link cursor-pointer py-[0.4rem] text-white`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="grid gap-x-[4vw] gap-y-[3rem] lg:grid-cols-[1.35fr_1fr]">
          <div className="relative aspect-[1.45] w-full overflow-hidden rounded-[1.6rem]" style={{ backgroundColor: BAND, border: LINE }}>
            {source ? <BarPicture alt={title} cell={7} className="absolute inset-0" source={source} /> : null}
          </div>
          <div className="min-w-0">
            <h2 className="font-sans text-[clamp(3.2rem,3.4vw,5.6rem)] font-medium leading-[1.05] tracking-[-0.02em] text-white" id="b43-detail-title">
              {title}
            </h2>
            {lede ? <p className="mt-[1.4rem] font-sans text-[1.8rem] font-light leading-[1.45]">{lede}</p> : null}
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B43(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [flat, setFlat] = useState(false);
  const [mode, setMode] = useState<"work" | "skills">("work");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [front, setFront] = useState(0);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shadeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  // The ring's motion, kept out of React: angle, speed, drag, hover, a target angle to ease to.
  const motion = useRef({ rot: 0, vel: DRIFT, drag: false, hover: false, open: false, target: null as number | null, moved: false });
  const geoRef = useRef<Geo | null>(null);
  const frontRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const on = (): void => setFlat(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Pictures, made once in the browser.
  const pics = useMemo(() => {
    if (!mounted) return null;
    return {
      projects: projects.map((p) => projectSource(p)),
      team: textPlate("82855Z", { width: 1200, height: 800 }),
      awards: textPlate(`${awards.length} awards`, { width: 1200, height: 800 }),
      groups: skillGroups.map((g) => groupPlate(g)),
    };
  }, [mounted]);

  const cards: Card[] = useMemo(() => {
    if (mode === "skills") {
      return skillGroups.map((g, i) => ({ key: `g${i}`, name: g.label, source: pics?.groups[i] ?? null, sheet: { kind: "group", i } }));
    }
    const list: Card[] = projects.map((p, i) => ({ key: `p${i}`, name: p.title, source: pics?.projects[i] ?? null, sheet: { kind: "project", i } }));
    if (TEAM) list.push({ key: "team", name: TEAM.org, source: pics?.team ?? null, sheet: { kind: "team" } });
    list.push({ key: "awards", name: "Awards", source: pics?.awards ?? null, sheet: { kind: "awards" } });
    list.push({ key: "skills", name: "Skills", source: pics?.groups[0] ?? null, sheet: "skills" });
    return list;
  }, [mode, pics]);

  const n = cards.length;

  // Stage size → card size, ring radius, perspective.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || flat) return undefined;
    const measure = (): void => {
      const g = geometry(el.clientWidth, el.clientHeight, n);
      geoRef.current = g;
      setGeo(g);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flat, n, mounted]);

  // The turning ring: one loop writes every card's transform.
  useEffect(() => {
    if (flat || !mounted) return undefined;
    const m = motion.current;
    const still = stillMotion();
    if (still) m.vel = 0;
    let raf = 0;
    let last = performance.now();
    let seen = true;
    let lastRot = Number.NaN;
    let lastGeo: Geo | null = null;

    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
    });
    if (stageRef.current) io.observe(stageRef.current);

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = geoRef.current;
      if (!seen || !g) return;
      if (m.drag) {
        m.target = null;
      } else if (m.target !== null) {
        const k = still ? 1 : 1 - Math.exp(-dt * 7);
        m.rot += (m.target - m.rot) * k;
        if (Math.abs(m.target - m.rot) < 0.02) {
          m.rot = m.target;
          m.target = null;
        }
        m.vel = 0;
      } else {
        const want = still || m.hover || m.open ? 0 : DRIFT;
        m.vel += (want - m.vel) * (1 - Math.exp(-dt * 2.2));
        if (still) m.vel = 0;
        m.rot += m.vel * dt;
      }
      if (m.rot === lastRot && g === lastGeo) return;
      lastRot = m.rot;
      lastGeo = g;

      const span = n * g.step;
      let best = 0;
      let bestA = Infinity;
      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const a = wrap(i * g.step + m.rot, span);
        const abs = Math.abs(a);
        el.style.transform = `translate3d(0, 0, ${-g.r}px) rotateY(${a}deg) translateZ(${g.r}px)`;
        const op = Math.max(0, Math.min(1, (94 - abs) / 22));
        el.style.opacity = String(op);
        el.style.pointerEvents = op > 0.2 ? "auto" : "none";
        const shade = shadeRefs.current[i];
        if (shade) shade.style.opacity = String(Math.min(1, abs / 80) * 0.55);
        if (abs < bestA) {
          bestA = abs;
          best = i;
        }
      }
      if (floorRef.current) {
        floorRef.current.style.backgroundPosition = `${(m.rot / g.step) * (g.w + 2 * g.gap) * 0.6}px 0`;
      }
      if (best !== frontRef.current) {
        frontRef.current = best;
        setFront(best);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [flat, mounted, n]);

  // Sideways wheel turns the ring while the cursor is over it; vertical wheel still scrolls the page.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || flat) return undefined;
    const onWheel = (e: WheelEvent): void => {
      const g = geoRef.current;
      if (!g || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const m = motion.current;
      m.target = null;
      m.rot -= e.deltaX * (g.step / (g.w + 2 * g.gap)) * 0.8;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [flat, mounted]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !geoRef.current) return;
    const m = motion.current;
    const g = geoRef.current;
    const perPx = g.step / (g.w + 2 * g.gap);
    const x0 = e.clientX;
    let lastX = x0;
    let lastT = performance.now();
    m.drag = true;
    m.moved = false;
    m.target = null;
    m.vel = 0;
    const move = (ev: PointerEvent): void => {
      const now = performance.now();
      const dx = ev.clientX - lastX;
      if (Math.abs(ev.clientX - x0) > 6) m.moved = true;
      m.rot += dx * perPx;
      const dtt = Math.max(1, now - lastT) / 1000;
      m.vel = m.vel * 0.6 + ((dx * perPx) / dtt) * 0.4;
      lastX = ev.clientX;
      lastT = now;
    };
    const up = (): void => {
      m.drag = false;
      if (stillMotion() || performance.now() - lastT > 90) m.vel = 0;
      m.vel = Math.max(-240, Math.min(240, m.vel));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      // Let the click that ends a drag through first, then forget the drag.
      window.setTimeout(() => {
        m.moved = false;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, []);

  const openCard = useCallback((c: Card, el: HTMLElement) => {
    if (motion.current.moved) return;
    if (c.sheet === "skills") {
      setMode("skills");
      return;
    }
    opener.current = el;
    motion.current.open = true;
    setSheet(c.sheet);
  }, []);

  const close = useCallback(() => {
    motion.current.open = false;
    setSheet(null);
    opener.current?.focus({ preventScroll: true });
  }, []);

  // Keyboard focus brings a card round to the front.
  const focusCard = useCallback(
    (i: number) => (e: FocusEvent<HTMLButtonElement>) => {
      const g = geoRef.current;
      if (!g || !e.currentTarget.matches(":focus-visible")) return;
      const m = motion.current;
      m.target = m.rot - wrap(i * g.step + m.rot, n * g.step);
    },
    [n],
  );

  const sheetSource = (s: Sheet): BarSource | null => {
    if (!pics) return null;
    if (s.kind === "project") return pics.projects[s.i];
    if (s.kind === "group") return pics.groups[s.i];
    if (s.kind === "awards") return pics.awards;
    return pics.team;
  };

  const toContact = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById("b43-contact");
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: stillMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  const toggle = (
    <p className={CORNER}>
      {(["work", "skills"] as const).map((k, j) => (
        <span key={k}>
          {j > 0 ? <span className="mx-[0.6rem] opacity-60">/</span> : null}
          <button
            aria-pressed={mode === k}
            className={`${CORNER} b43-link cursor-pointer ${mode === k ? "text-white" : "opacity-60"}`}
            onClick={() => setMode(k)}
            type="button"
          >
            {k}
          </button>
        </span>
      ))}
    </p>
  );

  const name = (
    <p className={`${CORNER} text-white`}>Kevin He</p>
  );
  const contact = (
    <a className={`${CORNER} b43-link text-white`} href="#b43-contact" onClick={toContact}>
      Contact
    </a>
  );

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {flat ? (
        /* Phone: the ring as a row you swipe. */
        <section aria-label="Work" className="py-[4rem]">
          <div className="flex items-center justify-between px-[1.6rem]">
            {name}
            {contact}
          </div>
          <div className="b43-row mt-[3.2rem] flex snap-x snap-mandatory gap-[1.2rem] overflow-x-auto px-[1.6rem]" key={mode}>
            {cards.map((c) => (
              <button
                className="b43-card relative aspect-[1.45] w-[80vw] shrink-0 cursor-pointer snap-center overflow-hidden rounded-[1.2rem]"
                key={c.key}
                onClick={(e) => openCard(c, e.currentTarget)}
                style={{ backgroundColor: BAND, border: LINE }}
                type="button"
              >
                <Face card={c} cell={5} />
              </button>
            ))}
          </div>
          <div className="mt-[3.2rem] flex items-center justify-between px-[1.6rem]">
            {toggle}
            <p className={`${CORNER} opacity-60`}>Swipe →</p>
          </div>
        </section>
      ) : (
        /* The stage: a ring of cards over a grid floor, in perspective. */
        <section
          aria-label="Work"
          className="relative h-[100svh] min-h-[60rem] select-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerOver={(e) => {
            motion.current.hover = e.target instanceof Element && e.target.closest(".b43-card") !== null;
          }}
          onPointerLeave={() => {
            motion.current.hover = false;
          }}
          ref={stageRef}
          style={{ perspective: geo ? `${geo.p}px` : undefined, perspectiveOrigin: "50% 50%", touchAction: "pan-y", cursor: "grab" }}
        >
          {mounted && geo ? (
            <div className="b43-ring absolute left-1/2 top-1/2 h-0 w-0" key={mode} style={{ transformStyle: "preserve-3d" }}>
              {/* The floor: a wide plane laid flat just under the cards, fading out towards the back. */}
              <div
                aria-hidden
                className="pointer-events-none absolute"
                ref={floorRef}
                style={(() => {
                  const near = geo.p * 0.8;
                  const far = geo.r * 2.4;
                  const fh = near + far;
                  const fw = geo.sw * 4;
                  const cellPx = geo.sw * 0.07;
                  const line = "rgba(249, 185, 220, 0.2)";
                  return {
                    width: `${fw}px`,
                    height: `${fh}px`,
                    left: `${-fw / 2}px`,
                    top: `${geo.h / 2 + geo.h * 0.03 - fh / 2}px`,
                    transform: `translateZ(${(near - far) / 2}px) rotateX(90deg)`,
                    backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
                    backgroundSize: `${cellPx}px ${cellPx}px`,
                    maskImage: "linear-gradient(to bottom, transparent 0%, #000 45%, #000 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 45%, #000 100%)",
                  };
                })()}
              />
              {cards.map((c, i) => (
                <button
                  aria-label={c.sheet === "skills" ? "Skills: show the skill groups" : c.name}
                  className="b43-card absolute cursor-pointer overflow-hidden rounded-[1.6rem]"
                  key={c.key}
                  onClick={(e) => openCard(c, e.currentTarget)}
                  onFocus={focusCard(i)}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  style={{
                    width: `${geo.w}px`,
                    height: `${geo.h}px`,
                    left: `${-geo.w / 2}px`,
                    top: `${-geo.h / 2}px`,
                    backgroundColor: BAND,
                    border: LINE,
                    opacity: 0,
                    willChange: "transform",
                  }}
                  type="button"
                >
                  <Face
                    card={c}
                    cell={6}
                    shadeRef={(el) => {
                      shadeRefs.current[i] = el;
                    }}
                  />
                </button>
              ))}
            </div>
          ) : null}

          {/* The four corner labels. */}
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-[5.3vw] py-[5.3vh]">
            <div className="flex items-start justify-between">
              <div className="pointer-events-auto">{name}</div>
              <div className="pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
                {contact}
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div className="pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
                {toggle}
              </div>
              <p aria-live="polite" className={`${CORNER} tabular-nums text-white`}>
                {pad2(front + 1)} <span className="opacity-60">/ {pad2(n)}</span>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Under the stage: the skill groups and the contact links in one row. */}
      <div
        className="grid grid-cols-2 gap-x-[2.4rem] gap-y-[3.2rem] px-[1.6rem] py-[5vh] md:grid-cols-3 md:px-[5.3vw] lg:grid-cols-[repeat(5,1fr)_1.3fr]"
        style={{ borderTop: LINE }}
      >
        {skillGroups.map((g) => (
          <div className="min-w-0" key={g.label}>
            <h3 className={`${CORNER} text-white`}>{g.label}</h3>
            <p className="mt-[1rem] font-sans text-[1.3rem] leading-[1.55] opacity-80">{g.skills.map((s) => s.name).join(", ")}</p>
          </div>
        ))}
        <div className="col-span-2 min-w-0 scroll-mt-[4vh] md:col-span-1" id="b43-contact">
          <h3 className={`${CORNER} text-white`}>Contact</h3>
          <a className="b43-link mt-[1rem] block break-all font-sans text-[1.6rem] leading-[1.4] text-white" href={`mailto:${EMAIL}`}>
            {EMAIL} ↗
          </a>
          <ul className="mt-[1.2rem] flex flex-wrap gap-x-[1.8rem] gap-y-[0.6rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className={`${CORNER} b43-link opacity-80`} href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {sheet ? <Detail onClose={close} sheet={sheet} source={sheetSource(sheet)} /> : null}
    </div>
  );
}
