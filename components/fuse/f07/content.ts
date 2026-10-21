/**
 * The words on the strip, in lanceyan.com's voice: short, first person,
 * facts only. Every line is from the résumé (Kevin_He_Resume.pdf); years,
 * never ages. Projects and links come from components/profile.ts and
 * components/siteContent.ts, so they are not repeated here.
 */

/** A tiny monogram square set inline before an organisation's name. */
export type Chip = { mark: string; bg: string; fg: string };

export const CHIPS = {
  actually: { mark: "A", bg: "#b8174f", fg: "#fffafc" },
  founders: { mark: "F", bg: "#fffafc", fg: "#1a0812" },
  uoft: { mark: "U", bg: "#25355a", fg: "#fffafc" },
  stl: { mark: "S", bg: "#f9b9dc", fg: "#1a0812" },
  vex: { mark: "Z", bg: "#d4312c", fg: "#fffafc" },
} satisfies Record<string, Chip>;

export type TimelineRow = { when: string; title: string; lines: string[] };

/** Newest first, like lanceyan's. One row open at a time. */
export const TIMELINE: TimelineRow[] = [
  {
    when: "2026 – now",
    title: "Co-founded The Actually Company",
    lines: [
      "Co-founder and CTO of a local-first AI speaking coach.",
      "Notes on filler words, pacing, posture and gestures, each linked to the moment it happened.",
      "$1k MRR, 200+ active users.",
    ],
  },
  {
    when: "2026",
    title: "Founder in residence at Founders, Inc.",
    lines: ["Off Season II, San Francisco, June to August.", "One of 100 builders from 10K+ applicants; $50,000 in credits."],
  },
  {
    when: "2026",
    title: "Started at the University of Toronto",
    lines: ["BASc in Computer Engineering with PEY Co-op, expected 2031."],
  },
  {
    when: "2025",
    title: "President of STL Robotics",
    lines: [
      "A 56-member organization and a $140,000 annual budget.",
      "Mentored six teams to six Provincial and four World Championship qualifications.",
      "Founded a free robotics outreach program.",
    ],
  },
  {
    when: "2022",
    title: "Joined VEX team 82855Z",
    lines: [
      "Team captain and lead programmer.",
      "C++ controls: odometry, feedback control, motion profiling, particle-filter localization.",
      "A world-record autonomous routine in VEX High Stakes; 80th of about 20,000 teams in global Skills.",
      "2025 Ontario Provincial Build Award.",
    ],
  },
  {
    when: "2022 – 2026",
    title: "High school in Richmond Hill",
    lines: ["St. Theresa of Lisieux Catholic High School.", "4.0 GPA, Advanced Placement, Honour Roll."],
  },
  {
    when: "2021",
    title: "Built Saturn",
    lines: ["Moderation, logging and server management for Discord.", "Used by 40,000+ users across several communities."],
  },
];

/** The résumé's Technical Skills, as it groups them. */
export const SKILLS: { label: string; items: string }[] = [
  { label: "Languages", items: "C++, Python, TypeScript, JavaScript, C, Java, SQL" },
  {
    label: "Embedded & robotics",
    items: "ESP32, Arduino, VEX V5, PROS, RTOS, IMUs, sensor fusion, odometry, controls, motion profiling, particle filters",
  },
  { label: "Software & networking", items: "Node.js, React, Flask, Three.js, REST, UDP, WebSockets, Vitest, Git, Linux, CMake" },
  { label: "CAD & data", items: "Fusion 360, OpenCV, NumPy, pandas, scikit-learn, TensorFlow" },
];

/** The six stops the readout counts: the name, then the five panels. */
export const PAGES = ["Home", "Intro", "Timeline", "Work", "Skills", "Contact"] as const;
export const PAGE_COUNT = PAGES.length;
