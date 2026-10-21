/**
 * Everything concept 06 says, in one place. Every fact is from the résumé
 * (Kevin_He_Resume.pdf); nothing here is a guess at an age or an opinion.
 *
 * Time is counted in months from January 2021: month 0 is Jan 2021, month
 * 71 is Dec 2026. A stream is one thing on the résumé with a start and an
 * end month; the chart stacks every stream that is running in a month.
 */

export const PLUM = "#2a0d1e";
export const DEEP = "#1a0812";
export const BLOSSOM = "#f9b9dc";
export const ROSE = "#b8174f";
/** Rose lifted a step, for bars: #b8174f on plum is too close to the ground
 *  to read as thin lines. */
export const ROSE_LIT = "#dc3f78";
export const WHITE = "#fffafc";

export const FIRST_YEAR = 2021;
export const MONTHS = 72;
/** October 2026, the month this was built. Months after it draw as ground. */
export const NOW = (2026 - FIRST_YEAR) * 12 + 9;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const month = (year: number, m: number): number => (year - FIRST_YEAR) * 12 + (m - 1);
export const monthName = (i: number): string => `${MONTH_NAMES[i % 12]} ${FIRST_YEAR + Math.floor(i / 12)}`;
export const monthShort = (i: number): string => `${MONTH_NAMES[i % 12].slice(0, 3)} ${FIRST_YEAR + Math.floor(i / 12)}`;

/** The small square before an organisation's name, as on lanceyan.com. */
export type OrgKey = "actually" | "founders" | "stl" | "uoft" | "school" | "saturn" | "htn" | "eureka";
export const ORGS: Record<OrgKey, { mono: string; bg: string; fg: string; ring?: boolean }> = {
  actually: { mono: "A", bg: ROSE, fg: WHITE },
  founders: { mono: "F", bg: DEEP, fg: WHITE, ring: true },
  stl: { mono: "Z", bg: BLOSSOM, fg: DEEP },
  uoft: { mono: "U", bg: WHITE, fg: PLUM },
  school: { mono: "T", bg: "#6b3a55", fg: WHITE },
  saturn: { mono: "S", bg: WHITE, fg: DEEP },
  htn: { mono: "H", bg: DEEP, fg: BLOSSOM, ring: true },
  eureka: { mono: "E", bg: BLOSSOM, fg: PLUM },
};

export type Tone = "school" | "blossom" | "rose" | "white";
export const TONE_INK: Record<Tone, string> = { school: WHITE, blossom: BLOSSOM, rose: ROSE_LIT, white: WHITE };
/** How strong each tone draws at rest: school is the floor, so it stays quiet. */
export const TONE_ALPHA: Record<Tone, number> = { school: 0.42, blossom: 0.95, rose: 1, white: 1 };

export type Stream = {
  id: string;
  /** Stacking level, bottom first. Streams that never overlap share one. */
  level: number;
  start: number;
  /** Last month, inclusive. Running ones end at NOW. */
  end: number;
  /** Height in chart rows. */
  rows: number;
  tone: Tone;
  org: OrgKey;
  /** Short name for the month readout. */
  name: string;
  /** What it was, after the name. */
  role: string;
  /** Said in the readout for the month it began. */
  began: string;
};

export const STREAMS: Stream[] = [
  { id: "school", level: 0, start: month(2022, 9), end: month(2026, 6), rows: 5, tone: "school", org: "school", name: "St. Theresa of Lisieux", role: "high school, Richmond Hill", began: "Started high school at St. Theresa of Lisieux" },
  { id: "uoft", level: 0, start: month(2026, 9), end: NOW, rows: 5, tone: "school", org: "uoft", name: "University of Toronto", role: "computer engineering", began: "Started computer engineering at the University of Toronto" },
  { id: "vex", level: 1, start: month(2022, 9), end: NOW, rows: 9, tone: "blossom", org: "stl", name: "VEX 82855Z", role: "team captain and lead programmer", began: "Joined VEX team 82855Z as captain and lead programmer" },
  { id: "pres", level: 2, start: month(2025, 6), end: NOW, rows: 5, tone: "blossom", org: "stl", name: "STL Robotics", role: "president", began: "Became president of STL Robotics" },
  { id: "actually", level: 3, start: month(2026, 5), end: NOW, rows: 11, tone: "rose", org: "actually", name: "The Actually Company", role: "co-founder and CTO", began: "Co-founded The Actually Company" },
  { id: "founders", level: 4, start: month(2026, 6), end: month(2026, 8), rows: 7, tone: "rose", org: "founders", name: "Founders, Inc.", role: "founder in residence, San Francisco", began: "Moved to San Francisco for Founders, Inc. Off Season II" },
  { id: "saturn", level: 5, start: month(2021, 1), end: month(2021, 6), rows: 10, tone: "white", org: "saturn", name: "Saturn", role: "a Discord bot", began: "Built Saturn, a Discord bot for 40,000+ users" },
  { id: "skbd", level: 5, start: month(2025, 9), end: month(2025, 9), rows: 13, tone: "white", org: "htn", name: "S‑KBD67", role: "finalist, Hack The North", began: "Finalist at Hack The North with S‑KBD67" },
  { id: "kotr", level: 5, start: month(2026, 5), end: month(2026, 5), rows: 13, tone: "white", org: "eureka", name: "King of the Ring", role: "1st overall, EurekaHacks", began: "1st overall at EurekaHacks with King of the Ring" },
];

/** Rows of the chart's grid: the tallest stack (May 2026, 43) and headroom. */
export const CHART_ROWS = 50;

export const activeIn = (m: number): Stream[] => STREAMS.filter((s) => m >= s.start && m <= s.end);

/** One part of a sentence: plain text, or an organisation with its chip. */
export type Run = string | { org: OrgKey; text: string; href?: string };

export type TimelineRow = {
  period: string;
  head: Run[];
  facts: Run[][];
  /** Lit in the chart while this row is open or hovered. */
  streams: string[];
  quote?: string;
};

export const TIMELINE: TimelineRow[] = [
  {
    period: "Now",
    head: ["Studying computer engineering at ", { org: "uoft", text: "University of Toronto", href: "https://www.utoronto.ca" }],
    facts: [
      ["BASc in Computer Engineering with PEY Co‑op, from September 2026, expected 2031"],
      ["Still co‑founder and CTO of ", { org: "actually", text: "The Actually Company" }],
      ["Still president of ", { org: "stl", text: "STL Robotics" }],
    ],
    streams: ["uoft", "actually", "pres", "vex"],
    quote: "I build systems that bring ideas to life.",
  },
  {
    period: "2026",
    head: ["Co‑founded ", { org: "actually", text: "The Actually Company", href: "https://theactually.company" }],
    facts: [
      ["Co‑founder and CTO from May: a local‑first AI speaking coach that gives timestamped feedback on pitches and speeches"],
      ["$1k MRR, 200+ active users; 150+ automated tests behind it"],
      ["Founder in Residence at ", { org: "founders", text: "Founders, Inc." }, " Off Season II in San Francisco, June to August; one of 100 builders from 10K+ applicants"],
      ["1st overall at ", { org: "eureka", text: "EurekaHacks 2026" }, " with King of the Ring, a boxing game played with a phone’s motion sensors"],
      ["Finished high school with a 4.0 GPA"],
    ],
    streams: ["actually", "founders", "kotr", "school"],
  },
  {
    period: "2025",
    head: ["Became president of ", { org: "stl", text: "STL Robotics" }],
    facts: [
      ["President from June: a 56‑member organization with a $140,000 annual budget"],
      ["Mentored six teams to six Provincial and four World Championship qualifications"],
      ["Won the 2025 Ontario Provincial Build Award"],
      ["Finalist at ", { org: "htn", text: "Hack The North 2025" }, " with S‑KBD67, a Nerf blaster turned into shooter controls; one of 12 from 1,200+ hackers"],
      ["Founded a free robotics outreach program"],
    ],
    streams: ["pres", "skbd"],
  },
  {
    period: "2022",
    head: ["Joined VEX team ", { org: "stl", text: "82855Z" }],
    facts: [
      ["Team captain and lead programmer from September"],
      ["Started high school at ", { org: "school", text: "St. Theresa of Lisieux" }, " in Richmond Hill"],
      ["Wrote the C++ controls: odometry, feedback control, motion profiling, particle‑filter localization"],
      ["Since then, part of a VEX High Stakes world‑record autonomous routine, and 80th in global Skills of about 20,000 teams"],
    ],
    streams: ["vex", "school"],
  },
  {
    period: "2021",
    head: ["Built ", { org: "saturn", text: "Saturn" }],
    facts: [
      ["A Discord bot for moderation, logging and server management, January to June"],
      ["Used by 40,000+ users across several Discord communities"],
      ["JavaScript, Node.js and the Discord API"],
    ],
    streams: ["saturn"],
  },
];

/** The résumé's skills, with the depth profile.ts gives each (1..5). */
export type SkillBar = { name: string; depth: number };
export const SKILLS: { label: string; tone: Tone; skills: SkillBar[] }[] = [
  {
    label: "Languages",
    tone: "white",
    skills: [
      { name: "C++", depth: 5 },
      { name: "Python", depth: 5 },
      { name: "TypeScript", depth: 5 },
      { name: "JavaScript", depth: 5 },
      { name: "C", depth: 4 },
      { name: "Java", depth: 3 },
      { name: "SQL", depth: 3 },
    ],
  },
  {
    label: "Embedded & robotics",
    tone: "blossom",
    skills: [
      { name: "ESP32", depth: 5 },
      { name: "VEX V5", depth: 5 },
      { name: "PROS", depth: 5 },
      { name: "Odometry", depth: 5 },
      { name: "Controls", depth: 5 },
      { name: "Arduino", depth: 4 },
      { name: "IMUs", depth: 4 },
      { name: "Motion profiling", depth: 4 },
      { name: "Particle filters", depth: 4 },
      { name: "RTOS", depth: 3 },
    ],
  },
  {
    label: "Software & networking",
    tone: "rose",
    skills: [
      { name: "Node.js", depth: 5 },
      { name: "React", depth: 5 },
      { name: "Next.js", depth: 5 },
      { name: "Three.js", depth: 4 },
      { name: "Electron", depth: 4 },
      { name: "FastAPI", depth: 4 },
      { name: "WebSockets", depth: 4 },
      { name: "UDP", depth: 4 },
      { name: "REST", depth: 4 },
      { name: "Flask", depth: 3 },
    ],
  },
  {
    label: "Tools, CAD & data",
    tone: "school",
    skills: [
      { name: "Git", depth: 5 },
      { name: "Linux", depth: 4 },
      { name: "CMake", depth: 4 },
      { name: "Vitest", depth: 4 },
      { name: "Fusion 360", depth: 4 },
      { name: "NumPy", depth: 4 },
      { name: "OpenCV", depth: 3 },
      { name: "pandas", depth: 3 },
      { name: "scikit‑learn", depth: 3 },
      { name: "TensorFlow", depth: 2 },
    ],
  },
];

export const EMAIL = "kevin.yuhan.he@gmail.com";
export const LINKS = [
  { label: "x", href: "https://x.com/thekevinlab" },
  { label: "linkedin", href: "https://www.linkedin.com/in/kevinyhe" },
  { label: "github", href: "https://github.com/kevinyhe" },
  { label: "email", href: `mailto:${EMAIL}` },
];
