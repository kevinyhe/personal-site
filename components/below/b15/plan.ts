import { fbm1, fbm2, makeRng } from "@/components/valley/sources/noise";

/**
 * Everything about Dusk that is a number: where the camera is at each
 * point of the scroll, how dark the sky is, where the clouds, hills, stars
 * and moon are, and when each piece of text shows.
 *
 * No DOM and no WebGL here, so a Node script can import it and check the
 * layout without a browser. The scene (scene.ts) and the page (driver.ts)
 * both read from this file, so what the check prints is what the page draws.
 *
 * Units: world units, camera looking down -z. `u` is scroll in screens
 * from the top of the design: 0 is the design's top at the top of the
 * window. Work is u 0..6, skills 6..8.5, contact 8.5..10, and the last
 * screen is on show at u = 9.
 */

// ------------------------------------------------------------ page length

export const WORK_SCREENS = 6;
export const SKILLS_SCREENS = 2.5;
export const CONTACT_SCREENS = 1.5;
export const TOTAL_SCREENS = WORK_SCREENS + SKILLS_SCREENS + CONTACT_SCREENS;
/** The scroll at which the page cannot go further. */
export const LAST_U = TOTAL_SCREENS - 1;
export const SKILLS_AT = WORK_SCREENS;
export const CONTACT_AT = WORK_SCREENS + SKILLS_SCREENS;

/** Where the dev handle's goTo(i) sends the page: five projects, skills, contact. */
export const STOPS = [0.4, 1.4, 2.4, 3.4, 4.4, 6.9, LAST_U];

// ------------------------------------------------------------------ helpers

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const smooth = (v: number): number => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
export const smoothstep = (a: number, b: number, v: number): number => smooth((v - a) / (b - a));
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const DEG = Math.PI / 180;

// ------------------------------------------------------------------- camera

/** Vertical field of view on a screen at least 1.6 wide to 1 tall. */
export const FOV = 50;

/** On a narrower screen the view keeps its width and grows taller, so the
 *  constellations at the sides stay on screen. */
export function fovFor(aspect: number): number {
  if (aspect >= 1.6) return FOV;
  const wide = Math.tan((FOV / 2) * DEG) * 1.6;
  return Math.min(90, (2 * Math.atan(wide / aspect)) / DEG);
}

/** How far the camera goes on each move between projects. */
const LEG = 16;
/** Each move starts this far into a project's screen and takes this long. */
const MOVE_FROM = 0.75;
const MOVE_FOR = 0.45;
/** Five moves: four between projects, one after the last, into the night. */
export const MOVES = 5;

/** 0 before move i, 1 after it. */
export function moveDone(u: number, i: number): number {
  return smooth((u - (i + MOVE_FROM)) / MOVE_FOR);
}

/** The scroll at which move i is half done, which is where its cloud is. */
export const crossingAt = (i: number): number => i + MOVE_FROM + MOVE_FOR / 2;

export type Pose = { x: number; y: number; z: number; pitch: number; yaw: number };

/** Camera position and angles (degrees; pitch up is positive) at scroll u,
 *  before the pointer's lean is added. */
export function pose(u: number, out: Pose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 }): Pose {
  const s = clamp(u, -1, LAST_U);
  let moved = 0;
  let sway = 0;
  for (let i = 0; i < MOVES; i += 1) {
    const k = moveDone(s, i);
    moved += k;
    // A slow lean left or right while passing through a cloud, turn and turn about.
    sway += Math.sin(Math.PI * k) * (i % 2 === 0 ? 1 : -1);
  }
  const night = smoothstep(5.2, 6.4, s);
  out.x = sway * 1.2;
  out.z = -(LEG * moved) - 0.9 * s;
  out.y = 2 + 0.5 * Math.max(0, s) + 1.2 * moved + 3 * night;
  // Up to the stars for the skills, back down to the hills for contact.
  out.pitch = 8 + 12 * smoothstep(5.3, 6.4, s) - 14 * smoothstep(7.7, 8.7, s);
  out.yaw = sway * 3;
  return out;
}

/** The camera at rest in the skills screen, which the stars are laid out for. */
export const SKY_U = 6.9;

// ---------------------------------------------------------------- the sky

/** How far dusk has gone: 0 bright blossom sky, 1 night. Mostly held
 *  light through the work, so the titles sit on a light ground; the night
 *  comes in the move after the last project. */
export function darkness(u: number): number {
  const work = 0.14 * smoothstep(0.2, 5.0, u);
  const fall = 0.79 * smoothstep(4.9, 6.3, u);
  const last = 0.07 * smoothstep(6.3, 8.6, u);
  return work + fall + last;
}

/** The darkest value drawn anywhere. The bar shader drops pure black, so
 *  "solid plum" is this grey, which the grade still turns into a full bar. */
export const INK = 0.03;

/** The sky's value at the horizon and straight up, at darkness d. */
export function skyParts(d: number): { horizon: number; zenith: number } {
  return { horizon: mix(0.99, 0.24, d), zenith: mix(0.62, INK + 0.01, d) };
}
/** Where between the two the sky is, by the sine of the elevation: held
 *  light up to about 10 degrees, where the words are, and darkening above,
 *  so dusk shows first at the top of the frame. The sky shader uses the
 *  same two numbers. */
export const SKY_FROM = 0.18;
export const SKY_TO = 0.78;

/** Sky value (0 dark .. 1 light) looking at elevation `elev` (radians). */
export function skyValue(elev: number, d: number): number {
  const { horizon, zenith } = skyParts(d);
  return mix(horizon, zenith, smoothstep(SKY_FROM, SKY_TO, Math.sin(elev)));
}

/** How much of the top of the frame is solid plum, so the design's first
 *  pixels are the band's colour. Full while the design comes up under the
 *  band, gone once the first project is in. */
export function topDark(u: number): number {
  return 1 - smoothstep(-0.15, 0.45, u);
}
/** How far down the frame the plum reaches, as a share of its height. */
export const TOP_REACH = 0.42;

// -------------------------------------------------------------- the hills

export type Ridge = { z: number; base: number; amp: number; freq: number; seed: number; dusk: number; night: number };

/** Two lines of hills far off, the far one paler. `dusk` and `night`: the
 *  value each is drawn at in daylight's last light and at full dark. */
export const RIDGES: Ridge[] = [
  { z: -560, base: -46, amp: 38, freq: 1 / 95, seed: 1501, dusk: 0.56, night: 0.1 },
  { z: -380, base: -78, amp: 44, freq: 1 / 70, seed: 1502, dusk: 0.24, night: INK },
];
export const RIDGE_HALF_WIDTH = 1400;

export function ridgeTop(r: Ridge, x: number): number {
  return r.base + r.amp * fbm1(x * r.freq + 40, 4, r.seed);
}

export const ridgeValue = (r: Ridge, d: number): number => mix(r.dusk, r.night, clamp01(d * 1.1));

// ------------------------------------------------------------- the clouds

export type Cloud = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Which of the drawn cloud shapes. */
  kind: number;
  /** Seconds per sway, and where in it this one starts. */
  period: number;
  phase: number;
  /** Set on the clouds the camera flies through between projects. */
  curtain?: number;
};

export const CLOUD_KINDS = 4;
/** Kind 3 is the dense one the camera passes through. */
export const DENSE_KIND = 3;
/** A cloud's sway sideways, in world units, either way. */
export const CLOUD_SWAY = 1.4;

/** Value of a cloud's lit side at darkness d. */
export const cloudTone = (d: number): number => mix(1.0, 0.3, d);
/** Clouds thin out as night comes, so the stars have a clear sky. */
export const cloudFade = (d: number): number => 1 - smoothstep(0.42, 0.82, d);

/** Clouds far ahead fade into the haze. Without this a far cloud, which
 *  sits near the horizon from where the camera is, would lie behind the
 *  titles. `ahead` is how far in front of the camera the cloud is. */
export const HAZE_NEAR = 70;
export const HAZE_FAR = 120;
export const hazeFade = (ahead: number): number => 1 - smoothstep(HAZE_NEAR, HAZE_FAR, ahead);

/** The titles and their lines fill the frame from 38% to 68% of its
 *  height, which with the camera tipped up 8 degrees is from 1.5 degrees
 *  below level to 14.4 above. Clouds stay out of that, with a margin. */
const ABOVE_DEG = 16;
const BELOW_DEG = -3;

/** Is the cloud's near edge outside the text band from every camera
 *  position that can see it while the work is on? */
function clearOfWords(c: Cloud, above: boolean): boolean {
  for (let u = -1; u <= 5.4; u += 0.05) {
    const p = pose(u);
    const ahead = p.z - c.z;
    if (ahead < 2 || ahead > HAZE_FAR) continue;
    const edge = above ? c.y - c.h / 2 : c.y + c.h / 2;
    const elev = Math.atan2(edge - p.y, ahead) / DEG;
    if (above ? elev < ABOVE_DEG : elev > BELOW_DEG) return false;
  }
  return true;
}

function buildClouds(): Cloud[] {
  const rng = makeRng(1515);
  const out: Cloud[] = [];
  // Scattered clouds at many depths, above and below the words, never
  // across them: a cloud behind a title turns its ground to stripes. Each
  // is raised (or lowered) until no camera position that can see it sees
  // it in the text band. A cloud off the middle moves outward as the
  // camera closes on it, so it only ever leaves the frame by its edge.
  const COUNT = 40;
  for (let k = 0; k < COUNT; k += 1) {
    const z = 20 - (k / (COUNT - 1)) * 210 + (rng() - 0.5) * 4;
    const above = k % 5 !== 1 && k % 5 !== 3;
    const w = 18 + rng() * 26;
    const h = w * (0.42 + rng() * 0.12);
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (4 + rng() * 38);
    const c: Cloud = { x, y: 0, z, w, h, kind: k % DENSE_KIND, period: 34 + rng() * 26, phase: rng() * Math.PI * 2 };
    c.y = above ? 10 + h / 2 : -h / 2;
    for (let step = 0; step < 400 && !clearOfWords(c, above); step += 1) c.y += above ? 0.5 : -0.5;
    // A little extra, at random, so they do not all sit on the one line.
    c.y += (above ? 1 : -1) * rng() * 6;
    out.push(c);
  }
  // One cloud across the path at the middle of each move, and a second
  // just past it, a little to the other side: the frame fills with bars
  // as the camera goes through, then clears onto the next title.
  for (let i = 0; i < MOVES; i += 1) {
    const at = pose(crossingAt(i));
    const lean = i % 2 === 0 ? 1 : -1;
    out.push({ x: at.x + 2.2 * lean, y: at.y - 0.4, z: at.z, w: 10, h: 6, kind: DENSE_KIND, period: 50, phase: i, curtain: i });
    out.push({ x: at.x - 3.4 * lean, y: at.y + 0.8, z: at.z - 1.6, w: 11, h: 6.2, kind: DENSE_KIND, period: 50, phase: i + 2, curtain: i });
  }
  return out;
}

export const CLOUDS: Cloud[] = buildClouds();

/** How visible a curtain cloud is at scroll u, before the fade near the lens. */
export function curtainShown(i: number, u: number): number {
  return smoothstep(i + 0.68, i + 0.82, u);
}

/** Near the lens a cloud fades out, so the camera never sees its flat edge
 *  or clips through it. `ahead` is how far in front of the camera it is. */
export const nearFade = (ahead: number): number => smoothstep(0.35, 1.8, ahead);

type Puff = { x: number; y: number; r: number };

/** Each cloud shape is a heap of round puffs: a row along the bottom and
 *  smaller ones on top. Radii are in shares of the texture's width; the
 *  texture is about twice as wide as tall, so a puff's height in texture
 *  units is twice its radius. */
function buildPuffs(kind: number): Puff[] {
  const rng = makeRng(1700 + kind * 19);
  const dense = kind === DENSE_KIND;
  const puffs: Puff[] = [];
  const rows = dense ? [0.3, 0.52, 0.7] : [0.3, 0.5];
  rows.forEach((y, row) => {
    const n = dense ? 4 - (row === 2 ? 1 : 0) : row === 0 ? 4 : 2 + (kind % 2);
    const span = dense ? 0.84 : row === 0 ? 0.76 : 0.5;
    for (let k = 0; k < n; k += 1) {
      const r = (dense ? 0.2 : row === 0 ? 0.15 : 0.19) + rng() * 0.05;
      const x = 0.5 - span / 2 + (span * (k + 0.5)) / n + (rng() - 0.5) * 0.06;
      puffs.push({ x: clamp(x, r, 1 - r), y: Math.min(y + (rng() - 0.5) * 0.06, 1 - r * 2), r });
    }
  });
  return puffs;
}

const PUFFS: Puff[][] = Array.from({ length: CLOUD_KINDS }, (_, k) => buildPuffs(k));

/**
 * One texel of cloud shape `kind` at (s, t), both 0..1, t up. Returns the
 * shade (how lit, 0..1) and the cover (alpha, 0..1): round heaps with a
 * flattened bottom, the edge broken up by noise, pale on top where the last
 * light catches them and darker in the belly.
 */
export function cloudTexel(kind: number, s: number, t: number, out: [number, number] = [0, 0]): [number, number] {
  const seed = 1600 + kind * 37;
  let dens = -1;
  let top = 0;
  for (const p of PUFFS[kind]) {
    const dx = (s - p.x) / p.r;
    const dy = (t - p.y) / (p.r * 2);
    const k = 1 - (dx * dx + dy * dy);
    if (k > dens) {
      dens = k;
      // How high in its own puff this texel is: the lit cap.
      top = clamp01(0.5 + dy * 0.5);
    }
  }
  // Flat underneath.
  dens -= 1 - smoothstep(0.1, 0.24, t);
  const n = fbm2(s * 7, t * 4, 4, seed);
  dens += (n - 0.5) * 0.3;
  // The texture's own edge is always clear, or the plane's square outline
  // would show where the noise reaches it.
  const rim = smoothstep(0.0, 0.06, Math.min(s, 1 - s, t, 1 - t));
  const cover = smoothstep(0.04, 0.3, dens) * rim;
  const grain = (fbm2(s * 11 + 3, t * 7, 3, seed + 29) - 0.5) * 0.25;
  // The dense cloud the camera flies through is a dark one, so the frame
  // fills with bars as it passes; the others are pale, lit by the last light.
  const shade = kind === DENSE_KIND ? clamp01(0.26 + 0.2 * t + 0.14 * top + grain) : clamp01(0.36 + 0.34 * t + 0.3 * top + grain);
  out[0] = shade;
  out[1] = cover;
  return out;
}

// ------------------------------------------------------------- the stars

export type Star = { group: number; index: number; sx: number; sy: number; size: number; bright: number };
export type Constellation = {
  group: number;
  /** The box the stars sit in, as shares of the stage at the skills pose. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stars: Star[];
  /** Pairs of star indexes (within this constellation) joined by a line. */
  lines: [number, number][];
};

/** Where each group's stars go, as shares of the stage at the skills pose,
 *  on a screen 1.85 wide to 1 tall. Three across the top, two below; each
 *  group's names sit under its stars. */
export const SKY_BOXES: [number, number, number, number][] = [
  [0.09, 0.15, 0.25, 0.33],
  [0.41, 0.12, 0.59, 0.32],
  [0.74, 0.15, 0.9, 0.33],
  [0.25, 0.55, 0.41, 0.72],
  [0.59, 0.55, 0.75, 0.72],
];

/** Stars closer than this (share of stage width) are pushed apart; two
 *  stars within a cell of each other come back from the bars as one. */
export const STAR_GAP = 0.022;

export function buildConstellations(sizes: number[], depths: number[][]): Constellation[] {
  return sizes.map((n, g) => {
    const [x0, y0, x1, y1] = SKY_BOXES[g];
    const rng = makeRng(2100 + g * 13);
    const pts: { x: number; y: number }[] = [];
    // A wandering chain from one side of the box to the other, which is
    // what a constellation drawn by hand looks like; a random scatter reads
    // as noise. Each step goes mostly across and a little up or down.
    let x = 0.04 + rng() * 0.1;
    let y = 0.3 + rng() * 0.4;
    for (let k = 0; k < n; k += 1) {
      if (k > 0) {
        x += 0.9 / Math.max(1, n - 1) + (rng() - 0.5) * 0.06;
        y += (rng() - 0.5) * 0.55;
        if (y < 0.05) y = 0.1 + rng() * 0.1;
        if (y > 0.95) y = 0.9 - rng() * 0.1;
      }
      pts.push({ x: clamp(x, 0.02, 0.98), y: clamp(y, 0.03, 0.97) });
    }
    // Spread apart any two that landed too close.
    const w = x1 - x0;
    const h = y1 - y0;
    for (let pass = 0; pass < 30; pass += 1) {
      for (let a = 0; a < n; a += 1) {
        for (let b = a + 1; b < n; b += 1) {
          const dx = (pts[b].x - pts[a].x) * w;
          const dy = ((pts[b].y - pts[a].y) * h) / 1.85;
          const gap = Math.hypot(dx, dy);
          if (gap >= STAR_GAP) continue;
          const push = (STAR_GAP - gap) / 2 + 0.001;
          const ux = gap > 0 ? dx / gap : 0;
          const uy = gap > 0 ? dy / gap : 1;
          pts[a].y = clamp(pts[a].y - (uy * push * 1.85) / h, 0.02, 0.98);
          pts[b].y = clamp(pts[b].y + (uy * push * 1.85) / h, 0.02, 0.98);
          pts[a].x = clamp(pts[a].x - (ux * push) / w, 0.02, 0.98);
          pts[b].x = clamp(pts[b].x + (ux * push) / w, 0.02, 0.98);
        }
      }
    }
    const stars: Star[] = pts.map((p, k) => {
      const depth = depths[g][k] ?? 3;
      return {
        group: g,
        index: k,
        sx: x0 + p.x * w,
        sy: y0 + p.y * h,
        size: 0.7 + 0.1 * depth,
        bright: 0.84 + 0.03 * depth,
      };
    });
    // The chain, and one branch from near its middle to a star two on,
    // so the figure is not a plain zigzag.
    const lines: [number, number][] = [];
    for (let k = 1; k < n; k += 1) lines.push([k - 1, k]);
    if (n >= 6) lines.push([Math.floor(n / 2) - 1, Math.floor(n / 2) + 1]);
    return { group: g, x0, y0, x1, y1, stars, lines };
  });
}

/** How far out the stars are. Far enough that the camera's small moves in
 *  the skills screen do not shift one against another. */
export const STAR_DISTANCE = 900;

/** The stars come in one group after another. */
export function starsShown(group: number, u: number): number {
  return smoothstep(5.7 + group * 0.12, 6.1 + group * 0.12, u);
}
/** The lines between them are drawn after the stars are up. */
export function linesDrawn(group: number, u: number): number {
  return smoothstep(6.15 + group * 0.1, 6.55 + group * 0.1, u);
}
/** The stars go as the camera tips back down to the hills. */
export function starsGone(u: number): number {
  return 1 - smoothstep(7.8, 8.4, u);
}

// -------------------------------------------------------------- the moon

/** The moon's direction: azimuth (degrees, right of straight ahead) and
 *  elevation (degrees) as it rises over the contact screen. */
export const MOON_AZ = 17;
export const MOON_DISTANCE = 700;
/** Angular radius of the disc, degrees. */
export const MOON_RADIUS = 3.2;
export function moonElevation(u: number): number {
  return mix(-9.5, -2.2, smoothstep(7.9, 8.9, u));
}

// ------------------------------------------------------------- the words

/** Opacity of project i's text at scroll u. */
export function projectShown(i: number, u: number): number {
  const inAt = i === 0 ? 0.02 : i + 0.1;
  return smoothstep(inAt, inAt + 0.14, u) * (1 - smoothstep(i + 0.62, i + 0.74, u));
}
export function skillsShown(u: number): number {
  return smoothstep(6.2, 6.5, u) * (1 - smoothstep(7.55, 7.8, u));
}
export function contactShown(u: number): number {
  return smoothstep(8.35, 8.75, u);
}

/** Title sizes: one size for every title, the largest at which the
 *  longest of them, at 0.4em tracking, is 82% of the stage wide. Checked
 *  in Node with the fonts' own advance widths. */
export const TITLE_VW = 4.6;
export const TRACKING_EM = 0.4;
export const EMAIL_VW = 1.6;

/** Where the words sit, as shares of the stage height (the page sets
 *  them with these numbers, so the check measures the same boxes). */
export const TITLE_MID = 0.45;
export const TAGLINE_TOP = 0.535;
export const EMAIL_MID = 0.44;
export const LINKS_TOP = 0.5;
/** Skill names: the block under each group's stars starts this far below
 *  the stars' box and is this wide (share of stage width). */
export const SKILL_LABEL_GAP = 0.03;
export const SKILL_LABEL_W = 0.15;
/** Type sizes in rem (8px on a 1920 wide screen, 16px at 3840). */
export const SKILL_GROUP_REM = 1.5;
export const SKILL_NAMES_REM = 1.3;
export const TAGLINE_REM = 1.6;
export const DETAIL_REM = 1.35;
export const LINK_REM = 1.4;
