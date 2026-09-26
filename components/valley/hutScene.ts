import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WeepingCherryGenerator } from "@/components/BareThreeCanvas";

// ---------------------------------------------------------------------------
// The realistic valley behind the hero: a log hut on a flat clearing, two
// cherry trees beside it, hillsides either side, two mountain ranges behind,
// all at dusk. Scroll drives a slow dolly straight back: p=0 already stands
// well back on the path with the whole hut, both cherry trees and the ridges
// in frame, and p=1 pulls further back and higher into a wide valley shot.
// The hero opens on the scene, not on a wall of logs.
//
// Everything static is merged by material so the frame is ~25 draw calls
// plus the trees. The sun's shadow map is baked once: nothing that casts a
// shadow moves (the canopy sway is a vertex-shader effect the depth pass
// does not see anyway).
// ---------------------------------------------------------------------------

export type HutScene = {
  ready: Promise<void>;
  setProgress: (p: number) => void;
  resize: (cssWidth: number, cssHeight: number) => void;
  // Shrinks the drawing buffer without touching the CSS box: 1 is full size,
  // 0.3 is a ninth of the pixels. The caller uses it when the hero is scaled
  // down on screen, so we stop drawing pixels nobody sees. Clamped to
  // [0.25, 1]; resize() keeps working either way.
  setRenderScale: (scale: number) => void;
  start: () => void;
  stop: () => void;
  renderOnce: () => void;
  dispose: () => void;
};

type Quality = "low" | "medium" | "high";

// Above 1.25 the extra pixels cost more than they show on a fogged dusk
// scene, and the hero canvas covers the whole viewport.
const DPR_CAP = 1.25;
// The dolly is capped here even on a 120 Hz display: above 60 the extra
// frames cost a whole GPU's worth of trees and nobody sees the difference.
const MOVING_FPS = 60;
// Camera settled, only the wind and the smoke left: a slow sway survives
// 10 fps, and it costs a third of what 30 fps did.
const WIND_FPS = 10;
// After this long with no setProgress() the scene stops drawing altogether
// and freezes its wind clock. The next setProgress() picks it up again.
const IDLE_SLEEP_MS = 4000;
// The buffer may be shrunk to a quarter scale (a sixteenth of the pixels);
// below that the scene turns to mush even behind a scaled-down hero.
const RENDER_SCALE_MIN = 0.25;
// Critically damped follow of the scroll progress. ~1 s to settle.
const FOLLOW_OMEGA = 5;
// Progress used when nothing scrubs (phones, reduced motion).
const STATIC_PROGRESS = 0.35;
// A phone is roughly 9:19.5. The vertical field of view is widened below to
// claw back the horizontal one, and this still frame sits a little further
// back than p=0 so the hut has air around it.
const PORTRAIT_STATIC_PROGRESS = 0.15;
// How wide the vertical field of view may go on a portrait canvas. Past ~70
// the edges of the frame stretch badly.
const PORTRAIT_FOV_MAX = 70;

// Palette (sRGB; THREE.Color converts to linear).
const SKY_TOP = "#2a1024";
const SKY_HORIZON = "#e79cc8";
const FOG_COLOR = "#d493bd";
// Rosy, not amber. The sun skims the ground at 8 degrees, so its colour IS
// the ground's colour over most of the frame; at #ffb27a the terrain came
// back olive-brown under a pink sky, which read as a different picture from
// the one behind it.
const SUN_COLOR = "#ffc6c9";
// Dimmer than the sun itself. This is the glow AROUND it in the sky shader,
// and on the television the tube multiplies its own bloom over the top —
// which at full strength took the corner it sits in to flat white.
const SUN_GLOW = "#f2c4d6";
const HEMI_SKY = "#a4648f";
const HEMI_GROUND = "#2e2030";
const WINDOW_COLOR = "#ffb35c";

// Sun: 8 degrees up, from the back-left as the camera sees it, so the hut
// and the trees are rim-lit and their long shadows run toward the viewer.
const SUN_ELEVATION = (8 * Math.PI) / 180;
const SUN_DIR = new THREE.Vector3(
  -0.68 * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  -0.73 * Math.cos(SUN_ELEVATION),
).normalize();

// Hut footprint in metres. Ridge runs along z; the door is on the +z face.
const HUT_W = 4;
const HUT_D = 3;
const LOG_R = 0.15;
const LOG_STEP = LOG_R * 2;
const BASE_TOP = 0.2;
const WALL_TOP = BASE_TOP + 9 * LOG_STEP - LOG_R; // centre of the 9th front course
// The roof's underside at the wall line sits a little above the top course so
// no log end pokes through the slab; the gable courses fill the wedge above.
const EAVE_Y = WALL_TOP + LOG_R + 0.25;
const RIDGE_RISE = 1.3;
const RIDGE_Y = EAVE_Y + RIDGE_RISE;
const ROOF_OVERHANG = 0.35;
const PORCH_D = 1.4;
const PORCH_TOP = 0.32;
const FRONT_Z = HUT_D / 2;
const DOOR_Z = FRONT_Z + LOG_R + 0.03;

// Trees flanking the hut: the left one nearer the camera.
const TREE_SPOTS = [
  { x: -5.0, z: 1.6, scale: 0.74, yaw: 0.5 },
  { x: 5.6, z: -2.4, scale: 0.66, yaw: -1.2 },
];

// Camera path end points (world metres).
//
// p=0: standing back on the path at eye height, 22.5 m from the hut. With a
// 44 degree vertical field that frame is 17.8 m tall and 31.6 m wide at the
// hut, so the 4.45 m hut fills about a quarter of the height, the two cherry
// canopies (about 21 m across between them) flank it and run off the edges,
// and the ranges sit on the horizon above the roof. The look-at is 0.7 m
// above the camera and above the eaves, which drops the hut into the lower
// half of the frame: the wordmark band across the middle of the hero then
// crosses sky and roof, not the lit windows.
// The clearing station the track used to pass through. Kept as a record
// of where the hut shot was composed from; the track no longer visits it.
// const CAM_NEAR_POS = new THREE.Vector3(1.2, 2.6, 22.5);
// const CAM_NEAR_LOOK = new THREE.Vector3(0, 3.3, 0);
// p=1: 44 m back and 9.6 m up, tipped about 4 degrees down, so the clearing,
// both trees, the valley walls and the ranges all read at once.
const CAM_FAR_POS = new THREE.Vector3(3.4, 9.6, 44);
const CAM_FAR_LOOK = new THREE.Vector3(0, 6.0, -6);
// p = -1: 96 m on past the clearing and well up, looking a long way down the
// valley. This is deliberately far beyond what the tree's own camera does —
// the two dollies are separate (BareThreeCanvas moves the tree camera 13
// units, which is through the canopy and no further), because the tree is a
// foot from the lens and the valley is hundreds of metres deep. Matching
// them would either park the valley or put the camera inside the trunk. The path used to stop at p = 0 and a forward dolly ran out of
// travel there, which is why the hills barely moved — most of the parallax in
// a scene like this is in the last stretch, and it was the one the camera
// could not reach. Straight extrapolation was not an option: the two points
// above are a line that goes UNDER the ground, which is why this is its own
// point rather than an overshoot of theirs.
const CAM_PAST_POS = new THREE.Vector3(-1.4, 7.5, -96);
const CAM_PAST_LOOK = new THREE.Vector3(-2.6, 16, -300);
const FOV_PAST = 58;
/** How far over the ground the camera is always kept, in metres. */
const CAM_CLEARANCE = 7.5;
/**
 * THE DOLLY IS A STRAIGHT TRACK. One x for the whole run, z sliding along
 * it, and the height a single smooth line worked out once from the ground
 * under the track (see buildTrackHeight). Nothing about the camera changes
 * direction part way: the three stations above still say where it starts,
 * how high it sits and how far it goes, but it no longer visits the
 * clearing's own x and y on the way, which is what made it swing sideways
 * and dip. The aim is a fixed distance ahead along the same track, at a
 * pitch that eases from a little down (the wide shot) to a little up (the
 * head of the valley), and it rides up and down WITH the camera, so the
 * ground never tilts the shot.
 */
const TRACK_X = 1.0;
const TRACK_Z_FROM = CAM_FAR_POS.z;
const TRACK_Z_TO = CAM_PAST_POS.z;
const TRACK_Y_FROM = CAM_FAR_POS.y;
const TRACK_Y_TO = CAM_PAST_POS.y;
const LOOK_AHEAD = 60;
const PITCH_FROM = Math.atan2(CAM_FAR_LOOK.y - CAM_FAR_POS.y, CAM_FAR_POS.z - CAM_FAR_LOOK.z);
const PITCH_TO = Math.atan2(CAM_PAST_LOOK.y - CAM_PAST_POS.y, CAM_PAST_POS.z - CAM_PAST_LOOK.z);
/** Samples along the track for the height line. */
const TRACK_SAMPLES = 128;

/** Where along the track a progress p (1 = wide shot, -1 = past the
 *  clearing) stands: 0..1, with the speed growing smoothly on the way in,
 *  since almost all of the parallax is in the last stretch. */
function trackT(p: number): number {
  const t = (1 - p) / 2;
  return 0.45 * t + 0.55 * t * t;
}

/**
 * The camera's height along the track, as a table.
 *
 * The ground under the track is sampled under and ahead of each station,
 * the clearance added, and that floor is BLURRED into one soft line — then
 * lifted as a whole by however much the blur went under the floor
 * anywhere, so it clears the ground at every sample and is still the
 * blurred, kink-free line. A clamp that took hold sample by sample was
 * the bobbing.
 */
function buildTrackHeight(seed: number): Float32Array {
  const n = TRACK_SAMPLES;
  const floor = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const z = TRACK_Z_FROM + (TRACK_Z_TO - TRACK_Z_FROM) * t;
    const ground = Math.max(
      terrainHeight(TRACK_X, z, seed),
      terrainHeight(TRACK_X, z - 22, seed),
      terrainHeight(TRACK_X, z - 48, seed),
    );
    // Never below the line the stations draw, either.
    floor[i] = Math.max(ground + CAM_CLEARANCE, TRACK_Y_FROM + (TRACK_Y_TO - TRACK_Y_FROM) * t);
  }
  // A wide Gaussian, run twice.
  const sigma = 7;
  const radius = sigma * 3;
  const kernel: number[] = [];
  let sum = 0;
  for (let k = -radius; k <= radius; k += 1) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    sum += w;
  }
  let line = floor;
  for (let pass = 0; pass < 2; pass += 1) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        acc += line[j] * kernel[k + radius];
      }
      out[i] = acc / sum;
    }
    line = out;
  }
  let deficit = 0;
  for (let i = 0; i < n; i += 1) deficit = Math.max(deficit, floor[i] - line[i]);
  for (let i = 0; i < n; i += 1) line[i] += deficit;
  return line;
}

/**
 * For tooling: the track sampled at N even steps of p, so a script can
 * check there is no step in it. Not used by the scene.
 */
export function sampleTrack(seed: number, n = 400): { x: number; y: number; z: number; pitch: number; fov: number }[] {
  const line = buildTrackHeight(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = 1 - (2 * i) / (n - 1);
    const t = trackT(p);
    const s01 = t * t * (3 - 2 * t);
    out.push({
      x: TRACK_X,
      y: trackHeightAt(line, t),
      z: TRACK_Z_FROM + (TRACK_Z_TO - TRACK_Z_FROM) * t,
      pitch: PITCH_FROM + (PITCH_TO - PITCH_FROM) * s01,
      fov: FOV_FAR + (FOV_PAST - FOV_FAR) * s01,
    });
  }
  return out;
}

/** The table read at t, with a cubic between samples. */
function trackHeightAt(line: Float32Array, t: number): number {
  const n = line.length;
  const x = Math.min(n - 1, Math.max(0, t * (n - 1)));
  const i = Math.floor(x);
  const f = x - i;
  const y0 = line[Math.max(0, i - 1)];
  const y1 = line[i];
  const y2 = line[Math.min(n - 1, i + 1)];
  const y3 = line[Math.min(n - 1, i + 2)];
  // Catmull-Rom.
  return (
    0.5 *
    (2 * y1 +
      (-y0 + y2) * f +
      (2 * y0 - 5 * y1 + 4 * y2 - y3) * f * f +
      (-y0 + 3 * y1 - 3 * y2 + y3) * f * f * f)
  );
}
const FOV_NEAR = 44;
const FOV_FAR = 40;
// The panes at full glow sit right behind the wordmark at the top of the
// page. They come up as the camera pulls back and they shrink.
const WINDOW_GLOW_NEAR = 1.0;
const WINDOW_GLOW_FAR = 2.6;

// ---------------------------------------------------------------------------
// Deterministic noise. Local copies so this module does not depend on the
// other workers' files.
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function valueNoise2(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fbm2(x: number, y: number, octaves: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2(fx, fy, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.03 + 17.1;
    fy = fy * 2.03 + 9.7;
  }
  return sum / norm;
}

// Sharp crests: fold the noise around its middle so ridgelines come out as
// creases, not as rolling bumps.
function ridged2(x: number, y: number, octaves: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(2 * valueNoise2(fx, fy, seed + i * 31) - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.1 + 3.3;
    fy = fy * 2.1 + 5.9;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Terrain height (world x/z, metres). Flat clearing around the hut, valley
// walls climbing either side, the valley head rising behind so the floor
// meets the ranges instead of running under them.
// ---------------------------------------------------------------------------

function terrainHeight(x: number, z: number, seed: number) {
  const ax = Math.abs(x);
  const wall = smoothstep(14, 95, ax);
  const wallH = 30 * wall * (0.5 + 0.9 * fbm2(x * 0.025, z * 0.025, 3, seed + 1));
  const head = smoothstep(-50, -150, z);
  const headH = 24 * head * (0.6 + 0.8 * fbm2(x * 0.02, z * 0.02, 3, seed + 2));
  // The clearing: the hut, its path and the two trees sit on near-level ground.
  const d = Math.hypot(x * 0.9, z * 0.6);
  const open = smoothstep(7, 30, d);
  const roll = (fbm2(x * 0.03, z * 0.03, 4, seed + 3) - 0.5) * 6 * open;
  const fine = (fbm2(x * 0.18, z * 0.18, 3, seed + 4) - 0.5) * 0.5 * open;
  const ripple = (fbm2(x * 0.5, z * 0.5, 2, seed + 5) - 0.5) * 0.12;
  return wallH + headH + roll + fine + ripple;
}

// ---------------------------------------------------------------------------
// Procedural surfaces: one colour canvas plus a height canvas (bump) and a
// roughness canvas, all painted by one per-pixel function.
// ---------------------------------------------------------------------------

type Surface = {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  textures: THREE.Texture[];
};

type Pixel = { r: number; g: number; b: number; h: number; rough: number };

function makeSurface(
  size: number,
  paint: (u: number, v: number, out: Pixel) => void,
): Surface {
  const color = document.createElement("canvas");
  const bump = document.createElement("canvas");
  const rough = document.createElement("canvas");
  for (const c of [color, bump, rough]) {
    c.width = size;
    c.height = size;
  }
  const cctx = color.getContext("2d");
  const bctx = bump.getContext("2d");
  const rctx = rough.getContext("2d");
  if (cctx && bctx && rctx) {
    const cImg = cctx.createImageData(size, size);
    const bImg = bctx.createImageData(size, size);
    const rImg = rctx.createImageData(size, size);
    const out: Pixel = { r: 0, g: 0, b: 0, h: 0, rough: 1 };
    for (let py = 0; py < size; py += 1) {
      for (let px = 0; px < size; px += 1) {
        paint(px / size, py / size, out);
        const i = (py * size + px) * 4;
        cImg.data[i] = Math.max(0, Math.min(255, out.r * 255));
        cImg.data[i + 1] = Math.max(0, Math.min(255, out.g * 255));
        cImg.data[i + 2] = Math.max(0, Math.min(255, out.b * 255));
        cImg.data[i + 3] = 255;
        const h = Math.max(0, Math.min(255, out.h * 255));
        bImg.data[i] = h;
        bImg.data[i + 1] = h;
        bImg.data[i + 2] = h;
        bImg.data[i + 3] = 255;
        const r = Math.max(0, Math.min(255, out.rough * 255));
        rImg.data[i] = r;
        rImg.data[i + 1] = r;
        rImg.data[i + 2] = r;
        rImg.data[i + 3] = 255;
      }
    }
    cctx.putImageData(cImg, 0, 0);
    bctx.putImageData(bImg, 0, 0);
    rctx.putImageData(rImg, 0, 0);
  }
  const wrap = (tex: THREE.CanvasTexture) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
  const map = wrap(new THREE.CanvasTexture(color));
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = wrap(new THREE.CanvasTexture(bump));
  const roughnessMap = wrap(new THREE.CanvasTexture(rough));
  return { map, bumpMap, roughnessMap, textures: [map, bumpMap, roughnessMap] };
}

// Grain runs along v (the log axis / the plank length); rings vary across u.
function makeWood(seed: number) {
  return makeSurface(256, (u, v, out) => {
    const warp = fbm2(u * 2.2, v * 0.7, 3, seed + 1);
    const ring = 0.5 + 0.5 * Math.sin((u * 14 + warp * 3 + v * 0.4) * Math.PI * 2);
    const streak = fbm2(u * 40, v * 6, 3, seed + 2);
    const blotch = fbm2(u * 6, v * 2, 2, seed + 3);
    const h = 0.55 * ring + 0.3 * streak + 0.15 * blotch;
    out.r = lerp(0.3, 0.64, h);
    out.g = lerp(0.19, 0.44, h);
    out.b = lerp(0.11, 0.26, h) * (0.9 + 0.2 * blotch);
    out.h = h;
    out.rough = 0.72 + 0.25 * (1 - h);
  });
}

// Six courses of five shingles, every other course shifted half a shingle,
// with a dark gap round each and a shadow band where the course above laps.
function makeShingles(seed: number) {
  const rows = 6;
  const cols = 5;
  return makeSurface(256, (u, v, out) => {
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const cx = u * cols + (row % 2) * 0.5;
    const col = Math.floor(cx);
    const fx = cx - col;
    const gap = fx < 0.035 || fx > 0.965 || fy > 0.96;
    const lap = 1 - smoothstep(0, 0.16, fy);
    const shade = 0.72 + 0.4 * hash2(col, row, seed);
    const grain = fbm2(u * 30, v * 8, 3, seed + 7);
    const base = (0.8 + 0.4 * grain) * shade;
    const k = gap ? 0.35 : 1 - 0.45 * lap;
    out.r = 0.36 * base * k;
    out.g = 0.29 * base * k;
    out.b = 0.26 * base * k + 0.02;
    out.h = gap ? 0 : (0.6 + 0.4 * grain) * shade * (1 - 0.3 * lap);
    out.rough = 0.85 + 0.15 * grain;
  });
}

// Voronoi cells on a wrapped grid so the tile is seamless: each cell is one
// stone, the ridges between cells are mortar.
function makeStone(seed: number) {
  const n = 5;
  const pts: { x: number; y: number }[] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      pts.push({
        x: (i + 0.2 + 0.6 * hash2(i, j, seed)) / n,
        y: (j + 0.2 + 0.6 * hash2(i, j, seed + 9)) / n,
      });
    }
  }
  return makeSurface(256, (u, v, out) => {
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    const ci = Math.floor(u * n);
    const cj = Math.floor(v * n);
    for (let dj = -1; dj <= 1; dj += 1) {
      for (let di = -1; di <= 1; di += 1) {
        const ii = (ci + di + n) % n;
        const jj = (cj + dj + n) % n;
        const p = pts[jj * n + ii];
        let dx = Math.abs(p.x - u);
        let dy = Math.abs(p.y - v);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = jj * n + ii;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    const inside = smoothstep(0.012, 0.05, d2 - d1);
    const tone = 0.55 + 0.35 * hash2(id, 3, seed + 5);
    const grit = fbm2(u * 22, v * 22, 3, seed + 6);
    const stone = tone * (0.85 + 0.3 * grit);
    out.r = lerp(0.2, 0.47 * stone, inside);
    out.g = lerp(0.17, 0.44 * stone, inside);
    out.b = lerp(0.16, 0.43 * stone, inside);
    out.h = inside * (0.7 + 0.3 * grit);
    out.rough = 0.9 + 0.1 * grit;
  });
}

// Grass grain for the terrain bump only; the colour comes from the vertices.
function makeGrassBump(seed: number) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py += 1) {
      for (let px = 0; px < size; px += 1) {
        const u = px / size;
        const v = py / size;
        const h = fbm2(u * 24, v * 24, 4, seed);
        const i = (py * size + px) * 4;
        img.data[i] = h * 255;
        img.data[i + 1] = h * 255;
        img.data[i + 2] = h * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  return tex;
}

function makeSmokeTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3(1, 1, 1);

function place(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  tmpEuler.set(rx, ry, rz);
  tmpQuat.setFromEuler(tmpEuler);
  tmpPos.set(x, y, z);
  tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.applyMatrix4(tmpMatrix);
  return g;
}

// A box whose texture keeps a fixed metre scale on every face instead of
// stretching one tile over each side.
function texturedBox(w: number, h: number, d: number, texScale: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f += 1) {
    const [du, dv] = dims[f];
    for (let k = 0; k < 4; k += 1) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * du) / texScale, (uv.getY(i) * dv) / texScale);
    }
  }
  return geo;
}

// A log lying along x (or z), grain along its length.
function logGeometry(length: number, axis: "x" | "z", radius = LOG_R) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 10, 1);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i), uv.getY(i) * length);
  }
  if (axis === "x") geo.rotateZ(Math.PI / 2);
  else geo.rotateX(Math.PI / 2);
  return geo;
}

function mergeAll(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------

type TreeBuild = Awaited<ReturnType<WeepingCherryGenerator["generate"]>>;

type Smoke = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  phase: number;
  driftX: number;
  driftZ: number;
  life: number;
};

function yieldFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function createHutScene(
  canvas: HTMLCanvasElement,
  options: {
    quality: Quality;
    seed: number;
    reducedMotion?: boolean;
    /**
     * Land only: the terrain and the two ranges behind it, with no hut, no
     * cherry trees, no path, no boulders and no fallen petals. The home
     * page's hero uses it that way — the site's own cherry tree stands in
     * front of the hills, and a second pair of trees and a cabin behind it
     * would be a different picture.
     */
    bare?: boolean;
  },
): HutScene {
  const quality = options.quality;
  const bare = options.bare === true;
  const seed = options.seed | 0;
  const reducedMotion = options.reducedMotion === true;
  const rng = makeRng(seed);

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== "low",
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    console.warn("hutScene: WebGL unavailable", error);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_NEAR, 16 / 9, 0.3, 2500);
  const lookAt = new THREE.Vector3();
  const disposables: { dispose: () => void }[] = [];
  const smokes: Smoke[] = [];
  const trees: TreeBuild[] = [];

  let width = Math.max(1, canvas.clientWidth || 1440);
  let height = Math.max(1, canvas.clientHeight || 900);
  let built = false;
  let disposed = false;
  let running = false;
  let raf = 0;
  let dirty = true;
  let targetProgress = reducedMotion ? STATIC_PROGRESS : 0;
  let progress = targetProgress;
  let progressVel = 0;
  let lastFrameMs = 0;
  let lastRenderMs = -Infinity;
  // The last moment something asked for a new frame. Drives the idle policy.
  let lastWakeMs = 0;
  // Multiplies the pixel ratio; see setRenderScale.
  let renderScale = 1;
  let windTime = 0;
  let windAtLastRender = 0;

  // The drawing buffer: the CSS box times the capped device ratio times the
  // caller's render scale.
  function applyBufferSize() {
    if (!renderer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * renderScale;
    renderer.setPixelRatio(Math.max(RENDER_SCALE_MIN * 0.5, dpr));
    renderer.setSize(width, height, false);
  }

  if (renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Nothing that casts a shadow moves, so one shadow pass is enough.
    renderer.shadowMap.autoUpdate = false;
    applyBufferSize();
    renderer.setClearColor(new THREE.Color(FOG_COLOR), 1);
  }

  scene.fog = new THREE.Fog(new THREE.Color(FOG_COLOR), 40, 620);

  // ---- lights ------------------------------------------------------------
  const sun = new THREE.DirectionalLight(new THREE.Color(SUN_COLOR), 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(70);
  sun.target.position.set(0, 1, 0);
  sun.castShadow = true;
  const shadowSize = quality === "low" ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  // A sun this low skims the ground; the normal bias stops the acne that
  // grazing light puts on the terrain.
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(
    new THREE.Color(HEMI_SKY),
    new THREE.Color(HEMI_GROUND),
    // Raised from 0.75: this and the sky fill below are the ONLY light on
    // anything facing the camera, the sun being behind the valley.
    1.45,
  );
  scene.add(hemi);

  // Warm light from the windows. No shadows: it lives inside the walls and
  // is meant to spill onto the porch, and a shadowed point light costs six
  // depth passes.
  // Both window lights belong to the hut, so in `bare` mode they are two
  // amber lamps hanging in mid-air over an empty clearing — which is where
  // the last of the warm cast on the ground was coming from.
  const lamp = new THREE.PointLight(new THREE.Color(WINDOW_COLOR), 12, 10, 2);
  lamp.position.set(0, 1.5, FRONT_Z - 0.3);
  if (!bare) scene.add(lamp);

  // The sun is behind the hut, so nothing facing the camera gets any direct
  // light, and a hemisphere light gives a vertical face only the halfway mix
  // of sky and ground - which, once the diffuse term divides by pi, is close
  // enough to black that the door, jambs, posts and porch read as a hole in
  // the wall. This is the rose sky put back as a fill: from the front and a
  // little above, dim, no shadow map, so the front of the hut reads as wood
  // at dusk instead of as a silhouette.
  const skyFill = new THREE.DirectionalLight(new THREE.Color(SKY_HORIZON), 2.1);
  skyFill.position.set(8, 5, 26);
  skyFill.target.position.set(0, 1.4, 0);
  scene.add(skyFill, skyFill.target);

  // The window glow actually spilling onto the porch. `lamp` above is 0.3 m
  // inside the wall, so every +z face is behind it and gets nothing; this one
  // hangs in front of the door, warm and weak enough to stay dusk.
  const porchLight = new THREE.PointLight(new THREE.Color(WINDOW_COLOR), 4, 7, 2);
  porchLight.position.set(0, 2.3, DOOR_Z + 0.7);
  if (!bare) scene.add(porchLight);

  // ---- sky -----------------------------------------------------------------
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(SKY_TOP) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color(SUN_GLOW) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Rose in a band on the horizon, plum from ~30 degrees up.
        float t = pow(smoothstep(-0.02, 0.55, h), 0.7);
        vec3 col = mix(uHorizon, uTop, t);
        float s = max(dot(d, uSunDir), 0.0);
        // A broad warm glow that spills above the ranges plus the disc itself,
        // which sits behind them.
        col += uSunColor * (0.35 * pow(s, 8.0) + 1.5 * pow(s, 200.0));
        // Under the horizon the sky is hidden by terrain; keep it near the fog.
        col = mix(col, uHorizon * 0.55, 1.0 - smoothstep(-0.25, 0.0, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  // 96 x 48, not 32 x 16. The sky's direction is computed per VERTEX and
  // interpolated across each face, and a linear interpolation of a direction
  // is not a direction — over a 32-segment sphere the error is large enough
  // to paint broad vertical bands down the sky, which on the television's
  // glass came out as raster streaks. Three times the segments makes the
  // error invisible and costs a few thousand triangles on one mesh.
  const skyGeometry = new THREE.SphereGeometry(900, 96, 48);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);
  disposables.push(skyGeometry, skyMaterial);

  // ---- materials -----------------------------------------------------------
  const wood = makeWood(seed + 11);
  const shingles = makeShingles(seed + 22);
  const stone = makeStone(seed + 33);
  const grassBump = makeGrassBump(seed + 44);
  const smokeTexture = makeSmokeTexture();
  disposables.push(...wood.textures, ...shingles.textures, ...stone.textures, grassBump, smokeTexture);

  const woodMaterial = new THREE.MeshStandardMaterial({
    map: wood.map,
    bumpMap: wood.bumpMap,
    bumpScale: 0.02,
    roughnessMap: wood.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  // Door, frames, posts, porch: the same grain, weathered darker. The tint
  // is a shade lighter than the wall logs rather than much darker - these
  // parts all face the camera, away from the sun, and at dusk a dark tint on
  // top of an already dark grain map leaves no wood to see.
  const darkWoodMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#8f7a66"),
    map: wood.map,
    bumpMap: wood.bumpMap,
    bumpScale: 0.015,
    roughnessMap: wood.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  const shingleMaterial = new THREE.MeshStandardMaterial({
    map: shingles.map,
    bumpMap: shingles.bumpMap,
    bumpScale: 0.03,
    roughnessMap: shingles.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: stone.map,
    bumpMap: stone.bumpMap,
    bumpScale: 0.04,
    roughnessMap: stone.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  // Chinking between the logs and the gable infill: without it the slits
  // between round logs show straight through the hut.
  const chinkMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#3a2f2a"),
    roughness: 1,
    metalness: 0,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(WINDOW_COLOR),
    emissive: new THREE.Color(WINDOW_COLOR),
    emissiveIntensity: 2.6,
    roughness: 0.4,
    metalness: 0,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#2a2622"),
    roughness: 0.5,
    metalness: 0.8,
  });
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    bumpMap: grassBump,
    bumpScale: 0.05,
    roughness: 1,
    metalness: 0,
  });
  const rangeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  disposables.push(
    woodMaterial,
    darkWoodMaterial,
    shingleMaterial,
    stoneMaterial,
    chinkMaterial,
    windowMaterial,
    metalMaterial,
    terrainMaterial,
    rangeMaterial,
  );

  function addMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    shadows: { cast?: boolean; receive?: boolean } = { cast: true, receive: true },
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadows.cast === true;
    mesh.receiveShadow = shadows.receive === true;
    scene.add(mesh);
    disposables.push(geometry);
    return mesh;
  }

  // ---- terrain -------------------------------------------------------------
  function buildTerrain() {
    const size = 320;
    const centerZ = -50;
    const seg = quality === "low" ? 96 : quality === "medium" ? 144 : 192;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, centerZ);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i), seed));
    }
    geo.computeVertexNormals();
    const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Plum and mauve rather than the two greens and the warm grey this had.
    // Grass under a blossom sky is still grass, but a literal olive next to
    // the page's pinks is the one thing in the frame that looks borrowed.
    const grassA = new THREE.Color("#4e3049");
    const grassB = new THREE.Color("#7a4d6c");
    const rock = new THREE.Color("#6e5c72");
    const carpet = new THREE.Color("#d9a2bf");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const slope = 1 - nor.getY(i);
      const patch = fbm2(x * 0.08, z * 0.08, 3, seed + 60);
      c.copy(grassA).lerp(grassB, patch);
      c.lerp(rock, smoothstep(0.3, 0.6, slope));
      // Fallen petals under each tree: a pale pink carpet thinning outward.
      for (const spot of bare ? [] : TREE_SPOTS) {
        const r = Math.hypot(x - spot.x, z - spot.z) / (4.2 * spot.scale);
        const fall = (1 - smoothstep(0.35, 1.1, r)) * (0.45 + 0.55 * fbm2(x * 0.9, z * 0.9, 2, seed + 61));
        c.lerp(carpet, fall * 0.7);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    addMesh(geo, terrainMaterial, { cast: false, receive: true });
  }

  // A distant range: a strip whose crests come from ridged noise, dropping
  // to nothing at its front and back edges so it sits down into the fog.
  function buildRange(opts: {
    width: number;
    depth: number;
    centerZ: number;
    amp: number;
    base: number;
    freq: number;
    snowLine: number;
    rangeSeed: number;
  }) {
    const segX = quality === "low" ? 110 : 180;
    const segZ = quality === "low" ? 30 : 44;
    const geo = new THREE.PlaneGeometry(opts.width, opts.depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, opts.centerZ);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nz = (z - opts.centerZ) / opts.depth + 0.5;
      const envelope = Math.pow(Math.sin(Math.max(0, Math.min(1, nz)) * Math.PI), 0.8);
      const r = ridged2(x * opts.freq, z * opts.freq, 4, opts.rangeSeed);
      const big = 0.55 + 0.7 * fbm2(x * opts.freq * 0.25, z * opts.freq * 0.25, 2, opts.rangeSeed + 5);
      // Pow 2.1, not 1.5. The exponent is what sharpens a ridge: the higher
      // it is the more the range sits low and throws up a few real summits
      // instead of rolling along at half height everywhere, which is what
      // made these read as a flat band on the horizon.
      const h = opts.base + opts.amp * Math.pow(r, 2.1) * big * envelope;
      pos.setY(i, h - 6);
    }
    geo.computeVertexNormals();
    const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // These ranges sit at z -200 and -400 with the sun BEHIND them, so the
    // only light on the faces the camera sees is the hemisphere and the sky
    // fill — and the fog in front of them takes most of what is left. Their
    // albedo has to start high or the lower half of every range comes back as
    // a dark band you cannot separate from the hillsides in front of it.
    const rockA = new THREE.Color("#8d8299");
    const rockB = new THREE.Color("#b8aabe");
    const snow = new THREE.Color("#fbf2f8");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i) + 6;
      const slope = 1 - nor.getY(i);
      const n = fbm2(x * 0.02, z * 0.02, 3, opts.rangeSeed + 9);
      c.copy(rockA).lerp(rockB, n);
      // Snow above a wobbly line, but not on faces too steep to hold it.
      const line = opts.snowLine * opts.amp * (0.85 + 0.3 * n);
      const snowy = smoothstep(line - 6, line + 6, y) * (1 - smoothstep(0.45, 0.7, slope));
      c.lerp(snow, snowy);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    addMesh(geo, rangeMaterial, { cast: false, receive: false });
  }

  // ---- the hut -------------------------------------------------------------
  function buildHut() {
    const logs: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    const roof: THREE.BufferGeometry[] = [];
    const stones: THREE.BufferGeometry[] = [];
    const chink: THREE.BufferGeometry[] = [];
    const panes: THREE.BufferGeometry[] = [];

    const halfW = HUT_W / 2;
    const halfD = HUT_D / 2;
    const overhang = 0.3;

    // Front and back walls: nine courses along x. Side walls: eight courses
    // along z, half a log higher, so the corners cross like a saddle notch.
    const frontLog = logGeometry(HUT_W + overhang * 2, "x");
    const sideLog = logGeometry(HUT_D + overhang * 2, "z");
    for (let i = 0; i < 9; i += 1) {
      const y = BASE_TOP + LOG_R + i * LOG_STEP;
      logs.push(place(frontLog, 0, y, halfD));
      logs.push(place(frontLog, 0, y, -halfD));
    }
    for (let i = 0; i < 9; i += 1) {
      const y = BASE_TOP + LOG_STEP + i * LOG_STEP;
      logs.push(place(sideLog, halfW, y, 0));
      logs.push(place(sideLog, -halfW, y, 0));
    }
    frontLog.dispose();
    sideLog.dispose();
    // Gable courses, each cut so its top stays under the roof line.
    for (let j = 1; j <= 4; j += 1) {
      const y = WALL_TOP + j * LOG_STEP;
      const half = Math.max(0.3, (halfW * (RIDGE_Y - y - LOG_R)) / RIDGE_RISE);
      const g = logGeometry(half * 2, "x");
      logs.push(place(g, 0, y, halfD));
      logs.push(place(g, 0, y, -halfD));
      g.dispose();
    }

    // Chinking box inside the walls and a triangle behind each gable.
    chink.push(place(new THREE.BoxGeometry(HUT_W - 0.06, EAVE_Y - BASE_TOP, HUT_D - 0.06), 0, (EAVE_Y + BASE_TOP) / 2, 0));
    const gable = new THREE.Shape();
    gable.moveTo(-halfW + 0.03, WALL_TOP - 0.1);
    gable.lineTo(halfW - 0.03, WALL_TOP - 0.1);
    gable.lineTo(halfW - 0.03, EAVE_Y - 0.05);
    gable.lineTo(0, RIDGE_Y - 0.05);
    gable.lineTo(-halfW + 0.03, EAVE_Y - 0.05);
    gable.closePath();
    const gableGeo = new THREE.ShapeGeometry(gable);
    chink.push(place(gableGeo, 0, 0, halfD - 0.08));
    chink.push(place(gableGeo, 0, 0, -halfD + 0.08, 0, Math.PI, 0));
    gableGeo.dispose();

    // Roof: two shingled slabs meeting at the ridge, reaching over the porch.
    const pitch = Math.atan2(RIDGE_RISE, halfW);
    const slopeHalf = halfW + ROOF_OVERHANG;
    const slopeLen = Math.hypot(slopeHalf, RIDGE_RISE * (slopeHalf / halfW));
    const roofZ0 = -halfD - ROOF_OVERHANG;
    const roofZ1 = halfD + PORCH_D + ROOF_OVERHANG;
    const roofLen = roofZ1 - roofZ0;
    const roofMid = (roofZ0 + roofZ1) / 2;
    const slab = texturedBox(slopeLen, 0.12, roofLen, 1.1);
    const cx = slopeHalf / 2;
    const cy = RIDGE_Y - RIDGE_RISE * (cx / halfW) + 0.06;
    roof.push(place(slab, cx, cy, roofMid, 0, 0, -pitch));
    roof.push(place(slab, -cx, cy, roofMid, 0, 0, pitch));
    slab.dispose();
    dark.push(place(texturedBox(0.26, 0.16, roofLen, 0.5), 0, RIDGE_Y + 0.12, roofMid));

    // Chimney on the right slope, capped, tall enough to clear the ridge.
    const chimneyX = 1.1;
    const chimneyZ = -0.7;
    const roofAtChimney = RIDGE_Y - RIDGE_RISE * (chimneyX / halfW);
    const chimneyTop = RIDGE_Y + 0.55;
    stones.push(
      place(
        texturedBox(0.6, chimneyTop - roofAtChimney + 0.5, 0.6, 0.6),
        chimneyX,
        (chimneyTop + roofAtChimney - 0.5) / 2,
        chimneyZ,
      ),
    );
    stones.push(place(texturedBox(0.76, 0.14, 0.76, 0.6), chimneyX, chimneyTop + 0.07, chimneyZ));

    // Foundation sunk below the ground ripple.
    stones.push(place(texturedBox(HUT_W + 0.4, 0.5, HUT_D + 0.4, 0.7), 0, BASE_TOP - 0.25, 0));

    // Porch: plank deck on stone piers, two posts under the roof edge, a
    // header beam, side rails, two steps down.
    const porchZ = halfD + PORCH_D / 2;
    dark.push(place(texturedBox(HUT_W + 0.2, 0.12, PORCH_D + 0.05, 0.45), 0, PORCH_TOP - 0.06, porchZ));
    for (const px of [-1.9, 1.9]) {
      stones.push(place(texturedBox(0.3, 0.32, 0.3, 0.6), px, 0.1, halfD + PORCH_D - 0.2));
    }
    const postX = halfW - 0.2;
    const postZ = halfD + PORCH_D - 0.15;
    const roofAtPost = RIDGE_Y - RIDGE_RISE * (postX / halfW);
    const postH = roofAtPost - PORCH_TOP;
    for (const sx of [-1, 1]) {
      dark.push(place(texturedBox(0.16, postH, 0.16, 0.5), sx * postX, PORCH_TOP + postH / 2, postZ));
      dark.push(place(texturedBox(0.06, 0.08, PORCH_D - 0.2, 0.5), sx * postX, 1.15, halfD + PORCH_D / 2));
      dark.push(place(texturedBox(0.05, 1.0, 0.05, 0.5), sx * postX, PORCH_TOP + 0.5, halfD + PORCH_D / 2));
    }
    dark.push(place(texturedBox(postX * 2 + 0.16, 0.14, 0.14, 0.5), 0, roofAtPost - 0.07, postZ));
    const stepZ = halfD + PORCH_D;
    dark.push(place(texturedBox(1.4, 0.21, 0.36, 0.45), 0, 0.105, stepZ + 0.18));
    dark.push(place(texturedBox(1.4, 0.1, 0.36, 0.45), 0, 0.05, stepZ + 0.54));

    // Door with jambs, lintel and a handle.
    const doorY = PORCH_TOP + 0.975;
    dark.push(place(texturedBox(0.9, 1.95, 0.06, 0.45), 0, doorY, DOOR_Z));
    dark.push(place(texturedBox(0.1, 2.05, 0.1, 0.5), -0.5, doorY + 0.05, DOOR_Z));
    dark.push(place(texturedBox(0.1, 2.05, 0.1, 0.5), 0.5, doorY + 0.05, DOOR_Z));
    dark.push(place(texturedBox(1.1, 0.1, 0.1, 0.5), 0, doorY + 1.025, DOOR_Z));
    const handle = new THREE.SphereGeometry(0.04, 10, 8);
    addMesh(place(handle, 0.35, doorY - 0.05, DOOR_Z + 0.05), metalMaterial, { cast: false, receive: false });
    handle.dispose();

    // Two windows either side of the door: frame, glowing pane, mullions.
    for (const wx of [-1.3, 1.3]) {
      const wy = 1.6;
      dark.push(place(texturedBox(0.82, 0.92, 0.1, 0.5), wx, wy, DOOR_Z - 0.02));
      panes.push(place(new THREE.PlaneGeometry(0.7, 0.8), wx, wy, DOOR_Z + 0.035));
      dark.push(place(new THREE.BoxGeometry(0.04, 0.8, 0.03), wx, wy, DOOR_Z + 0.05));
      dark.push(place(new THREE.BoxGeometry(0.7, 0.04, 0.03), wx, wy, DOOR_Z + 0.05));
    }

    // Stone path from the steps toward the camera, wandering a little.
    const flag = new THREE.CylinderGeometry(0.36, 0.4, 0.1, 7);
    for (let i = 0; i < 10; i += 1) {
      const z = stepZ + 1.0 + i * 0.72 + (rng() - 0.5) * 0.15;
      const x = 0.35 * Math.sin(z * 0.55) + (rng() - 0.5) * 0.25;
      const g = place(flag, x, terrainHeight(x, z, seed) - 0.02, z, 0, rng() * Math.PI, 0);
      g.scale(0.8 + rng() * 0.5, 1, 0.8 + rng() * 0.5);
      stones.push(g);
    }
    flag.dispose();

    // A few boulders round the clearing, off the path and away from the door.
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI * 0.3 + rng() * Math.PI * 1.55;
      const radius = 8 + rng() * 9;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 2;
      const s = 0.4 + rng() * 0.8;
      const g = rockGeo.clone();
      const p = g.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k += 1) {
        const n = 0.75 + 0.5 * fbm2(p.getX(k) * 1.5 + i, p.getZ(k) * 1.5, 2, seed + 70);
        p.setXYZ(k, p.getX(k) * n, p.getY(k) * n * 0.7, p.getZ(k) * n);
      }
      g.computeVertexNormals();
      const placed = place(g, x, terrainHeight(x, z, seed) - 0.25 * s, z, 0, rng() * Math.PI, 0);
      placed.scale(s, s, s);
      g.dispose();
      stones.push(placed);
    }
    rockGeo.dispose();

    addMesh(mergeAll(logs), woodMaterial);
    addMesh(mergeAll(dark), darkWoodMaterial);
    addMesh(mergeAll(roof), shingleMaterial);
    addMesh(mergeAll(stones), stoneMaterial);
    addMesh(mergeAll(chink), chinkMaterial, { cast: false, receive: true });
    addMesh(mergeAll(panes), windowMaterial, { cast: false, receive: false });

    // Smoke: a handful of sprites cycling up out of the chimney.
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: smokeTexture,
        color: new THREE.Color("#cdb3c3"),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(chimneyX, chimneyTop + 0.2, chimneyZ);
      scene.add(sprite);
      disposables.push(material);
      smokes.push({
        sprite,
        material,
        phase: i / count,
        driftX: 0.25 + rng() * 0.2,
        driftZ: 0.1 + rng() * 0.15,
        life: 7 + rng() * 2,
      });
    }
    smokeBase.set(chimneyX, chimneyTop + 0.15, chimneyZ);
  }
  const smokeBase = new THREE.Vector3();

  function updateSmoke(t: number) {
    for (const s of smokes) {
      const age = ((t / s.life + s.phase) % 1) * s.life;
      const k = age / s.life;
      const wobble = Math.sin(t * 0.7 + s.phase * 9) * 0.15 * k;
      s.sprite.position.set(
        smokeBase.x + s.driftX * age + wobble,
        smokeBase.y + age * 0.55,
        smokeBase.z + s.driftZ * age,
      );
      const size = 0.45 + k * 2.2;
      s.sprite.scale.set(size, size, 1);
      // Fades in over the first tenth and out over the rest.
      s.material.opacity = 0.32 * smoothstep(0, 0.1, k) * (1 - smoothstep(0.25, 1, k));
    }
  }

  // ---- trees ---------------------------------------------------------------
  async function buildTrees() {
    const blossomCount = quality === "low" ? 3000 : 4000;
    const petalCount = quality === "low" ? 50 : 80;
    for (let i = 0; i < TREE_SPOTS.length; i += 1) {
      if (disposed) return;
      const spot = TREE_SPOTS[i];
      const generator = new WeepingCherryGenerator({
        seed: seed + 101 * (i + 1),
        quality,
        blossomCount,
        petalCount,
      });
      const tree = await generator.generate(yieldFrame);
      if (disposed) return;
      // generate() bakes the hero's placement into the group; this scene
      // has its own.
      tree.group.position.set(spot.x, terrainHeight(spot.x, spot.z, seed) - 0.1, spot.z);
      tree.group.rotation.set(0, spot.yaw, 0);
      tree.group.scale.setScalar(spot.scale);
      if (tree.branchMesh) {
        tree.branchMesh.castShadow = true;
        tree.branchMesh.receiveShadow = true;
      }
      const casters = quality === "low"
        ? [tree.blossomMesh]
        : [tree.blossomMesh, tree.lowBlossomMesh, tree.halfBlossomMesh, tree.budMesh];
      for (const m of casters) if (m) m.castShadow = true;
      scene.add(tree.group);
      trees.push(tree);
    }
  }

  function tickTrees(t: number, dt: number) {
    for (const tree of trees) {
      if (tree.branchWindUniforms) tree.branchWindUniforms.uWindTime.value = t;
      tree.petals?.update(dt, t, tree.branchWindUniforms?.uWindStrength.value ?? 1);
    }
  }

  // ---- camera ----------------------------------------------------------------
  const camPos = new THREE.Vector3();
  const trackHeight = buildTrackHeight(seed);
  function applyCamera() {
    const portrait = camera.aspect < 1;
    // Nothing scrubs under reduced motion, so the one still frame is chosen
    // here. A portrait canvas is a narrow slot: even with the wider field
    // below it sees far less across than a 16:9 one, so it stands closer to
    // the middle of the path than the landscape still does.
    const held = portrait ? PORTRAIT_STATIC_PROGRESS : STATIC_PROGRESS;
    const p = Math.max(-1, Math.min(1, reducedMotion ? held : progress));
    // One straight track (see TRACK_X and friends): x fixed, z sliding,
    // the height off the precomputed line, the aim a fixed distance ahead
    // and riding with the camera. Nothing here can step.
    const t = trackT(p);
    const s01 = t * t * (3 - 2 * t);
    camPos.set(TRACK_X, trackHeightAt(trackHeight, t), TRACK_Z_FROM + (TRACK_Z_TO - TRACK_Z_FROM) * t);
    const pitch = PITCH_FROM + (PITCH_TO - PITCH_FROM) * s01;
    lookAt.set(TRACK_X, camPos.y + Math.tan(pitch) * LOOK_AHEAD, camPos.z - LOOK_AHEAD);
    const fov = FOV_FAR + (FOV_PAST - FOV_FAR) * s01;
    camera.position.copy(camPos);
    camera.lookAt(lookAt);
    // fov is the VERTICAL angle, so a tall narrow canvas keeps the height and
    // loses the width: at 9:19.5 a 44 degree vertical field is only about 21
    // degrees across, which is a frame 8 m wide at the hut - the hut alone.
    // Widening by 1/sqrt(aspect) trades some of that height back for width
    // (about 64 degrees vertical, 13 m across on a phone) and is continuous
    // at aspect 1, so a window dragged narrow does not jump.
    camera.fov = portrait ? Math.min(PORTRAIT_FOV_MAX, fov / Math.sqrt(camera.aspect)) : fov;
    camera.updateProjectionMatrix();
    // Two panes at full glow directly behind the pale wordmark bars leave the
    // logo with nothing to read against. They are dim at the top of the page
    // and reach full glow by p=0.45, once the wordmark has gone.
    windowMaterial.emissiveIntensity = lerp(
      WINDOW_GLOW_NEAR,
      WINDOW_GLOW_FAR,
      smoothstep(0.08, 0.45, p),
    );
  }

  function render() {
    if (!renderer || disposed) return;
    applyCamera();
    renderer.render(scene, camera);
    dirty = false;
  }

  // Exact critically damped step, stable for any dt.
  function stepFollow(dt: number) {
    const dx = progress - targetProgress;
    const e = Math.exp(-FOLLOW_OMEGA * dt);
    const temp = (progressVel + FOLLOW_OMEGA * dx) * dt;
    progress = targetProgress + (dx + temp) * e;
    progressVel = (progressVel - FOLLOW_OMEGA * temp) * e;
    if (Math.abs(progress - targetProgress) < 1e-5 && Math.abs(progressVel) < 1e-4) {
      progress = targetProgress;
      progressVel = 0;
      return false;
    }
    return true;
  }

  function frame(nowMs: number) {
    raf = 0;
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    if (!built) return;
    const dt = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;
    const moving = stepFollow(dt);
    if (moving) lastWakeMs = nowMs;
    // Asleep: nothing has scrubbed for IDLE_SLEEP_MS and the camera has
    // stopped, so draw nothing at all. The wind clock is held where it is,
    // so the sway carries on from there rather than jumping when the next
    // setProgress() wakes us. The rAF loop keeps ticking - it is a handful
    // of comparisons - so waking costs one frame.
    if (!moving && !dirty && nowMs - lastWakeMs > IDLE_SLEEP_MS) return;
    windTime += dt;
    // A moving camera is capped at 60 even on a 120 Hz display; once it has
    // settled only the wind and the smoke move, and those get WIND_FPS.
    const minGap = dirty ? 0 : 1000 / (moving ? MOVING_FPS : WIND_FPS);
    if (nowMs - lastRenderMs < minGap) return;
    const renderDt = Math.min(0.1, windTime - windAtLastRender);
    windAtLastRender = windTime;
    lastRenderMs = nowMs;
    tickTrees(windTime, renderDt);
    updateSmoke(windTime);
    render();
  }

  // ---- build -------------------------------------------------------------------
  const ready = (async () => {
    if (!renderer) return;
    try {
      buildTerrain();
      await yieldFrame();
      buildRange({
        width: 900,
        depth: 170,
        centerZ: -200,
        amp: 120,
        base: 10,
        freq: 0.0075,
        snowLine: 0.55,
        rangeSeed: seed + 80,
      });
      buildRange({
        width: 1700,
        depth: 280,
        centerZ: -400,
        amp: 265,
        base: 25,
        freq: 0.0042,
        snowLine: 0.45,
        rangeSeed: seed + 90,
      });
      if (!bare) {
        await yieldFrame();
        buildHut();
        await yieldFrame();
        await buildTrees();
      }
      if (disposed) return;
      built = true;
      renderer.shadowMap.needsUpdate = true;
      tickTrees(0, 0);
      updateSmoke(0);
      render();
    } catch (error) {
      console.warn("hutScene: build failed", error);
      built = true;
    }
  })();

  function disposeTree(tree: TreeBuild) {
    const seen = new Set<THREE.Material | THREE.Texture>();
    tree.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) {
        if (seen.has(m)) continue;
        seen.add(m);
        const withMaps = m as THREE.Material & { map?: THREE.Texture | null; roughnessMap?: THREE.Texture | null };
        for (const tex of [withMaps.map, withMaps.roughnessMap]) {
          if (tex && !seen.has(tex)) {
            seen.add(tex);
            tex.dispose();
          }
        }
        m.dispose();
      }
    });
  }

  return {
    ready,
    setProgress(p) {
      if (reducedMotion) return;
      targetProgress = Math.max(-1, Math.min(1, p));
      // Whatever else happens, this is the page asking for a frame: wake the
      // loop if it had gone to sleep.
      lastWakeMs = performance.now();
      if (!running) {
        // Nothing is stepping the follow, so land on the value directly.
        progress = targetProgress;
        progressVel = 0;
        dirty = true;
      }
    },
    resize(cssWidth, cssHeight) {
      width = Math.max(1, Math.round(cssWidth));
      height = Math.max(1, Math.round(cssHeight));
      if (!renderer) return;
      applyBufferSize();
      camera.aspect = width / height;
      dirty = true;
      lastWakeMs = performance.now();
      if (built && !running) render();
    },
    setRenderScale(scale) {
      const next = Math.max(RENDER_SCALE_MIN, Math.min(1, Number.isFinite(scale) ? scale : 1));
      if (next === renderScale) return;
      renderScale = next;
      if (!renderer) return;
      applyBufferSize();
      dirty = true;
      lastWakeMs = performance.now();
      if (built && !running) render();
    },
    start() {
      if (disposed || running) return;
      if (reducedMotion) {
        // One still frame; no wind, no dolly.
        if (built) render();
        return;
      }
      running = true;
      lastFrameMs = performance.now();
      lastWakeMs = lastFrameMs;
      lastRenderMs = -Infinity;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    renderOnce() {
      if (!built) return;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const tree of trees) disposeTree(tree);
      for (const d of disposables) d.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    },
  };
}
