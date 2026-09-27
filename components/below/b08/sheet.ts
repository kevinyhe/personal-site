import { BAND } from "@/components/bandColours";
import type { Skill } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { CAP, type Grid, type Headline, LINE, MARGIN, RESERVED, TRACKING } from "./layout";

/**
 * What is drawn on the sheet at the back of the scene: the headlines and
 * the skill marks, each on a canvas of its own with a clear ground. The
 * scene lays the ground colour under them, so the glass in front bends
 * real letters.
 */

/** Tracking, where the browser's canvas can do it. */
function track(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px.toFixed(2)}px`;
}

/** A width in ems at weight 700, for fitting the headlines. */
export function makeMeasure(family: string): (text: string) => number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return (text) => text.length * 0.66;
  ctx.font = `700 200px ${family}`;
  track(ctx, 0);
  return (text) => ctx.measureText(text).width / 200;
}

const plum = (alpha: number): string => {
  const v = parseInt(BAND.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
};

/**
 * One headline, filled, and round it rows of the same words in outline,
 * faint, so that a solid anywhere on the stage has letters behind it.
 * The rows leave the lower left clear for the small text.
 */
export function drawHeadline(
  canvas: HTMLCanvasElement,
  head: Headline,
  ghost: string,
  family: string,
  /** Whether the faint words also run on beside the headline, on its own rows. */
  alongside: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!head.lines[0]) return;

  const size = head.size * w;
  const fill = (): void => {
    ctx.font = `700 ${size}px ${family}`;
    track(ctx, TRACKING * size);
    ctx.fillStyle = BAND;
    head.lines.forEach((line, i) => ctx.fillText(line, head.left[i] * w, head.base[i] * h));
  };
  const big = 0.11 * w;
  const pitch = LINE * big;
  const gap = (LINE - CAP) * big;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";

  // ---- the faint rows
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(RESERVED.l * w - big * 0.1, RESERVED.t * h - big * 0.12, (RESERVED.r - RESERVED.l) * w + big * 0.2, h);
  ctx.clip("evenodd");
  ctx.font = `700 ${big}px ${family}`;
  track(ctx, TRACKING * big);
  ctx.strokeStyle = plum(0.26);
  ctx.lineWidth = Math.max(1.5, big * 0.011);
  const space = big * 0.42;
  const period = ctx.measureText(ghost).width + space;
  const row = (baseline: number, start: number): void => {
    if (baseline < -big * 0.3 || baseline > h + big) return;
    let x = start;
    while (x > 0) x -= period;
    for (; x < w; x += period) ctx.strokeText(ghost, x, baseline);
  };
  // Rows above and below the headline, each set off from the last.
  const firstBase = head.box.t * h - gap;
  for (let k = 0; firstBase - k * pitch > -big * 0.3; k += 1) {
    row(firstBase - k * pitch, MARGIN * w - (((k + 1) * 0.37) % 1) * period);
  }
  const under = head.box.b * h + gap + CAP * big;
  for (let k = 0; under + k * pitch < h + big; k += 1) {
    row(under + k * pitch, MARGIN * w - (((k + 2) * 0.53) % 1) * period);
  }
  // The rest of each headline row, in the headline's own size.
  if (!alongside) {
    ctx.restore();
    fill();
    return;
  }
  ctx.font = `700 ${size}px ${family}`;
  track(ctx, TRACKING * size);
  ctx.lineWidth = Math.max(1.5, size * 0.011);
  const ownSpace = size * 0.42;
  const ownPeriod = ctx.measureText(ghost).width + ownSpace;
  head.lines.forEach((_, i) => {
    const y = head.base[i] * h;
    const l = head.left[i] * w;
    const r = l + head.width[i] * w;
    for (let x = r + ownSpace; x < w; x += ownPeriod) ctx.strokeText(ghost, x, y);
    for (let x = l - ownPeriod; x + ownPeriod > 0; x -= ownPeriod) ctx.strokeText(ghost, x, y);
  });
  ctx.restore();
  fill();
}

/** Brand colours too light to read on the pale ground are drawn in plum. */
function markColour(hex: string): string {
  const v = parseInt(hex, 16);
  const lum = 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  return lum > 165 ? BAND : `#${hex}`;
}

/** Share of the lens's width the mark takes on the sheet. The lens makes it look larger. */
const MARK = 0.5;

/** Every skill's mark, each under where its lens will be. */
export function drawMarks(canvas: HTMLCanvasElement, grid: Grid, skills: Skill[], family: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = grid.r * 2 * h * MARK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  track(ctx, 0);
  grid.lenses.forEach((at, j) => {
    const skill = skills[j];
    if (!skill) return;
    const cx = at.x * w;
    const cy = at.y * h;
    const icon = skillIcon(skill.icon);
    if (icon) {
      ctx.save();
      ctx.translate(cx - s / 2, cy - s / 2);
      ctx.scale(s / 24, s / 24);
      ctx.fillStyle = markColour(icon.hex);
      ctx.fill(new Path2D(icon.path));
      ctx.restore();
      return;
    }
    const mark = skill.mark ?? skill.name.slice(0, 2);
    ctx.font = `700 ${(s * (mark.length > 2 ? 0.5 : 0.66)).toFixed(1)}px ${family}`;
    ctx.fillStyle = BAND;
    ctx.fillText(mark, cx, cy + s * 0.03);
  });
}
