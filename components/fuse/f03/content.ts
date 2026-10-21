/**
 * The words of concept 03, "Letter", kept apart from the layout.
 *
 * Every fact is from the résumé (Kevin_He_Resume.pdf). Years, not ages.
 *
 * The italic words in the big sentences are set in the display serif, a
 * DEMO cut that draws a "DEMO" flower for ' " & @ - ! ( ) / ; and digits.
 * So no italic run below carries any of those. The upright runs are Inter
 * and can carry anything; hyphens there are U+2011 so a line never breaks
 * inside "co‑founder".
 */

export type OrgKey = "ta" | "fi" | "ut" | "vex" | "htn" | "eh";

/** An organisation as Lance names one: a tiny square mark, then the name. */
export type Org = { name: string; mark: string; bg: string; fg: string; ring?: string; href?: string };

export const ORGS: Record<OrgKey, Org> = {
  ta: { name: "The Actually Company", mark: "A", bg: "#f9b9dc", fg: "#2a0d1e", href: "https://theactually.company" },
  fi: { name: "Founders Inc.", mark: "F", bg: "#fffafc", fg: "#1a0812" },
  ut: { name: "University of Toronto", mark: "UT", bg: "#b8174f", fg: "#fffafc" },
  vex: { name: "VEX 82855Z", mark: "Z", bg: "#1a0812", fg: "#f9b9dc", ring: "#f9b9dc" },
  htn: { name: "Hack The North", mark: "HN", bg: "transparent", fg: "#fffafc", ring: "#fffafc", href: "https://devpost.com/software/s-kbd67" },
  eh: { name: "EurekaHacks", mark: "E", bg: "#6a1d44", fg: "#f9b9dc", href: "https://devpost.com/software/king-of-the-ring" },
};

/** A piece of a big sentence: upright text, italic text, or an organisation.
 *  Spaces are written out; a run that starts without one joins the word
 *  before it, so "Company," never wraps away from its comma. */
export type Run = { t: string; i?: boolean } | { org: OrgKey };

export type Paragraph = { runs: Run[]; aside: string };

export const LETTER: Paragraph[] = [
  {
    runs: [
      { t: "I’m the co‑founder and " },
      { t: "CTO", i: true },
      { t: " of " },
      { org: "ta" },
      { t: ", an AI speaking coach that works " },
      { t: "on your own machine.", i: true },
      { t: " We spent the summer building it in San Francisco with " },
      { org: "fi" },
    ],
    aside:
      "Record a pitch, a talk or a speech, and it gives back timestamped notes on filler words, pacing, voice, posture and gestures. Co‑founded in May 2026; $1k MRR and 200+ active users. Founders, Inc. took 100 builders from 10,000+ applicants for Off Season II.",
  },
  {
    runs: [
      { t: "I study " },
      { t: "computer engineering", i: true },
      { t: " at " },
      { org: "ut" },
      { t: ", and I lead " },
      { org: "vex" },
      { t: ", where I write the " },
      { t: "controls", i: true },
      { t: " that drive our robots." },
    ],
    aside:
      "BASc in Computer Engineering with PEY Co‑op, 2026 to 2031. On 82855Z since 2022 as captain and lead programmer, president since 2025. My C++ odometry and motion profiling were part of a world‑record autonomous routine and an 80th‑place global Skills ranking among about 20,000 teams.",
  },
  {
    runs: [
      { t: "At hackathons I turn " },
      { t: "motion into play:", i: true },
      { t: " a finalist at " },
      { org: "htn" },
      { t: ", and " },
      { t: "first overall", i: true },
      { t: " at " },
      { org: "eh" },
      { t: "." },
    ],
    aside:
      "S‑KBD67, a Nerf blaster that plays a first‑person shooter, was one of 12 finalists from 1,200+ hackers. King of the Ring, a boxing game you play by swinging your phone, won EurekaHacks 2026. Before all of it, in 2021: Saturn, a Discord bot used by 40,000+ people.",
  },
];

export type Row = { when: string; title: string; notes: string[] };

/** Lance's timeline, newest first, in years. */
export const TIMELINE: Row[] = [
  {
    when: "Now",
    title: "Present",
    notes: ["Co‑founder and CTO at The Actually Company.", "Computer engineering at the University of Toronto."],
  },
  {
    when: "2026",
    title: "Started at the University of Toronto",
    notes: ["BASc, Computer Engineering & PEY Co‑op, expected 2031."],
  },
  {
    when: "2026",
    title: "Founder in Residence at Founders, Inc.",
    notes: ["Off Season II, San Francisco, June to August.", "One of 100 builders from 10,000+ applicants; $50,000 in credits."],
  },
  {
    when: "2026",
    title: "Co‑founded The Actually Company",
    notes: [
      "A local‑first AI speaking coach that analyses recorded pitches on the device.",
      "Next.js, React, Electron, FastAPI, FFmpeg, faster‑whisper and MediaPipe; 150+ automated tests.",
      "$1k MRR, 200+ active users.",
    ],
  },
  {
    when: "2026",
    title: "First overall at EurekaHacks",
    notes: ["King of the Ring: punches, blocks and dodges read from a phone’s motion sensors.", "A Three.js split‑screen arena on a WebSocket game loop."],
  },
  {
    when: "2025",
    title: "Finalist at Hack The North",
    notes: ["S‑KBD67: an IMU, a joystick and buttons in a Nerf blaster, Kalman‑filtered and streamed over UDP.", "One of 12 finalists from 1,200+ hackers."],
  },
  {
    when: "2025",
    title: "President of VEX 82855Z",
    notes: [
      "56 members and a $140,000 annual budget.",
      "Mentored six teams to six Provincial and four World Championship qualifications.",
      "Founded a free robotics outreach program. 2025 Ontario Provincial Build Award.",
    ],
  },
  {
    when: "2022",
    title: "Captain and lead programmer, VEX 82855Z",
    notes: [
      "C++ controls: odometry, feedback control, motion profiling, particle‑filter localisation.",
      "A VEX High Stakes world‑record autonomous routine; 80th of about 20,000 teams in global Skills.",
    ],
  },
  {
    when: "2022–26",
    title: "High school in Richmond Hill",
    notes: ["St. Theresa of Lisieux. 4.0 GPA, Advanced Placement, Honour Roll."],
  },
  {
    when: "2021",
    title: "Built Saturn",
    notes: ["Moderation, logging and server management for Discord, used by 40,000+ people."],
  },
];

export const LINE = "I build systems that bring ideas to life.";
