/**
 * The words on the four Garden pages, in one place.
 *
 * Every fact is from the résumé (resume.txt, mirrored in components/profile.ts).
 * Years, never ages. Nothing here is a guess at an opinion, a book, a
 * quote or a number the résumé does not give.
 */

export const PAGES = [
  { id: "01", nav: "Info", stage: "Bud" },
  { id: "02", nav: "Timeline", stage: "Branch" },
  { id: "03", nav: "Work", stage: "Bloom" },
  { id: "04", nav: "Contact", stage: "Night" },
] as const;

export const LINE = "I build systems that bring ideas to life.";

export const EMAIL = "kevin.yuhan.he@gmail.com";

export const LINKS = [
  { label: "x", href: "https://x.com/thekevinlab" },
  { label: "linkedin", href: "https://www.linkedin.com/in/kevinyhe" },
  { label: "github", href: "https://github.com/kevinyhe" },
  { label: "email", href: `mailto:${EMAIL}` },
] as const;

/**
 * The tiny squares that stand in front of an organisation's name, as
 * lanceyan.com puts a logo there. A letter on a colour: no real marks are
 * copied.
 */
export type Org = { mark: string; bg: string; fg: string; href?: string };

export const ORGS = {
  actually: { mark: "A", bg: "#f9b9dc", fg: "#2a0d1e", href: "https://theactually.company" },
  founders: { mark: "F", bg: "#fffafc", fg: "#1a0812" },
  uoft: { mark: "U", bg: "#25355a", fg: "#fffafc" },
  stl: { mark: "S", bg: "#b8174f", fg: "#fffafc" },
  eureka: { mark: "E", bg: "#6a1d44", fg: "#fffafc", href: "https://devpost.com/software/king-of-the-ring" },
  htn: { mark: "H", bg: "#1a0812", fg: "#f9b9dc", href: "https://devpost.com/software/s-kbd67" },
} satisfies Record<string, Org>;

/** Lance's timeline, newest first. `lines` show when the row is open. */
export const TIMELINE: { when: string; title: string; lines: string[] }[] = [
  {
    when: "Now",
    title: "Co‑founder and CTO, The Actually Company",
    lines: [
      "A local-first AI speaking coach. Record a pitch and it gives timestamped, evidence-linked notes on filler words, pacing, delivery, posture and gesture.",
      "$1k MRR, 200+ active users.",
    ],
  },
  {
    when: "2026",
    title: "Started at the University of Toronto",
    lines: ["BASc in Computer Engineering with PEY Co-op, expected 2031."],
  },
  {
    when: "2026",
    title: "Founder in Residence, Founders, Inc.",
    lines: [
      "Off Season II in San Francisco, June to August.",
      "One of 100 builders picked from 10,000+ applicants; $50,000 in credits.",
    ],
  },
  {
    when: "2026",
    title: "1st overall at EurekaHacks",
    lines: ["King of the Ring: a boxing game you play by swinging your phone."],
  },
  {
    when: "2025",
    title: "Finalist at Hack The North",
    lines: ["S‑KBD67: a Nerf blaster wired into a first-person shooter.", "One of 12 finalists from 1,200+ hackers."],
  },
  {
    when: "2025",
    title: "President of STL Robotics",
    lines: [
      "56 members and a $140,000 annual budget.",
      "Mentored six teams to six Provincial and four World Championship qualifications.",
      "Founded a free robotics outreach program. 2025 Ontario Provincial Build Award.",
    ],
  },
  {
    when: "2022",
    title: "Captain and lead programmer, VEX 82855Z",
    lines: [
      "C++ controls: odometry, feedback control, motion profiling, particle-filter localisation.",
      "Part of a VEX High Stakes world-record autonomous routine; 80th in global Skills of about 20,000 teams.",
    ],
  },
  {
    when: "2022",
    title: "Started high school",
    lines: ["St. Theresa of Lisieux, Richmond Hill. 4.0 GPA, Advanced Placement, Honour Roll."],
  },
  {
    when: "2021",
    title: "Built Saturn",
    lines: ["Moderation, logging and server management for Discord, used by 40,000+ people."],
  },
];

/** The short note after each project's name in the list, by title. */
export const WORK_NOTE: Record<string, string> = {
  "The Actually Company": "a speaking coach",
  "S‑KBD67": "finalist, Hack The North",
  "King of the Ring": "1st overall, EurekaHacks",
  mclib: "a VEX V5 library",
  Saturn: "a Discord bot",
};
