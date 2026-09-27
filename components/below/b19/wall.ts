import { hashSeed, petalPath, seededRandom } from "@/components/petalGlyphs";
import type { SkillGroup } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import * as L from "./layout";

/**
 * The wall's carving, drawn as height maps on 2D canvases: black is the
 * wall's face, white stands furthest out. The shader in relief.ts reads
 * these to push the wall out and to shade it.
 *
 * Everything is drawn in world units with y up (the canvas transform does
 * the flip), so the numbers here are the same numbers as layout.ts.
 *
 * Soft forms come from gradients: a dome is bright in the middle and falls
 * to its edge, a stem is bright along its middle line. A light blur at the
 * end rounds every edge. Where parts overlap, the higher one wins
 * ("lighten"); grooves are cut by multiplying.
 */

type P = [number, number];
type Tube = { pts: P[]; w0: number; w1: number };
type Bloom = { x: number; y: number; r: number; rot: number; variant: number; bud: boolean };
type Petal = { x: number; y: number; len: number; rot: number; variant: number };
type Plan = { tubes: Tube[]; blooms: Bloom[]; petals: Petal[] };

const WALL_X0 = L.tileX(0) - L.TILE_W / 2;
const WALL_X1 = L.tileX(L.TILE_COUNT - 1) + L.TILE_W / 2;
/** The face of the wall. A little above zero, so a sunk field can sit below it. */
const BASE = 22;

const grey = (v: number): string => {
  const g = Math.round(Math.max(0, Math.min(255, v)));
  return `rgb(${g},${g},${g})`;
};

/** A bump centred on x = at, one at the middle and none past `half`. */
const bump = (x: number, at: number, half: number): number => {
  const d = Math.abs(x - at) / half;
  return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d);
};

/** Is a wall point somewhere the type or a sunk field sits, where nothing loose should be carved? */
function keptClear(x: number, y: number): boolean {
  const panel = Math.round(x / L.PITCH);
  const rx = x - L.panelX(panel);
  if (panel >= 0 && panel < L.WORK_PANELS) {
    const c = L.CARTOUCHE;
    if (rx > c.x0 - 0.04 && rx < c.x1 + 0.04 && y > c.y0 - 0.04 && y < c.y1 + 0.04) return true;
    // the title and its details
    if (rx > -0.96 && rx < 0.02 && y > -0.27 && y < 0.25) return true;
  }
  if (panel === L.SKILLS_PANEL) {
    const f = L.SKILL.frame;
    if (rx > f.x0 - 0.04 && rx < f.x1 + 0.04 && y > f.y0 - 0.04 && y < f.y1 + 0.04) return true;
  }
  if (panel === L.CONTACT_PANEL) {
    const dx = (rx - L.SPOT.x) / (L.SPOT.rx + 0.08);
    const dy = (y - L.SPOT.y) / (L.SPOT.ry + 0.08);
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

/** The boughs, blossoms and loose petals along the whole wall. The same every time. */
function makePlan(): Plan {
  const rand = seededRandom(hashSeed("b19 relief wall"));
  const plan: Plan = { tubes: [], blooms: [], petals: [] };
  const skillsX = L.panelX(L.SKILLS_PANEL);
  const contactX = L.panelX(L.CONTACT_PANEL);

  const bough = (side: 1 | -1, phase: number): void => {
    // side 1 runs along the top and sends twigs down; -1 the bottom, twigs up.
    const lineY = (x: number): number =>
      side * (0.445 + 0.03 * Math.sin(x * 1.1 + phase) + 0.018 * Math.sin(x * 2.7 + phase * 2) + 0.1 * bump(x, skillsX, 1.3));
    const main: P[] = [];
    for (let x = WALL_X0 - 0.1; x <= WALL_X1 + 0.1; x += 0.08) main.push([x, lineY(x)]);
    // The main stem, in pieces so its thickness can swell and thin.
    for (let i = 0; i < main.length - 1; i += 1) {
      const x = main[i][0];
      const w = 0.028 + 0.009 * Math.sin(x * 0.9 + phase) + 0.004 * Math.sin(x * 3.3);
      plan.tubes.push({ pts: [main[i], main[i + 1]], w0: w, w1: w });
    }
    let x = WALL_X0 + rand() * 0.3;
    while (x < WALL_X1) {
      const y = lineY(x);
      // Twigs come thicker near the contact panel, so the email sits in blossom.
      const dense = bump(x, contactX, 1.2);
      const angle = -side * Math.PI / 2 + (rand() - 0.5) * 1.5;
      const reach = side > 0 ? y - 0.26 : -0.27 - y;
      let len = 0.1 + rand() * 0.12;
      const down = Math.abs(Math.sin(angle));
      if (down * len > reach) len = reach / Math.max(0.2, down);
      const pts: P[] = [[x, y]];
      const bend = (rand() - 0.5) * 0.6;
      for (let k = 1; k <= 4; k += 1) {
        const t = k / 4;
        const a = angle + bend * t;
        const prev = pts[k - 1];
        pts.push([prev[0] + Math.cos(a) * len * 0.25, prev[1] + Math.sin(a) * len * 0.25]);
      }
      plan.tubes.push({ pts, w0: 0.013, w1: 0.006 });
      const end = pts[pts.length - 1];
      const count = 2 + Math.floor(rand() * 3) + Math.round(dense * 2);
      for (let b = 0; b < count; b += 1) {
        const a = rand() * Math.PI * 2;
        const d = b === 0 ? 0 : 0.02 + rand() * 0.025;
        plan.blooms.push({
          x: end[0] + Math.cos(a) * d,
          y: end[1] + Math.sin(a) * d,
          r: 0.026 + rand() * 0.016,
          rot: rand() * Math.PI * 2,
          variant: Math.floor(rand() * 3),
          bud: rand() < 0.18,
        });
      }
      // Now and then a flower straight on the stem.
      if (rand() < 0.45) {
        plan.blooms.push({ x: x + 0.12, y: lineY(x + 0.12) + side * 0.01, r: 0.024 + rand() * 0.01, rot: rand() * 6.28, variant: Math.floor(rand() * 3), bud: rand() < 0.3 });
      }
      x += (0.3 + rand() * 0.24) * (1 - 0.45 * dense);
    }
  };
  bough(1, 0.4);
  bough(-1, 2.1);

  // Loose petals on the open wall, never under the type.
  let tries = 0;
  while (plan.petals.length < 90 && tries < 2000) {
    tries += 1;
    const x = WALL_X0 + rand() * (WALL_X1 - WALL_X0);
    const y = (rand() - 0.5) * 1.1;
    if (keptClear(x, y)) continue;
    plan.petals.push({ x, y, len: 0.03 + rand() * 0.02, rot: rand() * Math.PI * 2, variant: Math.floor(rand() * 3) });
  }
  return plan;
}

let cachedPlan: Plan | null = null;
const planOnce = (): Plan => (cachedPlan ??= makePlan());

// ---------------------------------------------------------- drawing kit

type Ctx = CanvasRenderingContext2D;

/** An ellipse that rises to a round top: `lo` at its edge, `hi` in the middle. */
function dome(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, lo: number, hi: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  const at = (f: number): string => grey(lo + (hi - lo) * f);
  g.addColorStop(0, at(1));
  g.addColorStop(0.5, at(0.87));
  g.addColorStop(0.75, at(0.66));
  g.addColorStop(0.9, at(0.44));
  g.addColorStop(1, at(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A gradient across a band from a to b: low at both sides, high along the middle, like a rod lying on the wall. */
function rod(ctx: Ctx, ax: number, ay: number, bx: number, by: number, lo: number, hi: number): CanvasGradient {
  const g = ctx.createLinearGradient(ax, ay, bx, by);
  const at = (f: number): string => grey(lo + (hi - lo) * f);
  g.addColorStop(0, at(0));
  g.addColorStop(0.18, at(0.62));
  g.addColorStop(0.5, at(1));
  g.addColorStop(0.82, at(0.62));
  g.addColorStop(1, at(0));
  return g;
}

/** A stem: three strokes, each narrower and higher, so it reads as round. */
function tube(ctx: Ctx, t: Tube, lo = 70, hi = 165): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const passes: [number, number][] = [
    [1, lo],
    [0.62, (lo + hi) / 2],
    [0.28, hi],
  ];
  for (const [k, g] of passes) {
    ctx.strokeStyle = grey(g);
    for (let i = 0; i < t.pts.length - 1; i += 1) {
      const f = t.pts.length > 2 ? i / (t.pts.length - 2) : 0;
      ctx.lineWidth = (t.w0 + (t.w1 - t.w0) * f) * k;
      ctx.beginPath();
      ctx.moveTo(t.pts[i][0], t.pts[i][1]);
      ctx.lineTo(t.pts[i + 1][0], t.pts[i + 1][1]);
      ctx.stroke();
    }
  }
}

function roundRect(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.arcTo(x1, y0, x1, y0 + r, r);
  ctx.lineTo(x1, y1 - r);
  ctx.arcTo(x1, y1, x1 - r, y1, r);
  ctx.lineTo(x0 + r, y1);
  ctx.arcTo(x0, y1, x0, y1 - r, r);
  ctx.lineTo(x0, y0 + r);
  ctx.arcTo(x0, y0, x0 + r, y0, r);
  ctx.closePath();
}

/** A sunk field with a raised rim round it, the frame each carving sits in. */
function frame(ctx: Ctx, r: L.Rect, corner: number): void {
  ctx.globalCompositeOperation = "source-over";
  roundRect(ctx, r.x0, r.y0, r.x1, r.y1, corner);
  ctx.fillStyle = grey(0);
  ctx.fill();
  for (const [w, g] of [
    [0.034, 60],
    [0.02, 105],
    [0.008, 140],
  ] as const) {
    roundRect(ctx, r.x0, r.y0, r.x1, r.y1, corner);
    ctx.lineWidth = w;
    ctx.strokeStyle = grey(g);
    ctx.stroke();
  }
}

/** A groove cut into whatever is already there, deeper where that stands higher. */
function groove(ctx: Ctx, draw: () => void, width: number, keep = 0.72): void {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = grey(255 * keep);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  draw();
  ctx.stroke();
  ctx.restore();
}

function bloom(ctx: Ctx, b: Bloom): void {
  if (b.bud) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    dome(ctx, 0, 0, b.r * 0.42, b.r * 0.3, 70, 185);
    ctx.restore();
    return;
  }
  const path = petalPath(b.variant);
  for (let k = 0; k < 5; k += 1) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot + (k * Math.PI * 2) / 5);
    // The petal's claw is at its local y = -0.5: move it to the flower's middle.
    ctx.translate(0, b.r * 0.5);
    ctx.scale(b.r * 1.45, b.r);
    const g = ctx.createRadialGradient(0, 0.08, 0, 0, 0.08, 0.58);
    g.addColorStop(0, grey(195));
    g.addColorStop(0.6, grey(160));
    g.addColorStop(1, grey(90));
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();
  }
  dome(ctx, b.x, b.y, b.r * 0.22, b.r * 0.22, 150, 215);
  ctx.fillStyle = grey(230);
  for (let k = 0; k < 7; k += 1) {
    const a = b.rot + (k * Math.PI * 2) / 7;
    ctx.beginPath();
    ctx.arc(b.x + Math.cos(a) * b.r * 0.34, b.y + Math.sin(a) * b.r * 0.34, b.r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

function petal(ctx: Ctx, p: Petal): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(p.len * 1.3, p.len);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.55);
  g.addColorStop(0, grey(150));
  g.addColorStop(1, grey(40));
  ctx.fillStyle = g;
  ctx.fill(petalPath(p.variant));
  ctx.restore();
}

// ------------------------------------------------------- the subjects

function microphone(ctx: Ctx): void {
  dome(ctx, 0.4, -0.335, 0.12, 0.03, 60, 170);
  tube(ctx, { pts: [[0.4, -0.31], [0.4, -0.02]], w0: 0.022, w1: 0.022 });
  const yoke: P[] = [[0.28, 0.22], [0.28, 0.1]];
  for (let k = 1; k <= 10; k += 1) {
    const a = Math.PI + (k / 10) * Math.PI;
    yoke.push([0.4 + Math.cos(a) * 0.12, 0.1 + Math.sin(a) * 0.12]);
  }
  yoke.push([0.52, 0.22]);
  tube(ctx, { pts: yoke, w0: 0.018, w1: 0.018 });
  // The capsule, round across its width, with its grille cut in.
  roundRect(ctx, 0.315, 0.02, 0.485, 0.36, 0.085);
  ctx.fillStyle = rod(ctx, 0.315, 0, 0.485, 0, 90, 235);
  ctx.fill();
  ctx.save();
  roundRect(ctx, 0.315, 0.02, 0.485, 0.36, 0.085);
  ctx.clip();
  for (let y = 0.06; y < 0.34; y += 0.022) groove(ctx, () => { ctx.moveTo(0.3, y); ctx.lineTo(0.5, y); }, 0.006);
  groove(ctx, () => { ctx.moveTo(0.4, 0.05); ctx.lineTo(0.4, 0.34); }, 0.005, 0.82);
  ctx.restore();
  ctx.fillStyle = rod(ctx, 0.31, 0, 0.49, 0, 100, 245);
  ctx.fillRect(0.31, 0.0, 0.18, 0.045);
}

function blaster(ctx: Ctx): void {
  ctx.fillStyle = rod(ctx, 0, 0.03, 0, 0.1, 80, 220);
  ctx.fillRect(0.4, 0.03, 0.29, 0.07);
  for (const a of [0.47, 0.54, 0.61]) {
    ctx.fillStyle = rod(ctx, 0, 0.022, 0, 0.108, 100, 245);
    ctx.fillRect(a, 0.022, 0.012, 0.086);
  }
  ctx.fillStyle = rod(ctx, 0, 0.015, 0, 0.115, 90, 240);
  ctx.fillRect(0.67, 0.015, 0.04, 0.1);
  tube(ctx, { pts: [[0.23, -0.02], [0.21, -0.12], [0.18, -0.21]], w0: 0.075, w1: 0.07 }, 60, 200);
  ctx.beginPath();
  ctx.moveTo(0.1, 0.14);
  ctx.lineTo(0.4, 0.165);
  ctx.lineTo(0.45, 0.12);
  ctx.lineTo(0.45, -0.01);
  ctx.lineTo(0.32, -0.04);
  ctx.lineTo(0.21, -0.03);
  ctx.lineTo(0.1, 0.03);
  ctx.closePath();
  ctx.fillStyle = rod(ctx, 0, -0.04, 0, 0.18, 90, 215);
  ctx.fill();
  ctx.fillStyle = grey(175);
  ctx.fillRect(0.17, 0.165, 0.23, 0.025);
  for (let x = 0.19; x < 0.39; x += 0.025) groove(ctx, () => { ctx.moveTo(x, 0.167); ctx.lineTo(x, 0.188); }, 0.005);
  groove(ctx, () => { ctx.moveTo(0.12, 0.05); ctx.lineTo(0.43, 0.05); }, 0.005, 0.8);
  tube(ctx, { pts: [[0.35, 0.17], [0.35, 0.205]], w0: 0.012, w1: 0.012 });
  dome(ctx, 0.35, 0.215, 0.02, 0.02, 120, 250);
  dome(ctx, 0.25, 0.09, 0.013, 0.013, 150, 250);
  dome(ctx, 0.29, 0.09, 0.013, 0.013, 150, 250);
  tube(ctx, { pts: [[0.31, -0.035], [0.315, -0.1], [0.27, -0.125], [0.235, -0.11]], w0: 0.012, w1: 0.012 });
  tube(ctx, { pts: [[0.285, -0.04], [0.28, -0.085]], w0: 0.012, w1: 0.01 });
}

function glove(ctx: Ctx): void {
  roundRect(ctx, 0.12, -0.16, 0.31, 0.18, 0.03);
  ctx.fillStyle = rod(ctx, 0, -0.16, 0, 0.18, 70, 200);
  ctx.fill();
  for (const x of [0.16, 0.2, 0.24]) groove(ctx, () => { ctx.moveTo(x, -0.13); ctx.lineTo(x, 0.15); }, 0.006);
  ctx.fillStyle = rod(ctx, 0, -0.17, 0, 0.19, 90, 225);
  ctx.fillRect(0.28, -0.17, 0.04, 0.36);
  dome(ctx, 0.46, 0.05, 0.21, 0.19, 70, 245);
  groove(ctx, () => { ctx.moveTo(0.33, 0.2); ctx.quadraticCurveTo(0.53, 0.27, 0.64, 0.06); }, 0.007);
  dome(ctx, 0.43, -0.1, 0.125, 0.06, 120, 255);
  groove(ctx, () => { ctx.moveTo(0.33, -0.08); ctx.quadraticCurveTo(0.45, -0.035, 0.55, -0.08); }, 0.006, 0.8);
}

function field(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(0.14, -0.22);
  ctx.lineTo(0.66, -0.22);
  ctx.lineTo(0.73, -0.37);
  ctx.lineTo(0.07, -0.37);
  ctx.closePath();
  ctx.fillStyle = grey(85);
  ctx.fill();
  const edge = (y: number): [number, number] => {
    const t = (-0.22 - y) / 0.15;
    return [0.14 - 0.07 * t, 0.66 + 0.07 * t];
  };
  for (const y of [-0.26, -0.31]) {
    const [a, b] = edge(y);
    groove(ctx, () => { ctx.moveTo(a, y); ctx.lineTo(b, y); }, 0.004, 0.65);
  }
  for (let k = 1; k < 6; k += 1) {
    groove(ctx, () => { ctx.moveTo(0.14 + (k * 0.52) / 6, -0.22); ctx.lineTo(0.07 + (k * 0.66) / 6, -0.37); }, 0.004, 0.65);
  }
  tube(ctx, { pts: [[0.07, -0.37], [0.73, -0.37]], w0: 0.018, w1: 0.018 }, 90, 170);
}

function planet(ctx: Ctx): void {
  const cx = 0.4;
  const cy = 0.02;
  const ring = (): void => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.33, 0.085, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, 0.235, 0.058, 0, 0, Math.PI * 2);
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.25);
  ring();
  ctx.fillStyle = grey(130);
  ctx.fill("evenodd");
  ctx.restore();
  dome(ctx, cx, cy, 0.19, 0.19, 60, 250);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 0.19, 0, Math.PI * 2);
  ctx.clip();
  for (let k = -2; k <= 2; k += 1) {
    const y = cy + k * 0.065 + 0.03;
    groove(ctx, () => { ctx.moveTo(cx - 0.2, y - 0.05); ctx.lineTo(cx + 0.2, y + 0.05); }, 0.012, 0.85);
  }
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.25);
  ctx.beginPath();
  ctx.rect(-0.4, -0.2, 0.8, 0.2);
  ctx.clip();
  ring();
  ctx.fillStyle = grey(205);
  ctx.fill("evenodd");
  groove(ctx, () => { ctx.ellipse(0, 0, 0.28, 0.071, 0, 0, Math.PI * 2); }, 0.006);
  ctx.restore();
  dome(ctx, 0.14, 0.3, 0.025, 0.025, 60, 200);
  dome(ctx, 0.68, -0.3, 0.018, 0.018, 60, 190);
}

/** The robot from its depth picture, standing on the field. */
function robotOn(ctx: Ctx, robot: HTMLCanvasElement, span: number): void {
  // The picture is `span` model units square, the model's floor at FLOOR_IN of its height from the bottom.
  const k = L.ROBOT.height / (L.ROBOT_BOX.max[1] - L.ROBOT_BOX.min[1]);
  const size = span * k;
  const left = L.ROBOT.cx - size / 2;
  const bottom = L.ROBOT.floor - ROBOT_FLOOR_IN * k;
  ctx.save();
  ctx.globalCompositeOperation = "lighten";
  ctx.translate(left, bottom + size);
  ctx.scale(size / robot.width, -size / robot.height);
  ctx.drawImage(robot, 0, 0);
  ctx.restore();
}
/** How far below the model's floor the depth picture starts, model units. relief.ts frames it so. */
export const ROBOT_FLOOR_IN = 0.012;

function medallions(ctx: Ctx, groups: SkillGroup[], sans: string): void {
  const spots = L.skillSpots(groups.map((g) => g.skills.length));
  const R = L.SKILL.radius;
  for (const s of spots) {
    const skill = groups[s.group].skills[s.index];
    dome(ctx, s.x, s.y, R, R, 55, 100);
    ctx.beginPath();
    ctx.arc(s.x, s.y, R - 0.006, 0, Math.PI * 2);
    ctx.lineWidth = 0.007;
    ctx.strokeStyle = grey(150);
    ctx.stroke();
    const icon = skillIcon(skill.icon);
    ctx.fillStyle = grey(205);
    if (icon) {
      const size = R * 1.15;
      ctx.save();
      ctx.translate(s.x - size / 2, s.y + size / 2);
      ctx.scale(size / 24, -size / 24);
      ctx.fill(new Path2D(icon.path));
      ctx.restore();
    } else {
      const text = skill.mark ?? skill.name.slice(0, 2);
      ctx.save();
      ctx.translate(s.x, s.y);
      // Back to pixels, y down, so the type is drawn the right way up.
      ctx.scale(1 / L.PPU, -1 / L.PPU);
      const px = R * L.PPU * (text.length > 2 ? 0.62 : 0.8);
      ctx.font = `700 ${px.toFixed(1)}px ${sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, px * 0.05);
      ctx.restore();
    }
  }
}

// --------------------------------------------------------- one tile

export type TileOptions = { robot: HTMLCanvasElement | null; robotSpan: number; groups: SkillGroup[]; sans: string };

/**
 * Draws tile t of the wall (centred on panel t + TILE_FIRST) into `out`,
 * TILE_W x TILE_H world units at PPU texels per unit. Height in every
 * channel. Returns `out`.
 */
export function drawTile(t: number, out: HTMLCanvasElement, opts: TileOptions): HTMLCanvasElement {
  const pad = L.TILE_PAD;
  const W = Math.round(L.TILE_W * L.PPU);
  const H = Math.round(L.TILE_H * L.PPU);
  const padPx = Math.round(pad * L.PPU);
  const work = document.createElement("canvas");
  work.width = W + padPx * 2;
  work.height = H + padPx * 2;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  out.width = W;
  out.height = H;
  if (!ctx) return out;

  const cx = L.tileX(t);
  const x0 = cx - L.TILE_W / 2 - pad;
  const x1 = cx + L.TILE_W / 2 + pad;
  ctx.setTransform(L.PPU, 0, 0, -L.PPU, -x0 * L.PPU, (L.TILE_H / 2 + pad) * L.PPU);
  ctx.fillStyle = grey(BASE);
  ctx.fillRect(x0, -L.TILE_H, x1 - x0, L.TILE_H * 2);

  const plan = planOnce();
  const near = (x: number, m = 0.12): boolean => x > x0 - m && x < x1 + m;
  ctx.globalCompositeOperation = "lighten";
  for (const tb of plan.tubes) if (near(tb.pts[0][0], 0.3)) tube(ctx, tb);
  for (const b of plan.blooms) if (near(b.x)) bloom(ctx, b);

  const panel = t + L.TILE_FIRST;
  ctx.save();
  ctx.translate(L.panelX(panel), 0);
  if (panel >= 0 && panel < L.WORK_PANELS) {
    frame(ctx, L.CARTOUCHE, 0.035);
    ctx.globalCompositeOperation = "source-over";
    if (panel === 0) microphone(ctx);
    if (panel === 1) blaster(ctx);
    if (panel === 2) glove(ctx);
    if (panel === 3) {
      field(ctx);
      if (opts.robot) robotOn(ctx, opts.robot, opts.robotSpan);
    }
    if (panel === 4) planet(ctx);
  } else if (panel === L.SKILLS_PANEL) {
    frame(ctx, L.SKILL.frame, 0.04);
    ctx.globalCompositeOperation = "source-over";
    medallions(ctx, opts.groups, opts.sans);
  } else if (panel === L.CONTACT_PANEL) {
    // A smooth oval, ringed, where the light comes to rest on the email.
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.ellipse(L.SPOT.x, L.SPOT.y, L.SPOT.rx + 0.05, L.SPOT.ry + 0.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = grey(BASE);
    ctx.fill();
    for (const [w, g] of [
      [0.016, 80],
      [0.007, 130],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(L.SPOT.x, L.SPOT.y, L.SPOT.rx + 0.05, L.SPOT.ry + 0.05, 0, 0, Math.PI * 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = grey(g);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.globalCompositeOperation = "lighten";
  for (const p of plan.petals) if (near(p.x)) petal(ctx, p);
  ctx.globalCompositeOperation = "source-over";

  // Round every edge a little, then keep the middle.
  const img = ctx.getImageData(0, 0, work.width, work.height);
  const h = new Float32Array(work.width * work.height);
  for (let i = 0; i < h.length; i += 1) h[i] = img.data[i * 4];
  blur(h, work.width, work.height, 2);
  blur(h, work.width, work.height, 2);
  const octx = out.getContext("2d");
  if (!octx) return out;
  const result = octx.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const v = h[(y + padPx) * work.width + x + padPx];
      const o = (y * W + x) * 4;
      result.data[o] = v;
      result.data[o + 1] = v;
      result.data[o + 2] = v;
      result.data[o + 3] = 255;
    }
  }
  octx.putImageData(result, 0, 0);
  work.width = 0;
  work.height = 0;
  return out;
}

/** A box blur, across then down, in place. */
function blur(h: Float32Array, w: number, hgt: number, r: number): void {
  const line = new Float32Array(Math.max(w, hgt));
  const n = r * 2 + 1;
  for (let y = 0; y < hgt; y += 1) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k += 1) sum += h[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x += 1) {
      line[x] = sum / n;
      sum += h[row + Math.min(w - 1, x + r + 1)] - h[row + Math.max(0, x - r)];
    }
    for (let x = 0; x < w; x += 1) h[row + x] = line[x];
  }
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    for (let k = -r; k <= r; k += 1) sum += h[Math.min(hgt - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < hgt; y += 1) {
      line[y] = sum / n;
      sum += h[Math.min(hgt - 1, y + r + 1) * w + x] - h[Math.max(0, y - r) * w + x];
    }
    for (let y = 0; y < hgt; y += 1) h[y * w + x] = line[y];
  }
}
