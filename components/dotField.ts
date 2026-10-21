/**
 * A picture redrawn as a grid of small diamonds, after the last page of
 * lanceyan.com (its mountain timelapse). Each frame the source is painted
 * at one pixel per cell; every cell brighter than the threshold gets one
 * diamond of the same fixed size, as strong (alpha, in 16 steps) as the
 * cell is bright, in the cell's colour. Diamonds reach 0.85 of a cell from
 * their centre, so neighbours overlap and blend, later cells (right, then
 * down) over earlier ones, as lanceyan draws them. Dark cells draw nothing
 * and the ground shows between them.
 *
 * lanceyan colours each diamond with the video's own colour. Here the
 * brightness is read through the site's palette instead (plum, rose,
 * blossom, white), with a little of the source's own hue kept.
 *
 * The source is painted on a small 2D canvas (cols x rows); the diamonds
 * are drawn on the GPU, one fragment shader over the whole canvas that
 * looks at the 3x3 cells round each pixel. Drawn in JavaScript instead,
 * the ~40k diamonds cost 45 ms a frame at 1x and 130 ms at 2x.
 */

export type DotFieldOpts = {
  /** Cells across the canvas. lanceyan uses 280, and 180 on a phone. */
  cols: number;
  /** Brightness (0..1) under which a cell draws nothing. */
  threshold: number;
  /** Multiplies the colour before it is used. */
  brightness: number;
  /** How far a diamond reaches from its centre, in cells. */
  size: number;
  /** Palette stops by brightness, [brightness, "#rrggbb"], ascending. */
  ramp: [number, string][];
  /** How much of the source's own colour is kept, 0..1. */
  hue: number;
  /** The ground the diamonds sit on. */
  ground: string;
  /** Draw only the diamonds, with real alpha, so whatever is behind the
   *  canvas shows between them (the ground is then not drawn). Works under
   *  any stacking context, where a screen blend would not. */
  transparent?: boolean;
};

export type DotField = {
  /** Draws one frame. `paint` draws the source into a canvas of cols x rows. */
  render(paint: (ctx: CanvasRenderingContext2D, cols: number, rows: number) => void): void;
  resize(): void;
  dispose(): void;
};

const hex = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uLut;
uniform vec2 uGrid;
uniform vec2 uRes;
uniform float uCell;
uniform float uThr;
uniform float uBright;
uniform float uHue;
uniform float uSize;
uniform vec3 uGround;
uniform float uClear;

void main() {
  // Pixel position from the top left, in device pixels, then in cells.
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 c = px / uCell;
  vec2 ci = floor(c);
  // The diamonds laid one over another (premultiplied), later cells over
  // earlier, then over the ground unless the canvas is see-through.
  vec4 acc = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cc = ci + vec2(float(i), float(j));
      if (cc.x < 0.0 || cc.y < 0.0 || cc.x >= uGrid.x || cc.y >= uGrid.y) continue;
      vec2 d = abs(c - (cc + 0.5));
      if (d.x + d.y > uSize) continue;
      vec3 s = texture2D(uSrc, (cc + 0.5) / uGrid).rgb;
      float L = dot(s, vec3(0.299, 0.587, 0.114));
      if (L < uThr) continue;
      float st = min(16.0, floor((L - uThr) * (16.0 / 0.12) + 0.5));
      if (st <= 0.0) continue;
      vec3 pal = texture2D(uLut, vec2(L, 0.5)).rgb;
      vec3 c2 = min(vec3(1.0), (pal * (1.0 - uHue) + s * uHue) * uBright);
      float a = st / 16.0;
      acc = vec4(c2 * a, a) + acc * (1.0 - a);
    }
  }
  if (uClear > 0.5) gl_FragColor = acc;
  else gl_FragColor = vec4(uGround * (1.0 - acc.a) + acc.rgb, 1.0);
}
`;

export function createDotField(canvas: HTMLCanvasElement, o: DotFieldOpts): DotField | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: Boolean(o.transparent), premultipliedAlpha: true, powerPreference: "low-power" });
  const src = document.createElement("canvas");
  const sctx = src.getContext("2d");
  if (!gl || !sctx || gl.isContextLost()) return null;

  const shader = (type: number, text: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, text);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);

  const texture = (unit: number, filter: number): WebGLTexture | null => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const srcTex = texture(0, gl.NEAREST);
  const lutTex = texture(1, gl.LINEAR);

  // The palette as a 256 x 1 texture: brightness in, colour out.
  const stops = o.ramp.map(([at, c]) => ({ at, c: hex(c) }));
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const L = i / 255;
    let k = 0;
    while (k < stops.length - 2 && L > stops[k + 1].at) k += 1;
    const a = stops[k];
    const b = stops[Math.min(stops.length - 1, k + 1)];
    const t = Math.max(0, Math.min(1, (L - a.at) / Math.max(1e-3, b.at - a.at)));
    for (let ch = 0; ch < 3; ch += 1) lut[i * 4 + ch] = a.c[ch] + (b.c[ch] - a.c[ch]) * t;
    lut[i * 4 + 3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);

  const g = hex(o.ground);
  gl.uniform1i(u("uSrc"), 0);
  gl.uniform1i(u("uLut"), 1);
  gl.uniform1f(u("uThr"), o.threshold);
  gl.uniform1f(u("uBright"), o.brightness);
  gl.uniform1f(u("uHue"), o.hue);
  gl.uniform1f(u("uSize"), o.size);
  gl.uniform3f(u("uGround"), g[0] / 255, g[1] / 255, g[2] / 255);
  gl.uniform1f(u("uClear"), o.transparent ? 1 : 0);
  // The canvas's top row lands at t = 0, which is how the shader reads it.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  let cols = o.cols;
  let rows = 1;
  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, canvas.clientWidth);
    const H = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cols = o.cols;
    const cell = W / cols;
    rows = Math.max(1, Math.ceil(H / cell));
    src.width = cols;
    src.height = rows;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u("uGrid"), cols, rows);
    gl.uniform2f(u("uRes"), canvas.width, canvas.height);
    gl.uniform1f(u("uCell"), cell * dpr);
  };
  resize();

  return {
    render: (paint) => {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = "source-over";
      sctx.globalAlpha = 1;
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, cols, rows);
      paint(sctx, cols, rows);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    resize,
    dispose: () => {
      gl.deleteTexture(srcTex);
      gl.deleteTexture(lutTex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // The context itself is NOT thrown away (no loseContext): a canvas
      // keeps the one context it was first given, so a component that is
      // mounted again on the same canvas (React does this in development)
      // would get a dead one back and draw nothing.
      src.width = 1;
      src.height = 1;
    },
  };
}
