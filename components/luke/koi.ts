import type { CanvasSource } from "@/components/valley/barShader";

/**
 * Two big koi swimming down the left of the work section: what stands in
 * for lukebaffait.fr's red brush stroke. They are drawn into a plain 2D
 * canvas that the bar shader reads (CanvasSource), so they come out in the
 * same pink bars as the flower on the statement band above.
 *
 * The fish is one photograph (public/work/koi.png: Pexels photo 32351119,
 * pexels.com/photo/colorful-koi-fish-swimming-in-clear-water-32351119, a
 * single koi seen from above, cut out and turned to face right). Each koi
 * is drawn as thin slices from head to tail, every slice placed on the path
 * a little further back than the one before it and turned to the path's
 * direction there, so a koi bends round the curves it swims.
 *
 * Where the fish are is where the section is on screen (`setPlace`). The
 * path is lukebaffait's stroke (PATH), laid on the section exactly as his
 * is laid on his #projects, so it scrolls with the page. The lead's head
 * is his line's tip: it goes along the path at one speed through the same
 * stretch of scroll (his ScrollTrigger: ease none, from the section's top
 * at 70% of the screen to its bottom at 20%), and trails the scroll as his
 * does (scrub 1): every frame it closes a fixed share of what is left
 * between it and the tip, a follow with a time constant of FOLLOW
 * seconds that is never restarted. (It was a one-second expo catch-up
 * restarted from zero at every scroll step; Lenis moves the page every
 * frame, so the step came a millisecond before the draw and the head
 * moved a fraction of a percent a frame: nothing while scrolling, then
 * the fish arrived once the page stood still.) How hard the tail beats,
 * and how big the wake is, follow how fast they are going. When the
 * scroll stops they glide to a stop; nothing moves on its own.
 *
 * The second koi follows the first a little under a body length behind,
 * drifting slowly from one side of its line to the other as it goes, the
 * way a following fish does, not locked to a fixed offset. It is a little
 * darker than the first (DARKER).
 */

export type Hole = { x: number; y: number; w: number; h: number };

/** How soft a hole's edge is, as a share of the canvas width. */
const HOLE_SOFT = 0.025;

export type KoiPair = {
  source: CanvasSource;
  /** Where the section's top and the koi canvas's top are on screen, px.
   *  `swim`, when given, is the section top the fish are timed off instead
   *  of `top`: the path stays where `top` puts it and the fish go on along
   *  it (WorkIndex's hold, where the page stands still and they swim off). */
  setPlace(top: number, canvasTop: number, swim?: number): void;
  /** The box round both fish on the screen, px, placed as
   *  setPlace(top, _, swim) places them, with the lead on the tip: from
   *  the furthest left of their spines to the furthest right, on or off
   *  the screen, and from the highest of them less half the photo's height
   *  (fins and all) to the lowest plus it. */
  extent(top: number, swim: number): { left: number; right: number; top: number; bottom: number };
  /** For a stage that runs the fish off a progress of its own (the /t
   *  designs): 0..1 through the swim, with the canvas held at the top. */
  setProgress(p: number): void;
  /** Where the names are, in screen px, read every frame the fish move. */
  setHoles(fn: () => Hole[]): void;
  /** Whether the bars are darker than the ground they are on (plum on the
   *  cloud's pink) or lighter (pink on plum), so the darker fish stays the
   *  darker one either way. */
  setInkDark(dark: boolean): void;
  /** The screen's shape changed. */
  resize(width: number, height: number): void;
};

/**
 * lukebaffait.fr's red stroke in his own units: a start point and then
 * four cubic Béziers (two controls and an end each). Source: #fluid-line
 * in lukebaffait.fr/index.html,
 *   M -80,0 C 300,-20 600,150 540,400 C 490,650 0,655 300,1050
 *   C 600,1385 650,1250 850,1200 C 1050,1150 1350,1250 1540,1300
 * in a 1400 x 1400 viewBox drawn "xMidYMid slice" (styles/index.css,
 * .fluid-line-svg) into a box 100vw wide and his section's height plus
 * 100vh tall, 30vh above the section's top. His #projects is 1.4 screens
 * tall (20vh padding each end round a 100vh list), so the box is 2.4.
 * build() does the slice for the screen at hand, so this is his curve at
 * every shape of screen; Béziers stay Béziers under it.
 *
 * One change to his points: the third curve's first control was 600,1385,
 * 450 units out along the hairpin's exit, so the fish left the hairpin on
 * a straight diagonal (radius 3 fish lengths) and only turned at the
 * bottom of the swoop (radius 0.3). It is 433,1225 now: the same
 * direction, 220 units out, so the exit is one even arc (radius 0.6 to
 * 0.9 of a fish) from the hairpin round to the level run. The tangent at
 * 300,1050 is unchanged, so the hairpin itself is as it was.
 */
const PATH: [number, number][] = [
  [-80, 0],
  [300, -20], [600, 150], [540, 400],
  [490, 650], [0, 655], [300, 1050],
  [433, 1225], [650, 1250], [850, 1200],
  [1050, 1150], [1350, 1250], [1540, 1300],
];
const VIEWBOX = 1400;
/** His box: its top from the section's top, and its height, in screens.
 *  His top is -0.3; a tenth of a screen higher here (user). */
const BOX_TOP = -0.4;
const BOX_H = 2.4;
/** His line draws from the section's top at 70% of the screen to its
 *  bottom at 20%: 0.7 + 1.4 - 0.2 = 1.9 screens of scroll. The fish swim
 *  from the section's top at 1.1 screens (just under the bottom of the
 *  screen) over 2.5 screens of scroll: a little earlier and a third
 *  slower than his line, which keeps them further inside the screen. On
 *  his timing the lead was on the first crest with the crest 30 px above
 *  the top of the screen and on the hairpin with the hairpin's foot at
 *  the bottom edge. They still cross the edge now and then: a fish is
 *  0.62 of the screen's width long and the stroke's hairpin drops it
 *  nearly vertical, so a whole fish does not fit the screen's height
 *  there at any timing (searched over the start and run at 1920 x 1080:
 *  the least any timing leaves outside is about 360 px, on this one).
 *  Smaller fish, or a flatter stroke, would be the only way to never
 *  cross. What is fixed: the fish are never cut by the CANVAS — its track
 *  (WorkIndex.tsx) now covers the whole swim. */
const DRAW_FROM = 1.1;
const DRAW_RUN = 2.5;
/** The follow's time constant, seconds: about what his scrub of 1 s on
 *  GSAP's expo ease comes to (1 / (10 ln 2) = 0.14 s), settled within a
 *  second. */
const FOLLOW = 0.16;
/** The stroke's leftmost point stays at least this far in from the left
 *  edge, in fish widths, so the fish on the dip are whole on screen. His
 *  slice puts the dip 40 px from the edge at 16:9, half a fish off it, and
 *  past the edge on anything narrower; the curve is slid right by what
 *  that takes and nothing else about it changes. */
const EDGE_ROOM = 0.6;
/**
 * The fish's length, as a share of the width. The stroke is drawn as Luke
 * draws it at every width, x in widths and y in heights, so a big window
 * is a small one scaled up. On that stroke a fish 0.72 of the width long
 * at 960 x 460 (six times the tightest turn's radius) bends round it
 * cleanly; at 1920 x 1080 0.62 is about four times. What folded the fish
 * was squeezing the stroke into the left half, not their size.
 */
const FISH_W = 0.72;
const FISH_W_WIDE = 0.62;
/** A straight run off the start, in screen heights, so a whole fish is
 *  off screen before the stroke. */
const RUN_IN = 0.9;
/** How far the lead's head goes on past the stroke's end, straight on, in
 *  its own lengths: the follower's tail is then 0.28 of a length past the
 *  end, which is off the right edge at every shape of screen. The run was
 *  1.3 screen heights, but on a wide screen the two fish are 2.1 heights
 *  long, so they stopped with the follower's tail on the right edge (570
 *  px short at 1888 x 1020). */
const GONE = 1.9;

/** Slices per fish. */
const SLICES = 44;
/** Points sampled along the path. */
const SAMPLES = 2400;
/** One tail beat per this many body lengths swum: an unhurried koi. */
const STRIDE = 1.5;
/** The source canvas's width; its height follows the screen's shape. The
 *  bar grid is about 400 cells across, so 720 is still ~1.8 px a cell; it
 *  was 1280, and that canvas is redrawn and re-uploaded every frame. */
const SRC_W = 720;
/** The wake's arms, off the fish's line (drawWake). */
const ARM = Math.tan((9 * Math.PI) / 180);
/** The wake's thinnest mark, source px: a cell and a half. */
const MARK = 5.5;
/** The grey round each of the wake's marks, and how far out it goes:
 *  under the grade's no-bar point (WorkIndex's whitePoint, 40), so it
 *  draws nothing, but not black, so the bars beside it are kept. */
const FLOOR = 14;
const FLOOR_RING = 3;
const grey = (v: number): string => {
  const g = Math.round(Math.max(0, Math.min(255, v)));
  return `rgb(${g},${g},${g})`;
};
/**
 * The follower's tone: its greys put through this gamma. A bright part of
 * a fish draws a wide bar, so with plum bars on the pink the greys are
 * lifted (gamma under 1) and the fish comes out with about a sixth more
 * ink; with pink bars on plum they are lowered by the inverse, which takes
 * as much away.
 */
const DARKER = 0.72;

/** The sprite with its greys through `gamma`, alpha untouched. */
function toned(img: HTMLImageElement, gamma: number): CanvasImageSource {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return img;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) lut[v] = Math.round(255 * (v / 255) ** gamma);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  g.putImageData(data, 0, 0);
  return c;
}

export function createKoiPair(img: HTMLImageElement, screenW: number, screenH: number): KoiPair {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const IW = img.naturalWidth;
  const IH = img.naturalHeight;
  // The follower's sprite, for plum bars and for pink ones; made once each.
  const tones = new Map<boolean, CanvasImageSource>();
  let inkDark = true;
  const darker = (): CanvasImageSource => {
    let t = tones.get(inkDark);
    if (!t) {
      t = toned(img, inkDark ? DARKER : 1 / DARKER);
      tones.set(inkDark, t);
    }
    return t;
  };

  const W = SRC_W;
  let H = 540;
  /** The lead's length, in source px. */
  let L = 300;
  const px = new Float32Array(SAMPLES + 1);
  const py = new Float32Array(SAMPLES + 1);
  const along = new Float32Array(SAMPLES + 1);
  let total = 1;
  /** Where the head starts (Luke's first point) and ends (his last), and
   *  how much further than his 1.9 screens it goes on, at the same speed,
   *  so both fish can swim off. */
  let sFrom = 0;
  let sEnd = 1;
  let span = 1;
  /** Canvas px to a screen px. */
  let k = 1;

  const build = (sw: number, sh: number): void => {
    H = Math.round((SRC_W * sh) / Math.max(1, sw));
    canvas.width = W;
    canvas.height = H;
    L = W * (sw < 1024 ? FISH_W : FISH_W_WIDE);
    k = W / Math.max(1, sw);
    // PATH in canvas px down from the section's top, sliced into his box
    // as his SVG is: scaled to cover it and centred.
    const boxH = BOX_H * sh;
    const unit = Math.max(sw, boxH) / VIEWBOX;
    const x0 = (sw - VIEWBOX * unit) / 2;
    const y0 = BOX_TOP * sh + (boxH - VIEWBOX * unit) / 2;
    const pts = PATH.map(([x, y]) => [(x0 + unit * x) * k, (y0 + unit * y) * k] as [number, number]);
    // Slid right if the dip would run off the left edge (EDGE_ROOM). The
    // first Bézier is left out: it starts off the left edge on purpose,
    // where the fish swim in from.
    let leftmost = Infinity;
    for (let b = 1; b < (pts.length - 1) / 3; b += 1) {
      const [a, c1, c2, d] = [pts[3 * b], pts[3 * b + 1], pts[3 * b + 2], pts[3 * b + 3]];
      for (let i = 0; i <= 64; i += 1) {
        const t = i / 64;
        const u = 1 - t;
        leftmost = Math.min(leftmost, u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * d[0]);
      }
    }
    const room = EDGE_ROOM * ((L * IH) / IW);
    if (leftmost < room) for (const q of pts) q[0] += room - leftmost;
    // With a straight run on each end along the stroke's own direction
    // there.
    const n = (pts.length - 1) / 3;
    const ahead = (a: [number, number], b: [number, number], d: number): [number, number] => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [b[0] + ((b[0] - a[0]) / len) * d, b[1] + ((b[1] - a[1]) / len) * d];
    };
    const first = ahead(pts[1], pts[0], RUN_IN * H);
    const last = ahead(pts[pts.length - 2], pts[pts.length - 1], GONE * L);
    // Pieces: run in, n Béziers, run out; SAMPLES shared out evenly.
    const pieces = n + 2;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const g = (i / SAMPLES) * pieces;
      const k = Math.min(pieces - 1, Math.floor(g));
      const t = g - k;
      let x: number;
      let y: number;
      if (k === 0) {
        x = first[0] + (pts[0][0] - first[0]) * t;
        y = first[1] + (pts[0][1] - first[1]) * t;
      } else if (k === pieces - 1) {
        const e = pts[pts.length - 1];
        x = e[0] + (last[0] - e[0]) * t;
        y = e[1] + (last[1] - e[1]) * t;
      } else {
        const [a, b, c, d] = [pts[3 * k - 3], pts[3 * k - 2], pts[3 * k - 1], pts[3 * k]];
        const u = 1 - t;
        x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
        y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
      }
      px[i] = x;
      py[i] = y;
      along[i] = i === 0 ? 0 : along[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    }
    total = along[SAMPLES];
    // The lead's head runs from where Luke's stroke starts (off the left)
    // to the end of the run past where it ends (off the right), GONE
    // lengths on, so both fish are gone.
    sFrom = along[Math.round(SAMPLES / pieces)];
    sEnd = along[Math.round((SAMPLES * (pieces - 1)) / pieces)];
    span = (total - sFrom) / Math.max(1, sEnd - sFrom);
  };

  const out = { x: 0, y: 0, a: 0 };
  const at = (s: number): typeof out => {
    const d = Math.max(0, Math.min(total, s));
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (along[mid] < d) lo = mid;
      else hi = mid;
    }
    const seg = along[hi] - along[lo] || 1;
    const f = (d - along[lo]) / seg;
    out.x = px[lo] + (px[hi] - px[lo]) * f;
    out.y = py[lo] + (py[hi] - py[lo]) * f;
    out.a = Math.atan2(py[hi] - py[lo], px[hi] - px[lo]);
    return out;
  };

  // Where the section is (its top, and the canvas's, in screen px); the
  // lead's head and where it is making for (his line's tip); how fast it
  // is going (smoothed, in body lengths a second) and how far through the
  // beat.
  let top = 0;
  let swim = 0;
  let canvasTop = 0;
  let head = 0;
  let to = 0;
  let speed = 0;
  let beat = 0;
  let view = 0;
  let dirty = true;

  /** The two fish: lag behind the lead and length, in lead lengths; the
   *  follower is the darker one. */
  const FISH = [
    { lag: 0, size: 1, phase: 0, dark: false, side: (): number => 0 },
    { lag: 0.78, size: 0.84, phase: 2.1, dark: true, side: (s: number): number => 0.16 + 0.09 * Math.sin(s / (1.9 * L)) },
  ];
  type Fish = (typeof FISH)[number];

  /** A point `off` px to the left of the path at distance s. */
  const place = (s: number, side: number, off: number): { x: number; y: number; a: number } => {
    const p = at(s);
    const o = side * L + off;
    return { x: p.x - Math.sin(p.a) * o, y: p.y + Math.cos(p.a) * o, a: p.a };
  };

  const drawFish = (f: Fish): void => {
    if (!ctx) return;
    const len = L * f.size;
    const tall = (len * IH) / IW;
    const s0 = head - f.lag * L;
    const side = f.side(s0);
    // A fish swimming hard beats wide; a gliding one barely at all.
    const drive = 0.3 + 0.55 * Math.min(1, speed / 1.8);
    const sw = IW / SLICES;
    const step = len / SLICES;
    const sprite = f.dark ? darker() : img;
    for (let k = 0; k < SLICES; k += 1) {
      const u = (k + 0.5) / SLICES; // 0 at the head, 1 at the tail
      // Carp swim with the front third nearly rigid and the wave growing
      // toward the tail, about one body length long.
      const env = 0.015 + 0.11 * Math.pow(u, 2.2);
      const ph = beat + f.phase - u * Math.PI * 2 * 0.95;
      const wave = Math.sin(ph) * env * len * drive;
      const slope = Math.cos(ph) * env * Math.PI * 2 * 0.95 * drive;
      const q = place(s0 - u * len, side, wave);
      ctx.setTransform(1, 0, 0, 1, 0, -view);
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a + slope);
      ctx.drawImage(sprite, IW - (k + 1) * sw, 0, sw, IH, -step / 2 - 1, -tall / 2, step + 2, tall);
    }
  };

  // Fixed positions in the water for the wake's flecks (keyed by how far
  // along the path they are), so a fish swims away from them.
  const hash = (n: number): number => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // The wake: what a koi leaves swimming just under the surface. A
  // narrow trail down the line it swam, smoothed water a little wider
  // than its tail's beat; either side of it a V of short crests, one
  // behind and outside the next, opening at ARM; and where its tail
  // swung furthest out, a swirl, to one side and then the other. All of
  // it fixed in the water where it was made, so the fish swims away from
  // it, and as bright and as long as the fish is fast.
  //
  // Faint: its strongest crest is about a quarter of a bar, and at full
  // speed it runs a body length behind the tail. At three quarters of a
  // bar and 1.4 lengths it read as drawn on the water, not as the water.
  //
  // Every mark is at least MARK wide, on a ring of FLOOR: the bars read
  // one point a cell (3.6 px of this canvas, at WorkIndex's 200 across)
  // and drop a cell with black within two px of that point (barShader.ts,
  // NEIGHBOUR_RADIUS), and the hairlines it was drawn in before came out
  // as a few specks. The arms were 19.5 degrees then, a boat's wake in
  // open water: on a fish, a wide fan.
  const drawWake = (f: Fish): void => {
    if (!ctx) return;
    const level = Math.min(1, speed / 1.08);
    if (level < 0.03) return;
    const len = L * f.size;
    const nose = head - f.lag * L;
    const tail = nose - len * 0.9;
    const side = f.side(nose);
    const reach = len * (0.4 + 0.6 * level);
    // How it fades: out along its length, and in over the first bit
    // behind the tail, which is still churning.
    const fade = (d: number, over = reach): number => level * Math.min(1, d / (0.06 * len)) * Math.pow(Math.max(0, 1 - d / over), 1.2);
    const marks: { pts: { x: number; y: number }[]; w: number; g: number }[] = [];
    const arcs: { x: number; y: number; r: number; from: number; w: number; g: number }[] = [];

    // The trail, down the middle.
    const STEPS = 20;
    for (let k = 0; k < STEPS; k += 1) {
      const d0 = (k / STEPS) * reach;
      const d1 = ((k + 1) / STEPS) * reach;
      const a = place(tail - d0, side, 0);
      const b = place(tail - d1, side, 0);
      marks.push({ pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], w: len * (0.05 + 0.03 * (d0 / reach)), g: 40 + 14 * fade(d0) });
    }

    // The crests: one a side every `gap` along the line, each slanting
    // out and back at 20 degrees, centred on its arm. At 30, and full
    // bars, they read as a feather drawn on the water.
    const gap = len * 0.06;
    const crest = len * 0.05;
    const cos = Math.cos(Math.PI / 9);
    const sin = Math.sin(Math.PI / 9);
    for (let i = Math.floor(tail / gap); ; i -= 1) {
      const at0 = i * gap;
      const d = tail - at0;
      if (d > reach) break;
      if (d < len * 0.02) continue;
      const v = fade(d);
      for (const dir of [-1, 1]) {
        const j = hash(i * 2 + (dir > 0 ? 1 : 0));
        const off = len * (0.05 + (j - 0.5) * 0.012) + d * ARM;
        const a = place(at0 + (crest / 2) * cos, side, dir * (off - (crest / 2) * sin));
        const b = place(at0 - (crest / 2) * cos, side, dir * (off + (crest / 2) * sin));
        marks.push({ pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], w: MARK, g: 40 + 45 * v * (0.75 + 0.25 * j) });
      }
    }

    // The swirls, where the tail was furthest out: its phase there (as
    // drawFish beats it) a quarter turn on from a crossing, half a beat
    // apart, and the head has gone STRIDE lengths a beat since.
    const drive = 0.3 + 0.55 * Math.min(1, speed / 1.8);
    const swing = 0.125 * len * drive;
    const ph = beat + f.phase - Math.PI * 2 * 0.95;
    const SWIRL = 0.4 * len;
    for (let n = Math.floor((ph - Math.PI / 2) / Math.PI); ; n -= 1) {
      const d = ((ph - (Math.PI / 2 + n * Math.PI)) / (Math.PI * 2)) * STRIDE * L;
      if (d > SWIRL) break;
      const v = fade(d, SWIRL);
      if (v <= 0) continue;
      const way = n % 2 === 0 ? 1 : -1;
      const c = place(tail - d, side, way * swing);
      const r = len * (0.025 + 0.035 * (d / SWIRL));
      // A curl, half a ring, open away from the line and toward the
      // fish. Whole rings read as letters on the water.
      const out = c.a + (way * Math.PI) / 2;
      arcs.push({ x: c.x, y: c.y, r, from: way > 0 ? out : out - Math.PI, w: MARK, g: 40 + 38 * v });
    }

    ctx.setTransform(1, 0, 0, 1, 0, -view);
    ctx.lineCap = "round";
    // The floors first, so none is laid over a mark drawn before it.
    for (const pass of [0, 1]) {
      for (const m of marks) {
        ctx.strokeStyle = pass ? grey(m.g) : grey(FLOOR);
        ctx.lineWidth = pass ? m.w : m.w + 2 * FLOOR_RING;
        ctx.beginPath();
        ctx.moveTo(m.pts[0].x, m.pts[0].y);
        for (let i = 1; i < m.pts.length; i += 1) ctx.lineTo(m.pts[i].x, m.pts[i].y);
        ctx.stroke();
      }
      for (const c of arcs) {
        ctx.strokeStyle = pass ? grey(c.g) : grey(FLOOR);
        ctx.lineWidth = pass ? c.w : c.w + 2 * FLOOR_RING;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, c.from, c.from + Math.PI);
        ctx.stroke();
      }
    }
  };

  const draw = (): void => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    for (let i = FISH.length - 1; i >= 0; i -= 1) drawWake(FISH[i]);
    for (let i = FISH.length - 1; i >= 0; i -= 1) drawFish(FISH[i]);
    // Where a name stands, the water goes dark under it, softly: the bars
    // thin away there, so a fish passing under a name fades and comes back
    // rather than running through the letters.
    const list = holes?.() ?? [];
    if (list.length) {
      const k = W / Math.max(1, sw0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.filter = `blur(${(HOLE_SOFT * W).toFixed(1)}px)`;
      for (const r of list) ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
      ctx.filter = "none";
    }
  };

  /** Where his line's tip is with the section's top here: one speed along
   *  the path over the run, then on at that speed. */
  const tipAt = (from: number = swim): number => {
    const f = (DRAW_FROM * sh0 - from) / (DRAW_RUN * sh0);
    return sFrom + (sEnd - sFrom) * Math.max(0, Math.min(span, f));
  };

  const extent = (t: number, from: number): { left: number; right: number; top: number; bottom: number } => {
    const lead = tipAt(from);
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const f of FISH) {
      const s0 = lead - f.lag * L;
      const side = f.side(s0);
      const half = (L * f.size * IH) / IW / 2 / k;
      for (let u = 0; u <= 1; u += 0.05) {
        const q = place(s0 - u * L * f.size, side, 0);
        const x = q.x / k;
        const y = t + q.y / k;
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.top = Math.min(box.top, y - half);
        box.bottom = Math.max(box.bottom, y + half);
      }
    }
    return box;
  };

  // The path is fixed to the section, so it moves with the page.
  const aim = (): void => {
    view = (canvasTop - top) * k;
  };

  let sw0 = screenW;
  let sh0 = screenH;
  let holes: (() => Hole[]) | null = null;
  build(screenW, screenH);
  head = sFrom;
  to = head;
  aim();
  draw();

  const setPlace = (t: number, c: number, sw: number = t): void => {
    top = t;
    swim = sw;
    canvasTop = c;
    to = tipAt();
    dirty = true;
  };

  return {
    source: {
      canvas,
      animated: true,
      update: (_time: number, dt: number) => {
        const step = Math.min(0.1, Math.max(0, dt));
        // The follow: a share of what is left, by the frame's own length.
        // The last tenth of a px is taken whole, so it comes to rest.
        const left = to - head;
        const next = Math.abs(left) < 0.1 || step === 0 ? to : head + left * (1 - Math.exp(-step / FOLLOW));
        const moved = next - head;
        head = next;
        // Speed in body lengths a second, smoothed over about 0.1 s.
        if (step > 0) speed += (Math.abs(moved) / L / step - speed) * (1 - Math.exp(-9.75 * step));
        if (moved === 0 && speed < 6e-3) speed = 0;
        beat += (moved / (STRIDE * L)) * Math.PI * 2;
        if (!dirty && moved === 0 && speed === 0) return false;
        dirty = speed !== 0;
        aim();
        draw();
        return true;
      },
    },
    setHoles: (fn) => {
      holes = fn;
      dirty = true;
    },
    setInkDark: (dark) => {
      if (dark === inkDark) return;
      inkDark = dark;
      dirty = true;
    },
    setPlace,
    extent,
    setProgress: (p) => setPlace((DRAW_FROM - DRAW_RUN * span * Math.max(0, Math.min(1, p))) * sh0, 0),
    resize: (sw, sh) => {
      sw0 = sw;
      sh0 = sh;
      build(sw, sh);
      head = tipAt();
      to = head;
      dirty = true;
    },
  };
}
