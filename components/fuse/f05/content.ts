/**
 * The words for concept 05, in lanceyan.com's voice: short, first person,
 * facts only. Every fact is from the résumé (components/profile.ts and
 * components/siteContent.ts hold the same facts); nothing here is made up.
 * Years, not ages.
 */

import { projects } from "@/components/profile";

/** The four sections, in order. `label` is the small uppercase name. */
export const SECTIONS = [
  { id: "f05-info", label: "Info" },
  { id: "f05-timeline", label: "Timeline" },
  { id: "f05-work", label: "Work" },
  { id: "f05-contact", label: "Contact" },
] as const;

/** An organisation named inline, with its tiny monogram chip. */
export type Org = { name: string; mark: string; tone: "rose" | "blossom" | "white" | "plum"; href?: string };

export const ORGS = {
  actually: { name: "The Actually Company", mark: "A", tone: "rose", href: "https://theactually.company" },
  founders: { name: "Founders, Inc.", mark: "F", tone: "white" },
  uoft: { name: "the University of Toronto", mark: "U", tone: "blossom" },
  stl: { name: "STL Robotics", mark: "S", tone: "plum" },
} satisfies Record<string, Org>;

export type TimelineRow = { year: string; title: string; details: string[] };

export const TIMELINE: TimelineRow[] = [
  {
    year: "2026",
    title: "Present",
    details: [
      "Computer engineering at the University of Toronto, with PEY Co‑op, through 2031",
      "Co‑founder and CTO of The Actually Company",
    ],
  },
  {
    year: "2026",
    title: "Founded The Actually Company",
    details: [
      "A local‑first AI speaking coach: timestamped notes on filler words, pacing, delivery, posture and gesture",
      "Built it end to end with Next.js, Electron, FastAPI, faster‑whisper and MediaPipe; 150+ automated tests",
      "$1k MRR, 200+ active users",
    ],
  },
  {
    year: "2026",
    title: "Founder in Residence at Founders, Inc.",
    details: [
      "Off Season II, one of 100 builders from 10,000+ applicants",
      "Built the product in San Francisco, June to August, with $50,000 in credits",
    ],
  },
  {
    year: "2026",
    title: "Graduated high school",
    details: [
      "St. Theresa of Lisieux Catholic High School, Richmond Hill",
      "4.0/4.0 GPA, Advanced Placement, Honour Roll",
      "First overall at EurekaHacks with King of the Ring",
    ],
  },
  {
    year: "2025",
    title: "President of STL Robotics",
    details: [
      "56 members and a $140,000 annual budget",
      "Mentored six teams to six Provincial and four World Championship qualifications",
      "Founded a free robotics outreach program",
      "Ontario Provincial Build Award",
      "Hack the North finalist with S‑KBD67, one of 12 from 1,200+ hackers",
    ],
  },
  {
    year: "2022",
    title: "Joined VEX team 82855Z",
    details: [
      "Team captain and lead programmer",
      "C++ controls: odometry, feedback control, motion profiling, particle‑filter localisation",
      "A VEX High Stakes world‑record autonomous routine; 80th in global Skills of about 20,000 teams",
      "Wrote mclib, the controls library behind it",
    ],
  },
  {
    year: "2021",
    title: "Built Saturn",
    details: ["Moderation, logging and server management for Discord", "Used by 40,000+ people across several communities"],
  },
];

/** The work index: the résumé's projects, in profile.ts's order. */
export const WORK = projects.map((p) => ({
  title: p.title,
  tagline: p.tagline,
  year: p.year,
  award: p.award,
  href: p.href,
}));

/** lanceyan's book list, in the same form, for what the work was recognised with. */
export const ALONG_THE_WAY: { title: string; year: string }[] = [
  { title: "1st overall, EurekaHacks", year: "2026" },
  { title: "Finalist, Hack the North", year: "2025" },
  { title: "Ontario Provincial Build Award", year: "2025" },
  { title: "USACO Silver", year: "2025" },
  { title: "Canadian Computing Competition Senior, 50 of 75", year: "2025" },
  { title: "SHAD, University of New Brunswick", year: "2024" },
];

export const LINE = "I build systems that bring ideas to life.";
