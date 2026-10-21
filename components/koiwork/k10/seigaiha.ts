/**
 * The seigaiha (青海波): rows of overlapping circles, each drawn as a few
 * concentric rings, every row half a circle lower than the last and moved
 * along by a radius, so the lower circles cover the bottoms of the upper
 * ones and only fans of arcs show. Drawn in pink hairlines on a screen-sized
 * 2D canvas that stays put while the work section goes by.
 *
 * Each project has its own band of it. As the band comes up the screen its
 * scales come in one by one in a sweep from the left, each one ring at a
 * time from the outside in. Where a koi is, the pattern fades out in a soft
 * round clearing (the fish part the water), and it is faint behind the
 * project's name and facts so they read.
 */

export type Band = {
  /** The band's box on screen, in CSS px. */
  top: number;
  height: number;
  /** The box of the type in it, which the pattern stays faint behind. */
  text: { left: number; top: number; right: number; bottom: number };
  /** How far the band's water fades in at its top and bottom, in px. */
  fade: number;
  /** 0..1: how far the band's sweep has come. */
  reveal: number;
};

export type Clearing = { x: number; y: number; r: number };

/** Rings per scale. */
const RINGS = 4;
/** How strong the lines are at full. */
const LINE = 0.08;
/** Near the edge of a fish's clearing the lines come up to this. */
const LIFT = 0.125;
const INK_RGB = "249,185,220";
const GROUND = "#170a14";

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export function drawSeigaiha(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, bands: Band[], clear: Clearing[]): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1 / dpr; // one device pixel
  const r = w < 700 ? 22 : Math.max(36, Math.min(96, w * 0.034));
  const cols = Math.ceil(w / (2 * r)) + 2;

  for (const b of bands) {
    if (b.reveal <= 0 || b.top > h || b.top + b.height < 0) continue;
    const rows = Math.ceil(b.height / (r / 2)) + 2;
    const r0 = Math.max(0, Math.floor(-b.top / (r / 2)) - 2);
    const r1 = Math.min(rows, Math.ceil((h - b.top) / (r / 2)) + 2);
    for (let row = r0; row < r1; row += 1) {
      const cy = b.top + row * (r / 2);
      // The water is a strip through the middle of the band, soft at its
      // top and bottom, so there is open ground between projects.
      const edge = smooth(Math.min((cy - b.top) / b.fade, (b.top + b.height - cy) / b.fade));
      if (edge <= 0) continue;
      const shift = row % 2 ? r : 0;
      for (let c = -1; c < cols; c += 1) {
        const cx = c * 2 * r + shift;
        // The sweep: each column 0.015 of the reveal after the one to its left.
        const lag = Math.min(0.6, Math.max(0, c + 1) * 0.015);
        const local = smooth((b.reveal - lag) / (1 - lag));
        if (local <= 0) continue;
        let a = edge;
        // Faint behind the type.
        const tx = Math.max(b.text.left - cx, 0, cx - b.text.right);
        const ty = Math.max(b.text.top - cy, 0, cy - b.text.bottom);
        a *= 0.14 + 0.86 * smooth(Math.hypot(tx, ty) / (r * 4));
        // Parted round the fish, and a little brighter at the clearing's rim,
        // the water pushed aside.
        let lift = 0;
        for (const k of clear) {
          const d = (Math.hypot(cx - k.x, cy - k.y) - k.r * 0.55) / (k.r * 0.75);
          a *= smooth(d);
          lift = Math.max(lift, Math.max(0, 1 - Math.abs(d - 1.1) / 0.7));
        }
        if (a < 0.01) continue;
        // The circle's ground covers the rows above, then its rings.
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0);
        ctx.fillStyle = GROUND;
        ctx.fill();
        ctx.beginPath();
        for (let k = 0; k < RINGS; k += 1) {
          // Outer ring first; each next one once the last is in.
          const on = smooth(local * RINGS - k);
          if (on <= 0) break;
          const rr = (r * (RINGS - k)) / RINGS - 1;
          const sweep = Math.PI * on;
          ctx.moveTo(cx - rr, cy);
          ctx.arc(cx, cy, rr, Math.PI, Math.PI + sweep);
        }
        ctx.strokeStyle = `rgba(${INK_RGB},${((LINE + (LIFT - LINE) * lift) * a * (0.35 + 0.65 * local)).toFixed(3)})`;
        ctx.stroke();
      }
    }
  }
}
