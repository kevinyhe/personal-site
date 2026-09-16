/** The five designs, for the routes and the switch in every top bar. A
 *  plain module, not a client one, so the server route can read it. */
export const VARIANTS = [
  { n: 1, name: "Ledger", note: "an index, in a serif, on cream" },
  { n: 2, name: "Grid", note: "Swiss columns, mono captions, icon tiles" },
  { n: 3, name: "Terminal", note: "monospace, a table and bars" },
  { n: 4, name: "Sakura", note: "the site's own dither, petals and needles" },
  { n: 5, name: "Poster", note: "kinetic type, marquees, stacked cards" },
  // 6–15: direct rebuilds of one awwwards portfolio's layout and motion each.
  { n: 6, name: "Blur", note: "after bleibtgleich.dev: blur-to-blob text, wave clip reveals" },
  { n: 7, name: "HUD", note: "after danielkiss.hu: a live x/y/scroll/section readout" },
  { n: 8, name: "Liquid", note: "after guillaumecolombel.fr: a WebGL carousel that drags like liquid" },
  { n: 9, name: "Hover", note: "after dennissnellenberg.com: cursor-following tiles, magnetic button" },
  { n: 10, name: "Pinned", note: "after the Lenis showcase: pinned horizontal scroll, outlined type" },
  { n: 11, name: "Grow", note: "after gionatannese.com: a seed that opens into a flower as you scroll" },
  { n: 12, name: "Preloader", note: "after gilhuybrecht.com: a 0–100% loader, then only the gallery" },
  { n: 13, name: "Editorial", note: "after noahlesage.com: each project re-themes the page" },
  { n: 14, name: "Chain", note: "after brandonyasin.com: case studies in a chain, a draggable pill" },
  { n: 15, name: "Tear", note: "after meermohsin.me: paper-tear transitions, a custom cursor" },
] as const;
