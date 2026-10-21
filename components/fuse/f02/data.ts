/**
 * The words for concept F02, all from the résumé. Years, not ages.
 *
 * Each timeline row is one line in the index: the year set large, a short
 * headline, and the one-line facts that open under it. `month` is the
 * "MM YYYY" label over the preview card. `picture` is what the card draws
 * in bars: a photo under public/, or a word set as type ("plate").
 */

export type Picture = { image: string } | { plate: string; serif?: boolean };

export type Row = {
  year: string;
  headline: string;
  facts: string[];
  month: string;
  /** What the card is of, in small capitals under it. */
  title: string;
  picture: Picture;
  link?: { href: string; label: string };
};

export const TIMELINE: Row[] = [
  {
    year: "Now",
    headline: "Computer engineering at U of T",
    facts: [
      "Started a BASc in Computer Engineering & PEY Co-op at the University of Toronto, September 2026",
      "Still CTO of The Actually Company",
      "Still president of STL Robotics",
    ],
    month: "09 2026",
    title: "University of Toronto",
    picture: { plate: "U of T", serif: true },
  },
  {
    year: "2026",
    headline: "Co-founded The Actually Company",
    facts: [
      "A local-first AI speaking coach: record a pitch, get timestamped notes on filler words, pacing, posture and gestures",
      "Built it end to end with Next.js, React, Electron, FastAPI, FFmpeg, faster-whisper and MediaPipe",
      "150+ automated tests behind the analysis pipelines",
      "$1k MRR, 200+ active users",
      "Built in San Francisco at Founders, Inc. Off Season II, one of 100 picked from 10K+ applicants",
    ],
    month: "05 2026",
    title: "The Actually Company",
    picture: { image: "/work/actually.jpg" },
    link: { href: "https://theactually.company", label: "theactually.company" },
  },
  {
    year: "2026",
    headline: "Won EurekaHacks with King of the Ring",
    facts: [
      "A boxing game you play by swinging your phone",
      "Reads the phone's accelerometer, gyroscope and orientation to tell punches, blocks and dodges apart in real time",
      "A Three.js split-screen arena on a WebSocket game loop",
      "1st place overall",
    ],
    month: "05 2026",
    title: "King of the Ring",
    picture: { image: "/work/king-of-the-ring.jpg" },
    link: { href: "https://devpost.com/software/king-of-the-ring", label: "devpost" },
  },
  {
    year: "2025",
    headline: "Hack the North finalist with S-KBD67",
    facts: [
      "A Nerf blaster wired into a first-person shooter",
      "An IMU, joystick and buttons on an ESP32; Kalman-filtered motion sent as wireless UDP packets",
      "A Python pipeline turns the packets into mouse and keyboard events",
      "One of 12 finalists from 1,200+ hackers",
    ],
    month: "09 2025",
    title: "S-KBD67",
    picture: { image: "/work/s-kbd67.jpg" },
    link: { href: "https://devpost.com/software/s-kbd67", label: "devpost" },
  },
  {
    year: "2025",
    headline: "Became president of STL Robotics",
    facts: [
      "56 members and a $140,000 annual budget",
      "Mentored six teams to six Provincial and four World Championship qualifications",
      "Founded a free robotics outreach program",
      "2025 Ontario Provincial Build Award",
    ],
    month: "06 2025",
    title: "STL Robotics",
    picture: { plate: "82855Z" },
  },
  {
    year: "2022–2026",
    headline: "Lead programmer, VEX team 82855Z",
    facts: [
      "Wrote the C++ controls: odometry, feedback control, motion profiling, particle-filter localization",
      "Contributed to a VEX High Stakes world-record autonomous routine",
      "80th in global Skills, of about 20,000 teams",
      "Designed mechanisms in Fusion 360 under size, power and match-time limits",
      "High school at St. Theresa of Lisieux: 4.0/4.0 GPA, AP, Honour Roll",
    ],
    month: "09 2022",
    title: "mclib",
    picture: { image: "/work/mclib.jpg" },
    link: { href: "https://github.com/kevinyhe/mclib", label: "github" },
  },
  {
    year: "2021",
    headline: "Built Saturn",
    facts: [
      "A Discord bot for moderation, logging and server management",
      "Used by 40,000+ people across several communities",
      "JavaScript, Node.js and the Discord API",
    ],
    month: "01 2021",
    title: "Saturn",
    picture: { plate: "40,000+" },
  },
];

export const SKILLS: { label: string; items: string }[] = [
  { label: "Languages", items: "C++, Python, TypeScript, JavaScript, C, Java, SQL" },
  {
    label: "Embedded & robotics",
    items: "ESP32, ESP8266, Arduino, VEX V5, PROS, RTOS, IMUs, sensor fusion, odometry, controls, motion profiling, particle filters",
  },
  { label: "Software & networking", items: "Node.js, React, Flask, Three.js, REST, UDP, WebSockets, Vitest, Git, Linux, CMake" },
  { label: "CAD & data", items: "Fusion 360, OpenCV, NumPy, pandas, scikit-learn, TensorFlow" },
];
