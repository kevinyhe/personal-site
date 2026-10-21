/**
 * The words for concept 01 that are lists rather than sentences: the
 * timeline on page 02 and the order of the scenes. Every fact is from the
 * résumé (scratchpad resume.txt, mirrored in components/profile.ts).
 * Years, never ages.
 */

export const SCENES = [
  { n: 1, label: "Info" },
  { n: 2, label: "Timeline" },
  { n: 3, label: "Work" },
  { n: 4, label: "Contact" },
] as const;

export type Year = {
  /** The left column: a year, or "Now". */
  when: string;
  /** One line, always shown. */
  title: string;
  /** One-line facts, shown when the row is open. */
  facts: string[];
};

export const TIMELINE: Year[] = [
  {
    when: "Now",
    title: "Present",
    facts: [
      "Studying computer engineering at the University of Toronto",
      "Building The Actually Company as its CTO",
      "President of STL Robotics",
    ],
  },
  {
    when: "2026",
    title: "Started at the University of Toronto",
    facts: ["BASc in Computer Engineering, with PEY Co‑op", "Expected to finish in 2031"],
  },
  {
    when: "2026",
    title: "Founder in Residence at Founders, Inc.",
    facts: [
      "Off Season II, June to August, in San Francisco",
      "One of 100 builders picked from 10,000+ applicants",
      "Built The Actually Company there on $50,000 in credits",
    ],
  },
  {
    when: "2026",
    title: "Co‑founded The Actually Company",
    facts: [
      "A local‑first AI speaking coach that runs on your own machine",
      "Timestamped notes on filler words, pacing, voice, posture and gestures",
      "Next.js, React, Electron, FastAPI, FFmpeg, faster‑whisper, MediaPipe",
      "150+ automated tests behind deterministic analysis pipelines",
      "$1k MRR and 200+ active users",
    ],
  },
  {
    when: "2026",
    title: "First overall at EurekaHacks",
    facts: [
      "King of the Ring: a boxing game you play by swinging your phone",
      "Punches, blocks and dodges read from the phone’s motion sensors",
      "A Three.js split‑screen arena on a WebSocket game loop",
    ],
  },
  {
    when: "2026",
    title: "Graduated high school",
    facts: ["St. Theresa of Lisieux Catholic High School, Richmond Hill", "4.0 GPA, Advanced Placement, Honour Roll"],
  },
  {
    when: "2025",
    title: "Became president of STL Robotics",
    facts: [
      "56 members and a $140,000 annual budget",
      "Mentored six teams to six Provincial and four World Championship qualifications",
      "Founded a free robotics outreach program",
      "2025 Ontario Provincial Build Award",
    ],
  },
  {
    when: "2025",
    title: "Hack The North finalist",
    facts: [
      "S‑KBD67: a Nerf blaster wired into a first‑person shooter",
      "An IMU, a joystick and buttons, Kalman‑filtered and streamed over UDP",
      "One of 12 finalists from 1,200+ hackers",
    ],
  },
  {
    when: "2022",
    title: "Joined VEX team 82855Z",
    facts: [
      "Team captain and lead programmer",
      "C++ controls: odometry, motion profiling, particle‑filter localisation",
      "Part of a VEX High Stakes world‑record autonomous routine",
      "80th in global Skills, of about 20,000 teams",
      "mclib, the PROS library behind the robot",
    ],
  },
  {
    when: "2021",
    title: "Built Saturn",
    facts: ["Moderation, logging and server tools for Discord", "Used by 40,000+ people across several communities"],
  },
];
