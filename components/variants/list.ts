/** The five designs, for the routes and the switch in every top bar. A
 *  plain module, not a client one, so the server route can read it. */
export const VARIANTS = [
  { n: 1, name: "Ledger", note: "an index, in a serif, on cream" },
  { n: 2, name: "Grid", note: "Swiss columns, mono captions, icon tiles" },
  { n: 3, name: "Terminal", note: "monospace, a table and bars" },
  { n: 4, name: "Sakura", note: "the site's own dither, petals and needles" },
  { n: 5, name: "Poster", note: "kinetic type, marquees, stacked cards" },
] as const;
