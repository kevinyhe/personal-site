/**
 * What is printed on each face of each sheet, as a list of things to draw
 * at fixed places on a TEX_W x TEX_H canvas: lines of text, rules, a
 * halftone picture, skill marks, boxes. Laid out here and drawn in
 * print.ts, so a Node script can run the layout with rough type widths
 * and check that every headline fits its page.
 *
 * No imports but layout.ts, and no DOM. The words come in as `Content`.
 */
import { fitHeadline, PROJECT_SHEETS, SERIF_UNSAFE, TEX_H, TEX_W, wrap } from "./layout";

export type Face = "serif" | "sans" | "mono";
export type Font = { face: Face; size: number; weight: number; italic: boolean; tracking: number; caps: boolean };
/** Width of `text` set in `font`, in canvas px. Caps and tracking are applied by the caller. */
export type MeasureFont = (text: string, font: Font) => number;

export type SceneKey = "coach" | "blaster" | "ring" | "robot" | "saturn" | "torii" | "pagoda" | "lanterns";

export type Run =
  | { kind: "text"; text: string; x: number; y: number; font: Font; align: "left" | "center" | "right"; soft?: boolean }
  | { kind: "rule"; x: number; y: number; w: number; h: number }
  | { kind: "picture"; x: number; y: number; w: number; h: number; scene: SceneKey; seed: number }
  | { kind: "mark"; x: number; y: number; size: number; icon?: string; mark?: string }
  | { kind: "frame"; x: number; y: number; w: number; h: number; line: number }
  | { kind: "square"; x: number; y: number; size: number };

/** A place on the face that is a link. Canvas px. */
export type Hot = { x0: number; y0: number; x1: number; y1: number; href: string; label: string };

export type Printed = {
  runs: Run[];
  hot: Hot[];
  /** Lines of body text that did not fit. Should be 0. */
  overflow: number;
  headline: { size: number; lines: string[]; widest: number; face: Face } | null;
};

export type Content = {
  projects: {
    title: string;
    tagline: string;
    bullets: string[];
    stack: string[];
    award?: string;
    year: string;
    href?: string;
    kind: string;
  }[];
  skillGroups: { label: string; blurb: string; skills: { name: string; icon?: string; mark?: string }[] }[];
  email: string;
  links: { label: string; handle: string; href: string }[];
  school: string;
  degree: string;
};

export type FaceKey = string;

const M = 60;
const CW = TEX_W - 2 * M;
const GUT = 36;
const COL = (CW - 2 * GUT) / 3;
const FOOT = TEX_H - 92;
const NAME = "Things that move";
const SCENES: SceneKey[] = ["coach", "blaster", "ring", "robot", "saturn"];

const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

const f = (face: Face, size: number, o: Partial<Font> = {}): Font => ({
  face,
  size,
  weight: o.weight ?? (face === "sans" ? 300 : 400),
  italic: o.italic ?? face === "serif",
  tracking: o.tracking ?? 0,
  caps: o.caps ?? false,
});
const LABEL = (size = 17): Font => f("mono", size, { caps: true, tracking: 0.16, weight: 500 });

/** The face a title can be set in: the serif where it can show every glyph, else Inter. */
export const titleFace = (text: string): Face => (SERIF_UNSAFE.test(text) ? "sans" : "serif");

class Page {
  runs: Run[] = [];
  hot: Hot[] = [];
  readonly m: MeasureFont;
  constructor(m: MeasureFont) {
    this.m = m;
  }
  width(text: string, font: Font): number {
    const t = font.caps ? text.toUpperCase() : text;
    return this.m(t, font) + font.tracking * font.size * Math.max(0, t.length - 1);
  }
  text(text: string, x: number, y: number, font: Font, align: "left" | "center" | "right" = "left", soft = false): void {
    if (text) this.runs.push({ kind: "text", text, x, y, font, align, soft });
  }
  rule(y: number, h = 1.5, x = M, w = CW): void {
    this.runs.push({ kind: "rule", x, y, w, h });
  }
  /** Lines at a font; returns the y after the last. */
  lines(lines: string[], x: number, top: number, font: Font, lh: number, soft = false): number {
    let y = top;
    for (const l of lines) {
      this.text(l, x, y + font.size * 0.8, font, "left", soft);
      y += font.size * lh;
    }
    return y;
  }
  wrapped(text: string, font: Font, width: number): string[] {
    const measure = (t: string): number => this.width(t, { ...font, size: 100 }) / 100;
    return wrap(text, font.face, font.size, (t) => measure(t), width);
  }
  /** A link area around a line of text set with its baseline at y. */
  hotText(text: string, x: number, y: number, font: Font, href: string, align: "left" | "right" = "left"): void {
    const w = this.width(text, font);
    const x0 = align === "left" ? x : x - w;
    this.hot.push({ x0: x0 - 14, y0: y - font.size * 1.6, x1: x0 + w + 14, y1: y + font.size * 0.9, href, label: text });
  }
  /** The strip across the top of every face: three mono labels over a double rule. */
  top(left: string, centre: string, right: string): void {
    const font = LABEL();
    this.text(left, M, 72, font, "left");
    this.text(centre, TEX_W / 2, 72, font, "center");
    this.text(right, TEX_W - M, 72, font, "right");
    this.rule(88, 5);
    this.rule(98, 1.5);
  }
  masthead(): number {
    this.text(NAME, TEX_W / 2, 200, f("serif", 104), "center");
    this.rule(226, 1.5);
    return 226;
  }
  dateline(left: string, centre: string, right: string): number {
    const font = LABEL(16);
    this.text(left, M, 256, font, "left");
    this.text(centre, TEX_W / 2, 256, font, "center");
    this.text(right, TEX_W - M, 256, font, "right");
    this.rule(272, 4);
    return 276;
  }
  foot(left: string, right: string, href?: string): void {
    this.rule(FOOT, 1.5);
    const font = f("mono", 18, { weight: 500 });
    const y = FOOT + 38;
    this.text(left, M, y, font, "left");
    if (href) this.hotText(left, M, y, font, href);
    this.text(right, TEX_W - M, y, LABEL(16), "right", true);
  }
  /**
   * A title and lines under it, set against the right margin. Used on the
   * backs of sheets: they lie on the left, where the camera often cuts off
   * the outer edge, so their words sit by the spine.
   */
  caption(title: string, top: number, maxSize: number, rest: { text: string; font: Font; lh: number; gap: number; soft: boolean }[]): Printed["headline"] {
    const probe = new Page(this.m).headline(title, top, CW, maxSize, 1);
    const widest = probe.fit?.widest ?? 0;
    const head = this.headline(title, top, CW, maxSize, 1, TEX_W - M - widest);
    let y = head.bottom;
    for (const r of rest) {
      y += r.gap;
      for (const line of this.wrapped(r.text, r.font, CW * 0.72)) {
        this.text(line, TEX_W - M, y + r.font.size * 0.8, r.font, "right", r.soft);
        y += r.font.size * r.lh;
      }
    }
    return head.fit;
  }
  headline(text: string, top: number, width: number, maxSize: number, maxLines: number, x = M, splitAt = " "): { bottom: number; fit: Printed["headline"] } {
    const face = titleFace(text);
    const font = f(face, 100, face === "sans" ? { weight: 500, italic: false, tracking: -0.02 } : {});
    const fit = fitHeadline(text, face, (t) => this.width(t, font) / 100, width, maxSize, maxLines, splitAt);
    const size = Math.floor(fit.size);
    const lf = { ...font, size };
    const step = size * (face === "serif" ? 0.9 : 0.98);
    let y = top + size * 0.76;
    for (const l of fit.lines) {
      this.text(l, x, y, lf, "left");
      y += step;
    }
    const bottom = top + step * (fit.lines.length - 1) + size * 0.98;
    return { bottom, fit: { size, lines: fit.lines, widest: fit.widest * (size / fit.size), face } };
  }
}

// ------------------------------------------------------------ the faces

/** A project's own page: masthead, headline, tagline, picture and columns. */
function projectFront(c: Content, k: number, m: MeasureFont): Printed {
  const p = c.projects[k];
  const pg = new Page(m);
  pg.top("Kevin He", "Toronto", `${pad2(k + 1)} / ${pad2(PROJECT_SHEETS)}`);
  pg.masthead();
  pg.dateline(p.year, p.kind, p.award ?? "");
  const head = pg.headline(p.title, 306, CW, 210, 2);

  const tagFont = f("sans", 32);
  const tag = pg.wrapped(p.tagline, tagFont, CW);
  const tagEnd = pg.lines(tag, M, head.bottom + 22, tagFont, 1.3);
  const ruleY = tagEnd + 14;
  pg.rule(ruleY, 1.5);
  const bodyTop = ruleY + 30;
  const bodyEnd = FOOT - 26;

  // The picture spans the second and third columns, the stack under it.
  const px = M + COL + GUT;
  const pw = COL * 2 + GUT;
  const ph = Math.round(Math.min(380, Math.max(200, (bodyEnd - bodyTop) * 0.5)));
  pg.runs.push({ kind: "picture", x: px, y: bodyTop, w: pw, h: ph, scene: SCENES[k], seed: 11 + k * 7 });
  const capFont = f("mono", 17);
  const cap = pg.wrapped(p.stack.join("  ·  "), capFont, pw);
  const capEnd = pg.lines(cap, px, bodyTop + ph + 12, capFont, 1.45, true);

  // Thin rules between the columns, as on a broadsheet.
  for (const i of [1, 2]) {
    const x = M + i * COL + (i - 0.5) * GUT;
    const y0 = i === 1 ? bodyTop : capEnd + 8;
    pg.runs.push({ kind: "rule", x: x - 0.75, y: y0, w: 1.5, h: bodyEnd - y0 });
  }

  const columns = [
    { x: M, top: bodyTop },
    { x: M + COL + GUT, top: capEnd + 22 },
    { x: M + 2 * (COL + GUT), top: capEnd + 22 },
  ];
  let overflow = 0;
  for (const size of [27, 26, 25, 24, 23, 22, 21, 20]) {
    const font = f("sans", size);
    const lh = size * 1.36;
    const trial: Run[] = [];
    let col = 0;
    let y = columns[0].top;
    let left = 0;
    const indent = 22;
    const place = (line: string, first: boolean): boolean => {
      while (col < 3 && y + lh > bodyEnd) {
        col += 1;
        if (col < 3) y = columns[col].top;
      }
      if (col >= 3) return false;
      const x = columns[col].x;
      if (first) trial.push({ kind: "square", x, y: y + lh * 0.5 - 6, size: 9 });
      trial.push({ kind: "text", text: line, x: x + indent, y: y + size * 0.88, font, align: "left" });
      y += lh;
      return true;
    };
    for (let b = 0; b < p.bullets.length; b += 1) {
      const lines = pg.wrapped(p.bullets[b], font, COL - indent);
      lines.forEach((l, i) => {
        if (!place(l, i === 0)) left += 1;
      });
      // Half a line between paragraphs, unless the column just broke.
      if (col < 3 && y !== columns[col].top) y += lh * 0.45;
    }
    overflow = left;
    if (left === 0 || size === 20) {
      pg.runs.push(...trial);
      break;
    }
  }

  if (p.href) pg.foot(hostOf(p.href), "Work", p.href);
  else pg.foot("Kevin He", "Work");
  return { runs: pg.runs, hot: pg.hot, overflow, headline: head.fit };
}

/** The back of a project sheet: a large picture of the project that follows, and its title. */
function plateBack(c: Content, n: number, m: MeasureFont): Printed {
  const p = c.projects[n];
  const pg = new Page(m);
  pg.top("Kevin He", "Plate", `${pad2(n + 1)} / ${pad2(PROJECT_SHEETS)}`);
  const top = 130;
  const h = 930;
  pg.runs.push({ kind: "picture", x: M, y: top, w: CW, h, scene: SCENES[n], seed: 40 + n * 5 });
  pg.rule(top + h + 26, 4);
  const head = pg.caption(p.title, top + h + 52, 96, [
    { text: p.tagline, font: f("sans", 28), lh: 1.32, gap: 14, soft: false },
    { text: p.stack.join("  ·  "), font: f("mono", 17), lh: 1.45, gap: 16, soft: true },
  ]);
  pg.foot(p.year, "Plate");
  return { runs: pg.runs, hot: [], overflow: 0, headline: head };
}

/** One group of skills in a column: its name, its line, then a mark and a name per skill. */
function skillColumn(pg: Page, g: Content["skillGroups"][number], x: number, top: number, width: number, bottom: number): number {
  // Four of the five labels carry an "&", which the serif cannot set, so
  // all five are in Inter and the columns match.
  const lf = f("sans", 36, { weight: 500, italic: false, tracking: -0.01 });
  const labelLines = pg.wrapped(g.label, lf, width);
  let y = pg.lines(labelLines, x, top, lf, 1.02);
  const bf = f("sans", 22, { italic: true });
  y = pg.lines(pg.wrapped(g.blurb, bf, width), x, y + 10, bf, 1.34, true);
  pg.rule(y + 10, 1.5, x, width);
  y += 30;
  const nameFont = f("sans", 29, { weight: 400 });
  const row = Math.min(62, (bottom - y) / g.skills.length);
  for (const s of g.skills) {
    const size = Math.min(38, row * 0.66);
    pg.runs.push({ kind: "mark", x, y: y + (row - size) / 2, size, icon: s.icon, mark: s.mark });
    pg.text(s.name, x + size + 16, y + row / 2 + nameFont.size * 0.34, nameFont);
    y += row;
  }
  return y;
}

/** Left half of the centre fold: the headline and the first two groups. */
function skillsLeft(c: Content, m: MeasureFont): Printed {
  const pg = new Page(m);
  pg.top("Kevin He", "Centre fold", "Skills");
  const head = pg.headline("Skills", 128, CW, 250, 1);
  const top = Math.max(head.bottom + 40, 520);
  pg.rule(top - 18, 4);
  const w = (CW - GUT) / 2;
  const bottom = FOOT - 20;
  skillColumn(pg, c.skillGroups[0], M, top, w, bottom);
  skillColumn(pg, c.skillGroups[1], M + w + GUT, top, w, bottom);
  pg.runs.push({ kind: "rule", x: M + w + GUT / 2 - 0.75, y: top, w: 1.5, h: bottom - top });
  pg.foot(`${c.skillGroups[0].label}  ·  ${c.skillGroups[1].label}`, "Skills");
  return { runs: pg.runs, hot: [], overflow: 0, headline: head.fit };
}

/** Right half of the centre fold: a picture across the top and the other three groups. */
function skillsRight(c: Content, m: MeasureFont): Printed {
  const pg = new Page(m);
  pg.top("Skills", "Centre fold", "Kevin He");
  pg.runs.push({ kind: "picture", x: M, y: 128, w: CW, h: 356, scene: "pagoda", seed: 71 });
  const top = 520;
  pg.rule(top - 18, 4);
  const bottom = FOOT - 20;
  for (let i = 0; i < 3; i += 1) {
    const x = M + i * (COL + GUT);
    skillColumn(pg, c.skillGroups[2 + i], x, top, COL, bottom);
    if (i > 0) pg.runs.push({ kind: "rule", x: x - GUT / 2 - 0.75, y: top, w: 1.5, h: bottom - top });
  }
  pg.foot(c.skillGroups.slice(2).map((g) => g.label).join("  ·  "), "Skills");
  return { runs: pg.runs, hot: [], overflow: 0, headline: null };
}

/** The back of the skills sheet, left of the back page: a torii, a name, the school. */
function contactLeft(c: Content, m: MeasureFont): Printed {
  const pg = new Page(m);
  pg.top("Kevin He", "Plate", "Toronto");
  pg.runs.push({ kind: "picture", x: M, y: 130, w: CW, h: 980, scene: "torii", seed: 90 });
  pg.rule(1136, 4);
  const head = pg.caption("Kevin He", 1162, 110, [
    { text: c.school, font: f("sans", 28), lh: 1.3, gap: 12, soft: false },
    { text: c.degree, font: f("mono", 18), lh: 1.45, gap: 6, soft: true },
  ]);
  pg.foot("Toronto", "Plate");
  return { runs: pg.runs, hot: [], overflow: 0, headline: head };
}

/** The back page: the email as the headline, the links in a small classified box. */
function contactFront(c: Content, m: MeasureFont): Printed {
  const pg = new Page(m);
  pg.top("Kevin He", "Back page", "Contact");
  pg.masthead();
  pg.dateline("Toronto", "Contact", "Kevin He");
  const top = 318;
  const head = pg.headline(c.email, top, CW, 190, 2, M, "@");
  if (head.fit) {
    const step = head.fit.size * 0.98;
    pg.hot.push({ x0: M - 12, y0: top - 6, x1: M + head.fit.widest + 12, y1: top + step * head.fit.lines.length + 10, href: `mailto:${c.email}`, label: c.email });
  }
  const ruleY = head.bottom + 34;
  pg.rule(ruleY, 1.5);
  const bodyTop = ruleY + 34;
  const bodyEnd = FOOT - 30;

  // The picture on the left two columns, the box on the right.
  const pw = COL * 2 + GUT;
  pg.runs.push({ kind: "picture", x: M, y: bodyTop, w: pw, h: bodyEnd - bodyTop, scene: "lanterns", seed: 33 });

  const bx = M + pw + GUT;
  const title = LABEL(18);
  const lab = LABEL(15);
  const handle = f("sans", 27, { weight: 400 });
  const entry = 88;
  const bh = 78 + entry * c.links.length + 10;
  pg.runs.push({ kind: "frame", x: bx, y: bodyTop, w: COL, h: bh, line: 3 });
  pg.text("Classified", bx + COL / 2, bodyTop + 44, title, "center");
  pg.rule(bodyTop + 62, 1.5, bx + 18, COL - 36);
  let y = bodyTop + 78;
  for (const l of c.links) {
    pg.text(l.label, bx + 22, y + 24, lab, "left", true);
    pg.text(l.handle, bx + 22, y + 62, handle);
    pg.hot.push({ x0: bx + 6, y0: y + 2, x1: bx + COL - 6, y1: y + entry - 6, href: l.href, label: `${l.label} ${l.handle}` });
    y += entry;
  }
  pg.foot(`${c.email}`, "Contact", `mailto:${c.email}`);
  return { runs: pg.runs, hot: pg.hot, overflow: 0, headline: head.fit };
}

/** A face nothing is printed on: the back of the last sheet, never seen. */
const blank = (): Printed => ({ runs: [], hot: [], overflow: 0, headline: null });

/**
 * The face named by key: "f3" is the front of sheet 3, "b3" its back.
 * Sheets 0 to 4 carry the projects, 5 the skills, 6 the back page. The
 * back of each project sheet shows the next project's plate, so the open
 * spread reads as one: plate on the left, story on the right.
 */
export function printFace(key: FaceKey, c: Content, m: MeasureFont): Printed {
  const front = key[0] === "f";
  const j = Number(key.slice(1));
  if (front) {
    if (j < PROJECT_SHEETS) return projectFront(c, j, m);
    if (j === 5) return skillsRight(c, m);
    if (j === 6) return contactFront(c, m);
    return blank();
  }
  if (j < PROJECT_SHEETS - 1) return plateBack(c, j + 1, m);
  if (j === PROJECT_SHEETS - 1) return skillsLeft(c, m);
  if (j === 5) return contactLeft(c, m);
  return blank();
}

/** Every face someone can see, in the order they come. */
export const FACE_KEYS: FaceKey[] = ["f0", "b0", "f1", "b1", "f2", "b2", "f3", "b3", "f4", "b4", "f5", "b5", "f6"];
