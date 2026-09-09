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
  /** One line. If it needs two, it is doing too much. */
  description: string;
  href?: string;
  /** Shown only on the hover plate, not in the row. */
  tag: string;
  title: string;
  year: string;
};

export const workEntries: WorkEntry[] = [
  {
    description:
      "Software that plays games to find bugs, then proves they reproduce.",
    tag: "Company",
    title: "The Actually Company",
    year: "2026 —",
  },
  {
    description:
      "Founder in Residence, Off Season II. Built Checkpoint in San Francisco.",
    tag: "Residency",
    title: "Founders, Inc.",
    year: "2026",
  },
  {
    description:
      "A boxing game you play by swinging your phone. First overall at EurekaHacks.",
    href: "https://devpost.com/software/king-of-the-ring",
    tag: "Hackathon",
    title: "King of the Ring",
    year: "2026",
  },
  {
    description:
      "A Nerf blaster wired into a first-person shooter. Hack the North finalist, 12 of 1,200.",
    href: "https://devpost.com/software/s-kbd67",
    tag: "Hackathon",
    // U+2011 non-breaking hyphen, not an ASCII "-". The display serif is a
    // Fontspring DEMO cut and it substitutes a "DEMO" flower for ' " & @ -
    // ! ( ) / — the work titles are set in it, so an ASCII hyphen here put
    // a logo in the middle of the project name. See app/layout.tsx: the
    // font has to be licensed before this ships anyway.
    title: "S\u2011KBD67",
    year: "2025",
  },
  {
    description:
      "Captain and lead programmer. World-record autonomous routine in VEX High Stakes.",
    tag: "Robotics",
    title: "VEX 82855Z",
    year: "2022 —",
  },
  {
    description:
      "President. 56 members, a $140,000 budget, ten championship qualifications.",
    tag: "Leadership",
    title: "STL Robotics",
    year: "2025 —",
  },
  {
    description: "Discord moderation and logging bot. 40,000 users.",
    tag: "Software",
    title: "Saturn",
    year: "2021",
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
 * The narration, spoken over the statue.
 *
 * One first-person sentence in five stanzas, set over the statue while it
 * puts itself back together (see HeroIntro). `indent` is a percentage of
 * the column, desktop only.
 *
 * Two to four words a line, like the reference's. That is not only a
 * rhythm: the figure sits in the right of the frame through all of this,
 * so a line long enough to reach it is a line printed on a statue.
 *
 * The indents swing rather than drift — 0% to 16% and back, line by line
 * — because that side-to-side is the movement in the reference's own
 * staircase. Which way a line goes is set by how long it is: the short ones
 * are free to sit right, the long ones start at the margin or they run into
 * the statue.
 *
 * The band is 0..16 rather than 0..30 because the sideways travel
 * (NARRATION_DRIFT) now carries every line another 9% of the screen either
 * way on top of its indent, and the two together have to fit in the gap
 * before the figure.
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
    { indent: 14, runs: [{ text: "Hello,", voice: "soft" }] },
    { indent: 0, runs: [{ text: "I\u2019m Kevin He," }] },
    { indent: 10, runs: [{ text: "an engineer", voice: "strong" }] },
    { indent: 4, runs: [{ text: "based in Toronto" }] },
  ],
  [
    { indent: 8, runs: [{ text: "I write software", voice: "soft" }] },
    { indent: 0, runs: [{ text: "for things that move", voice: "strong" }] },
    { indent: 10, runs: [{ text: "Robot autonomy,", voice: "soft" }] },
    { indent: 2, runs: [{ text: "embedded firmware," }] },
    { indent: 12, runs: [{ text: "and the tooling" }] },
    { indent: 16, runs: [{ text: "around both" }] },
  ],
  [
    {
      indent: 10,
      runs: [{ text: "Now", voice: "soft" }, { text: "co\u2011founder" }],
    },
    { indent: 16, runs: [{ text: "and CTO at" }] },
    { indent: 0, runs: [{ text: "The Actually Company", voice: "strong" }] },
  ],
  [
    { indent: 12, runs: [{ text: "Before that,", voice: "soft" }] },
    { indent: 0, runs: [{ text: "four seasons of VEX" }] },
    { indent: 14, runs: [{ text: "and a summer" }] },
    { indent: 6, runs: [{ text: "in San Francisco" }] },
  ],
  [
    { indent: 16, runs: [{ text: "Also", voice: "soft" }] },
    { indent: 0, runs: [{ text: "computer engineering", voice: "strong" }] },
    { indent: 10, runs: [{ text: "at the University" }] },
    { indent: 14, runs: [{ text: "of Toronto" }] },
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
