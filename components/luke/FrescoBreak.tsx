"use client";

import { type JSX, useEffect, useRef } from "react";
import * as THREE from "three";

import { css, ground, ink, onPalette } from "@/components/cloudPalette";
import { Em, INK } from "@/components/luke/theme";
import { useTvUp } from "@/components/tvUp";

/**
 * Between Work and Skills: the "Each project..." sentence in the middle of
 * the screen, and behind it Michelangelo's Creation of Adam, the whole
 * fresco, as a stone relief panel that cracks and comes apart as the page
 * scrolls — lukebaffait.fr's hero (his 341-frame sequence of Adam's arm
 * bursting into large flat-faced blocks that fan up, sideways and toward
 * the camera while the rest of the figure stands), done live, on the
 * painting itself.
 *
 * The panel is the fresco (public domain, Wikimedia Commons) pushed into
 * relief by a depth estimate of the painting (scripts/fresco-depth.py), a
 * wall's thickness behind it, cut into solid Voronoi chunks offline
 * (scripts/bake-fresco-chunks.mjs): every chunk is closed, with real cut
 * faces, so a piece that turns in the air shows stone inside and a blank
 * back. One geometry, one draw call: each vertex carries its chunk's
 * number and the vertex shader moves it by that chunk's flight, set from
 * the scroll. The front is shaded off the painting: its light and dark
 * become the stone's, and a normal taken from the depth texture lights it
 * in relief, so the figures read at full detail on a coarse grid.
 *
 * The scroll: the section is HEIGHT_VH tall with a sticky screen-high
 * stage on it (nothing is pinned; the page never stops). Progress runs
 * 0..1 from the section's top reaching the bottom of the screen to its
 * bottom reaching it. The panel stands whole until BREAK[0]; then the
 * pieces go in order from where the fingers nearly touch (ORIGIN) out to
 * the panel's corners, every one flying the same way (up, a little left,
 * and toward the viewer, FLIGHT) plus a spread away from the panel's
 * centre, pushed further the further along the flight it started, so
 * pieces never close on one another, with a slow tumble and a shrink to
 * open daylight at the seams. The camera pulls out a little over the
 * whole run and never holds still. The sentence is there for the middle
 * of the run, drifting up, its words coming in from a blur one after
 * another (his phrase).
 *
 * Colours from the cloud bank's palette (cloudPalette.ts): the stone is a
 * ramp between a tone just off the ground and one most of the way to the
 * type, so on the pink ground the fresco is pale plum-grey marble and on
 * the dark ground pink-lit stone. PAINT turns the painting's own colours
 * up over that. Drawn only when the scroll, the palette or the size
 * changes; no frame loop. Reduced motion: the panel stands whole with
 * the sentence shown.
 */

/** The section's height in screens. */
const HEIGHT_VH = 460;
/** His phrase's run and travel. */
const PHRASE: [number, number] = [0.42, 0.92];
/** His window: the whole screen-high stage, with four corner marks, sits
 *  at scale 0 in the middle of the screen and grows straight to full size
 *  over this span of the run (his reveal-seq: scale 0 to 1, no easing,
 *  over the last 70% of his scroll), the break running inside it while it
 *  is still small. The sentence is not in the window. */
const WINDOW: [number, number] = [0.22, 0.95];
const PHRASE_TRAVEL = 200;
const PHRASE_REVEAL = 0.4;
/** Where in the run the first piece leaves and the last piece's flight
 *  ends (past the run's end: the corners are still in the air as the
 *  stage scrolls away, rather than the sky being empty for its last
 *  third). */
const BREAK: [number, number] = [0.32, 1.1];
/** How much of the run one piece's flight takes: long, so the air stays
 *  full of pieces (his flight is slow against the break). */
const TRAVEL = 0.42;
/** Where the break starts, in the painting (0..1 across, 0..1 up from the
 *  bottom): the gap between the two fingers. */
const ORIGIN: [number, number] = [0.455, 0.55];
/** The flight, in the panel's frame: x right, y up, z toward the viewer. */
const FLIGHT = new THREE.Vector3(0, 0.3, 0.95).normalize();
/** Every piece's push along FLIGHT, the extra for pieces further along it
 *  (his pieces come out of the middle of the frame toward the camera and
 *  up, and the far ones end around the camera), and the spread away from
 *  the statue's centre line, in statue heights. */
const PUSH = 0.3;
const STRETCH = 0.4;
const SPREAD = 0.5;
/** Each piece shrinks to this over its flight. 1: his pieces keep their size. */
const SHRINK = 1.0;
/** Most turn, in radians over the flight, for the smallest pieces. Small:
 *  his slabs drift flat-faced and barely turn. */
const SPIN = 0.35;
/** Noise on the release order (a share of the order) so the front is ragged. */
const RAGGED = 0.08;
/** The camera: field of view; how much of the statue's height the frame
 *  shows at the start and the end of the run (his frames are close-ups,
 *  the figure cropped); where it looks, in statue heights up from the
 *  centre, at the start and the end (it begins on the raised hands, where
 *  the break starts, and travels down the body as the break does); and
 *  the drift of its angle. */
const FOV = 22;
const VIEW: [number, number] = [0.26, 0.46];
const AIM: [number, number] = [0.4, -0.25];
/** Where in the run the camera starts travelling down (it holds on the
 *  hands until just before the break). */
const AIM_FROM = 0.2;
const DRIFT_RAD = 0.06;
/** The light, in the camera's frame: raking from the upper left, so one
 *  side of every form is in shade (his). */
const LIGHT = new THREE.Vector3(-0.45, 0.5, 0.74).normalize();
/** How strongly the depth texture bends the front's normal. */
const RELIEF = 2.2;
/** How much of the painting's own colour shows through the stone, 0..1. */
const PAINT = 0;
/** Where the bake lives. /models/statue is a scanned statue (bake-statue-chunks.mjs), /models/fresco the relief panel (bake-fresco-chunks.mjs). */
const BAKE = "/models/statue";
/** On a painted relief: shade it as plain marble (his) rather than from the painting's own light and dark. */
const MARBLE = true;

const WORDS: { t: string; em?: boolean }[] = [
  { t: "Each" },
  { t: "project" },
  { t: "is" },
  { t: "an" },
  { t: "opportunity" },
  { t: "to" },
  { t: "learn,", em: true },
  { t: "build", em: true },
  { t: "and" },
  { t: "show" },
  { t: "what" },
  { t: "I" },
  { t: "can" },
  { t: "do." },
];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** A hash in 0..1 from two integers. */
const hash01 = (a: number, b: number): number => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type ChunkMeta = {
  centre: [number, number, number];
  radius: number;
  vOff: number;
  vCount: number;
  iOff: number;
  iCount: number;
};
type Bake = {
  aspect: number;
  /** A statue bake: every face plain stone, no textures; the break starts at `origin`. */
  painted?: boolean;
  origin?: [number, number, number];
  posScale: number;
  vertexBytes: number;
  indexOffset: number;
  vertexCount: number;
  indexCount: number;
  chunks: ChunkMeta[];
};

const VERT = /* glsl */ `
  attribute float aChunk;
  attribute float aKind;
  uniform vec4 uMove[N];
  uniform vec4 uRot[N];
  uniform vec3 uCentre[N];
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying float vKind;
  varying vec4 vRot;
  vec3 rotq(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  void main() {
    int i = int(aChunk + 0.5);
    vec3 c = uCentre[i];
    vec3 p = rotq(uRot[i], (position - c) * uMove[i].w) + c + uMove[i].xyz;
    vN = normalMatrix * rotq(uRot[i], normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    vUv = uv;
    vKind = aKind;
    vRot = uRot[i];
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uShadow;
  uniform vec3 uL;
  uniform float uMarble;
  uniform sampler2D uTex;
  uniform sampler2D uDepth;
  uniform vec2 uTexel;
  uniform float uRelief;
  uniform float uPaint;
  uniform float uPainted;
  uniform mat3 uNormalMatrix;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying float vKind;
  varying vec4 vRot;
  vec3 rotq(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  void main() {
    vec3 n = normalize(vN);
    float k;
    vec3 paint = vec3(0.0);
    if (uPainted > 0.5 && vKind < 0.5) {
      // The relief's front: its normal from the depth texture, turned with the piece.
      float dl = texture2D(uDepth, vUv - vec2(uTexel.x, 0.0)).r;
      float dr = texture2D(uDepth, vUv + vec2(uTexel.x, 0.0)).r;
      float dd = texture2D(uDepth, vUv - vec2(0.0, uTexel.y)).r;
      float du = texture2D(uDepth, vUv + vec2(0.0, uTexel.y)).r;
      vec3 rn = normalize(vec3((dl - dr) * uRelief, (dd - du) * uRelief, 1.0));
      n = normalize(uNormalMatrix * rotq(vRot, rn));
      vec3 col = texture2D(uTex, vUv).rgb;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      if (uMarble > 0.5) {
        float lit = pow(clamp(dot(n, uL), 0.0, 1.0), 0.7);
        k = 0.05 + 0.95 * lit;
      } else {
        float lit = pow(clamp(dot(n, uL) * 0.5 + 0.5, 0.0, 1.0), 1.6);
        k = clamp(pow(lum, 0.75) * (0.35 + 0.8 * lit), 0.0, 1.0);
      }
      paint = col;
    } else {
      // Cut faces, sides and backs, and all of a statue: plain stone over
      // the whole range, white where the light hits and dark where it
      // does not (his marble).
      float lit = pow(clamp(dot(n, uL), 0.0, 1.0), 0.7);
      k = 0.05 + 0.95 * lit;
    }
    float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0) * 0.12;
    // The ramp is meant as seen: mixed in linear light it would sit in
    // the greys, so it is bent back first.
    vec3 stone = mix(uShadow, uLight, pow(clamp(k + rim, 0.0, 1.0), 2.2));
    gl_FragColor = vec4(mix(stone, paint * (0.6 + 0.6 * k), uPaint * (1.0 - step(0.5, vKind))), 1.0);
    #include <colorspace_fragment>
  }
`;

export default function FrescoBreak(): JSX.Element {
  const section = useRef<HTMLElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const phrase = useRef<HTMLParagraphElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  /** The window that grows from the middle of the screen. */
  const win = useRef<HTMLDivElement>(null);
  /** The stage's draw, once it is built, called with the progress. */
  const draw = useRef<((progress: number) => void) | null>(null);

  // The type's colour, with the cloud's.
  useEffect(
    () =>
      onPalette((t) => {
        if (section.current) section.current.style.color = css(ink(t));
      }),
    [],
  );

  // The scroll: the phrase, and the stage through `draw`.
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = -1;
    const apply = (): void => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = reduced ? 0.5 : clamp01((vh - r.top) / Math.max(1, r.height));
      // Off screen: nothing to do.
      if (r.bottom < 0 || r.top > vh) return;
      if (progress !== last) {
        last = progress;
        draw.current?.(progress);
      }
      if (win.current) {
        const s = reduced ? 1 : clamp01((progress - WINDOW[0]) / (WINDOW[1] - WINDOW[0]));
        win.current.style.transform = `scale(${s.toFixed(4)})`;
      }
      const p = phrase.current;
      if (!p) return;
      if (progress < PHRASE[0] || progress > PHRASE[1]) {
        p.style.opacity = "0";
        return;
      }
      const g = (progress - PHRASE[0]) / (PHRASE[1] - PHRASE[0]);
      // The inline transform replaces the classes' centring, so it carries it.
      p.style.transform = `translate(-50%, calc(-50% + ${(PHRASE_TRAVEL * (0.5 - g)).toFixed(1)}px))`;
      p.style.opacity = (g < 0.1 ? g / 0.1 : g > 0.75 ? (1 - g) / 0.25 : 1).toFixed(3);
      const n = words.current.length;
      words.current.forEach((w, i) => {
        if (!w) return;
        const k = g < PHRASE_REVEAL ? clamp01(((g / PHRASE_REVEAL) * (n + 4) - i) / 3) : 1;
        w.style.opacity = k.toFixed(3);
        w.style.filter = k >= 1 ? "none" : `blur(${(8 * (1 - k)).toFixed(1)}px)`;
      });
    };
    const ask = (): void => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The stage. Waits for the hero (tvUp.ts) so it does not slow the TV
  // loading, then fetches the bake and the two textures and builds the one
  // mesh.
  const tvUp = useTvUp();
  useEffect(() => {
    if (!tvUp) return undefined;
    const el = host.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const loader = new THREE.TextureLoader();
      const meta = (await fetch(`${BAKE}/chunks.json`).then((r) => r.json())) as Bake;
      const painted = meta.painted !== false;
      // The textures only for the painted relief: a statue is plain stone.
      const [bin, tex, depth] = await Promise.all([
        fetch(`${BAKE}/chunks.bin`).then((r) => r.arrayBuffer()),
        painted ? loader.loadAsync(`${BAKE}/fresco.jpg`) : null,
        painted ? loader.loadAsync(`${BAKE}/depth.jpg`) : null,
      ]);
      if (gone) {
        tex?.dispose();
        depth?.dispose();
        return;
      }
      const N = meta.chunks.length;
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
      }
      if (depth) {
        depth.colorSpace = THREE.NoColorSpace;
        depth.anisotropy = 4;
      }

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      } catch {
        return;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      el.appendChild(renderer.domElement);

      // The geometry off the bake's bytes: 14 bytes a vertex (int16 x3
      // position, int8 x3 normal, u8 kind, uint16 x2 uv), split into plain
      // attributes; uint16 indices per chunk, lifted to one uint32 index.
      const V = meta.vertexCount;
      const bytes = new DataView(bin);
      const position = new Int16Array(V * 3);
      const normal = new Int8Array(V * 3);
      const kind = new Uint8Array(V);
      const uv = new Uint16Array(V * 2);
      for (let v = 0; v < V; v++) {
        const o = v * meta.vertexBytes;
        position[v * 3] = bytes.getInt16(o, true);
        position[v * 3 + 1] = bytes.getInt16(o + 2, true);
        position[v * 3 + 2] = bytes.getInt16(o + 4, true);
        normal[v * 3] = bytes.getInt8(o + 6);
        normal[v * 3 + 1] = bytes.getInt8(o + 7);
        normal[v * 3 + 2] = bytes.getInt8(o + 8);
        kind[v] = bytes.getUint8(o + 9);
        uv[v * 2] = bytes.getUint16(o + 10, true);
        uv[v * 2 + 1] = bytes.getUint16(o + 12, true);
      }
      const chunkOf = new Uint8Array(V);
      const index = new Uint32Array(meta.indexCount);
      const local = new Uint16Array(bin, meta.indexOffset, meta.indexCount);
      meta.chunks.forEach((c, k) => {
        chunkOf.fill(k, c.vOff, c.vOff + c.vCount);
        for (let i = 0; i < c.iCount; i++) index[c.iOff + i] = c.vOff + local[c.iOff + i];
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3, true));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3, true));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2, true));
      geometry.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
      geometry.setAttribute("aChunk", new THREE.BufferAttribute(chunkOf, 1));
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
      // The bake's positions are × posScale; the panel is one unit wide.
      const scale = 32767 / meta.posScale;
      const centres = meta.chunks.map((c) => new THREE.Vector3(...c.centre));

      const uniforms = {
        uMove: { value: meta.chunks.map(() => new THREE.Vector4(0, 0, 0, 1)) },
        uRot: { value: meta.chunks.map(() => new THREE.Vector4(0, 0, 0, 1)) },
        uCentre: { value: centres },
        uLight: { value: new THREE.Color() },
        uShadow: { value: new THREE.Color() },
        uL: { value: LIGHT.clone() },
        uMarble: { value: MARBLE ? 1 : 0 },
        uTex: { value: tex },
        uDepth: { value: depth },
        uTexel: { value: depth ? new THREE.Vector2(1 / depth.image.width, 1 / depth.image.height) : new THREE.Vector2(1, 1) },
        uRelief: { value: RELIEF },
        uPaint: { value: PAINT },
        uPainted: { value: painted ? 1 : 0 },
        // The fragment shader has no normalMatrix of its own; set per frame below.
        uNormalMatrix: { value: new THREE.Matrix3() },
      };
      const material = new THREE.ShaderMaterial({
        defines: { N },
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(scale);
      const scene = new THREE.Scene();
      scene.add(mesh);
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);

      // The break's order: from the statue's top point (the raised hand) down,
      // or on the relief from the fingers' gap outward; ragged either way.
      const H = 1 / meta.aspect;
      const origin = meta.origin ? new THREE.Vector3(...meta.origin) : new THREE.Vector3(ORIGIN[0] - 0.5, (ORIGIN[1] - 0.5) * H, 0);
      const dist = centres.map((c) => (meta.origin ? c.distanceTo(origin) : Math.hypot(c.x - origin.x, c.y - origin.y)));
      const span = Math.max(...dist) || 1;
      const ragged = centres.map((_, i) => dist[i] / span + (hash01(i, 11) - 0.5) * 2 * RAGGED);
      const lo = Math.min(...ragged);
      const hi = Math.max(...ragged);
      const releaseAt = ragged.map((r) => BREAK[0] + ((r - lo) / (hi - lo || 1)) * (BREAK[1] - BREAK[0] - TRAVEL));
      // The flight: the shared line (up and toward the camera), further for
      // pieces further along it, plus the spread away from the statue's
      // centre line, all in statue heights; the tumble, less for big pieces.
      const along = centres.map((c) => c.dot(FLIGHT));
      const minAlong = Math.min(...along);
      const alongSpan = Math.max(...along) - minAlong || 1;
      const flights = centres.map((c, i) => {
        const lead = (along[i] - minAlong) / alongSpan;
        const side = new THREE.Vector3(c.x, 0, c.z);
        return FLIGHT.clone()
          .multiplyScalar((PUSH + STRETCH * lead) * H)
          .addScaledVector(side, SPREAD)
          .add(new THREE.Vector3(hash01(i, 3) - 0.5, hash01(i, 5) - 0.5, hash01(i, 7) - 0.5).multiplyScalar(0.05 * H));
      });
      const spins = meta.chunks.map((c, i) => ({
        axis: new THREE.Vector3(hash01(i, 13) - 0.5, hash01(i, 17) - 0.5, (hash01(i, 19) - 0.5) * 0.5).normalize(),
        rate: (SPIN * Math.min(1, 0.08 / Math.max(c.radius, 0.03))) * (0.5 + hash01(i, 23)),
      }));
      const q = new THREE.Quaternion();
      const modelView = new THREE.Matrix4();

      const fit = (): void => {
        const w = el.clientWidth || window.innerWidth;
        const h = el.clientHeight || window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      const render = (progress: number): void => {
        const p = reduced ? 0.5 : progress;
        // The camera: close on the raised hands at first, travelling down
        // the body and pulling out as the break goes, drifting round a little.
        const halfH = Math.tan((FOV * Math.PI) / 360);
        const view = VIEW[0] + (VIEW[1] - VIEW[0]) * p;
        const travel = clamp01((p - AIM_FROM) / (1 - AIM_FROM));
        // On a statue the camera starts on the raised hands and travels
        // down the body; on the relief it starts on the fingers' gap and
        // travels left, over Adam, the way his does.
        const aimX = meta.origin ? 0 : origin.x - 0.3 * travel;
        const aimY = meta.origin ? (AIM[0] + (AIM[1] - AIM[0]) * travel) * H : origin.y - 0.12 * travel;
        const d = (view * H) / 2 / halfH;
        const a = (p - 0.5) * DRIFT_RAD;
        camera.position.set(aimX + Math.sin(a) * d, aimY, Math.cos(a) * d);
        camera.lookAt(aimX, aimY, 0);
        camera.updateMatrixWorld();
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        mesh.updateMatrixWorld();
        uniforms.uNormalMatrix.value.getNormalMatrix(modelView.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld));
        // The pieces.
        for (let i = 0; i < N; i++) {
          const t = reduced ? 0 : easeOut(clamp01((p - releaseAt[i]) / TRAVEL));
          const m = uniforms.uMove.value[i];
          m.set(flights[i].x * t, flights[i].y * t, flights[i].z * t, 1 - (1 - SHRINK) * t);
          q.setFromAxisAngle(spins[i].axis, spins[i].rate * t);
          uniforms.uRot.value[i].set(q.x, q.y, q.z, q.w);
        }
        renderer.render(scene, camera);
      };

      let progress = 0.5;
      draw.current = (v) => {
        progress = v;
        render(v);
      };
      const offPalette = onPalette((t) => {
        // The stone's two tones (his marble is white with black shade): the
        // lit side most of the way from the ground to white, the shade most
        // of the way to the type where the type is darker than the ground
        // (the pink ground) and to black where it is not (the dark ground).
        const g = ground(t);
        const k = ink(t);
        const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const toward = (c: readonly number[], f: number): THREE.Color =>
          new THREE.Color().setRGB(g[0] + (c[0] - g[0]) * f, g[1] + (c[1] - g[1]) * f, g[2] + (c[2] - g[2]) * f, THREE.SRGBColorSpace);
        uniforms.uLight.value.copy(toward([1, 1, 1], 0.9));
        uniforms.uShadow.value.copy(lum(k) < lum(g) ? toward(k, 0.9) : toward([0, 0, 0], 0.75));
        render(progress);
      });
      const onResize = (): void => {
        fit();
        render(progress);
      };
      fit();
      window.addEventListener("resize", onResize);
      // First frame: wherever the scroll is now.
      const r = track.current?.getBoundingClientRect();
      if (r) render(reduced ? 0.5 : clamp01((window.innerHeight - r.top) / Math.max(1, r.height)));

      cleanup = () => {
        draw.current = null;
        offPalette();
        window.removeEventListener("resize", onResize);
        geometry.dispose();
        material.dispose();
        tex?.dispose();
        depth?.dispose();
        renderer.domElement.remove();
        renderer.dispose();
      };
    })().catch(() => {
      // No bake, no WebGL: the sentence on the plain ground.
    });

    return () => {
      gone = true;
      cleanup?.();
    };
  }, [tvUp]);

  return (
    // Above Skills (z-30), so nothing of Skills shows through the stage's
    // last screen.
    <section aria-label="Approach" className="relative z-40" id="each" ref={section} style={{ color: INK, height: `${HEIGHT_VH}vh` }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" ref={track}>
        <div className="sticky top-0 h-screen w-full overflow-clip">
          {/* The statue, behind, in his window: the stage and its corner
              marks, scaled up from nothing in the middle of the screen. */}
          <div className="absolute inset-0 will-change-transform" ref={win} style={{ transform: "scale(0)" }}>
            <div className="absolute inset-0" ref={host} />
            {(["left-8 top-8", "right-8 top-8", "bottom-8 left-8", "bottom-8 right-8"] as const).map((at) => (
              <span className={`absolute h-[18px] w-[18px] ${at}`} key={at}>
                <span className="absolute left-1/2 top-0 h-full w-px bg-current" />
                <span className="absolute left-0 top-1/2 h-px w-full bg-current" />
              </span>
            ))}
          </div>
          {/* The sentence, in the middle, over it. */}
          <p
            className="absolute left-1/2 top-1/2 z-10 w-[88vw] max-w-[44rem] text-center font-sans text-[clamp(26px,2.9vw,100px)] leading-[1.16] tracking-[-0.03em] [text-wrap:balance] md:w-[42vw] md:max-w-none"
            ref={phrase}
            style={{ opacity: 0, transform: "translate(-50%, -50%)" }}
          >
            {WORDS.map((w, i) => (
              <span key={`${w.t}-${i}`}>
                <span
                  className="inline-block"
                  ref={(node) => {
                    words.current[i] = node;
                  }}
                  style={{ opacity: 0 }}
                >
                  {w.em ? <Em>{w.t}</Em> : w.t}
                </span>
                {i < WORDS.length - 1 ? " " : null}
              </span>
            ))}
          </p>
        </div>
      </div>
      <span className="sr-only">{WORDS.map((w) => w.t).join(" ")}</span>
    </section>
  );
}
