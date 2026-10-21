import * as THREE from "three";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { DEEP, LIFT, PALE, ROSE, WHITE } from "./timeline";

/**
 * The five project cards. Each is one plane with a picture drawn in its
 * fragment shader, a different picture per project:
 *
 *   0  The Actually Company  a recorded pitch as a waveform, a playhead
 *                            crossing it, the filler words flagged
 *   1  S-KBD67               a sight with a horizon that rolls, as the
 *                            blaster's motion sensor would report it
 *   2  King of the Ring      a ring from above, two fighters, a hit
 *   3  mclib                 a field of tiles, a driven path, the cloud of
 *                            guesses round the robot
 *   4  Saturn                the planet
 *
 * The left of every card is kept quiet: the words sit there, in the DOM.
 */

/** What the DOM needs to know about each card: its ground when there is
 *  no WebGL, and the colour its words are set in. */
export const CARD_LOOK: { ground: string; ink: string; soft: string }[] = [
  { ground: LIFT, ink: WHITE, soft: BLOSSOM },
  { ground: BLOSSOM, ink: BAND, soft: "#5a2340" },
  { ground: ROSE, ink: WHITE, soft: "#ffd9ea" },
  { ground: PALE, ink: BAND, soft: "#5a2340" },
  { ground: BAND, ink: BLOSSOM, soft: "#e6a3c6" },
];

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uSize;
uniform vec3 uRipple;
varying vec2 vUv;

float ripple(vec2 uv) {
  float age = uTime - uRipple.z;
  if (age < 0.0 || age > 3.0) return 0.0;
  float d = length((uv - uRipple.xy) * vec2(uSize.x / uSize.y, 1.0));
  float front = age * 0.85;
  return sin(30.0 * (d - front)) * exp(-2.2 * age) * (1.0 - smoothstep(front - 0.1, front + 0.02, d));
}

void main() {
  vUv = uv;
  vec3 p = position;
  // The plane is 1 x 1 and scaled to size, so z is already in scene units.
  p.z += ripple(uv) * 0.2;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform int uKind;
uniform vec2 uSize;
uniform vec3 uRipple;
uniform vec2 uTilt;
uniform float uCorner;
uniform vec3 uPlum, uDeep, uBlossom, uWhite, uRose, uPale, uLift;
uniform sampler2D uPhoto;
uniform float uHasPhoto;
uniform float uPhotoAspect;
uniform float uInvert;
/** 1 on a phone: the card is split top and bottom. Set by the page, so it
 *  agrees with where the words are laid out. */
uniform float uTall;
varying vec2 vUv;

/** The words' share of the card, from the left, when it carries a picture. */
const float WORDS = 0.42;
/** The same for a tall card, from the bottom. */
const float WORDS_TALL = 0.5;

// A picture in place of the drawn art: nothing under the words, and the
// picture filling the rest of the card, cropped to cover it.
vec3 photoArt(vec2 uv, float A) {
  // A tall card (a phone) is split top and bottom instead: the picture on
  // top, the words under it, so each card reads picture-then-words.
  bool tall = uTall > 0.5;
  float cut = tall ? 1.0 - WORDS_TALL : WORDS;
  float along = tall ? uv.y : uv.x;
  if (along < (tall ? WORDS_TALL : WORDS)) return vec3(0.0);
  vec2 q = tall ? vec2(uv.x, (uv.y - WORDS_TALL) / cut) : vec2((uv.x - WORDS) / (1.0 - WORDS), uv.y);
  float regionA = tall ? A / cut : (1.0 - WORDS) * A;
  vec2 k = regionA > uPhotoAspect ? vec2(1.0, uPhotoAspect / regionA) : vec2(regionA / uPhotoAspect, 1.0);
  vec2 t = (q - 0.5) * k + 0.5;
  vec3 c = texture2D(uPhoto, t).rgb;
  // A light picture (a web page on a pale ground) is turned over, so its
  // ground is nothing and what is drawn on it is the ink. Turned over as
  // the eye sees it (in sRGB), not in linear light, where a cream ground
  // would come back as a mid grey.
  c = mix(c, pow(1.0 - pow(c, vec3(1.0 / 2.2)), vec3(2.2)), uInvert);
  // Eased in over the first few per cent, so the picture has no hard edge
  // against the words.
  return c * smoothstep(0.0, 0.04, tall ? q.y : q.x);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// 1 inside a shape whose edge is at d = 0, over one pixel w.
float ink(float d, float w) { return 1.0 - smoothstep(-w, w, d); }

float ripple(vec2 uv) {
  float age = uTime - uRipple.z;
  if (age < 0.0 || age > 3.0) return 0.0;
  float d = length((uv - uRipple.xy) * vec2(uSize.x / uSize.y, 1.0));
  float front = age * 0.85;
  return sin(30.0 * (d - front)) * exp(-2.2 * age) * (1.0 - smoothstep(front - 0.1, front + 0.02, d));
}

// 0: a pitch, recorded.
vec3 art0(vec2 p, float A, float w) {
  vec3 col = mix(uLift, uPlum, smoothstep(-0.5, 0.5, p.y) * 0.7);
  col = mix(col, uRose, 0.3 * exp(-2.6 * length((p - vec2(0.24 * A, 0.0)) * vec2(0.55, 1.0))));
  float x0 = -0.05 * A, x1 = 0.455 * A, bw = 0.027;
  float i = floor((p.x - x0) / bw);
  float cx = x0 + (i + 0.5) * bw;
  float inside = step(x0, p.x) * step(p.x, x1);
  // Speech comes in runs with gaps between them.
  float run = smoothstep(0.3, 0.45, noise1(i * 0.12 + 40.0));
  float h = 0.012 + 0.34 * run * (0.3 + 0.7 * hash11(i + 7.0)) * (0.3 + noise1(i * 0.21 + 3.0));
  float head = mix(x0, x1, fract(uTime * 0.06));
  h *= 1.0 + 0.45 * exp(-pow((cx - head) / 0.05, 2.0));
  h = min(h, 0.37);
  float fade = smoothstep(x0, x0 + 0.1 * A, p.x);
  float filler = step(0.87, hash11(i * 1.7 + 2.0)) * run;
  vec3 bar = mix(mix(uLift, uBlossom, 0.42), uBlossom, step(cx, head));
  bar = mix(bar, uWhite, filler);
  col = mix(col, bar, ink(sdBox(vec2(p.x - cx, p.y), vec2(bw * 0.3, h), bw * 0.3), w) * inside * fade);
  // A flag over each filler word.
  col = mix(col, uWhite, ink(length(p - vec2(cx, 0.425)) - 0.0085, w) * filler * inside * fade);
  col = mix(col, uWhite, ink(abs(p.x - head) - 0.0016, w) * step(abs(p.y), 0.455) * 0.9);
  col = mix(col, uWhite, ink(length(p - vec2(head, -0.455)) - 0.011, w));
  return col;
}

// 1: the sight, and the horizon the sensor reports.
vec3 art1(vec2 p, float A, float w) {
  vec3 col = uBlossom;
  vec2 q = p - vec2(0.24 * A, 0.0);
  float r = length(q);
  // Dots that thin out toward the words.
  float cell = 0.042;
  vec2 g = fract(p / cell) - 0.5;
  float size = 0.17 * smoothstep(-0.1 * A, 0.3 * A, p.x) * smoothstep(0.34, 0.6, r);
  col = mix(col, mix(uBlossom, uRose, 0.55), ink(length(g) - size, w / cell));

  float roll = 0.34 * sin(uTime * 0.6) + 0.1 * sin(uTime * 1.7);
  float pitch = 0.07 * sin(uTime * 0.9);
  vec2 h = rot(roll) * q;
  float disc = ink(r - 0.3, w);
  col = mix(col, uWhite, disc);
  col = mix(col, uRose, disc * ink(h.y - pitch, w));
  // The ladder either side of the horizon.
  for (int k = -3; k <= 3; k += 1) {
    if (k == 0) continue;
    float y = pitch + float(k) * 0.075;
    float len = mod(float(k), 2.0) == 0.0 ? 0.09 : 0.05;
    float d = sdBox(h - vec2(0.0, y), vec2(len, 0.0022), 0.0);
    col = mix(col, k > 0 ? uPlum : uWhite, ink(d, w) * disc);
  }
  col = mix(col, uPlum, ink(abs(r - 0.3) - 0.006, w));
  // Ticks round the outside, a long one every ninth.
  float ang = atan(q.y, q.x) / 6.28318;
  float t36 = abs(fract(ang * 36.0 + 0.5) - 0.5) / 36.0 * 6.28318 * r;
  float long9 = step(abs(fract(ang * 4.0 + 0.5) - 0.5), 0.02);
  float band = step(0.335, r) * step(r, 0.355 + 0.03 * long9);
  col = mix(col, uPlum, ink(t36 - 0.0022, w) * band);
  // The fixed mark in the middle: two wings and a dot.
  vec2 a = vec2(abs(q.x), q.y);
  col = mix(col, uPlum, ink(sdBox(a - vec2(0.13, 0.0), vec2(0.06, 0.005), 0.0), w));
  col = mix(col, uPlum, ink(r - 0.013, w));
  // Four lines running out from the ring.
  vec2 c4 = abs(q);
  float arm = min(sdBox(c4 - vec2(0.45, 0.0), vec2(0.045, 0.0025), 0.0), sdBox(c4 - vec2(0.0, 0.45), vec2(0.0025, 0.045), 0.0));
  col = mix(col, uPlum, ink(arm, w));
  return col;
}

// 2: the ring.
vec3 art2(vec2 p, float A, float w) {
  vec3 col = mix(uRose, mix(uRose, uPlum, 0.45), smoothstep(-0.2, 0.6, -p.y + p.x * 0.2));
  vec2 q = rot(0.785398) * (p - vec2(0.24 * A, 0.0));
  col = mix(col, mix(uRose, uWhite, 0.14), ink(sdBox(q, vec2(0.285), 0.0), w));
  // Rings spreading out from the hit, on the canvas.
  float beat = fract(uTime * 0.7);
  float wave = abs(length(q) - beat * 0.3) - 0.004;
  col = mix(col, uWhite, ink(wave, w) * (1.0 - beat) * 0.5 * ink(sdBox(q, vec2(0.285), 0.0), w));
  for (int k = 0; k < 3; k += 1) {
    float s = 0.29 + float(k) * 0.024;
    col = mix(col, uWhite, ink(abs(sdBox(q, vec2(s), 0.0)) - 0.0032, w));
  }
  vec2 c = abs(q) - vec2(0.314);
  col = mix(col, uPlum, ink(length(c) - 0.03, w));
  col = mix(col, uWhite, ink(abs(length(c) - 0.03) - 0.004, w));
  // Two fighters circling, closing as the hit lands.
  float th = uTime * 0.45;
  float gap = 0.085 + 0.035 * smoothstep(0.0, 0.6, beat);
  vec2 f = gap * vec2(cos(th), sin(th));
  col = mix(col, uPlum, ink(length(q - f) - 0.05, w));
  col = mix(col, uWhite, ink(length(q + f) - 0.05, w));
  // The hit: a star that bursts and fades.
  float sa = atan(q.y, q.x);
  float spike = mix(0.018, 0.075, pow(abs(cos(sa * 4.0 + th)), 8.0)) * (0.35 + 1.3 * beat);
  col = mix(col, uWhite, ink(length(q) - spike, w) * (1.0 - smoothstep(0.35, 0.8, beat)));
  return col;
}

vec2 pathAt(float u) { return vec2(0.3 * sin(6.28318 * u), 0.27 * sin(12.56637 * u + 0.5)); }

// 3: the field and the path driven over it.
vec3 art3(vec2 p, float A, float w) {
  vec3 col = uPale;
  vec2 q = p - vec2(0.24 * A, 0.0);
  float hw = 0.4, tile = hw / 3.0;
  float field = ink(sdBox(q, vec2(hw), 0.0), w);
  vec2 id = floor((q + hw) / tile);
  col = mix(col, mix(uPale, uBlossom, 0.5), field * mod(id.x + id.y, 2.0));
  vec2 gl = abs(fract((q + hw) / tile + 0.5) - 0.5) * tile;
  col = mix(col, uPlum, ink(min(gl.x, gl.y) - 0.0012, w) * field * 0.35);
  col = mix(col, uPlum, ink(abs(sdBox(q, vec2(hw), 0.0)) - 0.004, w));

  float here = fract(uTime * 0.045);
  float best = 1.0, at = 0.0;
  vec2 a = pathAt(0.0);
  for (int k = 1; k <= 48; k += 1) {
    float u = float(k) / 48.0;
    vec2 b = pathAt(u);
    vec2 pa = q - a, ba = b - a;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * t);
    if (d < best) { best = d; at = u - (1.0 - t) / 48.0; }
    a = b;
  }
  // Driven so far: a line. Still to drive: dashes.
  float done = step(at, here);
  float dash = step(fract(at * 70.0), 0.5);
  col = mix(col, uRose, ink(best - 0.0055, w) * mix(dash * 0.75, 1.0, done));

  vec2 pos = pathAt(here);
  vec2 ahead = pathAt(here + 0.004) - pos;
  float heading = atan(ahead.y, ahead.x);
  // Where the robot might be: a cloud of guesses, drawing in and out.
  for (int k = 0; k < 22; k += 1) {
    float fk = float(k);
    vec2 off = (vec2(hash11(fk * 3.1), hash11(fk * 7.7 + 1.0)) - 0.5) * 0.17 * (0.55 + 0.45 * sin(uTime * 1.1 + fk));
    col = mix(col, uPlum, ink(length(q - pos - off) - 0.0055, w) * 0.5);
  }
  vec2 b2 = rot(heading) * (q - pos);
  col = mix(col, uPlum, ink(sdBox(b2, vec2(0.04, 0.034), 0.009), w));
  col = mix(col, uWhite, ink(sdBox(b2 - vec2(0.02, 0.0), vec2(0.014, 0.004), 0.0), w));
  return col;
}

// 4: the planet.
vec3 art4(vec2 p, float A, float w) {
  vec2 q = p - vec2(0.24 * A, 0.0);
  vec3 col = mix(mix(uPlum, uLift, 0.6), uDeep, smoothstep(0.1, 1.0, length(q * vec2(0.6, 1.0))));
  col += uRose * 0.3 * exp(-5.0 * dot(q, q));
  float sc = 0.055;
  vec2 cid = floor(p / sc);
  vec2 sp = fract(p / sc) - 0.5 - (vec2(hash21(cid), hash21(cid + 9.0)) - 0.5) * 0.7;
  float lit = step(0.72, hash21(cid + 3.0)) * (0.5 + 0.5 * sin(uTime * 1.6 + hash21(cid) * 40.0));
  col = mix(col, uWhite, ink(length(sp) - 0.05, w / sc) * lit * 0.8);

  vec2 t = rot(-0.36) * q;
  float e = length(t * vec2(1.0, 3.3));
  float lane = hash11(floor(e * 110.0));
  float rings = step(0.27, e) * step(e, 0.48) * (1.0 - step(0.372, e) * step(e, 0.388));
  vec3 ringCol = mix(uBlossom, uWhite, lane) * (0.75 + 0.25 * lane);
  // The far half of the rings, then the planet over it, then the near half.
  col = mix(col, ringCol, rings * step(0.0, t.y) * 0.95);
  float R = 0.19;
  float body = ink(length(q) - R, w);
  float bands = sin(t.y * 62.0 + sin(t.x * 9.0) * 0.7);
  vec3 skin = mix(uBlossom, uWhite, smoothstep(-0.3, 0.3, bands));
  skin = mix(skin, uRose, smoothstep(0.55, 0.9, sin(t.y * 23.0 + 1.2)) * 0.8);
  // Shade in dots that grow toward the dark side.
  vec3 n = vec3(q / R, sqrt(max(0.0, 1.0 - dot(q, q) / (R * R))));
  float dark = 1.0 - clamp(dot(n, normalize(vec3(-0.55, 0.5, 0.65))) * 1.15, 0.0, 1.0);
  float hc = 0.011;
  vec2 hg = fract(rot(0.5) * q / hc) - 0.5;
  skin = mix(skin, uPlum, ink(length(hg) - 0.62 * dark, w / hc));
  col = mix(col, skin, body);
  col = mix(col, ringCol, rings * (1.0 - step(0.0, t.y)) * 0.95);
  // One moon on its way round.
  float m = uTime * 0.22;
  vec2 mp = rot(0.36) * vec2(0.6 * cos(m), 0.6 * sin(m) / 3.3);
  float hidden = step(0.0, sin(m)) * step(length(mp), R);
  col = mix(col, uWhite, ink(length(q - mp) - 0.013, w) * (1.0 - hidden));
  return col;
}

void main() {
  float A = uSize.x / uSize.y;
  float rp = ripple(vUv);
  vec2 p = (vUv - 0.5) * vec2(A, 1.0);
  vec2 from = (uRipple.xy - 0.5) * vec2(A, 1.0);
  vec2 away = p - from;
  p += (away / max(length(away), 0.001)) * rp * 0.012;
  float w = fwidth(p.y) * 0.75;

  vec3 col;
  if (uHasPhoto > 0.5) col = photoArt(p / vec2(A, 1.0) + 0.5, A);
  else if (uKind == 0) col = art0(p, A, w);
  else if (uKind == 1) col = art1(p, A, w);
  else if (uKind == 2) col = art2(p, A, w);
  else if (uKind == 3) col = art3(p, A, w);
  else col = art4(p, A, w);

  // The crest of a ripple catches the light.
  col *= 1.0 + rp * 0.22;
  // A band of light that crosses the card as it tilts.
  float sweep = exp(-pow((p.x * 0.8 + p.y * 0.5 - uTilt.x * 2.6) / 0.3, 2.0));
  // Not under the words when the card carries a picture: there the light
  // would come out as bars behind the type.
  float lit = uHasPhoto > 0.5 ? (uTall > 0.5 ? step(WORDS_TALL, vUv.y) : step(WORDS, vUv.x)) : 1.0;
  col += vec3(0.05) * sweep * (0.4 + abs(uTilt.x) * 4.0) * lit;

  vec2 m = (vUv - 0.5) * uSize;
  float d = sdBox(m, uSize * 0.5, uCorner);
  float a = 1.0 - smoothstep(-fwidth(m.y), fwidth(m.y), d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export type Card = {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  /** Width and height now, in scene units. */
  w: number;
  h: number;
  /** Tilt it is easing toward, and where it is. */
  tx: number;
  ty: number;
  rx: number;
  ry: number;
  /** The cursor was over it last frame. */
  over: boolean;
  seen: boolean;
};

export type CardKit = { cards: Card[]; dispose: () => void };

export function makeCards(count: number, photos?: (string | HTMLCanvasElement)[]): CardKit {
  const loader = new THREE.TextureLoader();
  const pictures: THREE.Texture[] = [];
  const plane = new THREE.PlaneGeometry(1, 1, 96, 48);
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.3, fog: false });
  const col = (hex: string): THREE.Color => new THREE.Color(hex);
  const cards: Card[] = [];
  for (let i = 0; i < count; i += 1) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: false,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uKind: { value: i },
        uSize: { value: new THREE.Vector2(16, 7.6) },
        uRipple: { value: new THREE.Vector3(0.5, 0.5, -10) },
        uTilt: { value: new THREE.Vector2(0, 0) },
        uCorner: { value: 0.16 },
        uPlum: { value: col(BAND) },
        uDeep: { value: col(DEEP) },
        uBlossom: { value: col(BLOSSOM) },
        uWhite: { value: col(WHITE) },
        uRose: { value: col(ROSE) },
        uPale: { value: col(PALE) },
        uLift: { value: col(LIFT) },
        uPhoto: { value: null as THREE.Texture | null },
        uHasPhoto: { value: 0 },
        uPhotoAspect: { value: 1 },
        uInvert: { value: 0 },
        uTall: { value: 0 },
      },
    });
    const src = photos?.[i];
    if (src) {
      /** Mean brightness of a picture, 0..1, from a 32 px copy of it. */
      const meanOf = (im: CanvasImageSource): number => {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return 0;
        ctx.drawImage(im, 0, 0, 32, 32);
        const d = ctx.getImageData(0, 0, 32, 32).data;
        let sum = 0;
        for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        return sum / (255 * 1024);
      };
      const shown = (t: THREE.Texture, w: number, h: number): void => {
        material.uniforms.uInvert.value = meanOf(t.image as CanvasImageSource) > 0.6 ? 1 : 0;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        material.uniforms.uPhoto.value = t;
        material.uniforms.uPhotoAspect.value = w / Math.max(1, h);
        material.uniforms.uHasPhoto.value = 1;
      };
      if (typeof src === "string") {
        const t = loader.load(src, (tex) => {
          const im = tex.image as HTMLImageElement;
          shown(tex, im.naturalWidth, im.naturalHeight);
        });
        pictures.push(t);
      } else {
        const t = new THREE.CanvasTexture(src);
        shown(t, src.width, src.height);
        pictures.push(t);
      }
    }
    const face = new THREE.Mesh(plane, material);
    face.name = "face";
    // The pieces at the corners and in orbit throw their shadows on it.
    const shade = new THREE.Mesh(plane, shadowMat);
    shade.position.z = 0.03;
    shade.receiveShadow = true;
    shade.renderOrder = 2;
    face.renderOrder = 1;
    const group = new THREE.Group();
    group.add(face, shade);
    group.visible = false;
    cards.push({ group, material, w: 16, h: 7.6, tx: 0, ty: 0, rx: 0, ry: 0, over: false, seen: false });
  }
  return {
    cards,
    dispose: () => {
      plane.dispose();
      shadowMat.dispose();
      cards.forEach((c) => c.material.dispose());
      pictures.forEach((t) => t.dispose());
    },
  };
}
