// A cherry sprig for the prologue sides and the preloader, replacing the
// reference's poppy. One curved stem from the bottom edge, a few side twigs,
// five-petal blossoms with dark centres, some buds and leaves, all in grey on
// opaque black. The sprig is a small tree of nodes; each node sways about its
// attachment point on its own sine of time, so blossoms nod on their stalks,
// twigs rock and the whole stem leans back and forth from the base.

import type { CanvasSource } from "../barShader";
import { makeRng } from "./noise";

type SprigOptions = {
  seed: number;
  width: number;
  height: number;
  side: "left" | "right" | "center";
  scale?: number;
  // Multiplies the size of every blossom and bud, leaving the stem alone.
  // 1 keeps the sprig exactly as it was.
  blossomScale?: number;
};

type Kind = "stem" | "twig" | "blossom" | "bud" | "leaf";

type Node = {
  kind: Kind;
  x: number; // attachment point in the parent's frame
  y: number;
  rot: number; // base orientation
  swayAmp: number; // radians
  swayPeriod: number;
  swayPhase: number;
  scaleAmp: number; // blossoms only: breathing
  scalePeriod: number;
  size: number; // radius (blossom, bud) or length (twig, leaf, stalk)
  stalk: number; // blossom/bud: distance from the attachment to the flower
  tilt: number; // blossom: squash for a flower seen at an angle
  petalRot: number;
  grey: number;
  pts: Float32Array | null; // stem/twig centreline in own frame
  width0: number; // stem/twig thickness at the start and end
  width1: number;
  children: Node[];
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const BLOSSOM_GREY = 230;
const BUD_GREY = 180;
const WOOD_GREY = 120;

function makeNode(kind: Kind, partial: Partial<Node>): Node {
  return {
    kind,
    x: 0,
    y: 0,
    rot: 0,
    swayAmp: 0,
    swayPeriod: 1,
    swayPhase: 0,
    scaleAmp: 0,
    scalePeriod: 1,
    size: 1,
    stalk: 0,
    tilt: 1,
    petalRot: 0,
    grey: WOOD_GREY,
    pts: null,
    width0: 1,
    width1: 1,
    children: [],
    ...partial,
  };
}

// One five-petal blossom at unit radius: heart-shaped petals with a notch at
// the tip, slightly overlapping. Built once, scaled per flower.
function makeFlowerPath(): Path2D {
  const p = new Path2D();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pt = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
    const o = pt(0, 0);
    p.moveTo(o[0], o[1]);
    let q = pt(0.22, -0.5);
    let r = pt(0.86, -0.52);
    let e = pt(1, -0.15);
    p.bezierCurveTo(q[0], q[1], r[0], r[1], e[0], e[1]);
    q = pt(0.86, 0);
    e = pt(1, 0.15);
    p.quadraticCurveTo(q[0], q[1], e[0], e[1]);
    q = pt(0.86, 0.52);
    r = pt(0.22, 0.5);
    e = pt(0, 0);
    p.bezierCurveTo(q[0], q[1], r[0], r[1], e[0], e[1]);
    p.closePath();
  }
  return p;
}

let flowerPath: Path2D | null = null;

function bezier3(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function bezier2(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export function createSprig(options: SprigOptions): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(options.width));
  const h = Math.max(2, Math.round(options.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(options.seed);
  const scale = options.scale ?? 1;
  const blossomScale = options.blossomScale ?? 1;
  const lean = options.side === "left" ? 1 : options.side === "right" ? -1 : 0;
  // "center" is the preloader: the sprig stands alone in a square and has to
  // fill it, the way the reference's animal fills the same square. The sides
  // are the prologue's tall narrow columns and stay as they are.
  const center = options.side === "center";

  // Stem height. The centre sprig is shorter so its top cluster, which is much
  // bigger than the sides', still has room above the stem.
  const Hs = (center ? 0.76 : 0.86) * h * scale;
  // Sizes follow the height, but a tall narrow box (the prologue sides) caps
  // them by the width so the flowers never leave the box. The centre sprig's
  // flowers are about a fifth of the square across, twice the sides'.
  const blossomR = (center ? Math.min(0.12 * Hs, 0.115 * w) : Math.min(0.056 * Hs, 0.08 * w)) * blossomScale;
  // The longest stalk any blossom hangs on below, needed to work out how far
  // a twig can reach before its flower would leave the box.
  const stalkMax = blossomR * 0.7;
  const twigMax = center
    ? Math.max(0.1 * w, Math.min(0.42 * Hs, 0.45 * w - stalkMax - blossomR * 1.3 - 0.03 * Hs))
    : Math.min(0.2 * Hs, 0.2 * w);
  // A leaning sprig starts off-centre and leans only as far as the box allows
  // for the longest twig and its blossom on the leaning side.
  const baseX = w * (0.5 - lean * 0.08);
  const edge = lean >= 0 ? 0.97 * w - baseX : baseX - 0.03 * w; // room toward the leaning side
  const leanRoom = Math.max(0, edge - twigMax - blossomR * 1.2);
  const leanX = lean === 0 ? (rng() - 0.5) * 0.06 * Hs : lean * Math.min(0.24 * Hs, leanRoom) + (rng() - 0.5) * 0.02 * Hs;

  // Main stem: a cubic from the base to the top, bowing toward the lean.
  const cx1 = leanX * 0.12 + (rng() - 0.5) * 0.04 * Hs;
  const cy1 = -0.35 * Hs;
  const cx2 = leanX * 0.75;
  const cy2 = -0.72 * Hs;
  const stemSamples = 48;
  const stemPts = new Float32Array((stemSamples + 1) * 2);
  for (let i = 0; i <= stemSamples; i++) {
    const t = i / stemSamples;
    stemPts[i * 2] = bezier3(0, cx1, cx2, leanX, t);
    stemPts[i * 2 + 1] = bezier3(0, cy1, cy2, -Hs, t);
  }
  const stemAt = (t: number): [number, number, number] => {
    const x = bezier3(0, cx1, cx2, leanX, t);
    const y = bezier3(0, cy1, cy2, -Hs, t);
    const dx = bezier3(0, cx1, cx2, leanX, t + 0.01) - x;
    const dy = bezier3(0, cy1, cy2, -Hs, t + 0.01) - y;
    return [x, y, Math.atan2(dy, dx)];
  };

  const root = makeNode("stem", {
    x: baseX,
    y: h,
    swayAmp: 1.5 * DEG,
    swayPeriod: 5,
    swayPhase: rng() * TAU,
    pts: stemPts,
    width0: 0.016 * Hs,
    width1: 0.006 * Hs,
  });

  const blossom = (x: number, y: number, rot: number, stalk: number, sizeMul = 1): Node =>
    makeNode("blossom", {
      x,
      y,
      rot,
      stalk,
      size: blossomR * sizeMul * (0.85 + 0.3 * rng()),
      tilt: 0.7 + 0.3 * rng(),
      petalRot: rng() * TAU,
      swayAmp: 5 * DEG,
      swayPeriod: 1.2 + 1.2 * rng(),
      swayPhase: rng() * TAU,
      scaleAmp: 0.03,
      scalePeriod: 1.2 + 1.2 * rng(),
      grey: BLOSSOM_GREY + (rng() - 0.5) * 12,
    });
  const bud = (x: number, y: number, rot: number, stalk: number): Node =>
    makeNode("bud", {
      x,
      y,
      rot,
      stalk,
      size: blossomR * 0.4 * (0.85 + 0.3 * rng()),
      swayAmp: 3 * DEG,
      swayPeriod: 1.4 + 1 * rng(),
      swayPhase: rng() * TAU,
      grey: BUD_GREY + (rng() - 0.5) * 16,
    });
  const leaf = (x: number, y: number, rot: number, len: number, grey: number): Node =>
    makeNode("leaf", {
      x,
      y,
      rot,
      size: len,
      swayAmp: 2 * DEG,
      swayPeriod: 2 + 1.5 * rng(),
      swayPhase: rng() * TAU,
      grey,
    });

  // Side twigs: alternate sides up the stem, each with its own blossoms. The
  // centre sprig carries six, starting lower and thrown out nearly sideways,
  // so the square fills across and down instead of leaving a bare stem.
  const twigCount = center ? 6 : 3 + (rng() < 0.5 ? 1 : 0);
  let side = rng() < 0.5 ? 1 : -1;
  const twigParams = center
    ? [0.22, 0.36, 0.5, 0.63, 0.76, 0.88]
    : [0.4, 0.55, 0.69, 0.82].slice(0, twigCount);
  for (const s of twigParams) {
    const [ax, ay, tangent] = stemAt(s + (rng() - 0.5) * 0.04);
    const spread = (center ? 58 + rng() * 26 : 38 + rng() * 22) * DEG;
    // The centre sprig keeps its twigs near their full length so the square
    // fills right out to the sides; the sides vary more.
    const L = twigMax * (center ? 0.82 + rng() * 0.18 : 0.65 + rng() * 0.35);
    // Twig centreline in its own frame: +x along the twig, bending upward,
    // which is local -y on a right twig and local +y on a left one.
    const bend = -side;
    const samples = 12;
    const pts = new Float32Array((samples + 1) * 2);
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      pts[i * 2] = bezier2(0, 0.55 * L, L, t);
      pts[i * 2 + 1] = bezier2(0, bend * 0.02 * L, bend * 0.18 * L, t);
    }
    const twig = makeNode("twig", {
      x: ax,
      y: ay,
      rot: tangent + side * spread,
      swayAmp: 1 * DEG,
      swayPeriod: 3 + rng() * 1.2,
      swayPhase: rng() * TAU,
      pts,
      width0: 0.007 * Hs,
      width1: 0.003 * Hs,
    });
    const along = (t: number): [number, number] => [bezier2(0, 0.55 * L, L, t), bezier2(0, bend * 0.02 * L, bend * 0.18 * L, t)];
    const tip = along(1);
    // Flowers point away from the twig; stalks lean toward the bend side.
    twig.children.push(blossom(tip[0], tip[1], bend * 0.6, blossomR * 0.5));
    const mid = along(0.62);
    twig.children.push(blossom(mid[0], mid[1], bend * 1.5 + (rng() - 0.5) * 0.4, blossomR * 0.7, 0.9));
    const b = along(0.36);
    twig.children.push(bud(b[0], b[1], -bend * 1.3, blossomR * 0.5));
    const lf = along(0.16);
    twig.children.push(leaf(lf[0], lf[1], -bend * 0.9, blossomR * 1.6, WOOD_GREY));
    root.children.push(twig);
    side = -side;
  }

  // The stem tip: a cluster of two blossoms and a bud.
  const [tx, ty, tTan] = stemAt(1);
  root.children.push(blossom(tx, ty, tTan + Math.PI / 2 + 0.2, blossomR * 0.35, 1.05));
  const [ux, uy, uTan] = stemAt(0.94);
  root.children.push(blossom(ux, uy, uTan + Math.PI / 2 - 1.2, blossomR * 0.8, 0.9));
  const [vx, vy, vTan] = stemAt(0.9);
  root.children.push(bud(vx, vy, vTan + Math.PI / 2 + 1.1, blossomR * 0.6));

  // Two pale leaves at the base, like the poppy's.
  root.children.push(leaf(0, -0.01 * Hs, -Math.PI / 2 - 1.1, 0.1 * Hs, 140));
  root.children.push(leaf(0, -0.01 * Hs, -Math.PI / 2 + 1.0, 0.09 * Hs, 140));

  if (!flowerPath) flowerPath = makeFlowerPath();
  const flower = flowerPath;

  const grey = (v: number) => {
    const c = Math.round(Math.max(0, Math.min(255, v)));
    return `rgb(${c},${c},${c})`;
  };

  // Fill a tapered ribbon along a centreline: the polygon of the left offsets
  // followed by the right offsets in reverse.
  const drawRibbon = (c: CanvasRenderingContext2D, pts: Float32Array, w0: number, w1: number, g: number) => {
    const n = pts.length / 2;
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      const dx = pts[i1 * 2] - pts[i0 * 2];
      const dy = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const half = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
      left.push(pts[i * 2] + nx * half, pts[i * 2 + 1] + ny * half);
      right.push(pts[i * 2] - nx * half, pts[i * 2 + 1] - ny * half);
    }
    c.fillStyle = grey(g);
    c.beginPath();
    c.moveTo(left[0], left[1]);
    for (let i = 1; i < n; i++) c.lineTo(left[i * 2], left[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(right[i * 2], right[i * 2 + 1]);
    c.closePath();
    c.fill();
  };

  const drawFlower = (c: CanvasRenderingContext2D, node: Node, t: number) => {
    const r = node.size * (1 + node.scaleAmp * Math.sin((TAU * t) / node.scalePeriod + node.swayPhase * 1.7));
    // Stalk from the attachment to the flower.
    c.strokeStyle = grey(WOOD_GREY - 10);
    c.lineWidth = Math.max(1, r * 0.08);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -node.stalk);
    c.stroke();
    c.translate(0, -node.stalk);
    c.rotate(node.petalRot);
    c.scale(r, r * node.tilt);
    // Petals: slightly darker toward the centre, like the real flower.
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, grey(node.grey - 30));
    grad.addColorStop(0.55, grey(node.grey));
    grad.addColorStop(1, grey(node.grey + 8));
    c.fillStyle = grad;
    c.fill(flower);
    // Dark eye and a ring of stamens.
    c.fillStyle = grey(105);
    c.beginPath();
    c.arc(0, 0, 0.17, 0, TAU);
    c.fill();
    c.strokeStyle = grey(165);
    c.lineWidth = 0.035;
    c.fillStyle = grey(205);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.3;
      const ex = Math.cos(a) * 0.42;
      const ey = Math.sin(a) * 0.42;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(ex, ey);
      c.stroke();
      c.beginPath();
      c.arc(ex, ey, 0.05, 0, TAU);
      c.fill();
    }
  };

  const drawBud = (c: CanvasRenderingContext2D, node: Node) => {
    const r = node.size;
    c.strokeStyle = grey(WOOD_GREY - 10);
    c.lineWidth = Math.max(1, r * 0.2);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -node.stalk);
    c.stroke();
    c.translate(0, -node.stalk);
    // The bud itself, then the darker sepal cup at its base.
    c.fillStyle = grey(node.grey);
    c.beginPath();
    c.ellipse(0, -r * 0.6, r * 0.7, r, 0, 0, TAU);
    c.fill();
    c.fillStyle = grey(125);
    c.beginPath();
    c.moveTo(-r * 0.7, -r * 0.35);
    c.lineTo(0, -r * 0.95);
    c.lineTo(r * 0.7, -r * 0.35);
    c.lineTo(0, 0.05 * r);
    c.closePath();
    c.fill();
  };

  const drawLeaf = (c: CanvasRenderingContext2D, node: Node) => {
    const L = node.size;
    c.fillStyle = grey(node.grey);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(L * 0.5, -L * 0.26, L, 0);
    c.quadraticCurveTo(L * 0.5, L * 0.26, 0, 0);
    c.closePath();
    c.fill();
    c.strokeStyle = grey(node.grey - 25);
    c.lineWidth = Math.max(1, L * 0.03);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(L * 0.9, 0);
    c.stroke();
  };

  const drawNode = (c: CanvasRenderingContext2D, node: Node, t: number) => {
    c.save();
    c.translate(node.x, node.y);
    c.rotate(node.rot + node.swayAmp * Math.sin((TAU * t) / node.swayPeriod + node.swayPhase));
    if (node.kind === "stem" || node.kind === "twig") {
      if (node.pts) {
        drawRibbon(c, node.pts, node.width0, node.width1, WOOD_GREY - 22);
        // A lighter core so the wood is not one flat grey.
        drawRibbon(c, node.pts, node.width0 * 0.55, node.width1 * 0.55, WOOD_GREY + 12);
      }
      for (const child of node.children) drawNode(c, child, t);
    } else if (node.kind === "blossom") {
      drawFlower(c, node, t);
    } else if (node.kind === "bud") {
      drawBud(c, node);
    } else {
      drawLeaf(c, node);
    }
    c.restore();
  };

  const draw = (t: number) => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    drawNode(ctx, root, t);
  };

  draw(0);
  return {
    canvas,
    animated: true,
    ready: Promise.resolve(),
    update: (t) => draw(t),
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
