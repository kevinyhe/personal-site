"use client";

import { type JSX, useEffect, useRef } from "react";

import Work from "@/components/tx/t3/Work";
import { GROUND, INK } from "@/components/luke/theme";
import {
  type BarCanvas,
  type BarLayerConfig,
  type CanvasSource,
  createBarCanvas,
  hexToRgb,
} from "@/components/valley/barShader";

/**
 * Transition 3: the band is the surface of the pond.
 *
 * Adapted from the image-to-image ripple wipes on awwwards Sites of the Day
 * built on displacement shaders (Lusion's water drop on lusion.co, and the
 * liquid page change on Bruno Simon's / Active Theory's work pages): one drop
 * lands, rings run out over the picture, then the picture opens from that
 * point with a bent, refracting lip and is gone past the corners.
 *
 * Here the drop falls on the full stop of "to life.". The band (ground,
 * flower and type) is copied into one texture and drawn by one WebGL canvas:
 *
 *   q 0.00 - 0.30  the band as it is: the real DOM, read.
 *   q 0.30 - 0.58  the canvas takes over (same picture), and a train of rings
 *                  runs out from the full stop across the band.
 *   q 0.40 - 0.88  the surface opens from that point. The band near the edge
 *                  bends down into the opening, rings run ahead of it, and
 *                  the whole surface swells toward you as you go under.
 *   q 0.30 - 0.90  Work comes up from below, under the water: a little
 *                  blurred and enlarged, clearing as the surface goes.
 *
 * q is the scroll through the section's held stretch (two screens). The
 * scroll drives everything; nothing moves on a clock but the flower's sway.
 *
 * Reduced motion: no water. The band fades out while Work comes up. Narrow
 * screens: no hold and no canvas, the band then Work.
 */

const LINE = "I build systems that bring ideas to life.";
const LINE_ROWS = ["I build systems", "that bring ideas", "to life."];
const INTRO_TEXT =
  "My name is Kevin. I’m a computer engineering student at the University of Toronto. I design and build software, hardware and robots, for the love of the craft and the people who use what I make.";
const NARROW = 1024;

const ASSETS = "/sonda";
const BLOOM_FROM = 0.0;
const BLOOM_TO = 0.8;
const FRAMES = 64;
const SHEET_COLS = 8;
const FRAME_W = 200;
const FRAME_H = 356;

const Q_SWAP = 0.3;

const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uC;
uniform float uRing;
uniform float uRingAmp;
uniform float uHole;
uniform float uOpen;
uniform float uZoom;
uniform vec3 uInk;

vec3 band(vec2 q) {
  vec2 uv = clamp(q / uRes, vec2(0.0), vec2(1.0));
  return texture2D(uTex, uv).rgb;
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 d = px - uC;
  float r = length(d);
  vec2 n = d / max(r, 0.001);
  float a = atan(d.y, d.x);
  float s = min(uRes.x, uRes.y);

  // The drop's rings: a train of waves behind the front, dying toward the centre.
  float b = (uRing - r) / s;
  float wave = 0.0;
  if (b > 0.0) wave = sin(b * 70.0) * exp(-b * 4.0) * smoothstep(0.0, 0.02, b) * smoothstep(0.0, 0.06, r / s);
  float off = uRingAmp * wave;

  // The opening, with a rim that wobbles as it grows.
  float rim = uHole * (1.0 + 0.035 * sin(a * 5.0 + uHole * 0.004) + 0.02 * sin(a * 11.0 - uHole * 0.006));
  float e = (r - rim) / s;
  float on = step(0.5, uHole);
  float lip = on * exp(-max(e, 0.0) * 10.0);
  // The band near the rim is pulled down into the opening: it shows what
  // lies further in, stretched, as a surface bending over an edge does.
  off -= on * 70.0 * lip * sqrt(uOpen);
  // Waves running out ahead of the rim, faster than it.
  float run = on * sin((r - 1.5 * rim) / s * 60.0) * exp(-max(e, 0.0) * 4.0) * (1.0 - 0.6 * uOpen);
  off += 9.0 * run;

  vec2 base = uC + (px - uC) / uZoom;
  vec3 col = band(base - n * off);

  // Light on the water: crests catch it, the lip falls into shadow.
  col += uInk * (0.10 * max(wave, 0.0) * uRingAmp / 18.0 + 0.05 * max(run, 0.0));
  col *= 1.0 - 0.55 * lip * smoothstep(0.0, 0.02, e);

  float alpha = on > 0.5 ? smoothstep(rim - 1.5, rim + 1.5, r) : 1.0;
  float hl = on * exp(-pow((r - rim) / 2.2, 2.0)) * (0.35 + 0.65 * (1.0 - uOpen));
  // Under the surface: a few rings of light seen from below, fading with depth.
  float depth = max(rim - r, 0.0) / s;
  float inner = on * (1.0 - alpha) * 0.08 * (1.0 - uOpen) * pow(0.5 + 0.5 * sin(depth * 38.0), 14.0) * exp(-depth * 3.0);

  vec3 outc = col * alpha + uInk * (0.85 * hl + inner);
  float outa = clamp(max(alpha, 0.85 * hl + inner), 0.0, 1.0);
  gl_FragColor = vec4(outc, outa);
}`;

type Water = {
  draw: (u: { ring: number; ringAmp: number; hole: number; open: number; zoom: number; cx: number; cy: number }) => void;
  upload: (src: HTMLCanvasElement) => void;
  resize: (w: number, h: number, dpr: number) => void;
  destroy: () => void;
};

function createWater(canvas: HTMLCanvasElement): Water | null {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const o = gl.createShader(type);
    if (!o) return null;
    gl.shaderSource(o, src);
    gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(o));
      return null;
    }
    return o;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT);
  const fs = sh(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const U = {
    res: u("uRes"), c: u("uC"), ring: u("uRing"), ringAmp: u("uRingAmp"),
    hole: u("uHole"), open: u("uOpen"), zoom: u("uZoom"), ink: u("uInk"),
  };
  const [ir, ig, ib] = hexToRgb(INK);
  gl.uniform3f(U.ink, ir, ig, ib);
  let dpr = 1;
  let w = 1;
  let h = 1;
  return {
    resize(nw, nh, nd) {
      w = nw;
      h = nh;
      dpr = nd;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    upload(src) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    },
    draw(v) {
      // Uniforms in CSS px; the shader works in its own pixels.
      gl.uniform2f(U.res, w * dpr, h * dpr);
      gl.uniform2f(U.c, v.cx * dpr, v.cy * dpr);
      gl.uniform1f(U.ring, v.ring * dpr);
      gl.uniform1f(U.ringAmp, v.ringAmp * dpr);
      gl.uniform1f(U.hole, v.hole * dpr);
      gl.uniform1f(U.open, v.open);
      gl.uniform1f(U.zoom, v.zoom);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

/** The flower: sondaven's prologue clip through the bar shader, opened by the scroll. */
function startFlower(canvas: HTMLCanvasElement, reduced: boolean): { setOpen: (v: number) => void; destroy: () => void } {
  const video = document.createElement("video");
  video.src = `${ASSETS}/prolog-r-c.mp4`;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const sheet = document.createElement("canvas");
  sheet.width = SHEET_COLS * FRAME_W;
  sheet.height = Math.ceil(FRAMES / SHEET_COLS) * FRAME_H;
  const sheetCtx = sheet.getContext("2d");
  const frame = document.createElement("canvas");
  frame.width = FRAME_W;
  frame.height = FRAME_H;
  const ctx = frame.getContext("2d");
  let captured = 0;
  let want = 0;
  let shown = -1;
  let stopped = false;
  const slotTime = (i: number) => (BLOOM_FROM + ((BLOOM_TO - BLOOM_FROM) * i) / (FRAMES - 1)) * video.duration;
  type WithRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  const rvfc = (video as WithRvfc).requestVideoFrameCallback;
  const schedule = (): void => {
    if (stopped) return;
    if (rvfc) rvfc.call(video, grab);
    else requestAnimationFrame(grab);
  };
  function grab(): void {
    if (stopped || !sheetCtx) return;
    while (captured < FRAMES && video.currentTime >= slotTime(captured)) {
      sheetCtx.drawImage(video, (captured % SHEET_COLS) * FRAME_W, Math.floor(captured / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H);
      captured += 1;
    }
    if (captured >= FRAMES) {
      stopped = true;
      video.pause();
      return;
    }
    schedule();
  }
  const ready = new Promise<void>((resolve) => {
    const go = (): void => {
      schedule();
      void video.play().catch(() => {
        stopped = true;
        video.currentTime = BLOOM_TO * video.duration;
        video.addEventListener(
          "seeked",
          () => {
            if (!sheetCtx) return;
            for (let i = 0; i < FRAMES; i += 1) {
              sheetCtx.drawImage(video, (i % SHEET_COLS) * FRAME_W, Math.floor(i / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H);
            }
            captured = FRAMES;
          },
          { once: true },
        );
      });
      resolve();
    };
    if (video.readyState >= 2) go();
    else {
      video.addEventListener("loadeddata", go, { once: true });
      video.addEventListener("error", () => resolve(), { once: true });
    }
  });
  const STRIPS = 36;
  const sway = (t: number, h: number): number => {
    const arm = Math.pow(1 - h, 1.6);
    const slow = 5.5 * Math.sin(t * 0.9) + 2.2 * Math.sin(t * 1.7 + 1.1);
    return arm * slow + 1.1 * Math.pow(1 - h, 4) * Math.sin(t * 6.3 + h * 9);
  };
  const source: CanvasSource = {
    canvas: frame,
    animated: true,
    ready,
    update: (timeSec) => {
      if (!ctx || captured === 0) return false;
      const i = Math.min(want, captured - 1);
      if (reduced && i === shown) return false;
      shown = i;
      const sx = (i % SHEET_COLS) * FRAME_W;
      const sy = Math.floor(i / SHEET_COLS) * FRAME_H;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
      if (reduced) {
        ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
        return true;
      }
      const stripH = FRAME_H / STRIPS;
      for (let k = 0; k < STRIPS; k += 1) {
        const y = k * stripH;
        ctx.drawImage(sheet, sx, sy + y, FRAME_W, stripH + 1, sway(timeSec, (k + 0.5) / STRIPS), y, FRAME_W, stripH + 1);
      }
      return true;
    },
  };
  const config: BarLayerConfig = {
    x: "-2.5%", y: "2%", width: "50%", height: "100%",
    blackPoint: 200, whitePoint: 25, threshold: 255,
    xSquares: 150, ySquares: 190, bgOpacity: 0, fillOpacity: 0,
  };
  const bar: BarCanvas | null = createBarCanvas(canvas, [{ type: "canvas", source, config }], {
    colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(INK) }),
    defaults: { bgOpacity: 0 },
    fps: reduced ? 4 : 60,
  });
  return {
    setOpen(v) {
      want = Math.round(v * (FRAMES - 1));
      config.fillOpacity = v <= 0.002 ? 0 : 1;
    },
    destroy() {
      stopped = true;
      bar?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      sheet.width = 1;
      frame.width = 1;
    },
  };
}

/** Writes the band's type into a 2D canvas, letter by letter where the DOM put it. */
function paintType(g: CanvasRenderingContext2D, root: HTMLElement): void {
  g.textBaseline = "alphabetic";
  g.fillStyle = INK;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-glyph]"))) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    g.globalAlpha = Number(cs.opacity) * Number(getComputedStyle(el.closest("[data-fade]") ?? el).opacity);
    const m = g.measureText(el.textContent ?? "");
    const lh = r.height;
    const asc = m.fontBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent;
    const base = r.top + (lh - (asc + desc)) / 2 + asc;
    g.fillText(el.textContent ?? "", r.left, base);
  }
  g.globalAlpha = 1;
}

export default function Scene(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const flowerRef = useRef<HTMLCanvasElement | null>(null);
  const waterRef = useRef<HTMLCanvasElement | null>(null);
  const domRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLParagraphElement | null>(null);
  const lineRef = useRef<HTMLParagraphElement | null>(null);
  const workRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const flowerCanvas = flowerRef.current;
    const waterCanvas = waterRef.current;
    const dom = domRef.current;
    const intro = introRef.current;
    const work = workRef.current;
    if (!root || !stage || !flowerCanvas || !waterCanvas || !dom || !intro || !work) return undefined;
    if (window.innerWidth < NARROW) {
      intro.style.opacity = "1";
      return undefined;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const flower = startFlower(flowerCanvas, reduced);
    const water = reduced ? null : createWater(waterCanvas);

    // The band's picture, for the water: ground, flower, then the type.
    const pic = document.createElement("canvas");
    const picG = pic.getContext("2d");
    const typeLayer = document.createElement("canvas");
    const typeG = typeLayer.getContext("2d");
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let typed = false;
    let drop = { x: vw * 0.7, y: vh * 0.6 };

    const size = (): void => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [pic, typeLayer]) {
        c.width = Math.round(vw * dpr);
        c.height = Math.round(vh * dpr);
      }
      water?.resize(vw, vh, dpr);
      typed = false;
    };
    size();

    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const smooth = (v: number): number => v * v * (3 - 2 * v);
    let q = 0;
    let swapped = false;
    let raf = 0;

    // The type is copied from the DOM once, while it is still the DOM, and
    // the drop is placed on the full stop.
    const takeType = (): void => {
      if (!typeG) return;
      typeG.setTransform(dpr, 0, 0, dpr, 0, 0);
      typeG.clearRect(0, 0, vw, vh);
      paintType(typeG, dom);
      const glyphs = lineRef.current?.querySelectorAll<HTMLElement>("[data-glyph]");
      const stop = glyphs?.[glyphs.length - 1]?.getBoundingClientRect();
      if (stop) drop = { x: stop.left + stop.width * 0.45, y: stop.top + stop.height * 0.78 };
      typed = true;
    };

    const setSwapped = (v: boolean): void => {
      if (v === swapped) return;
      if (v && !typed) takeType();
      swapped = v;
      waterCanvas.style.opacity = v ? "1" : "0";
      dom.style.opacity = v ? "0" : "1";
      flowerCanvas.style.opacity = v ? "0" : "1";
      stage.style.backgroundColor = v ? "transparent" : GROUND;
    };

    const frame = (): void => {
      raf = 0;
      if (!water || !picG) return;
      if (!swapped) return;
      picG.setTransform(1, 0, 0, 1, 0, 0);
      picG.fillStyle = GROUND;
      picG.fillRect(0, 0, pic.width, pic.height);
      picG.drawImage(flowerCanvas, 0, 0, pic.width, pic.height);
      picG.drawImage(typeLayer, 0, 0);
      water.upload(pic);
      const diag = Math.hypot(Math.max(drop.x, vw - drop.x), Math.max(drop.y, vh - drop.y));
      const tr = clamp01((q - Q_SWAP) / 0.28);
      const th = clamp01((q - 0.4) / 0.48);
      water.draw({
        cx: drop.x,
        cy: drop.y,
        ring: tr * 1.5 * diag,
        ringAmp: 18 * Math.pow(1 - tr, 1.3) * smooth(clamp01(tr / 0.08)),
        hole: th <= 0 ? 0 : 6 + diag * 1.25 * Math.pow(th, 1.7),
        open: th,
        zoom: 1 + 0.22 * th * th,
      });
      // The flower sways on its own: keep drawing while the surface is up.
      if (q < 0.9) raf = requestAnimationFrame(frame);
    };

    const update = (): void => {
      const r = root.getBoundingClientRect();
      const held = Math.max(1, root.offsetHeight - vh);
      q = clamp01(-r.top / held);
      // The flower opens as the band arrives and over the first of the hold.
      flower.setOpen(clamp01((vh - r.top) / (1.4 * vh)));
      // The introduction comes in under the sentence.
      const iq = 1 - Math.pow(1 - clamp01(q / 0.1 + (r.top < vh ? 0.15 : 0)), 2);
      intro.style.opacity = String(iq);
      intro.style.transform = `translateY(${((1 - iq) * 28).toFixed(1)}px)`;
      // Work under the water: enlarged and soft, clearing as the surface goes.
      const tw = clamp01((q - 0.3) / 0.6);
      if (tw > 0 && tw < 1) {
        const u = 1 - smooth(tw);
        work.style.transform = `scale(${(1 + 0.07 * u).toFixed(4)})`;
        work.style.filter = reduced ? "" : `blur(${(5 * u).toFixed(2)}px)`;
      } else {
        work.style.transform = "";
        work.style.filter = "";
      }
      stage.style.visibility = q >= 0.9 ? "hidden" : "visible";
      if (reduced || !water) {
        stage.style.opacity = String(1 - smooth(clamp01((q - 0.4) / 0.48)));
        return;
      }
      setSwapped(q >= Q_SWAP);
      if (swapped && !raf) raf = requestAnimationFrame(frame);
    };

    const onResize = (): void => {
      size();
      if (swapped) takeType();
      update();
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
      flower.destroy();
      water?.destroy();
    };
  }, []);

  // The line coming to, a letter at a time, as it reaches the middle.
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return undefined;
    const letters = Array.from(line.querySelectorAll<HTMLElement>("[data-glyph]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const paint = (): void => {
      const r = line.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 as the line comes over the fold, 1 when it is centred.
      const t = Math.max(0, Math.min(1, (vh - r.top) / (vh - (vh - r.height) / 2)));
      letters.forEach((el, i) => {
        const k = Math.max(0, Math.min(1, t * 1.6 - (i / letters.length) * 0.6));
        el.style.opacity = String(0.06 + 0.94 * k);
        el.style.filter = k >= 1 ? "" : `blur(${(7 * (1 - k)).toFixed(2)}px)`;
      });
    };
    paint();
    window.addEventListener("scroll", paint, { passive: true });
    return () => window.removeEventListener("scroll", paint);
  }, []);

  return (
    <>
      <section
        aria-label={LINE}
        className="relative z-10 lg:h-[300vh]"
        data-statement
        id="info"
        ref={rootRef}
        style={{ color: INK }}
      >
        <div
          className="flex min-h-[100vh] items-center overflow-hidden lg:sticky lg:top-0 lg:h-[100vh]"
          ref={stageRef}
          style={{ backgroundColor: GROUND }}
        >
          <canvas aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" ref={flowerRef} />
          <canvas
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full opacity-0 lg:block"
            ref={waterRef}
          />
          <div className="relative z-[1] flex w-full items-center">
            <div className="mx-[6vw] lg:ml-[50vw] lg:mr-0" ref={domRef}>
              <p
                aria-hidden="true"
                className="pb-[0.1em] font-serif-display italic text-[12vw] leading-[1.02] tracking-[-0.03em] lg:whitespace-nowrap lg:text-[min(16vh,6.2vw)]"
                ref={lineRef}
              >
                {LINE_ROWS.map((row, r) => (
                  <span className="block" key={r}>
                    {row.split(" ").map((word, index, all) => (
                      <span className="inline-block" key={index}>
                        {Array.from(word).map((glyph, at) => (
                          <span className="inline-block" data-glyph key={at}>
                            {glyph}
                          </span>
                        ))}
                        {index < all.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </span>
                ))}
              </p>
              <p
                className="mt-[5vh] max-w-[46rem] font-sans text-[1.75rem] font-light leading-[1.6] tracking-[0.01em] opacity-0 lg:w-[22vw] lg:max-w-none lg:text-[min(2.2vh,0.93vw)]"
                data-fade
                ref={introRef}
              >
                {INTRO_TEXT.split(" ").map((word, i, all) => (
                  <span data-glyph key={i}>
                    {word}
                    {i < all.length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* Work starts 1.4 screens early, under the held band, and comes up
          beneath it as the surface opens. */}
      <div className="relative z-0 origin-[70%_40%] lg:-mt-[140vh]" ref={workRef}>
        <Work />
      </div>
    </>
  );
}
