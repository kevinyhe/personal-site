import * as THREE from "three";

import type { HeroRobot } from "@/components/heroRobot";

/**
 * Hover the robot and a liquid window opens in it: inside the window the
 * robot is an engineer's drawing, with its dimensions; outside, it stays
 * the band's bars. The window follows the cursor, wobbles at the edge,
 * drifts and fades after it leaves.
 *
 * How: a mask the size of the frame, kept in two textures that take turns.
 * Each frame the old mask is read back a little way off (so it drifts),
 * blurred a touch (so its edge rounds), faded, and the cursor's stroke is
 * added. The picture pass shows the drawing where the mask is over half,
 * with a thin bright line where it crosses half.
 *
 * The drawing is heroRobot's own second pass, same pose, same lens, so it
 * lies exactly over the bars. The robot's layer on the bar canvas can be
 * any box on the frame (the band pushes in on it); `rect` says which, as
 * fractions of the frame, and the picture pass maps into it.
 *
 * Nothing runs until the cursor first touches the robot, and the loop
 * stops again a few seconds after it leaves, once the mask has faded.
 */

export type RevealRect = { x: number; y: number; w: number; h: number };

const STROKES = 4;
/** Seconds the loop keeps running after the last stroke. */
const LINGER = 5;

const QUAD = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const NOISE = /* glsl */ `
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 slope(vec2 cell) {
  float a = 6.2831853 * hash(cell);
  return vec2(cos(a), sin(a));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(slope(i), f);
  float b = dot(slope(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(slope(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(slope(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
`;

const MASK = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uAspect;
uniform float uTime;
uniform float uKeep;
uniform float uFlow;
uniform vec4 uSeg[${STROKES}];
uniform vec2 uBlob[${STROKES}];
varying vec2 vUv;
${NOISE}
float stroke(vec2 p, vec4 seg, vec2 blob) {
  vec2 a = seg.xy;
  vec2 ab = seg.zw - seg.xy;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  float d = length(p - a - ab * h);
  float r = max(blob.x, 0.001);
  return blob.y * (1.0 - smoothstep(r * 0.4, r, d));
}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 q = p * 2.6;
  vec2 push = vec2(noise(q + vec2(0.0, uTime * 0.19)), noise(q + vec2(31.7, -uTime * 0.16)));
  push.y -= 0.25;
  vec2 from = vUv - vec2(push.x / uAspect, push.y) * uFlow;
  float m = texture2D(uPrev, from).r * 0.4;
  m += texture2D(uPrev, from + vec2(uTexel.x, 0.0)).r * 0.15;
  m += texture2D(uPrev, from - vec2(uTexel.x, 0.0)).r * 0.15;
  m += texture2D(uPrev, from + vec2(0.0, uTexel.y)).r * 0.15;
  m += texture2D(uPrev, from - vec2(0.0, uTexel.y)).r * 0.15;
  m = max(min(m * uKeep - 0.0012, m - 0.0025), 0.0);
  for (int i = 0; i < ${STROKES}; i++) {
    m = max(m, stroke(p, uSeg[i], uBlob[i]));
  }
  gl_FragColor = vec4(min(m, 1.0), 0.0, 0.0, 1.0);
}
`;

const PICTURE = /* glsl */ `
uniform sampler2D uDraw;
uniform sampler2D uMask;
uniform vec4 uRect;
uniform vec2 uPixel;
uniform vec2 uDrawPixel;
uniform float uAspect;
uniform float uTime;
uniform float uLine;
uniform vec3 uGround;
uniform vec3 uGrid;
uniform vec3 uRim;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 wob = vec2(noise(p * 4.0 + vec2(0.0, uTime * 0.23)), noise(p * 4.0 + vec2(9.1, -uTime * 0.2))) * 0.01;
  float raw = texture2D(uMask, vUv + vec2(wob.x / uAspect, wob.y)).r;
  float edge = (raw - 0.5) / max(fwidth(raw), 0.0005);
  float inside = smoothstep(-1.0, 1.0, edge);
  float rim = 1.0 - smoothstep(uLine, uLine + 1.2, abs(edge));
  if (inside < 0.001 && rim < 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Squared paper: a fine line every 24 px, a stronger one every 120.
  vec2 px = gl_FragCoord.xy;
  vec2 fine = abs(fract(px / 24.0) - 0.5) * 24.0;
  vec2 major = abs(fract(px / 120.0) - 0.5) * 120.0;
  float gridLine = max(1.0 - smoothstep(0.0, 1.0, min(fine.x, fine.y)) , 0.0) * 0.08;
  gridLine = max(gridLine, (1.0 - smoothstep(0.0, 1.2, min(major.x, major.y))) * 0.2);
  vec3 ground = mix(uGround, uGrid, gridLine);

  // The drawing, mapped from the frame into the robot's box.
  vec2 s = (vUv - uRect.xy) / uRect.zw;
  vec4 d = vec4(0.0);
  if (s.x >= 0.0 && s.x <= 1.0 && s.y >= 0.0 && s.y <= 1.0) {
    d = texture2D(uDraw, s);
    // Lines one pixel wide at the drawing's size are thinner than that
    // once the band pushes in, so spread each a little.
    vec4 dx = max(texture2D(uDraw, s + vec2(uDrawPixel.x, 0.0)), texture2D(uDraw, s - vec2(uDrawPixel.x, 0.0)));
    vec4 dy = max(texture2D(uDraw, s + vec2(0.0, uDrawPixel.y)), texture2D(uDraw, s - vec2(0.0, uDrawPixel.y)));
    d = max(d, max(dx, dy) * 0.35);
  }
  vec3 col = mix(ground, d.rgb, d.a);
  col = mix(col, uRim, rim * 0.9);
  float alpha = max(inside, rim * 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
}
`;

export function createRobotReveal({
  overlay,
  robot,
  rect,
  colours,
}: {
  /** A canvas laid exactly over the band's bar canvas. */
  overlay: HTMLCanvasElement;
  robot: HeroRobot;
  /** The robot layer's box on the frame, fractions, from the top left. */
  rect: () => RevealRect;
  colours: { ground: string; grid: string; rim: string };
}): { dispose(): void } {
  const drawing = robot.drawing;
  if (!drawing) return { dispose: () => undefined };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
  } catch {
    return { dispose: () => undefined };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  const targetOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.HalfFloatType };
  let a = new THREE.WebGLRenderTarget(4, 4, targetOpts);
  let b = new THREE.WebGLRenderTarget(4, 4, targetOpts);

  const segs = Array.from({ length: STROKES }, () => new THREE.Vector4());
  const blobs = Array.from({ length: STROKES }, () => new THREE.Vector2());
  const maskMat = new THREE.ShaderMaterial({
    vertexShader: QUAD,
    fragmentShader: MASK,
    uniforms: {
      uPrev: { value: a.texture },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uKeep: { value: 0.988 },
      uFlow: { value: 0.0016 },
      uSeg: { value: segs },
      uBlob: { value: blobs },
    },
    depthTest: false,
    depthWrite: false,
  });
  const drawTex = new THREE.CanvasTexture(drawing.canvas);
  drawTex.colorSpace = THREE.SRGBColorSpace;
  drawTex.minFilter = THREE.LinearFilter;
  drawTex.generateMipmaps = false;
  const col = (hex: string) => new THREE.Color(hex);
  const picMat = new THREE.ShaderMaterial({
    vertexShader: QUAD,
    fragmentShader: PICTURE,
    uniforms: {
      uDraw: { value: drawTex },
      uMask: { value: b.texture },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uPixel: { value: new THREE.Vector2(1, 1) },
      uDrawPixel: { value: new THREE.Vector2(1, 1) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uLine: { value: 0.9 },
      uGround: { value: col(colours.ground) },
      uGrid: { value: col(colours.grid) },
      uRim: { value: col(colours.rim) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const maskMesh = new THREE.Mesh(quad, maskMat);
  const picMesh = new THREE.Mesh(quad, picMat);
  const maskScene = new THREE.Scene().add(maskMesh);
  const picScene = new THREE.Scene().add(picMesh);

  let W = 1;
  let H = 1;
  const size = () => {
    W = Math.max(2, overlay.clientWidth);
    H = Math.max(2, overlay.clientHeight);
    renderer.setSize(W, H, false);
    // The mask at a third of the frame: its edge is smoothed anyway.
    const mw = Math.max(4, Math.round(W / 3));
    const mh = Math.max(4, Math.round(H / 3));
    a.setSize(mw, mh);
    b.setSize(mw, mh);
    maskMat.uniforms.uTexel.value.set(1 / mw, 1 / mh);
    maskMat.uniforms.uAspect.value = W / H;
    picMat.uniforms.uAspect.value = W / H;
    picMat.uniforms.uPixel.value.set(1 / W, 1 / H);
  };
  size();
  const clearMask = () => {
    for (const t of [a, b]) {
      renderer.setRenderTarget(t);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    renderer.clear();
  };
  clearMask();

  // --- Strokes -------------------------------------------------------------------
  type Pt = { x: number; y: number; t: number };
  let last: Pt | null = null;
  /** Where the cursor rests over the robot, if it does: the window holds
   *  open there while it stays, and closes once it leaves. */
  let resting: Pt | null = null;
  const queue: { from: Pt; to: Pt; r: number }[] = [];
  let lastStroke = -Infinity;
  let running = false;
  let raf = 0;
  let lastVersion = -1;
  const t0 = performance.now();

  /** Is this frame point (px, from the top left) on the robot? Mapped
   *  back into the robot's canvas through the layer's box and tested
   *  against its rendered outline. */
  const onRobot = (x: number, y: number, pad: number): boolean => {
    const r = rect();
    const cw = robot.canvas.width || 1;
    const ch = robot.canvas.height || 1;
    const sx = ((x / W - r.x) / r.w) * cw;
    const sy = ((y / H - r.y) / r.h) * ch;
    return robot.hit(sx, sy, (pad / (r.h * H)) * ch);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const bounds = overlay.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > window.innerHeight || bounds.width < 2) return;
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    const now = performance.now() / 1000;
    // A little outside a part counts, so the window can open on an edge.
    const over = onRobot(x, y, H * 0.012);
    const here = { x: x / H, y: 1 - y / H, t: now };
    if (!over) {
      last = null;
      resting = null;
      return;
    }
    resting = here;
    const from = last ?? here;
    const dt = Math.max(1 / 240, now - from.t);
    const speed = Math.hypot(here.x - from.x, here.y - from.y) / dt;
    // Slow: a small window; quick: a wide one.
    const r = 0.12 + Math.min(1, speed / 2.2) * 0.11;
    queue.push({ from, to: here, r });
    if (queue.length > STROKES) queue.shift();
    last = here;
    lastStroke = now;
    start();
  };

  const frame = () => {
    raf = 0;
    const now = performance.now() / 1000;
    const time = now - t0 / 1000;
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width !== W || bounds.height !== H) size();

    // The drawing: fresh texture only when the robot redrew it.
    const v = drawing.version();
    if (v !== lastVersion) {
      lastVersion = v;
      drawTex.needsUpdate = true;
      picMat.uniforms.uDrawPixel.value.set(1 / Math.max(1, drawing.canvas.width), 1 / Math.max(1, drawing.canvas.height));
    }

    // A cursor at rest on the robot keeps its window open.
    if (resting && queue.length === 0) {
      queue.push({ from: resting, to: resting, r: 0.12 });
      lastStroke = now;
    }
    // One step of the mask.
    for (let i = 0; i < STROKES; i += 1) {
      const s = queue[i];
      if (s) {
        segs[i].set(s.from.x, s.from.y, s.to.x, s.to.y);
        blobs[i].set(s.r, 1);
      } else {
        segs[i].set(0, 0, 0, 0);
        blobs[i].set(0, 0);
      }
    }
    queue.length = 0;
    maskMat.uniforms.uPrev.value = a.texture;
    maskMat.uniforms.uTime.value = time;
    renderer.setRenderTarget(b);
    renderer.render(maskScene, camera);
    renderer.setRenderTarget(null);

    // The picture.
    const r = rect();
    // uRect is in the frame's uv, whose y runs up from the bottom.
    picMat.uniforms.uRect.value.set(r.x, 1 - r.y - r.h, r.w, r.h);
    picMat.uniforms.uMask.value = b.texture;
    picMat.uniforms.uTime.value = time;
    renderer.render(picScene, camera);
    [a, b] = [b, a];

    if (now - lastStroke > LINGER) {
      stop();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    robot.setDrawing(true);
    lastVersion = -1;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    robot.setDrawing(false);
    last = null;
    resting = null;
    clearMask();
  };

  const onResize = () => size();
  // Development only: open a window by hand and read the drawing back,
  // for checking it without a mouse.
  const dev = process.env.NODE_ENV !== "production";
  if (dev) {
    (window as unknown as Record<string, unknown>).__reveal = {
      stamp: (fx: number, fy: number, r = 0.3) => {
        const p = { x: (fx * W) / H, y: 1 - fy, t: performance.now() / 1000 };
        queue.push({ from: p, to: p, r });
        lastStroke = p.t;
        start();
      },
      drawing: () => drawing.canvas.toDataURL("image/png"),
    };
  }
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("resize", onResize);

  return {
    dispose: () => {
      if (dev) delete (window as unknown as Record<string, unknown>).__reveal;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      robot.setDrawing(false);
      a.dispose();
      b.dispose();
      drawTex.dispose();
      maskMat.dispose();
      picMat.dispose();
      quad.dispose();
      renderer.dispose();
    },
  };
}
