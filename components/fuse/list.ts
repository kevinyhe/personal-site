/**
 * Whole-site concepts that fuse three styles: lanceyan.com's way of saying
 * things (short first-person paragraphs, organisations named inline with
 * their marks, a timeline you open row by row, paged scenes with "01 / 04"),
 * lukebaffait.fr's way of setting them (the huge two-word name, small caps
 * nav, hairlines, the glowing gradient, the work index), and this site's
 * own (plum and blossom, the aurora, sondaven's bars, lanceyan's diamonds,
 * the sakura, the television). A plain module: server routes map over it.
 */
export type Fuse = { n: number; name: string; note: string };

export const FUSES: Fuse[] = [
  { n: 1, name: "Scenes", note: "Lance's four paged scenes, each a different dotted picture from this site; Luke's name lockup on the first." },
  { n: 2, name: "Index", note: "Luke's home and work index, with Lance's timeline as the index: rows open in place, a brush stroke marks the year." },
  { n: 3, name: "Letter", note: "Lance's bio set as Luke's large mixed sans and italic serif statement, a dotted sakura pinned beside it." },
  { n: 4, name: "Channel", note: "Lance's pages shown on the site's television; the arrow changes the channel." },
  { n: 5, name: "Diptych", note: "Lance's text column on the left, Luke's full-bleed glow and name on the right, the picture changing per section." },
  { n: 6, name: "Ledger", note: "Lance's timeline drawn as a sondaven bar chart, one column of bars a year, in Luke's type." },
  { n: 7, name: "Strip", note: "A sideways run of dotted scenes with Lance's captions, Luke's footer bar along the foot." },
  { n: 8, name: "Garden", note: "The sakura as the whole site: each of Lance's pages a flower that opens, the timeline as a branch." },
];

export const pad2 = (n: number): string => String(n).padStart(2, "0");
