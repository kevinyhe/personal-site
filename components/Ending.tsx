"use client";

import { type JSX, useEffect, useRef } from "react";

import { BAND, BLOSSOM } from "@/components/bandColours";
import * as P from "@/components/below/b15/plan";
import { buildSky } from "@/components/below/b15/scene";
import { skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { type BarCanvas, createBarCanvas, hexToRgb, type CanvasSource } from "@/components/valley/barShader";

/**
 * The end of the page: design 15's sky. The night has fallen, and as you
 * scroll the camera tips down to the far hills and the moon comes up over
 * them, drawn in the valley's bars, plum on blossom. The email comes up
 * with it.
 *
 * The scene is b15's own (buildSky, driven by its scroll value u); only
 * the stretch of u from full night to moonrise is used here.
 */

/** The part of b15's journey this section plays: night, then the moon. */
const U_FROM = 7.2;
const U_TO = P.LAST_U;

export default function Ending(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const words = wordsRef.current;
    if (!root || !stage || !words) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sky: ReturnType<typeof buildSky>;
    try {
      sky = buildSky(
        P.buildConstellations(
          skillGroups.map((g) => g.skills.length),
          skillGroups.map((g) => g.skills.map((s) => s.depth)),
        ),
      );
    } catch {
      words.style.opacity = "1";
      return undefined;
    }
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%";
    stage.appendChild(canvas);

    const config = {
      x: 0,
      y: 0,
      width: "100%",
      height: "100%",
      blackPoint: 12,
      whitePoint: 245,
      threshold: 255,
      xSquares: 240,
      ySquares: 130,
      bgOpacity: 1,
      fillOpacity: 1,
    };
    const measure = (): void => {
      const w = Math.max(1, stage.clientWidth);
      const h = Math.max(1, stage.clientHeight);
      // Bar cells about 8 px at 1920 wide and 16 at 3840: the same drawing.
      const cell = w / 240;
      config.xSquares = 240;
      config.ySquares = Math.round(h / cell);
      sky.resize(w, h, cell);
    };
    measure();

    const lean = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent): void => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const progress = (): number => {
      const h = window.innerHeight;
      const r = root.getBoundingClientRect();
      return Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - h)));
    };
    const source: CanvasSource = {
      canvas: sky.canvas,
      animated: !reduced,
      ready: Promise.resolve(),
      update: (time, dt) => {
        const p = reduced ? 1 : progress();
        const ease = 1 - Math.exp(-dt * 2.5);
        lean.x += (target.x - lean.x) * ease;
        lean.y += (target.y - lean.y) * ease;
        sky.frame(U_FROM + (U_TO - U_FROM) * p, time, lean);
        const w = Math.max(0, Math.min(1, (p - 0.55) / 0.3));
        words.style.opacity = w.toFixed(3);
        words.style.transform = `translateY(${((1 - w) * 2).toFixed(2)}vh)`;
        words.style.pointerEvents = w > 0.5 ? "auto" : "none";
        return true;
      },
    };
    if (reduced) sky.frame(U_TO, 0, lean);

    let bar: BarCanvas | null = null;
    try {
      bar = createBarCanvas(canvas, [{ type: "canvas", source, config }], {
        colors: () => ({ bg: hexToRgb(BLOSSOM), fill: hexToRgb(BAND) }),
        visibleRootMargin: "10% 0px 10% 0px",
      });
    } catch {
      bar = null;
    }
    if (!bar) {
      canvas.remove();
      sky.dispose();
      words.style.opacity = "1";
      return undefined;
    }
    const bars = bar;
    const sized = new ResizeObserver(() => {
      measure();
      bars.redraw({ reupload: false });
    });
    sized.observe(stage);

    return () => {
      window.removeEventListener("pointermove", onPointer);
      sized.disconnect();
      bars.destroy();
      sky.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <section className="relative h-[240vh]" id="contact" ref={rootRef} style={{ backgroundColor: BAND }}>
      <div className="sticky top-0 h-[100vh] w-full overflow-hidden" ref={stageRef}>
        {/* The plum of the section above runs down into the night, so the
            sky comes up out of it rather than starting at a line. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[45vh]" style={{ background: `linear-gradient(${BAND}, ${BAND}00)` }} />
        <div className="absolute inset-x-0 top-[24vh] z-[1] text-center" ref={wordsRef} style={{ opacity: 0 }}>
          <p className="font-mono text-[1.8rem] uppercase tracking-[0.22em] text-[#f9b9dc] opacity-70">Contact</p>
          <a className="mt-[3vh] inline-block font-sans text-[5vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <ul className="mt-[4vh] flex justify-center gap-[4vw] font-mono text-[2rem] text-white">
            {elsewhere.map((l) => (
              <li key={l.label}>
                <a className="underline-offset-[0.35em] hover:underline" href={l.href} rel="noreferrer" target="_blank">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
