"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, useEffect, useRef } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { ACCENT, BLOSSOM, GROUND, INK, Serif } from "@/components/luke/theme";
import { hostOf, kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

import { flowerPaths } from "./lotus";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k11, "Lotus stem": the projects as a timeline.
 *
 * One hairline stem runs down the section in gentle S-curves, drawn in
 * as the page scrolls (its dash offset follows the scroll). At each
 * project a short side stem leaves it and ends in a lotus bud, drawn in
 * fine line art, which opens into a flower as its row comes up the
 * screen. The project's date sits on the other side of the stem, so the
 * dates are the timeline's labels. Newest at the top, oldest at the root.
 *
 * Behind it all the two koi (koi.ts) swim down the left of the screen in
 * the site's pink bars, crossing the stem; they move only with the scroll.
 *
 * Reduced motion: the stem is drawn and every flower open; the koi still
 * go with the scroll, since that is the scroll itself.
 */

/** Newest first, by the month each is dated (mclib by its first year). */
const ORDER: Project[] = [...projects].sort((a, b) => dateKey(b) - dateKey(a));

function dateKey(p: Project): number {
  const w = whenOf(p);
  const m = /^(\d\d) (\d{4})$/.exec(w);
  if (m) return Number(m[2]) * 12 + Number(m[1]);
  return Number(w.slice(0, 4)) * 12;
}

const FIRST = Math.min(...projects.map((p) => Number(p.year.slice(0, 4))));
const LAST = Math.max(...projects.map((p) => Number(p.year.slice(-4))));

const SVG_NS = "http://www.w3.org/2000/svg";
const smooth = (x: number): number => x * x * (3 - 2 * x);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const yearRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // The koi, exactly as the home page's work section draws them.
  const tvUp = useTvUp();
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = koiRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let bar: BarCanvas | null = null;
    let ctx: gsap.Context | null = null;
    let onResize: (() => void) | null = null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pair = createKoiPair(img, w, h);
      const cols = Math.round(w / (w < 1024 ? 4 : 4.8));
      const config: BarLayerConfig = {
        x: "0%",
        y: "0%",
        width: "100%",
        height: "100%",
        blackPoint: 215,
        whitePoint: 40,
        threshold: 255,
        xSquares: cols,
        ySquares: Math.round((cols * h) / w),
        bgOpacity: 0,
        fillOpacity: 1,
      };
      bar = createBarCanvas(canvas, [{ type: "canvas", source: pair.source, config }], {
        colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(BLOSSOM) }),
        defaults: { bgOpacity: 0 },
        fps: reduced ? 12 : 60,
      });
      ctx = gsap.context(() => {
        ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (st) => pair.setProgress(st.progress),
          onRefresh: (st) => pair.setProgress(st.progress),
        });
      }, section);
      onResize = () => {
        pair.resize(window.innerWidth, window.innerHeight);
        bar?.redraw();
      };
      window.addEventListener("resize", onResize);
    };
    img.src = "/work/koi.png";
    return () => {
      gone = true;
      ctx?.revert();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  // The stem, side stems and flowers: built from where the rows are laid
  // out, then drawn by the scroll. One listener, one frame per scroll.
  useEffect(() => {
    const section = sectionRef.current;
    const svg = svgRef.current;
    if (!section || !svg) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    type Flower = { g: SVGGElement; petals: SVGPathElement[]; pod: SVGPathElement; branch: SVGPathElement; branchLen: number; node: SVGCircleElement; y: number; size: number };
    let stem: SVGPathElement | null = null;
    let stemLen = 0;
    /** Stem length reached at each sampled height, for drawing to a height. */
    let lenAt: { y: number; l: number }[] = [];
    let flowers: Flower[] = [];
    let raf = 0;

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
    const line = { fill: "none", stroke: INK, "stroke-width": "1", "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" };

    const build = (): void => {
      const sr = section.getBoundingClientRect();
      const W = window.innerWidth;
      const H = section.offsetHeight;
      const phone = W < 1024;
      svg.setAttribute("viewBox", `0 0 ${sr.width} ${H}`);
      svg.replaceChildren();

      const nodes = slotRefs.current.map((slot) => {
        const r = slot!.getBoundingClientRect();
        // The flower's base sits on its title's baseline.
        const h3 = slot!.parentElement!.querySelector("h3 > *")!;
        const tr = h3.getBoundingClientRect();
        const fs = parseFloat(getComputedStyle(h3).fontSize);
        return { left: r.left - sr.left, cx: r.left - sr.left + r.width / 2, y: tr.top - sr.top + fs * 0.86, size: r.width };
      });
      const sx = nodes[0].left - W * (phone ? 0.04 : 0.025);
      const sway = W * (phone ? 0.018 : 0.03);
      const nodeY = nodes.map((n) => n.y);

      // The years stand at the stem's height for their row.
      yearRefs.current.forEach((y, i) => {
        if (y) y.style.top = `${nodeY[i] - (rowRefs.current[i]!.getBoundingClientRect().top - sr.top)}px`;
      });

      // Stem: from the top of the section through every node, an S between
      // each pair, then on down past the last to a fine root.
      const pts = [H * 0.02, ...nodeY, H - window.innerHeight * 0.1];
      let d = `M ${sx} ${pts[0]}`;
      for (let i = 1; i < pts.length; i++) {
        const y0 = pts[i - 1];
        const y1 = pts[i];
        const dy = y1 - y0;
        const s = i % 2 === 0 ? 1 : -1;
        d += ` C ${sx + s * sway} ${y0 + dy * 0.36}, ${sx - s * sway} ${y1 - dy * 0.36}, ${sx} ${y1}`;
      }
      stem = el("path", { ...line, d, "stroke-opacity": "0.7" });
      svg.appendChild(stem);
      stemLen = stem.getTotalLength();
      lenAt = [];
      for (let l = 0; l <= stemLen; l += 6) lenAt.push({ y: stem.getPointAtLength(l).y, l });
      stem.style.strokeDasharray = `${stemLen} ${stemLen}`;

      flowers = nodes.map((n, i) => {
        const ny = nodeY[i];
        const node = el("circle", { cx: String(sx), cy: String(ny), r: "2.2", fill: INK });
        // The side stem bends up from the main stem to the flower's base.
        const bx = n.cx;
        const by = n.y;
        const branch = el("path", {
          ...line,
          "stroke-opacity": "0.7",
          d: `M ${sx} ${ny} C ${sx + (bx - sx) * 0.45} ${ny + n.size * 0.02}, ${bx} ${by + (ny - by) * 0.9}, ${bx} ${by}`,
        });
        const g = el("g", { transform: `translate(${bx} ${by}) scale(${n.size / 100})` });
        const petals = Array.from({ length: 7 }, () => el("path", { ...line }));
        const pod = el("path", { ...line });
        petals.forEach((p) => g.appendChild(p));
        g.appendChild(pod);
        svg.append(branch, node, g);
        const branchLen = branch.getTotalLength();
        branch.style.strokeDasharray = `${branchLen} ${branchLen}`;
        return { g, petals, pod, branch, branchLen, node, y: ny, size: n.size };
      });
      paint();
    };

    const lengthToY = (y: number): number => {
      if (!lenAt.length) return 0;
      if (y <= lenAt[0].y) return 0;
      let lo = 0;
      let hi = lenAt.length - 1;
      if (y >= lenAt[hi].y) return stemLen;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lenAt[mid].y < y) lo = mid;
        else hi = mid;
      }
      return lenAt[hi].l;
    };

    const paint = (): void => {
      raf = 0;
      if (!stem) return;
      const top = section.getBoundingClientRect().top;
      const vh = window.innerHeight;
      // The stem is drawn down to two thirds of the way down the screen.
      const reach = reduced ? Infinity : vh * 0.6 - top;
      stem.style.strokeDashoffset = String(stemLen - lengthToY(reach));
      // The active row: the last whose node the stem has reached.
      let activeIndex = -1;
      flowers.forEach((f, i) => {
        if (reach >= f.y) activeIndex = i;
      });
      flowers.forEach((f, i) => {
        const a = reduced ? 1 : clamp01((reach - f.y) / (vh * 0.06));
        const open = reduced ? 1 : smooth(clamp01((reach - f.y - vh * 0.04) / (vh * 0.3)));
        f.node.style.opacity = String(a);
        const year = yearRefs.current[i];
        if (year) year.style.opacity = String(a * 0.9);
        const active = i === activeIndex;
        f.node.setAttribute("fill", active ? ACCENT : INK);
        f.node.setAttribute("r", active ? "2.5" : "2.2");
        f.branch.style.strokeDashoffset = String(f.branchLen * (1 - clamp01((reach - f.y) / (vh * 0.12))));
        const shapes = flowerPaths(open);
        f.petals.forEach((p, k) => {
          p.setAttribute("d", shapes.petals[k]);
          p.style.opacity = String(a * shapes.alpha[k]);
        });
        f.pod.setAttribute("d", shapes.pod);
        f.pod.style.opacity = String(a * clamp01(open * 1.6 - 0.4));
        const row = rowRefs.current[i];
        if (row) {
          const t = reduced ? 1 : smooth(clamp01((reach - f.y - vh * 0.09) / (vh * 0.3)));
          row.style.setProperty("--k11-in", String(t));
        }
      });
    };

    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    let rebuild = 0;
    const onResize = (): void => {
      cancelAnimationFrame(rebuild);
      rebuild = requestAnimationFrame(build);
    };
    build();
    // Fonts change the rows' heights; build again once they are in.
    void document.fonts?.ready.then(() => build());
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rebuild);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section aria-labelledby="k11-title" className="relative" id="work" ref={sectionRef} style={{ color: INK }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full opacity-35 lg:opacity-100 [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" ref={svgRef} />

      <div className="relative pb-[34vh] pt-[16vh]">
        <header className="pl-[34vw] pr-4 lg:pl-[40vw] lg:pr-[8vw]">
          <p className="font-sans text-[clamp(11px,0.72vw,22px)] uppercase tracking-[0.18em] opacity-60">
            {projects.length} projects, {FIRST}–{LAST}
          </p>
          <h2 className="mt-[2vh] pb-[0.1em] pr-[0.12em] text-[clamp(56px,15vw,120px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(20vh,8.5vw)]" id="k11-title">
            <Serif text="Work" />
          </h2>
        </header>

        <ol className="mt-[16vh] flex flex-col gap-[16vh] lg:mt-[20vh] lg:gap-[20vh]">
          {ORDER.map((p, i) => {
            const result = resultOf(p);
            return (
              <li
                className="relative"
                key={p.title}
                ref={(e) => {
                  rowRefs.current[i] = e;
                }}
                style={{ ["--k11-in" as string]: "1" }}
              >
                {/* Where the flower opens; the drawing itself is in the svg. */}
                <div
                  className="absolute left-[10vw] top-0 aspect-square w-[17vw] lg:left-[31.5vw] lg:w-[6.5vw]"
                  ref={(e) => {
                    slotRefs.current[i] = e;
                  }}
                />
                {/* The date, on the far side of the stem (wide screens). */}
                <span
                  className="absolute left-[26.8vw] hidden -translate-x-full -translate-y-1/2 whitespace-nowrap font-sans text-[clamp(11px,0.78vw,24px)] tabular-nums tracking-[0.06em] lg:block"
                  ref={(e) => {
                    yearRefs.current[i] = e;
                  }}
                >
                  {whenOf(p)}
                </span>
                <div
                  className="pl-[34vw] pr-4 lg:pl-[40vw] lg:pr-[8vw]"
                  style={{ opacity: "calc(0.25 + 0.75 * var(--k11-in))", transform: "translateY(calc((1 - var(--k11-in)) * 3vh))" }}
                >
                  <p className="font-sans text-[clamp(11px,0.72vw,22px)] tabular-nums tracking-[0.06em] opacity-70 lg:hidden">{whenOf(p)}</p>
                  <h3 className="mt-[1vh] text-[clamp(30px,8.4vw,60px)] leading-[1.05] tracking-[-0.025em] lg:mt-0 lg:text-[clamp(40px,4.2vw,160px)]">
                    {p.href ? (
                      <a
                        className="inline-block pb-[0.1em] pr-[0.12em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8"
                        href={p.href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Title text={p.title} />
                      </a>
                    ) : (
                      <span className="inline-block pb-[0.1em] pr-[0.12em]">
                        <Title text={p.title} />
                      </span>
                    )}
                  </h3>
                  <div className="mt-[1.6vh] max-w-[34em] border-t pt-[1.4vh] font-sans text-[clamp(12px,0.85vw,26px)] leading-[1.5]" style={{ borderColor: "rgba(249,185,220,0.16)" }}>
                    <p className="opacity-60">{kindOf(p)}</p>
                    {result ? <p className="mt-[0.3em]">{result}</p> : null}
                    {p.href ? (
                      <a className="mt-[0.9em] inline-block opacity-60 underline decoration-[0.5px] underline-offset-[0.3em] hover:opacity-100" href={p.href} rel="noopener noreferrer" target="_blank">
                        {hostOf(p.href)}
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** A project name in the italic serif. Digits and other characters the
 *  serif cannot draw go in a light sans, a little smaller and tight, so
 *  "67" sits with the serif instead of shouting over it. */
function Title({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(/([0-9'"&@\-\u2010\u2011!()/;]+)/).map((run, i) =>
        i % 2 === 1 ? (
          <span className="pl-[0.03em] font-sans text-[0.75em] font-light not-italic tracking-[-0.02em]" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}
