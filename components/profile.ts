/**
 * The fuller profile the design variants (app/v) draw on: what the résumé
 * says, in one place, typed. siteContent.ts keeps the home page's short
 * copy; this is everything a Work, Info or Skills page can ask for.
 *
 * Every fact here is from Kevin_He_Resume.pdf. LinkedIn was not reachable
 * from this machine, so nothing is taken from it; the DevOps group is the
 * résumé's own tooling, not a guess at what LinkedIn lists.
 *
 * Icon slugs are simple-icons names (components/skillIcons.ts). A skill
 * with no icon in that set carries a short `mark` instead, drawn as type.
 */

export type Project = {
  title: string;
  /** One line. */
  tagline: string;
  /** Two or three, from the résumé. */
  bullets: string[];
  stack: string[];
  /** "Finalist at Hack The North 2025", or nothing. */
  award?: string;
  year: string;
  href?: string;
  /** The role it plays on a page: the first is the lead. */
  kind: "company" | "hackathon" | "library" | "bot";
};

export const projects: Project[] = [
  {
    title: "The Actually Company",
    tagline: "A local-first speaking coach. Record a pitch, get timestamped notes on filler, pacing and posture.",
    bullets: [
      "Analyses recorded pitches on-device: filler words, pacing, vocal delivery, posture, hand gestures, body movement, each note linked to the moment it happened.",
      "Next.js 16, React 19, Electron, FastAPI, FFmpeg, faster-whisper and MediaPipe; word-level transcripts, audio features and pose landmarks synchronised into deterministic pipelines with 150+ tests.",
      "$1k MRR, 200+ active users. Built in San Francisco on Founders, Inc. Off Season II, one of 100 from 10,000 applicants.",
    ],
    stack: ["Next.js", "React", "Electron", "FastAPI", "FFmpeg", "MediaPipe", "Python", "TypeScript"],
    year: "2026",
    href: "https://theactually.company",
    kind: "company",
  },
  {
    title: "S‑KBD67",
    tagline: "A Nerf blaster wired into a first-person shooter.",
    bullets: [
      "An IMU, a joystick and buttons embedded in the blaster; Kalman-filtered motion streamed as high-frequency wireless packets.",
      "A low-latency Python UDP pipeline calibrates and decodes the streams into mouse and keyboard events.",
      "One of 12 finalists from 1,200+ hackers.",
    ],
    stack: ["C++", "Python", "ESP32", "MPU6050", "UDP"],
    award: "Finalist, Hack The North 2025",
    year: "2025",
    href: "https://devpost.com/software/s-kbd67",
    kind: "hackathon",
  },
  {
    title: "King of the Ring",
    tagline: "A boxing game you play by swinging your phone.",
    bullets: [
      "Threshold-based motion recognition on the phone's accelerometer, gyroscope and orientation, classifying punches, blocks and dodges in real time.",
      "A Three.js split-screen arena with motion overlays and gameplay animation, on a WebSocket game loop.",
    ],
    stack: ["JavaScript", "Node.js", "Three.js", "WebSockets"],
    award: "1st overall, EurekaHacks 2026",
    year: "2026",
    href: "https://devpost.com/software/king-of-the-ring",
    kind: "hackathon",
  },
  {
    title: "mclib",
    tagline: "A PROS 4 library for VEX V5: odometry, motion control, commands and mechanisms.",
    bullets: [
      "The controls stack behind 82855Z's autonomous routines: odometry, feedback control, motion profiling, particle-filter localisation.",
      "Contributed to a VEX High Stakes world-record autonomous routine and an 80th-place global Skills ranking among ~20,000 teams.",
    ],
    stack: ["C++", "PROS", "VEX V5", "CMake"],
    year: "2022–2026",
    href: "https://github.com/kevinyhe/mclib",
    kind: "library",
  },
  {
    title: "Saturn",
    tagline: "Moderation, logging and server management for Discord communities.",
    bullets: ["Deployed to 40,000+ users across several communities."],
    stack: ["JavaScript", "Node.js", "Discord API"],
    year: "2021",
    kind: "bot",
  },
];

export type Experience = {
  org: string;
  role: string;
  where: string;
  when: string;
  bullets: string[];
};

export const experience: Experience[] = [
  {
    org: "The Actually Company",
    role: "Co-founder & CTO",
    where: "Toronto",
    when: "May 2026 – present",
    bullets: [
      "Co-founded and architected a local-first AI speaking coach.",
      "Built the end-to-end platform; 150+ automated tests; $1k MRR, 200+ active users.",
    ],
  },
  {
    org: "Founders, Inc.",
    role: "Founder in Residence, Off Season II",
    where: "San Francisco",
    when: "Jun – Aug 2026",
    bullets: ["One of 100 builders from 10,000+ applicants; $50,000 in credits."],
  },
  {
    org: "STL Robotics, VEX 82855Z",
    role: "President; Team Captain & Lead Programmer",
    where: "Richmond Hill",
    when: "2022 – present",
    bullets: [
      "C++ controls: odometry, feedback control, motion profiling, particle-filter localisation. A world-record autonomous routine; 80th of ~20,000 in global Skills.",
      "Mechanisms in Fusion 360 under size, power and match-time limits. 2025 Ontario Provincial Build Award.",
      "56 members, a $140,000 budget, six teams mentored to six Provincial and four World Championship qualifications; a free outreach program.",
    ],
  },
];

export const education = {
  school: "University of Toronto",
  degree: "BASc, Computer Engineering, PEY Co-op",
  when: "2026 – 2031",
};

export type Skill = {
  name: string;
  /** simple-icons export name, e.g. "siReact". */
  icon?: string;
  /** Type drawn in place of an icon, two or three characters. */
  mark?: string;
  /** How much of it there is, 1..5, for the designs that draw a bar. */
  depth: 1 | 2 | 3 | 4 | 5;
};

export type SkillGroup = { label: string; blurb: string; skills: Skill[] };

export const skillGroups: SkillGroup[] = [
  {
    label: "Languages",
    blurb: "C++ for anything that has to answer in time; Python and TypeScript for everything round it.",
    skills: [
      { name: "C++", icon: "siCplusplus", depth: 5 },
      { name: "Python", icon: "siPython", depth: 5 },
      { name: "TypeScript", icon: "siTypescript", depth: 5 },
      { name: "JavaScript", icon: "siJavascript", depth: 5 },
      { name: "C", icon: "siC", depth: 4 },
      { name: "Java", icon: "siOpenjdk", depth: 3 },
      { name: "SQL", icon: "siPostgresql", depth: 3 },
    ],
  },
  {
    label: "Embedded & robotics",
    blurb: "Sensors in, motion out. The part of the stack that touches the floor.",
    skills: [
      { name: "ESP32 / ESP8266", icon: "siEspressif", depth: 5 },
      { name: "Arduino", icon: "siArduino", depth: 4 },
      { name: "VEX V5", mark: "V5", depth: 5 },
      { name: "PROS", mark: "PR", depth: 5 },
      { name: "RTOS", mark: "RT", depth: 3 },
      { name: "IMUs & sensor fusion", mark: "IMU", depth: 4 },
      { name: "Odometry", mark: "OD", depth: 5 },
      { name: "Controls", mark: "PID", depth: 5 },
      { name: "Motion profiling", mark: "MP", depth: 4 },
      { name: "Particle filters", mark: "PF", depth: 4 },
      { name: "ROS", icon: "siRos", depth: 2 },
    ],
  },
  {
    label: "Software & networking",
    blurb: "The web when it has to talk to hardware, and the wire between them.",
    skills: [
      { name: "Node.js", icon: "siNodedotjs", depth: 5 },
      { name: "React", icon: "siReact", depth: 5 },
      { name: "Next.js", icon: "siNextdotjs", depth: 5 },
      { name: "Three.js", icon: "siThreedotjs", depth: 4 },
      { name: "Electron", icon: "siElectron", depth: 4 },
      { name: "FastAPI", icon: "siFastapi", depth: 4 },
      { name: "Flask", icon: "siFlask", depth: 3 },
      { name: "WebSockets", mark: "WS", depth: 4 },
      { name: "UDP", mark: "UDP", depth: 4 },
      { name: "REST", mark: "API", depth: 4 },
    ],
  },
  {
    label: "DevOps & tooling",
    blurb: "What keeps the rest honest: tests, builds, the box it runs on.",
    skills: [
      { name: "Git", icon: "siGit", depth: 5 },
      { name: "Linux", icon: "siLinux", depth: 4 },
      { name: "CMake", icon: "siCmake", depth: 4 },
      { name: "Vitest", icon: "siVitest", depth: 4 },
      { name: "FFmpeg", icon: "siFfmpeg", depth: 3 },
      { name: "GitHub", icon: "siGithub", depth: 5 },
      { name: "Bash", icon: "siGnubash", depth: 4 },
    ],
  },
  {
    label: "CAD & data",
    blurb: "Mechanisms drawn before they are cut, and the maths on what the sensors saw.",
    skills: [
      { name: "Fusion 360", icon: "siAutodesk", depth: 4 },
      { name: "OpenCV", icon: "siOpencv", depth: 3 },
      { name: "MediaPipe", icon: "siMediapipe", depth: 3 },
      { name: "NumPy", icon: "siNumpy", depth: 4 },
      { name: "pandas", icon: "siPandas", depth: 3 },
      { name: "scikit-learn", icon: "siScikitlearn", depth: 3 },
      { name: "TensorFlow", icon: "siTensorflow", depth: 2 },
    ],
  },
];

export const awards = [
  { title: "1st overall, EurekaHacks", year: "2026" },
  { title: "Finalist, Hack The North", year: "2025" },
  { title: "Ontario Provincial Build Award", year: "2025" },
  { title: "USACO Silver", year: "2025" },
  { title: "Founders, Inc. Off Season II", year: "2026" },
];
