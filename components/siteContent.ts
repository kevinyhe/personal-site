/**
 * The site's written content, in one place.
 *
 * The home page carries Work, Info and Contact as sections below the hero
 * (components/HomeSections), and /work, /info and /contact still exist as
 * pages of their own. Both render this, so it lives here rather than being
 * typed twice and drifting.
 *
 * Kept deliberately short. Every line here is a line someone has to read,
 * and the page was three screens of small type before this.
 */

export type WorkEntry = {
  /** One line, the reference's own ratio: a title, then one thing about it. */
  description: string;
  href?: string;
  title: string;
};

/**
 * Things built, not places worked, in the order Kevin set. Titles are set
 * in the display serif, so they carry no "4" and no ASCII hyphen — see the
 * note on S‑KBD67.
 */
export const workEntries: WorkEntry[] = [
  {
    // theactually.company: "Communicate with confidence".
    description:
      "An on-device speaking coach: record a pitch, get timestamped notes on filler, pacing and posture.",
    href: "https://theactually.company",
    title: "The Actually Company",
  },
  {
    description:
      "A Nerf blaster wired into a first-person shooter. Hack the North finalist.",
    href: "https://devpost.com/software/s-kbd67",
    // U+2011 non-breaking hyphen, not an ASCII "-". The display serif is a
    // Fontspring DEMO cut and it substitutes a "DEMO" flower for ' " & @ -
    // ! ( ) / — the work titles are set in it, so an ASCII hyphen here put
    // a logo in the middle of the project name. See app/layout.tsx: the
    // font has to be licensed before this ships anyway.
    title: "S\u2011KBD67",
  },
  {
    description:
      "A PROS 4 library for VEX V5: odometry, motion control, commands and mechanisms.",
    href: "https://github.com/kevinyhe/mclib",
    title: "mclib",
  },
  {
    description:
      "A boxing game you play by swinging your phone. First overall at EurekaHacks.",
    href: "https://devpost.com/software/king-of-the-ring",
    title: "King of the Ring",
  },
];

/**
 * Three lines, not nineteen chips. The tools matter in groups; which
 * particular ORM someone has touched does not, and listing them all made
 * the page look like a keyword sheet.
 */
export const stack = [
  { items: "C++, TypeScript, Python, C, Java, SQL", label: "Languages" },
  {
    items:
      "ESP32, Arduino, VEX V5, PROS, sensor fusion, odometry, PID, motion profiling, particle filters",
    label: "Robotics",
  },
  {
    items: "Node.js, React, Three.js, Flask, WebSockets, Vitest, Git, Linux, Fusion 360",
    label: "Software",
  },
];

export const selected = [
  { title: "USACO Silver, 1000 of 1000", year: "2025" },
  { title: "Canadian Computing Competition Senior, 50 of 75", year: "2025" },
  { title: "Ontario Provincial Build Award", year: "2025" },
  { title: "SHAD, University of New Brunswick", year: "2024" },
];

/**
 * What is left after the narration has said the rest.
 *
 * "Based in Toronto" and "computer engineering at the University of
 * Toronto" are both lines of the narration now, in type five times this
 * size. Repeating them here in small print says them twice and means them
 * less. The clock is the only thing down here the sentence cannot carry.
 */
export const currently: { label: string; value: string }[] = [];

export const elsewhere = [
  { handle: "@kevinyhe", href: "https://github.com/kevinyhe", label: "GitHub" },
  {
    handle: "/in/kevinyhe",
    href: "https://www.linkedin.com/in/kevinyhe",
    label: "LinkedIn",
  },
  { handle: "@thekevinlab", href: "https://x.com/thekevinlab", label: "X" },
  {
    handle: "@kevin.h_3",
    href: "https://instagram.com/kevin.h_3",
    label: "Instagram",
  },
];

/**
 * The narration, scrolled up the television's screen.
 *
 * One first-person sentence in three stanzas of two lines, set over the
 * liquid backdrop, on the glass (see HeroIntro). Six lines, down from
 * seventeen: what I do and where, in the words the résumé's first line
 * uses; the list of what "things that move" means and the degree are
 * gone — the work below says the first and the résumé the second.
 *
 * Two thoughts to a line where they belong together ("Hello, I’m Kevin
 * He,"), one where the line has to land ("The Actually Company"). Every
 * line travels sideways as it goes by, and each the opposite way to the
 * one before it (HeroIntro's narrationX); a line is as wide as its words
 * and no wider, so `indent` is unused here and kept only for the type.
 *
 * The display serif cannot set ' " $ & 4 @ - ! ( ) * + / = # % — it draws a
 * "DEMO" watermark instead — so this text uses U+2019 for the apostrophe
 * and U+2011 for the hyphen, and carries no digits at all.
 */
export const HERO_NARRATION: {
  indent: number;
  runs: { text: string; voice?: "plain" | "soft" | "strong" }[];
}[][] = [
  [
    {
      indent: 0,
      runs: [{ text: "Hello,", voice: "soft" }, { text: "I\u2019m Kevin He," }],
    },
    {
      indent: 0,
      runs: [{ text: "an engineer", voice: "strong" }, { text: "based in Toronto" }],
    },
  ],
  [
    { indent: 0, runs: [{ text: "I write software", voice: "soft" }] },
    { indent: 0, runs: [{ text: "for things that move", voice: "strong" }] },
  ],
  [
    {
      indent: 0,
      runs: [{ text: "Now", voice: "soft" }, { text: "co\u2011founder and CTO at" }],
    },
    { indent: 0, runs: [{ text: "The Actually Company", voice: "strong" }] },
  ],
];

export const EMAIL = "kevin.yuhan.he@gmail.com";
export const GITHUB = "https://github.com/kevinyhe";

/**
 * The three links in every nav, and the ids the home sections carry.
 *
 * Info first, because that is the page's order now: the narration says who
 * I am, then shows the work. A nav that runs in a different order to the
 * page is a nav that is lying about the page.
 */
export const sectionLinks = [
  { href: "/info", id: "info", label: "Info" },
  { href: "/work", id: "work", label: "Work" },
  { href: "/contact", id: "contact", label: "Contact" },
] as const;

/** The short set shown in the hero strip and the footers. */
export const socialLinks = [
  { href: "https://x.com/thekevinlab", label: "X" },
  { href: "https://www.linkedin.com/in/kevinyhe", label: "LinkedIn" },
  { href: "https://github.com/kevinyhe", label: "GitHub" },
];
