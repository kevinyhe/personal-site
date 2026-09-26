// The "bar" dither engine: a WebGL fragment shader that turns any picture
// (image, video or a canvas we draw ourselves) into a grid of vertical bars,
// one per cell, whose width follows the cell's brightness. This is a port of
// the reference site's createCanvasInstance, with three additions the page
// needs: canvas sources (our generated mountains, trees, blossoms), a crop
// rectangle and a horizontal mirror on the sample coordinate, and colours
// read from the site's own CSS variables.
//
// Plain TS, no React, no three.js. Everything is deterministic: the engine
// never picks random numbers.

export type Rgb = [number, number, number]; // 0..1 each
export type Percent = string | number; // "40%" of the box, "45vw" of the width, or px

export type BarLayerConfig = {
  x: Percent;
  y: Percent;
  width: Percent;
  height: Percent;
  blackPoint?: number; // 0..255, default 0
  whitePoint?: number; // 0..255, default 255 (whitePoint < blackPoint inverts)
  threshold?: number; // 0..255, default 255 (cells brighter than this paint bg)
  gamma?: number; // default 1
  xSquares?: number; // default 100
  ySquares?: number; // default 100
  minSquareWidth?: Percent; // of one cell width, default "-2%"
  maxSquareWidth?: Percent; // default "102%"
  bgOpacity?: number; // default 1
  fillOpacity?: number; // default 1
  crop?: [number, number, number, number]; // u0 v0 u1 v1 of the source (0,0 = top-left), default [0,0,1,1]
  mirrorX?: boolean; // sample the source flipped left-right
};

export type CanvasSource = {
  canvas: HTMLCanvasElement;
  // Return false to say "I did not redraw this frame" and the engine skips
  // the texture upload. Returning nothing counts as a redraw.
  update?: (timeSec: number, dtSec: number) => void | boolean;
  ready?: Promise<void>;
  dispose?: () => void;
  animated: boolean;
};

export type BarLayer =
  | { type: "image"; src: string; config: BarLayerConfig }
  | {
      type: "video";
      sources: { src: string; type?: string }[];
      loop?: boolean;
      config: BarLayerConfig;
    }
  | { type: "canvas"; source: CanvasSource; config: BarLayerConfig };

export type BarCanvasOptions = {
  fps?: number; // default 60
  colors?: () => { bg: Rgb; fill: Rgb }; // default: readThemeColors(canvas)
  defaults?: Partial<BarLayerConfig>;
  visibleRootMargin?: string; // IntersectionObserver rootMargin, default "20% 0px 20% 0px"
  // Which GPU to ask for, default "low-power": these are small dither passes
  // and "high-performance" pins a laptop to its discrete card for the visit.
  powerPreference?: "default" | "low-power" | "high-performance";
};

export type BarCanvas = {
  loaded: Promise<void>;
  destroy: () => void;
  // redraw() re-uploads the still canvas sources first, which is what the
  // wordmark needs after its font lands. A caller that only changed a config
  // (a GSAP tween on a still scene) passes { reupload: false } and skips it.
  redraw: (options?: { reupload?: boolean }) => void;
  setColors: (bg: Rgb, fill: Rgb) => void;
  setPaused: (paused: boolean) => void;
};

// The reference caps the backing store at 1.5x so a 4k display does not pay
// for pixels the bars never show.
const MAX_DPR = 1.5;
// A cell is dropped when any texel within this radius of its sample point is
// black or transparent. This is what keeps the bars off the black sky around
// every source and gives the silhouettes their clean edge.
const NEIGHBOUR_RADIUS = 2;

const FALLBACK_BG = "#e8b7d3";
const FALLBACK_FILL = "#180a14";

const DEFAULT_CONFIG: Required<
  Omit<BarLayerConfig, "crop" | "mirrorX">
> & { crop: [number, number, number, number]; mirrorX: boolean } = {
  x: 0,
  y: 0,
  width: "100%",
  height: "100%",
  blackPoint: 0,
  whitePoint: 255,
  threshold: 255,
  gamma: 1,
  xSquares: 100,
  ySquares: 100,
  minSquareWidth: "-2%",
  maxSquareWidth: "102%",
  bgOpacity: 1,
  fillOpacity: 1,
  crop: [0, 0, 1, 1],
  mirrorX: false,
};

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Unrolled neighbour test, generated the same way the reference does it.
function neighbourDiscardGlsl(radius: number): string {
  let out = "";
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      if (ox === 0 && oy === 0) continue;
      out += `
  neighbor = texture2D(u_texture, uv + vec2(${ox.toFixed(1)}, ${oy.toFixed(1)}) * texelSize);
  if (neighbor.a < 0.01 || (neighbor.r < 0.01 && neighbor.g < 0.01 && neighbor.b < 0.01)) discard;`;
    }
  }
  return out;
}

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_texSize;
uniform vec2 u_gridSize;
uniform float u_minWidth;
uniform float u_maxWidth;
uniform float u_threshold;
uniform float u_gamma;
uniform float u_blackPoint;
uniform float u_whitePoint;
uniform vec3 u_bgColor;
uniform vec3 u_fillColor;
uniform float u_bgOpacity;
uniform float u_fillOpacity;
uniform vec4 u_bounds;
uniform vec4 u_crop;
uniform float u_mirror;
varying vec2 v_texCoord;

void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 b0 = u_bounds.xy;
  vec2 b1 = u_bounds.zw;

  if (p.x < b0.x || p.x > b1.x || p.y < b0.y || p.y > b1.y) discard;

  // Which cell of the grid this pixel is in, and the cell's centre (0..1 in the box).
  vec2 lc = (p - b0) / (b1 - b0);
  vec2 cs = 1.0 / u_gridSize;
  vec2 ci = floor(lc / cs);
  vec2 cc = (ci + 0.5) * cs;

  // Map the cell centre into the crop window, mirrored if asked. The texture is
  // uploaded flipped (UNPACK_FLIP_Y), so t = 0 is the bottom of the picture and
  // the crop's v (top-down in the picture) turns into 1 - v here.
  float sx = u_mirror > 0.5 ? 1.0 - cc.x : cc.x;
  vec2 uv = vec2(
    u_crop.x + sx * (u_crop.z - u_crop.x),
    (1.0 - u_crop.w) + cc.y * (u_crop.w - u_crop.y)
  );

  vec4 tc = texture2D(u_texture, uv);
  if (tc.a < 0.01 || (tc.r < 0.01 && tc.g < 0.01 && tc.b < 0.01)) discard;

  vec2 texelSize = 1.0 / u_texSize;
  vec4 neighbor;
  ${neighbourDiscardGlsl(NEIGHBOUR_RADIUS)}

  vec3 rgb = tc.rgb;
  if (u_gamma != 1.0) rgb = pow(rgb, vec3(u_gamma));

  float range = u_whitePoint - u_blackPoint;
  if (range != 0.0) {
    rgb = clamp((rgb * 255.0 - u_blackPoint) / range, 0.0, 1.0);
  }

  float br = dot(rgb, vec3(0.333)) * tc.a;
  if (br > u_threshold / 255.0) {
    gl_FragColor = vec4(u_bgColor, u_bgOpacity);
    return;
  }

  // Bar width in cell units: dark cells get the wide bar, bright cells the thin one.
  vec2 cl = (lc - ci * cs) / cs;
  float lw = ((1.0 - br) * (u_maxWidth - u_minWidth) + u_minWidth)
    / (b1.x - b0.x) * u_gridSize.x;

  gl_FragColor = abs(cl.x - 0.5) < lw * 0.5
    ? vec4(u_fillColor, u_fillOpacity)
    : vec4(u_bgColor, u_bgOpacity);
}
`;

export function hexToRgb(hex: string): Rgb {
  if (!hex) return [0, 0, 0];
  const t = hex.replace("#", "").trim();
  const full = t.length === 3 ? t[0] + t[0] + t[1] + t[1] + t[2] + t[2] : t;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [
    (Number.isNaN(r) ? 0 : r) / 255,
    (Number.isNaN(g) ? 0 : g) / 255,
    (Number.isNaN(b) ? 0 : b) / 255,
  ];
}

// Parses any colour getComputedStyle can hand back for a custom property:
// hex, or "rgb(r, g, b)" when the value was written that way in CSS.
function cssColorToRgb(value: string, fallback: string): Rgb {
  const v = value.trim();
  if (!v) return hexToRgb(fallback);
  if (v.startsWith("#")) return hexToRgb(v);
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) {
    return [
      Math.min(255, parseFloat(m[1])) / 255,
      Math.min(255, parseFloat(m[2])) / 255,
      Math.min(255, parseFloat(m[3])) / 255,
    ];
  }
  return hexToRgb(fallback);
}

export function readThemeColors(el: Element): { bg: Rgb; fill: Rgb } {
  if (typeof getComputedStyle !== "function") {
    return { bg: hexToRgb(FALLBACK_BG), fill: hexToRgb(FALLBACK_FILL) };
  }
  const cs = getComputedStyle(el);
  return {
    bg: cssColorToRgb(cs.getPropertyValue("--v-base-0"), FALLBACK_BG),
    fill: cssColorToRgb(cs.getPropertyValue("--v-base-1000"), FALLBACK_FILL),
  };
}

type LayerState = {
  type: "image" | "video" | "canvas";
  config: BarLayerConfig;
  tex: WebGLTexture;
  width: number;
  height: number;
  // image only: kept so a restored context can upload it again without a refetch
  image?: HTMLImageElement;
  // video only
  video?: HTMLVideoElement;
  videoReady?: boolean;
  lastVideoTime?: number;
  // canvas only
  source?: CanvasSource;
  shared?: CanvasTexture;
};

// One GL texture per source canvas. Two layers can show the same canvas (the
// tree and its mirror), and they must not cost two textures or two uploads.
type CanvasTexture = {
  tex: WebGLTexture;
  uploadedW: number;
  uploadedH: number;
  uploadedAt: number; // stamp of the last upload
  dirtyAt: number; // stamp of the last tick whose update() redrew the canvas
};

type Internals = {
  layers: LayerState[];
  size: () => { width: number; height: number; cssWidth: number };
};

// Lets describeBarCanvas peek at an engine without widening the public type.
const internals = new WeakMap<BarCanvas, Internals>();

// Slots of the per-draw uniform cache. Every uniform is re-sent only when its
// value differs from the previous layer's, the way the reference does it.
const enum U {
  TexW,
  TexH,
  GridX,
  GridY,
  MinW,
  MaxW,
  Thr,
  Gamma,
  BP,
  WP,
  BgOp,
  FillOp,
  B0x,
  B0y,
  B1x,
  B1y,
  Crop0,
  Crop1,
  Crop2,
  Crop3,
  Mirror,
  Count,
}

export function createBarCanvas(
  canvas: HTMLCanvasElement,
  layers: BarLayer[],
  options: BarCanvasOptions = {},
): BarCanvas | null {
  if (!canvas || typeof window === "undefined") return null;

  const frameInterval = 1000 / (options.fps || 60);
  const defaults = { ...DEFAULT_CONFIG, ...(options.defaults ?? {}) };

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: options.powerPreference ?? "low-power",
  });
  if (!gl) return null;

  // Hands the context back now instead of waiting for the GC to notice.
  // Browsers cap how many are alive at once and this page builds several.
  const releaseContext = () => {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };

  const compile = (kind: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(kind);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("barShader: shader failed", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };

  const readLocations = (p: WebGLProgram) => ({
    aPos: gl.getAttribLocation(p, "a_position"),
    aUV: gl.getAttribLocation(p, "a_texCoord"),
    uTex: gl.getUniformLocation(p, "u_texture"),
    uRes: gl.getUniformLocation(p, "u_resolution"),
    uTexSize: gl.getUniformLocation(p, "u_texSize"),
    uGrid: gl.getUniformLocation(p, "u_gridSize"),
    uMinW: gl.getUniformLocation(p, "u_minWidth"),
    uMaxW: gl.getUniformLocation(p, "u_maxWidth"),
    uThr: gl.getUniformLocation(p, "u_threshold"),
    uGam: gl.getUniformLocation(p, "u_gamma"),
    uBP: gl.getUniformLocation(p, "u_blackPoint"),
    uWP: gl.getUniformLocation(p, "u_whitePoint"),
    uBg: gl.getUniformLocation(p, "u_bgColor"),
    uFill: gl.getUniformLocation(p, "u_fillColor"),
    uBgOpacity: gl.getUniformLocation(p, "u_bgOpacity"),
    uFillOpacity: gl.getUniformLocation(p, "u_fillOpacity"),
    uBounds: gl.getUniformLocation(p, "u_bounds"),
    uCrop: gl.getUniformLocation(p, "u_crop"),
    uMirror: gl.getUniformLocation(p, "u_mirror"),
  });
  type Locs = ReturnType<typeof readLocations>;

  const makeBuffer = (data: Float32Array): WebGLBuffer | null => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  };

  const cache = new Float32Array(U.Count);
  cache.fill(NaN);

  let rafId: number | null = null;
  let lastDrawAt = 0;
  let visible = false;
  let paused = false;
  let destroyed = false;
  let contextLost = false;
  // True when something in the picture can change on its own (a video, or a
  // canvas source that animates). All-still engines draw once instead of
  // holding a rAF loop open for a picture that cannot change.
  let live = false;
  let states: LayerState[] = [];
  let pixelW = 0;
  let pixelH = 0;
  let cssWidth = canvas.offsetWidth;
  // Animation clock for canvas sources. It only advances while we draw, so a
  // scene that was off screen resumes where it stopped instead of jumping.
  let clockSec = 0;
  let lastTickAt: number | null = null;

  let vs: WebGLShader | null = null;
  let fs: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  let positionBuf: WebGLBuffer | null = null;
  let texCoordBuf: WebGLBuffer | null = null;
  let loc: Locs | null = null;
  // Counts how many times the context has come back. A layer that finished
  // loading against an older one is holding a dead texture.
  let glGen = 0;
  // Colours are read once, at creation, from the canvas's own themed ancestor
  // (the reference reads the document root once). setColors changes them, and
  // a rebuild sends whatever they are by then.
  let colors = (options.colors ?? (() => readThemeColors(canvas)))();

  // Compiles the program, makes the buffers and sends the state that never
  // changes per layer. Runs at creation and again when the context comes back.
  const buildPipeline = (): boolean => {
    vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("barShader: link failed", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return false;
    }
    program = prog;
    gl.useProgram(prog);
    const l = readLocations(prog);
    loc = l;

    positionBuf = makeBuffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    texCoordBuf = makeBuffer(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]));
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuf);
    gl.enableVertexAttribArray(l.aPos);
    gl.vertexAttribPointer(l.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuf);
    gl.enableVertexAttribArray(l.aUV);
    gl.vertexAttribPointer(l.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(l.uTex, 0);
    gl.uniform3fv(l.uBg, colors.bg);
    gl.uniform3fv(l.uFill, colors.fill);
    if (pixelW > 0 && pixelH > 0) {
      gl.viewport(0, 0, pixelW, pixelH);
      gl.uniform2f(l.uRes, pixelW, pixelH);
    }
    // A fresh program remembers nothing, so every uniform must go again.
    cache.fill(NaN);
    return true;
  };

  if (!buildPipeline()) {
    releaseContext();
    return null;
  }

  const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

  // "40%" of a reference length, "45vw" of the canvas's CSS width (in device
  // pixels, like the reference — its scene canvases are full-bleed so this is
  // the viewport width), or a plain px number.
  const toPx = (v: Percent, ref: number): number => {
    if (typeof v !== "string") return v;
    if (v.endsWith("%")) return (parseFloat(v) / 100) * ref;
    if (v.endsWith("vw")) return (parseFloat(v) / 100) * cssWidth * dpr();
    return parseFloat(v);
  };

  const applySize = (w: number, h: number) => {
    if (canvas.width === w && canvas.height === h && pixelW === w && pixelH === h) return false;
    canvas.width = w;
    canvas.height = h;
    pixelW = w;
    pixelH = h;
    gl.viewport(0, 0, w, h);
    if (loc) gl.uniform2f(loc.uRes, w, h);
    cache.fill(NaN);
    return true;
  };

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry || destroyed) return;
    const s = dpr();
    cssWidth = entry.contentRect.width;
    const changed = applySize(
      Math.round(entry.contentRect.width * s),
      Math.round(entry.contentRect.height * s),
    );
    if (changed && visible) draw();
  });
  resizeObserver.observe(canvas);
  applySize(Math.round(canvas.offsetWidth * dpr()), Math.round(canvas.offsetHeight * dpr()));

  const setVideosPlaying = (play: boolean) => {
    for (const st of states) {
      if (st.type !== "video" || !st.video) continue;
      if (play) {
        if (st.video.paused) st.video.play().catch(() => {});
      } else if (!st.video.paused) {
        st.video.pause();
      }
    }
  };

  const running = () => visible && !paused && !destroyed && !contextLost;

  const stopLoop = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    lastTickAt = null;
  };

  const tick = (now: number) => {
    if (!running()) {
      rafId = null;
      return;
    }
    if (now - lastDrawAt >= frameInterval - 1) {
      // The 1 ms slack keeps a 60 fps cap from dropping every other frame when
      // rAF timestamps land a hair under 16.67 ms apart.
      lastDrawAt = now;
      advanceSources(now);
      draw();
    }
    rafId = requestAnimationFrame(tick);
  };

  // For a live engine this is the rAF loop. For one whose layers are all
  // still pictures there is nothing to loop over, so it draws the one frame.
  const startDrawing = () => {
    stopLoop();
    if (!running()) return;
    if (!live) {
      draw();
      return;
    }
    lastDrawAt = 0;
    rafId = requestAnimationFrame(tick);
  };

  const intersection = new IntersectionObserver(
    (entries) => {
      const was = visible;
      visible = entries[0]?.isIntersecting ?? false;
      if (was === visible) return;
      if (paused) return;
      setVideosPlaying(visible);
      if (visible) startDrawing();
      else stopLoop();
    },
    { threshold: 0.01, rootMargin: options.visibleRootMargin ?? "20% 0px 20% 0px" },
  );
  intersection.observe(canvas);

  // Every texture this engine made. Two layers can share one, so destroy
  // deletes from this set rather than once per layer.
  const textures = new Set<WebGLTexture>();
  const canvasTextures = new Map<HTMLCanvasElement, CanvasTexture>();
  // Bumped once per tick (and per redraw). A canvas uploads once per stamp.
  let uploadStamp = 0;

  const makeTexture = (): WebGLTexture | null => {
    const tex = gl.createTexture();
    if (!tex) return null;
    textures.add(tex);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  };

  const dropTexture = (tex: WebGLTexture) => {
    if (!textures.delete(tex)) return;
    gl.deleteTexture(tex);
  };

  const canvasTextureFor = (c: HTMLCanvasElement): CanvasTexture | null => {
    const found = canvasTextures.get(c);
    if (found) return found;
    const tex = makeTexture();
    if (!tex) return null;
    const entry: CanvasTexture = {
      tex,
      uploadedW: -1,
      uploadedH: -1,
      uploadedAt: -1,
      dirtyAt: -1,
    };
    canvasTextures.set(c, entry);
    return entry;
  };

  // A source is disposed once, whichever path gets there first: destroy, a
  // layer that finished loading after destroy, or the load-time teardown.
  const disposedSources = new Set<CanvasSource>();
  const disposeSource = (src: CanvasSource | undefined) => {
    if (!src || disposedSources.has(src)) return;
    disposedSources.add(src);
    src.dispose?.();
  };
  const disposeAllSources = () => {
    // `layers` covers the ones that never finished loading; `states` the rest.
    for (const l of layers) if (l.type === "canvas") disposeSource(l.source);
    for (const st of states) disposeSource(st.source);
  };

  const releaseVideo = (st: LayerState) => {
    const v = st.video;
    if (!v) return;
    v.pause();
    v.removeAttribute("src");
    v.innerHTML = "";
    v.load();
  };

  const loadImage = (layer: Extract<BarLayer, { type: "image" }>) =>
    new Promise<LayerState | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      let retried = false;
      img.onload = () => {
        const tex = makeTexture();
        if (!tex) return resolve(null);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        resolve({
          type: "image",
          tex,
          image: img,
          config: layer.config,
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = () => {
        // Same-origin images sometimes refuse the CORS attribute; try once without it.
        if (!retried) {
          retried = true;
          img.crossOrigin = null;
          img.src = layer.src;
          return;
        }
        resolve(null);
      };
      img.src = layer.src;
    });

  const loadVideo = (layer: Extract<BarLayer, { type: "video" }>) =>
    new Promise<LayerState | null>((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.autoplay = false;
      video.loop = layer.loop !== false;
      video.playsInline = true;
      video.preload = "auto";
      for (const attr of ["muted", "playsinline", "webkit-playsinline"]) video.setAttribute(attr, "");
      for (const s of layer.sources) {
        if (!s?.src) continue;
        const el = document.createElement("source");
        el.src = s.src;
        if (s.type) el.type = s.type;
        video.appendChild(el);
      }
      const tex = makeTexture();
      if (!tex) return resolve(null);
      const st: LayerState = {
        type: "video",
        tex,
        config: layer.config,
        video,
        videoReady: false,
        lastVideoTime: -1,
        width: 1920,
        height: 1080,
      };
      let settled = false;
      const onReady = () => {
        if (settled || video.readyState < video.HAVE_CURRENT_DATA) return;
        settled = true;
        st.videoReady = true;
        st.width = video.videoWidth || 1920;
        st.height = video.videoHeight || 1080;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        if (visible && !paused) video.play().catch(() => {});
        resolve(st);
      };
      const giveUp = () => {
        if (settled) return;
        settled = true;
        resolve(st);
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("error", giveUp);
      video.load();
      // A stalled video must not hold the preloader forever.
      setTimeout(giveUp, 5000);
    });

  const uploadCanvas = (st: LayerState, stamp: number) => {
    const src = st.source;
    const shared = st.shared;
    if (!src || !shared) return;
    const c = src.canvas;
    if (c.width === 0 || c.height === 0) return;
    st.width = c.width;
    st.height = c.height;
    // The other layer on this canvas already sent these pixels.
    if (shared.uploadedAt === stamp) return;
    shared.uploadedAt = stamp;
    gl.bindTexture(gl.TEXTURE_2D, shared.tex);
    try {
      if (shared.uploadedW === c.width && shared.uploadedH === c.height) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, c);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        shared.uploadedW = c.width;
        shared.uploadedH = c.height;
      }
    } catch {
      // A WebGL canvas from another context can throw while it is mid-render;
      // the previous upload stays on screen until the next frame.
    }
  };

  const loadCanvasSource = async (layer: Extract<BarLayer, { type: "canvas" }>) => {
    const shared = canvasTextureFor(layer.source.canvas);
    if (!shared) return null;
    const st: LayerState = {
      type: "canvas",
      tex: shared.tex,
      shared,
      config: layer.config,
      source: layer.source,
      width: layer.source.canvas.width || 1,
      height: layer.source.canvas.height || 1,
    };
    if (layer.source.ready) {
      try {
        await layer.source.ready;
      } catch {
        // A source that failed to build still gets its (blank) canvas uploaded,
        // which the shader simply discards.
      }
    }
    if (destroyed) {
      // destroy() ran while this source was still building, so it never saw
      // the texture or the source. Free both here.
      dropTexture(shared.tex);
      canvasTextures.delete(layer.source.canvas);
      disposeSource(layer.source);
      return null;
    }
    // Static sources get their one upload here; animated ones re-upload as
    // they redraw. Both layers of a shared canvas upload under one stamp, so
    // the pixels go up once.
    uploadCanvas(st, uploadStamp);
    return st;
  };

  const loadAll = () =>
    Promise.all(
      layers.map((layer) => {
        if (layer.type === "image") return loadImage(layer);
        if (layer.type === "video") return loadVideo(layer);
        return loadCanvasSource(layer);
      }),
    ).then((list) => list.filter((s): s is LayerState => s !== null));

  const advanceSources = (now: number) => {
    // dt is clamped so a long pause (tab hidden, scrolled away) does not make
    // the blossoms leap when the scene comes back.
    const dt = lastTickAt === null ? 0 : Math.min(0.1, (now - lastTickAt) / 1000);
    lastTickAt = now;
    clockSec += dt;
    const stamp = ++uploadStamp;
    // Two passes. First every source redraws its own canvas; a source with no
    // update() is a second view of another layer's canvas (the mirrored tree),
    // and one that returns false says it skipped this frame.
    for (const st of states) {
      if (st.type !== "canvas" || !st.source?.animated || !st.source.update) continue;
      const redrew = st.source.update(clockSec, dt);
      if (redrew !== false && st.shared) st.shared.dirtyAt = stamp;
    }
    // Then one upload per canvas that actually changed.
    for (const st of states) {
      if (st.type !== "canvas" || !st.source?.animated) continue;
      if (st.shared?.dirtyAt === stamp) uploadCanvas(st, stamp);
    }
  };

  const updateVideoTexture = (st: LayerState) => {
    const v = st.video;
    if (!v || !st.videoReady || v.readyState < v.HAVE_CURRENT_DATA) return;
    const t = v.currentTime;
    if (t === st.lastVideoTime) return;
    st.lastVideoTime = t;
    try {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      } catch {
        // Frame not decodable yet; keep the previous one.
      }
    }
  };

  const setCached = (slot: U, value: number, send: () => void) => {
    if (cache[slot] === value) return;
    cache[slot] = value;
    send();
  };

  const pick = <K extends keyof BarLayerConfig>(
    cfg: BarLayerConfig,
    key: K,
  ): NonNullable<BarLayerConfig[K]> => {
    const v = cfg[key];
    return (v !== undefined ? v : defaults[key]) as NonNullable<BarLayerConfig[K]>;
  };

  const drawLayer = (st: LayerState, l: Locs) => {
    const cfg = st.config;
    gl.bindTexture(gl.TEXTURE_2D, st.tex);
    if (st.type === "video") updateVideoTexture(st);

    const texW = st.type === "video" ? st.video?.videoWidth || 1920 : st.width;
    const texH = st.type === "video" ? st.video?.videoHeight || 1080 : st.height;
    if (cache[U.TexW] !== texW || cache[U.TexH] !== texH) {
      cache[U.TexW] = texW;
      cache[U.TexH] = texH;
      gl.uniform2f(l.uTexSize, texW, texH);
    }

    const gx = pick(cfg, "xSquares");
    const gy = pick(cfg, "ySquares");
    if (cache[U.GridX] !== gx || cache[U.GridY] !== gy) {
      cache[U.GridX] = gx;
      cache[U.GridY] = gy;
      gl.uniform2f(l.uGrid, gx, gy);
    }

    const x = toPx(pick(cfg, "x"), pixelW);
    const y = toPx(pick(cfg, "y"), pixelH);
    const w = toPx(pick(cfg, "width"), pixelW);
    const h = toPx(pick(cfg, "height"), pixelH);
    const cellW = w / gx;
    const minW = toPx(pick(cfg, "minSquareWidth"), cellW);
    const maxW = toPx(pick(cfg, "maxSquareWidth"), cellW);
    if (cache[U.MinW] !== minW || cache[U.MaxW] !== maxW) {
      cache[U.MinW] = minW;
      cache[U.MaxW] = maxW;
      gl.uniform1f(l.uMinW, minW);
      gl.uniform1f(l.uMaxW, maxW);
    }

    setCached(U.Thr, pick(cfg, "threshold"), () => gl.uniform1f(l.uThr, cache[U.Thr]));
    setCached(U.Gamma, pick(cfg, "gamma"), () => gl.uniform1f(l.uGam, cache[U.Gamma]));
    setCached(U.BP, pick(cfg, "blackPoint"), () => gl.uniform1f(l.uBP, cache[U.BP]));
    setCached(U.WP, pick(cfg, "whitePoint"), () => gl.uniform1f(l.uWP, cache[U.WP]));
    setCached(U.BgOp, pick(cfg, "bgOpacity"), () => gl.uniform1f(l.uBgOpacity, cache[U.BgOp]));
    setCached(U.FillOp, pick(cfg, "fillOpacity"), () =>
      gl.uniform1f(l.uFillOpacity, cache[U.FillOp]),
    );

    // gl_FragCoord counts from the bottom, CSS-style y counts from the top.
    const b0y = pixelH - y - h;
    const b1x = x + w;
    const b1y = b0y + h;
    if (
      cache[U.B0x] !== x ||
      cache[U.B0y] !== b0y ||
      cache[U.B1x] !== b1x ||
      cache[U.B1y] !== b1y
    ) {
      cache[U.B0x] = x;
      cache[U.B0y] = b0y;
      cache[U.B1x] = b1x;
      cache[U.B1y] = b1y;
      gl.uniform4f(l.uBounds, x, b0y, b1x, b1y);
    }

    const crop = cfg.crop ?? defaults.crop;
    if (
      cache[U.Crop0] !== crop[0] ||
      cache[U.Crop1] !== crop[1] ||
      cache[U.Crop2] !== crop[2] ||
      cache[U.Crop3] !== crop[3]
    ) {
      cache[U.Crop0] = crop[0];
      cache[U.Crop1] = crop[1];
      cache[U.Crop2] = crop[2];
      cache[U.Crop3] = crop[3];
      gl.uniform4f(l.uCrop, crop[0], crop[1], crop[2], crop[3]);
    }
    const mirror = (cfg.mirrorX ?? defaults.mirrorX) ? 1 : 0;
    setCached(U.Mirror, mirror, () => gl.uniform1f(l.uMirror, mirror));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const draw = () => {
    if (destroyed || contextLost || !states.length || pixelW === 0 || pixelH === 0) return;
    const l = loc;
    if (!l) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    cache.fill(NaN);
    for (const st of states) {
      if (st.type === "video" && !st.videoReady) continue;
      drawLayer(st, l);
    }
  };

  // Makes one layer's texture again after the context came back. Nothing is
  // fetched twice: an image still holds its decoded element, a canvas source
  // still holds its pixels, and a video re-binds the frame it is showing.
  const rebuildTexture = (st: LayerState, stamp: number): boolean => {
    if (st.type === "canvas") {
      const shared = st.source ? canvasTextureFor(st.source.canvas) : null;
      if (!shared) return false;
      st.shared = shared;
      st.tex = shared.tex;
      uploadCanvas(st, stamp);
      return true;
    }
    if (st.type === "image" && !st.image) return false;
    const tex = makeTexture();
    if (!tex) return false;
    st.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (st.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, st.image);
      return true;
    }
    const v = st.video;
    st.lastVideoTime = -1;
    if (v && st.videoReady && v.readyState >= v.HAVE_CURRENT_DATA) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      } catch {
        // Not decodable this instant; the next tick uploads a frame.
      }
    }
    return true;
  };

  const rebuildTextures = () => {
    const stamp = ++uploadStamp;
    // A layer whose picture cannot be made again (an image that never loaded)
    // is dropped rather than drawn from an empty texture.
    states = states.filter((st) => rebuildTexture(st, stamp));
  };

  // Without this a lost context (GPU reset, too many contexts) would keep the
  // rAF loop spinning on a dead canvas. preventDefault asks for a restore.
  const onContextLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    stopLoop();
  };
  const onContextRestored = () => {
    if (destroyed) return;
    // Every object the old context held is gone and none of them can be
    // deleted, so forget them and build the lot again.
    textures.clear();
    canvasTextures.clear();
    vs = null;
    fs = null;
    program = null;
    positionBuf = null;
    texCoordBuf = null;
    loc = null;
    glGen++;
    if (!buildPipeline()) {
      // contextLost stays true: the canvas stays empty instead of crashing.
      console.error("barShader: could not rebuild after the context came back");
      return;
    }
    rebuildTextures();
    contextLost = false;
    startDrawing();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  const bc: BarCanvas = {
    loaded: loadAll().then((list) => {
      if (destroyed) {
        // destroy() ran while these were loading, so it only saw an empty
        // `states`: the textures, videos and sources are ours to free.
        for (const st of list) {
          dropTexture(st.tex);
          releaseVideo(st);
        }
        canvasTextures.clear();
        disposeAllSources();
        return;
      }
      states = list;
      live = list.some((st) => st.type === "video" || Boolean(st.source?.animated));
      // Layers that finished against a context that has since been replaced
      // are holding dead textures.
      if (glGen > 0 && !contextLost) rebuildTextures();
      if (visible && !paused) {
        setVideosPlaying(true);
        startDrawing();
      }
    }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      resizeObserver.disconnect();
      intersection.disconnect();
      // Off before the context goes, or the restore handler would rebuild a
      // dead engine.
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      for (const st of states) releaseVideo(st);
      // Includes the sources whose layers are still loading and so never
      // reached `states`.
      disposeAllSources();
      for (const tex of textures) gl.deleteTexture(tex);
      textures.clear();
      canvasTextures.clear();
      states = [];
      if (positionBuf) gl.deleteBuffer(positionBuf);
      if (texCoordBuf) gl.deleteBuffer(texCoordBuf);
      if (program) gl.deleteProgram(program);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      internals.delete(bc);
      releaseContext();
    },
    redraw: (opts) => {
      if (destroyed || contextLost) return;
      // Static canvas sources are re-uploaded here so a caller who repainted
      // one (the wordmark after its font arrived) can show the new pixels.
      // This is also how a still engine repaints after its config is tweened,
      // since it holds no loop of its own.
      if (opts?.reupload !== false) {
        const stamp = ++uploadStamp;
        for (const st of states) {
          if (st.type === "canvas" && st.source && !st.source.animated) uploadCanvas(st, stamp);
        }
      }
      draw();
    },
    setColors: (bg, fill) => {
      if (destroyed) return;
      // Kept even while the context is down, so the rebuild sends these.
      colors = { bg, fill };
      if (contextLost || !loc) return;
      gl.uniform3fv(loc.uBg, bg);
      gl.uniform3fv(loc.uFill, fill);
      if (visible) draw();
    },
    setPaused: (p) => {
      if (paused === p) return;
      paused = p;
      if (p) {
        stopLoop();
        setVideosPlaying(false);
      } else if (visible) {
        setVideosPlaying(true);
        startDrawing();
      }
    },
  };

  internals.set(bc, {
    layers: states,
    size: () => ({ width: pixelW, height: pixelH, cssWidth }),
  });
  // `states` is reassigned once loading finishes; keep the peek hole current.
  bc.loaded.then(() => {
    const i = internals.get(bc);
    if (i) i.layers = states;
  });

  return bc;
}

// Debug helper: what an engine is drawing and at what size.
export function describeBarCanvas(bc: BarCanvas | null): {
  layers: { type: string; width: number; height: number; animated: boolean; config: BarLayerConfig }[];
  size: { width: number; height: number; cssWidth: number };
} {
  const i = bc ? internals.get(bc) : undefined;
  if (!i) return { layers: [], size: { width: 0, height: 0, cssWidth: 0 } };
  return {
    layers: i.layers.map((st) => ({
      type: st.type,
      width: st.width,
      height: st.height,
      animated: st.type === "video" || Boolean(st.source?.animated),
      config: st.config,
    })),
    size: i.size(),
  };
}

// Rasterises text white on black for the bar shader (the wordmark). The font
// size is solved so the text's measured width fits inside the padding and its
// cap height fills about 80% of the canvas height, whichever is tighter.
export function renderTextSource(
  text: string,
  options: {
    fontFamily: string;
    width: number;
    height: number;
    letterSpacingEm?: number;
    weight?: number | string;
    italic?: boolean;
    padding?: number;
  },
): HTMLCanvasElement {
  const { fontFamily, width, height } = options;
  const letterSpacingEm = options.letterSpacingEm ?? -0.04;
  const weight = options.weight ?? 400;
  const style = options.italic ? "italic" : "normal";
  const padding = options.padding ?? 0;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const fontFor = (px: number) => `${style} ${weight} ${px}px ${fontFamily}`;

  // Kick off the font load so a later re-render gets the real face; this pass
  // draws with whatever the browser resolves now (the fallback if not loaded).
  try {
    document.fonts?.load(fontFor(100)).catch(() => {});
  } catch {
    // Some environments have no FontFaceSet; the fallback font is fine.
  }

  // A plain boolean (not an `in` narrowing) because the DOM lib types declare
  // letterSpacing even though older Safari/Firefox do not implement it.
  const supportsLetterSpacing: boolean =
    typeof (ctx as { letterSpacing?: unknown }).letterSpacing === "string";
  const probePx = 100;

  // Measures the string at one size: full width (with spacing) and cap height.
  const measure = (px: number) => {
    ctx.font = fontFor(px);
    if (supportsLetterSpacing) {
      ctx.letterSpacing = `${letterSpacingEm * px}px`;
    }
    const m = ctx.measureText(text);
    const cap = ctx.measureText("H");
    let w = m.width;
    if (!supportsLetterSpacing) {
      // Manual spacing: sum the glyph advances and add the gap between them.
      w = 0;
      for (const ch of text) w += ctx.measureText(ch).width;
      w += letterSpacingEm * px * Math.max(0, [...text].length - 1);
    } else {
      // Chrome adds the spacing after the last glyph too; strip it so the
      // text sits centred rather than nudged left.
      w -= letterSpacingEm * px;
    }
    const capH = cap.actualBoundingBoxAscent || px * 0.7;
    return { w, capH, ascent: m.actualBoundingBoxAscent || capH, descent: m.actualBoundingBoxDescent || 0 };
  };

  const probe = measure(probePx);
  const availW = Math.max(1, canvas.width - 2 * padding);
  const targetCap = canvas.height * 0.8;
  const byWidth = probe.w > 0 ? (probePx * availW) / probe.w : probePx;
  const byHeight = probe.capH > 0 ? (probePx * targetCap) / probe.capH : probePx;
  const px = Math.max(1, Math.floor(Math.min(byWidth, byHeight)));

  const final = measure(px);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const x0 = (canvas.width - final.w) / 2;
  // Centre the ink box, not the em box, so caps sit in the middle of the strip.
  const baseline = canvas.height / 2 + (final.ascent - final.descent) / 2;

  if (supportsLetterSpacing) {
    ctx.fillText(text, x0, baseline);
  } else {
    let x = x0;
    const gap = letterSpacingEm * px;
    for (const ch of text) {
      ctx.fillText(ch, x, baseline);
      x += ctx.measureText(ch).width + gap;
    }
  }
  return canvas;
}
