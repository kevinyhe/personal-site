"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import gsap from "gsap";
import * as THREE from "three";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { education, experience, projects, skillGroups } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

/**
 * 08 LIQUID. After guillaumecolombel.fr (Portfolio 2026): a light sans
 * headline, a numbered project index on the left, and behind it a WebGL
 * carousel whose slides drag like liquid under the cursor. The slides are
 * canvases drawn here (there are no photos): a muted ground, the number,
 * the title very large, the tagline, the stack. The bio is the reference's
 * credentials list, a big number in the accent with a caption under it.
 */
const GROUND = "#101214";
const INK = "#ececea";
const ACCENT = "#f9b9dc";
const LINE = "rgba(236,234,232,0.14)";

/** One muted ground per project, dark enough for the index to read over. */
const TONES = ["#243646", "#3e302c", "#2c3a2e", "#372b3d", "#3a382a"];

/** Slide size and gap as a fraction of the viewport width. */
const SLIDE_W = 0.56;
const SLIDE_H = 0.36;
const GAP = 0.04;
/** Where the active slide's centre sits across the container, 0..1. The
 *  index list owns the left third; the slide before the active one shows
 *  behind it. */
const FOCUS = 0.64;
/** Texture size. */
const TEX_W = 2048;
const TEX_H = 1310;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The picture is pulled along the cursor's velocity, most at the slide's
// centre and not at all at its edges, with a slow wave across it while the
// cursor is moving and a small RGB split in the direction of travel.
// uHover fades the whole effect in and out as the cursor enters and leaves.
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uVelocity;
uniform float uHover;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 vel = uVelocity * uHover;
  float speed = length(vel);
  vec2 uv = vUv;
  uv += vel * 0.35 * (1.0 - length(vUv - 0.5));
  uv.x += sin(vUv.y * 8.0 + uTime) * speed * 0.02;
  vec2 split = vel * 0.004;
  float r = texture2D(uMap, uv + split).r;
  float g = texture2D(uMap, uv).g;
  float b = texture2D(uMap, uv - split).b;
  gl_FragColor = vec4(r, g, b, 1.0);
  #include <colorspace_fragment>
}`;

/** Breaks `text` into lines no wider than `maxW` in the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws project `i` onto `canvas`: the slide's whole picture. */
function drawSlide(canvas: HTMLCanvasElement, i: number, family: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const p = projects[i];
  const pad = 128;
  ctx.fillStyle = TONES[i % TONES.length];
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.textBaseline = "top";

  ctx.fillStyle = ACCENT;
  ctx.font = `400 56px ${family}`;
  ctx.fillText(`0${i + 1}`, pad, pad);
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText(p.year, TEX_W - pad, pad);
  ctx.textAlign = "left";

  ctx.font = `700 236px ${family}`;
  const title = wrap(ctx, p.title, TEX_W - pad * 2);
  let y = 300;
  for (const line of title) {
    ctx.fillText(line, pad - 12, y);
    y += 236;
  }

  ctx.font = `400 60px ${family}`;
  ctx.globalAlpha = 0.85;
  y += 40;
  for (const line of wrap(ctx, p.tagline, TEX_W * 0.66)) {
    ctx.fillText(line, pad, y);
    y += 78;
  }

  // The stack sits on the bottom edge, wrapped: the first project's eight
  // tools are wider than the slide on one line.
  ctx.globalAlpha = 0.6;
  ctx.font = `500 44px ${family}`;
  const stack = wrap(ctx, p.stack.join("   ·   "), TEX_W - pad * 2);
  let sy = TEX_H - pad - stack.length * 58;
  for (const line of stack) {
    ctx.fillText(line, pad, sy);
    sy += 58;
  }
  ctx.globalAlpha = 1;
}

type Uniforms = {
  uMap: { value: THREE.Texture };
  uVelocity: { value: THREE.Vector2 };
  uHover: { value: number };
  uTime: { value: number };
};

function Caption({ children }: { children: string }): JSX.Element {
  return (
    <p className="text-[0.7rem] uppercase tracking-[0.28em] opacity-50" data-reveal>
      {children}
    </p>
  );
}

/** The credentials list. Each figure is the résumé's, as profile.ts has it. */
const CREDENTIALS = [
  { figure: "100", caption: "one of 100 from 10,000+ applicants at Founders, Inc." },
  { figure: "80th", caption: "of ~20,000 teams in global VEX Skills" },
  { figure: "56", caption: "members led at STL Robotics" },
  { figure: "150+", caption: "automated tests behind The Actually Company" },
];

export default function V08(): JSX.Element {
  const [index, setIndex] = useState(0);
  const [gl, setGl] = useState(true);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(0);
  const goToRef = useRef<(i: number) => void>(() => undefined);
  const active = projects[index];

  useEffect(() => {
    indexRef.current = index;
    goToRef.current(index);
  }, [index]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
    } catch {
      setGl(false);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = "v08-canvas";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const group = new THREE.Group();
    scene.add(group);

    // The slides share one unit plane; each mesh is scaled to the slide
    // size on resize. Each has its own texture and uniforms so the
    // displacement can differ per slide later if it wants to.
    const family = getComputedStyle(host).fontFamily || "Inter, system-ui, sans-serif";
    const geometry = new THREE.PlaneGeometry(1, 1);
    const canvases: HTMLCanvasElement[] = [];
    const textures: THREE.CanvasTexture[] = [];
    const materials: THREE.ShaderMaterial[] = [];
    const uniforms: Uniforms[] = [];
    const velocity = new THREE.Vector2(0, 0);
    projects.forEach((_, i) => {
      const c = document.createElement("canvas");
      c.width = TEX_W;
      c.height = TEX_H;
      drawSlide(c, i, family);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(4, renderer!.capabilities.getMaxAnisotropy());
      const u: Uniforms = {
        uMap: { value: tex },
        // Shared: one cursor, one velocity, every slide.
        uVelocity: { value: velocity },
        uHover: { value: 0 },
        uTime: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({ fragmentShader: FRAGMENT, uniforms: u, vertexShader: VERTEX });
      const mesh = new THREE.Mesh(geometry, mat);
      group.add(mesh);
      canvases.push(c);
      textures.push(tex);
      materials.push(mat);
      uniforms.push(u);
    });

    // The slides are drawn once with whatever font is ready, and again
    // when Inter's weights have loaded; on a first visit that is the
    // difference between the fallback sans and the real thing.
    let disposed = false;
    let frame = 0;
    let needsFrame = true;
    const redraw = () => {
      if (disposed) return;
      canvases.forEach((c, i) => {
        drawSlide(c, i, family);
        textures[i].needsUpdate = true;
      });
      needsFrame = true;
    };
    if (document.fonts) {
      Promise.all(["300", "400", "500", "700"].map((w) => document.fonts.load(`${w} 40px ${family}`)))
        .then(redraw)
        .catch(() => undefined);
    }

    // Layout in CSS pixels of the container: the camera spans exactly the
    // container, so a plane `sw` wide is `sw` CSS pixels wide on screen.
    let step = 1;
    let focusX = 0;
    const layout = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const vw = window.innerWidth;
      const sw = SLIDE_W * vw;
      const sh = SLIDE_H * vw;
      step = sw + GAP * vw;
      focusX = (FOCUS - 0.5) * w;
      renderer!.setSize(w, h, false);
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      group.children.forEach((m, i) => {
        m.scale.set(sw, sh, 1);
        m.position.x = i * step;
      });
      // A tween in flight was aiming at the old width's x; drop it.
      gsap.killTweensOf(group.position);
      group.position.x = focusX - indexRef.current * step;
      needsFrame = true;
    };

    // Moving the carousel: a tween on the group under motion, a jump
    // without. Only ever one tween in flight.
    const goTo = (i: number) => {
      const x = focusX - i * step;
      gsap.killTweensOf(group.position);
      if (reduced) {
        group.position.x = x;
        needsFrame = true;
        return;
      }
      gsap.to(group.position, { duration: 1.1, ease: "power3.out", onUpdate: () => (needsFrame = true), x });
    };
    goToRef.current = goTo;

    // The cursor, in container units. Velocity is the per-frame movement,
    // fed in every frame and decayed by 0.92 so it eases out after the
    // cursor stops — that easing is the liquid. Under reduced motion the
    // cursor is ignored altogether and the slides stay still.
    const pointer = new THREE.Vector2(0.5, 0.5);
    const prev = new THREE.Vector2(0.5, 0.5);
    let hover = 0;
    let hoverTarget = 0;
    const onMove = (e: PointerEvent) => {
      if (reduced) return;
      const r = host.getBoundingClientRect();
      pointer.set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      // Set here too: a cursor already resting over the stage at mount
      // never gets a pointerenter.
      hoverTarget = 1;
    };
    const onEnter = (e: PointerEvent) => {
      onMove(e);
      prev.copy(pointer);
    };
    const onLeave = () => {
      hoverTarget = 0;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);

    // Wheel steps the index, either axis, one step per gesture. A gesture
    // is claimed as a whole — every event until 160 ms of quiet — so a
    // trackpad's small lead-in and inertia deltas do not also creep the
    // page (Lenis is told to stand down for a claimed event). A fresh
    // gesture is left to the page when the stage is not across the middle
    // of the viewport, or when it points past either end of the carousel.
    let wheelAt = 0;
    let claimedAt = 0;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      const continuing = now - claimedAt < 160;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const next = indexRef.current + (d > 0 ? 1 : -1);
      const canStep = next >= 0 && next < projects.length;
      if (!continuing) {
        const r = host.getBoundingClientRect();
        const vh = window.innerHeight;
        const acrossMiddle = r.top < vh * 0.4 && r.bottom > vh * 0.6;
        if (!acrossMiddle || !canStep || Math.abs(d) < 4) {
          host.removeAttribute("data-lenis-prevent");
          return;
        }
      }
      claimedAt = now;
      host.setAttribute("data-lenis-prevent", "");
      e.preventDefault();
      if (canStep && now - wheelAt > 700) {
        wheelAt = now;
        setIndex(next);
      }
    };
    host.addEventListener("wheel", onWheel, { passive: false });

    // Arrow keys while the carousel is on screen.
    let visible = false;
    const onKey = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(projects.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);

    // Frames only while the carousel is in view. Under reduced motion
    // there is nothing per-frame to draw, so a frame is drawn only when
    // something asked for one (a resize, a jump, the fonts landing).
    const clock = new THREE.Clock();
    const render = () => {
      renderer!.render(scene, camera);
      needsFrame = false;
    };
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!reduced) {
        velocity.x = (velocity.x - (pointer.x - prev.x)) * 0.92;
        velocity.y = (velocity.y + (pointer.y - prev.y)) * 0.92;
        prev.copy(pointer);
        if (velocity.length() > 0.6) velocity.setLength(0.6);
        hover += (hoverTarget - hover) * 0.08;
        const t = clock.getElapsedTime();
        uniforms.forEach((u) => {
          u.uHover.value = hover;
          u.uTime.value = t;
        });
        render();
      } else if (needsFrame) {
        render();
      }
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.02 },
    );
    io.observe(host);

    const onResize = () => {
      layout();
      if (!frame) render();
    };
    layout();
    render();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("wheel", onWheel);
      gsap.killTweensOf(group.position);
      goToRef.current = () => undefined;
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer!.forceContextLoss();
      renderer!.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={8}>
      <style>{`
        .v08-stage { position: relative; height: ${SLIDE_H * 100 + 10}vw; overflow: hidden; }
        .v08-canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; display: block; }
        .v08-index { position: absolute; left: 3vw; top: 50%; transform: translateY(-50%); z-index: 2; display: flex; flex-direction: column; gap: 0.55rem; }
        .v08-line { display: grid; grid-template-columns: 2.2rem 1fr; align-items: baseline; gap: 0.8rem; text-align: left;
          font-size: 4.2rem; font-weight: 300; line-height: 1.05; letter-spacing: -0.03em;
          opacity: 0.4; transition: opacity 0.4s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
        .v08-line:hover { transform: translateX(1rem); opacity: 0.85; }
        .v08-line[aria-current="true"] { opacity: 1; }
        .v08-line small { font-size: 0.72rem; font-weight: 400; letter-spacing: 0.12em; opacity: 0.6; }
        .v08-fallback { position: absolute; top: 50%; left: ${FOCUS * 100}%; width: ${SLIDE_W * 100}vw; aspect-ratio: ${TEX_W} / ${TEX_H};
          transform: translate(-50%, -50%); padding: 3.5rem; display: flex; flex-direction: column; justify-content: flex-end; }
        .v08-figure { font-size: 8rem; font-weight: 300; line-height: 0.9; letter-spacing: -0.05em; color: ${ACCENT}; }
        @media (prefers-reduced-motion: reduce) { .v08-line { transition: none; } .v08-line:hover { transform: none; } }
      `}</style>

      <section className="px-[3vw] pb-[10vh] pt-[16vh]">
        <h1 className="max-w-[22ch] text-[8.5rem] font-light leading-[0.98] tracking-[-0.045em]" data-reveal>
          Kevin He {"—"} engineer for things that move.
        </h1>
        <p className="mt-[2.4rem] max-w-[44ch] text-[1.1rem] leading-[1.5] opacity-70" data-reveal>
          Co-founder of The Actually Company. Robot autonomy, embedded firmware, and the tooling between them.
        </p>
      </section>

      <section className="pb-[8vh]" id="work">
        <div className="px-[3vw]">
          <Caption>Work</Caption>
        </div>
        <div className="v08-stage mt-[1.5rem]" ref={hostRef}>
          {gl ? null : (
            <div aria-hidden="true" className="v08-fallback" style={{ backgroundColor: TONES[index % TONES.length] }}>
              <p className="text-[0.75rem] tabular-nums" style={{ color: ACCENT }}>
                0{index + 1}
              </p>
              <p className="mt-[0.6rem] text-[5.4rem] font-bold leading-[0.95] tracking-[-0.04em]">{active.title}</p>
              <p className="mt-[1rem] max-w-[40ch] text-[1rem] opacity-80">{active.tagline}</p>
            </div>
          )}
          <ol aria-label="Projects" className="v08-index">
            {projects.map((p, i) => (
              <li key={p.title}>
                <button aria-current={i === index} className="v08-line" onClick={() => setIndex(i)} type="button">
                  <small className="tabular-nums">0{i + 1}</small>
                  <span>{p.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-[2.5rem] grid grid-cols-[3fr_2fr] gap-x-[4vw] px-[3vw]" data-reveal>
          <div>
            <p className="max-w-[48ch] text-[1.1rem] leading-[1.5]">{active.tagline}</p>
            <ul className="mt-[1rem] max-w-[60ch] space-y-[0.5rem] text-[0.9rem] leading-[1.55] opacity-70">
              {active.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-[0.5rem] self-start border-t pt-[0.9rem] text-[0.85rem]" style={{ borderColor: LINE }}>
            <dt className="opacity-50">Year</dt>
            <dd className="tabular-nums">{active.year}</dd>
            <dt className="opacity-50">Stack</dt>
            <dd>{active.stack.join(", ")}</dd>
            {active.award ? (
              <>
                <dt className="opacity-50">Award</dt>
                <dd style={{ color: ACCENT }}>{active.award}</dd>
              </>
            ) : null}
            {active.href ? (
              <>
                <dt className="opacity-50">Link</dt>
                <dd>
                  <a className="underline underline-offset-[0.3em] opacity-80 hover:opacity-100" href={active.href} rel="noreferrer" target="_blank">
                    {active.href.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="info">
        <Caption>Info</Caption>
        <ol className="mt-[1.5rem] grid grid-cols-4 gap-x-[3vw] border-t pt-[2rem]" style={{ borderColor: LINE }}>
          {CREDENTIALS.map((c) => (
            <li data-reveal key={c.figure}>
              <p className="v08-figure tabular-nums">{c.figure}</p>
              <p className="mt-[1rem] max-w-[26ch] text-[0.9rem] leading-[1.5] opacity-70">{c.caption}</p>
            </li>
          ))}
        </ol>
        <div className="mt-[6rem] grid grid-cols-[1fr_1fr] gap-x-[4vw]">
          <ol>
            {experience.map((e) => (
              <li className="grid grid-cols-[9rem_1fr] gap-x-[2rem] border-t py-[1.5rem]" data-reveal key={e.org} style={{ borderColor: LINE }}>
                <p className="text-[0.75rem] tabular-nums opacity-50">{e.when}</p>
                <div>
                  <p className="text-[1.4rem] font-light leading-[1.1] tracking-[-0.02em]">{e.org}</p>
                  <p className="mt-[0.3rem] text-[0.85rem] opacity-60">
                    {e.role}, {e.where}
                  </p>
                  <ul className="mt-[0.8rem] space-y-[0.4rem] text-[0.85rem] leading-[1.5] opacity-70">
                    {e.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <div className="border-t py-[1.5rem]" data-reveal style={{ borderColor: LINE }}>
              <p className="text-[0.7rem] uppercase tracking-[0.28em] opacity-50">Education</p>
              <p className="mt-[0.8rem] text-[1.4rem] font-light leading-[1.1] tracking-[-0.02em]">{education.school}</p>
              <p className="mt-[0.3rem] text-[0.85rem] opacity-60">
                {education.degree}, {education.when}
              </p>
            </div>
            <p className="mt-[2rem] max-w-[40ch] text-[1.05rem] leading-[1.5] opacity-70" data-reveal>
              Computer engineering at the University of Toronto. Since 2022, the controls stack behind 82855Z{"’"}s
              autonomous routines: odometry, motion profiling, particle{"‑"}filter localisation.
            </p>
          </div>
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="skills">
        <Caption>Skills</Caption>
        <div className="mt-[1.5rem] border-t" style={{ borderColor: LINE }}>
          {skillGroups.map((g) => (
            <div className="grid grid-cols-[14rem_1fr] gap-x-[3vw] border-b py-[1.6rem]" data-reveal key={g.label} style={{ borderColor: LINE }}>
              <div>
                <p className="text-[1.15rem] font-light leading-[1.1]">{g.label}</p>
                <p className="mt-[0.5rem] text-[0.8rem] leading-[1.5] opacity-55">{g.blurb}</p>
              </div>
              <ul className="flex flex-wrap gap-x-[1.8rem] gap-y-[0.9rem] self-center">
                {g.skills.map((s) => (
                  <li className="flex items-center gap-[0.6rem] text-[0.95rem]" key={s.name}>
                    <SkillMark size="1.1rem" skill={s} />
                    <span className="opacity-85">{s.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[3vw] pb-[10vh] pt-[8vh]" id="contact">
        <Caption>Contact</Caption>
        <a className="mt-[1.5rem] block text-[6.4rem] font-light leading-none tracking-[-0.045em]" data-reveal href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <div className="mt-[2rem] flex gap-[2.4rem] text-[0.85rem]" data-reveal>
          {elsewhere.map((l) => (
            <a className="opacity-60 transition-opacity hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
              {l.label} <span className="opacity-60">{l.handle}</span>
            </a>
          ))}
        </div>
      </section>
    </VariantShell>
  );
}
