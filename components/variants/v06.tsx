"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups, type Skill } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * 06 BLUR. After bleibtgleich.dev (Awwwards Site of the Day, 2026): white
 * page, black Inter, very large type and a lot of air. Three moves are
 * copied from it.
 *
 * 1. Headings arrive as a blob. Each line is blurred through an SVG
 *    filter whose colour matrix hardens the blur's alpha, so the line is
 *    one black shape that sharpens into words as the blur goes to zero.
 * 2. Work tiles are wiped in from the bottom by a clip-path whose top edge
 *    is a wave in the middle of the wipe and flat at both ends. A solid
 *    black copy runs a tenth of a second ahead, so a dark band leads the
 *    edge.
 * 3. A hairline scrollbar of our own at the right edge, driven from Lenis.
 */
const GROUND = "#ffffff";
const INK = "#000000";
const GREY = "#f2f2f2";
const CAPTION = "rgba(0,0,0,0.4)";
const LINE = "rgba(0,0,0,0.12)";

/** Points along a tile's top edge for the wave clip. */
const WAVE_POINTS = 12;
/** Blur radius the blob starts from, in CSS px at a 16px rem. */
const BLOB_BLUR = 50;

const allSkills = skillGroups.flatMap((g) => g.skills);

/** The stack names on a project are plain strings; find the skill that
 *  carries the icon, or make a two-letter mark for the ones that have none
 *  (MPU6050, the Discord API). */
function skillFor(name: string): Skill {
  const exact = allSkills.find((s) => s.name === name);
  if (exact) return exact;
  const prefix = allSkills.find((s) => s.name.startsWith(name));
  if (prefix) return prefix;
  return { name, mark: name.slice(0, 2).toUpperCase(), depth: 1 };
}

/** "21–26": the first and last two-digit years across every project. */
function yearSpan(): string {
  const years = projects.flatMap((p) => (p.year.match(/\d{4}/g) ?? []).map(Number));
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return `${String(lo).slice(2)}–${String(hi).slice(2)}`;
}

/** The polygon for a wipe at `p` (0 hidden, 1 shown). The top edge sits at
 *  (1 - p) of the height; each point is pushed down by its own offset,
 *  scaled by sin(p·π) so the edge is flat at both ends and a wave midway. */
function wavePolygon(p: number, offsets: number[]): string {
  const wave = Math.sin(p * Math.PI);
  const base = (1 - p) * 100;
  const top = offsets.map((off, i) => {
    const x = (i / (WAVE_POINTS - 1)) * 100;
    const y = Math.min(100, base + off * wave);
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  });
  return `polygon(${top.join(",")},100% 100%,0% 100%)`;
}

function Caption({ children, className = "" }: { children: string; className?: string }): JSX.Element {
  return (
    <p className={`text-[0.78rem] leading-[1.4] ${className}`} style={{ color: CAPTION }}>
      {children}
    </p>
  );
}

function SkillColumn({ label, groups }: { label: string; groups: typeof skillGroups }): JSX.Element {
  return (
    <div>
      <Caption>{label}</Caption>
      {groups.map((g) => (
        <ul className="mt-[1.6rem] border-t pt-[1.2rem]" data-reveal key={g.label} style={{ borderColor: LINE }}>
          {g.skills.map((s) => (
            <li className="flex items-center gap-[0.9rem] py-[0.45rem] text-[1.15rem] font-light" key={s.name}>
              <SkillMark onDark={false} size="1.2rem" skill={s} />
              {s.name}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export default function V06(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // The filters' <svg> and the SplitText instances outlive the GSAP
    // context, so they are torn down by hand below.
    let defs: SVGSVGElement | undefined;
    const splits: SplitText[] = [];
    const ctx = gsap.context(() => {
      // 1. Blob reveal on every heading.
      const headings = Array.from(root.querySelectorAll<HTMLElement>("[data-v06-blur]"));
      if (reduced) {
        gsap.set(headings, { opacity: 1 });
      } else {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.setAttribute("aria-hidden", "true");
        svg.style.position = "absolute";
        root.appendChild(svg);
        defs = svg;
        headings.forEach((h, hi) => {
          const split = new SplitText(h, { type: "lines", linesClass: "v06-line" });
          splits.push(split);
          const lines = split.lines as HTMLElement[];
          // One filter per line so the lines can stagger independently.
          const blurs = lines.map((line, li) => {
            const id = `v06-blob-${hi}-${li}`;
            const filter = document.createElementNS(svgNS, "filter");
            filter.setAttribute("id", id);
            // Room for the blur to spill above and below the line.
            filter.setAttribute("x", "-10%");
            filter.setAttribute("y", "-60%");
            filter.setAttribute("width", "120%");
            filter.setAttribute("height", "220%");
            filter.setAttribute("color-interpolation-filters", "sRGB");
            const blur = document.createElementNS(svgNS, "feGaussianBlur");
            blur.setAttribute("in", "SourceGraphic");
            blur.setAttribute("stdDeviation", String((BLOB_BLUR * rem) / 16));
            blur.setAttribute("result", "b");
            const matrix = document.createElementNS(svgNS, "feColorMatrix");
            matrix.setAttribute("in", "b");
            matrix.setAttribute("type", "matrix");
            // Alpha' = 20a − 8: anything under 0.4 alpha vanishes, anything
            // over becomes solid. That is what turns a blur into a blob.
            matrix.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8");
            filter.appendChild(blur);
            filter.appendChild(matrix);
            svg.appendChild(filter);
            line.style.filter = `url(#${id})`;
            return blur;
          });
          gsap.set(lines, { opacity: 0 });
          gsap.set(h, { opacity: 1 });

          const tl = gsap.timeline({ paused: true });
          lines.forEach((line, li) => {
            const at = li * 0.08;
            tl.to(
              blurs[li],
              {
                attr: { stdDeviation: 0 },
                duration: 1.1,
                ease: "power3.out",
                // Crisp text once the blur is gone: the matrix would
                // otherwise harden the anti-aliasing.
                onComplete: () => {
                  line.style.filter = "";
                },
              },
              at,
            );
            tl.to(line, { opacity: 1, duration: 0.33, ease: "power1.out" }, at);
          });
          ScrollTrigger.create({
            trigger: h,
            start: "top 88%",
            once: true,
            onEnter: () => tl.play(),
          });
        });
      }

      // 2. Wave wipe on the work tiles.
      const tiles = Array.from(root.querySelectorAll<HTMLElement>("[data-v06-tile]"));
      tiles.forEach((tile) => {
        const face = tile.querySelector<HTMLElement>(".v06-face");
        const ink = tile.querySelector<HTMLElement>(".v06-ink");
        if (!face || !ink) return;
        if (reduced) {
          face.style.clipPath = "none";
          ink.style.display = "none";
          return;
        }
        const offsets = Array.from({ length: WAVE_POINTS }, () => Math.random() * 12);
        const inkP = { p: 0 };
        const faceP = { p: 0 };
        const tl = gsap.timeline({ paused: true });
        tl.to(inkP, {
          p: 1,
          duration: 1.2,
          ease: "power2.inOut",
          onUpdate: () => {
            ink.style.clipPath = wavePolygon(inkP.p, offsets);
          },
        });
        tl.to(
          faceP,
          {
            p: 1,
            duration: 1.2,
            ease: "power2.inOut",
            onUpdate: () => {
              face.style.clipPath = wavePolygon(faceP.p, offsets);
            },
            onComplete: () => {
              face.style.clipPath = "none";
              ink.style.display = "none";
            },
          },
          0.1,
        );
        ScrollTrigger.create({ trigger: tile, start: "top 85%", once: true, onEnter: () => tl.play() });
      });
    }, root);

    // 3. The scrollbar. Lenis scrolls the window itself, so its event and
    // the window's carry the same numbers; Lenis is preferred because it
    // fires on the eased position every frame.
    const bar = barRef.current;
    const thumb = thumbRef.current;
    let stopBar: (() => void) | undefined;
    if (bar && thumb) {
      const toY = gsap.quickTo(thumb, "y", { duration: 0.15, ease: "power2" });
      let trackH = 0;
      let thumbH = 0;
      const measure = () => {
        const doc = document.documentElement;
        trackH = bar.clientHeight;
        const ratio = Math.min(1, window.innerHeight / Math.max(1, doc.scrollHeight));
        thumbH = Math.max(rem * 2, trackH * ratio);
        thumb.style.height = `${thumbH}px`;
      };
      let docH = 0;
      const place = (scroll: number) => {
        const h = document.documentElement.scrollHeight;
        // The page grows after mount (fonts, images), so the thumb is
        // re-sized whenever the document's height has changed.
        if (h !== docH) {
          docH = h;
          measure();
        }
        const limit = Math.max(1, h - window.innerHeight);
        toY(Math.min(1, Math.max(0, scroll / limit)) * (trackH - thumbH));
      };
      const onLenis = (e: { scroll: number }) => place(e.scroll);
      const onWindow = () => place(window.scrollY);
      type LenisLike = { on: (ev: "scroll", cb: typeof onLenis) => void; off: (ev: "scroll", cb: typeof onLenis) => void };
      let lenis: LenisLike | undefined;
      // Hook up a frame later so a Lenis mounted by the layout is there.
      const raf = window.requestAnimationFrame(() => {
        lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
        if (lenis) lenis.on("scroll", onLenis);
        else window.addEventListener("scroll", onWindow, { passive: true });
        onWindow();
        bar.dataset.ready = "";
      });
      const onResize = () => {
        measure();
        onWindow();
      };
      window.addEventListener("resize", onResize);
      stopBar = () => {
        window.cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onWindow);
        lenis?.off("scroll", onLenis);
      };
    }

    return () => {
      stopBar?.();
      ctx.revert();
      splits.forEach((s) => s.revert());
      defs?.remove();
      // The tweens wrote these straight to the DOM; put them back so a
      // re-run of the effect starts from the hidden state.
      root.querySelectorAll<HTMLElement>(".v06-face, .v06-ink").forEach((el) => {
        el.style.clipPath = "";
        el.style.display = "";
      });
    };
  }, []);

  const languages = skillGroups.filter((g) => g.label === "Languages");
  const robots = skillGroups.filter((g) => g.label === "Embedded & robotics" || g.label === "CAD & data");
  const web = skillGroups.filter((g) => g.label === "Software & networking" || g.label === "DevOps & tooling");

  return (
    <VariantShell accent={INK} ground={GROUND} ink={INK} n={6}>
      <style>{`
        .v06-blur { opacity: 0; }
        .v06-line { display: block; will-change: filter, opacity; }
        .v06-face, .v06-ink { clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%); }
        .v06-bar { position: fixed; top: 0; right: 0; z-index: 50; width: 0.25rem; height: 100vh; opacity: 0; transition: opacity 0.4s; pointer-events: none; }
        .v06-bar[data-ready] { opacity: 1; }
        .v06-thumb { position: absolute; top: 0; left: 0; width: 100%; background: ${INK}; }
        @media (max-width: 64rem) { .v06-bar { display: none; } }
        @media (prefers-reduced-motion: reduce) {
          .v06-blur { opacity: 1; }
          .v06-face { clip-path: none; }
          .v06-ink { display: none; }
        }
      `}</style>
      <div ref={rootRef}>
        <section className="flex min-h-[88vh] flex-col justify-between px-[3vw] pb-[6vh] pt-[6vh]">
          <div className="text-[0.95rem] leading-[1.5]" data-reveal>
            <p>Engineer & developer</p>
            <p>Based in Toronto</p>
            <p>CTO, The Actually Company</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-[3vw]">
            <h1 className="v06-blur text-[9vw] font-normal leading-[0.9] tracking-[-0.05em]" data-v06-blur>
              Software for
              <br />
              things that
              <br />
              move.
            </h1>
            <p className="max-w-[22ch] pb-[1vw] text-[1.05rem] leading-[1.45]" data-reveal style={{ color: CAPTION }}>
              What I make has to work on real hardware, in real time.
            </p>
          </div>
        </section>

        <section className="px-[3vw] pt-[10vh] pb-[6vh]" id="work">
          <div className="flex items-baseline justify-between">
            <h2 className="v06-blur text-[4vw] font-normal leading-[1] tracking-[-0.04em]" data-v06-blur>
              Work
            </h2>
            <Caption className="tabular-nums">{yearSpan()}</Caption>
          </div>
          <div className="mt-[3rem] grid grid-cols-2 gap-[1.5vw]">
            {projects.map((p, i) => {
              const lead = i === 0;
              const faceClass = "v06-face absolute inset-0 flex flex-col justify-between p-[2rem] no-underline";
              const face = (
                <>
                  <div className="flex items-baseline justify-between">
                    <Caption className="tabular-nums">{String(i + 1).padStart(2, "0")}</Caption>
                    <Caption className="tabular-nums">{p.year}</Caption>
                  </div>
                  <div>
                    <h3 className={`${lead ? "text-[6.5vw]" : "text-[3.6vw]"} font-normal leading-[0.95] tracking-[-0.045em]`}>{p.title}</h3>
                    <p className={`mt-[1rem] ${lead ? "max-w-[46ch] text-[1.15rem]" : "max-w-[40ch] text-[1rem]"} leading-[1.45]`} style={{ color: CAPTION }}>
                      {p.tagline}
                      {p.award ? ` ${p.award}.` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-[1rem]">
                    {p.stack.map((s) => (
                      <SkillMark key={s} onDark={false} size="1.4rem" skill={skillFor(s)} />
                    ))}
                  </div>
                </>
              );
              return (
                <article
                  className={`relative overflow-hidden ${lead ? "col-span-2 aspect-[21/9]" : "aspect-[4/3]"}`}
                  data-v06-tile
                  key={p.title}
                >
                  <div className="v06-ink absolute inset-0" style={{ backgroundColor: INK }} />
                  {p.href ? (
                    <a className={faceClass} href={p.href} rel="noreferrer" style={{ backgroundColor: GREY }} target="_blank">
                      {face}
                    </a>
                  ) : (
                    <div className={faceClass} style={{ backgroundColor: GREY }}>
                      {face}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="px-[3vw] pt-[14vh] pb-[6vh]" id="info">
          <h2 className="v06-blur text-[4vw] font-normal leading-[1] tracking-[-0.04em]" data-v06-blur>
            Info
          </h2>
          <div className="mt-[3rem] grid grid-cols-[1.4fr_1fr] gap-[4vw]">
            <div>
              <Caption>Experience</Caption>
              <ol className="mt-[1.2rem]">
                {experience.map((e) => (
                  <li className="grid grid-cols-[1fr_1.4fr] gap-[2vw] border-t py-[1.6rem]" data-reveal key={e.org} style={{ borderColor: LINE }}>
                    <div>
                      <p className="text-[1.5rem] leading-[1.1] tracking-[-0.02em]">{e.org}</p>
                      <p className="mt-[0.4rem] text-[0.95rem] font-light">
                        {e.role}, {e.where}
                      </p>
                      <Caption className="mt-[0.4rem] tabular-nums">{e.when}</Caption>
                    </div>
                    <ul className="space-y-[0.5rem] text-[0.95rem] font-light leading-[1.5]">
                      {e.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <Caption>Education</Caption>
              <div className="mt-[1.2rem] border-t py-[1.6rem]" data-reveal style={{ borderColor: LINE }}>
                <p className="text-[1.5rem] leading-[1.1] tracking-[-0.02em]">{education.school}</p>
                <p className="mt-[0.4rem] text-[0.95rem] font-light">{education.degree}</p>
                <Caption className="mt-[0.4rem] tabular-nums">{education.when}</Caption>
              </div>
              <Caption className="mt-[3rem]">Awards</Caption>
              <ul className="mt-[1.2rem] border-t" data-reveal style={{ borderColor: LINE }}>
                {awards.map((a) => (
                  <li className="flex justify-between gap-[2rem] border-b py-[0.9rem] text-[0.95rem] font-light" key={a.title} style={{ borderColor: LINE }}>
                    <span>{a.title}</span>
                    <span className="tabular-nums" style={{ color: CAPTION }}>
                      {a.year}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="px-[3vw] pt-[14vh] pb-[6vh]" id="skills">
          <h2 className="v06-blur text-[4vw] font-normal leading-[1] tracking-[-0.04em]" data-v06-blur>
            Toolkit
          </h2>
          <div className="mt-[3rem] grid grid-cols-2 gap-[4vw]">
            <SkillColumn groups={[...languages, ...robots]} label="Robots & firmware" />
            <SkillColumn groups={web} label="Web & tooling" />
          </div>
        </section>

        <section className="px-[3vw] pt-[18vh] pb-[14vh]" id="contact">
          <Caption>Write to me</Caption>
          <a className="v06-blur mt-[1.5rem] block text-[6vw] font-normal leading-[1] tracking-[-0.05em]" data-v06-blur href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <div className="mt-[3rem] flex gap-[2.5rem] text-[1rem]" data-reveal>
            {elsewhere.map((l) => (
              <a className="underline underline-offset-[0.35em] decoration-[rgba(0,0,0,0.3)] hover:decoration-black" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                {l.label}
              </a>
            ))}
          </div>
        </section>
      </div>
      <div aria-hidden="true" className="v06-bar" ref={barRef}>
        <div className="v06-thumb" ref={thumbRef} />
      </div>
    </VariantShell>
  );
}
