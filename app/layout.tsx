import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import SiteBackground from "@/components/SiteBackground";
import SmoothScroll from "@/components/SmoothScroll";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500"],
});

// Apparel (Latinotype) — the exact serif from the reference site, loaded
// from user-provided files. NOTE: these are Fontspring DEMO cuts, licensed
// for testing/mockups only; license the webfonts before public deploy.
//
// WOFF2, converted from the .otf the demo ships with (pyftsubset, every
// glyph and layout feature kept, only the FontForge timestamp table dropped).
// next/font passes local files through as-is and preloads all three, so the
// format is the whole cost: 93.5 kB of OTF became 30.9 kB of WOFF2 on the
// critical path. All three cuts stay: the narration and /info set `font-bold
// italic`, and there is no bold roman to fall back to.
const displaySerif = localFont({
  display: "swap",
  variable: "--font-instrument-serif",
  src: [
    {
      path: "./fonts/Fontspring-DEMO-apparel-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Fontspring-DEMO-apparel-regularit.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/Fontspring-DEMO-apparel-boldit.woff2",
      weight: "700",
      style: "italic",
    },
  ],
});

const TITLE = "Kevin He";
const DESCRIPTION =
  "Kevin He writes software for things that move: robot autonomy, embedded firmware, and the tooling around both.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: TITLE,
    type: "website",
    locale: "en_CA",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// The ink behind everything, so the browser chrome around the page matches
// it on phones instead of flashing white over the dark ground.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${inter.variable} ${displaySerif.variable}`}
      lang="en"
    >
      <head>
        {/* With JavaScript off, nothing ever reveals the sections and the
            page is blank below the hero. The rule this cancels lives in
            globals.css and exists so the reveal does not flash; it is only
            correct while there is something around to undo it. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important}`}</style>
        </noscript>
      </head>
      <body>
        <SmoothScroll />
        <SiteBackground />
        {children}

        {/* Page-transition wipe. TransitionLink slides it up over the
            outgoing page; app/template.tsx slides it off the incoming one.
            It parks below the viewport (translateY 101%) between runs. */}
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a] will-change-transform"
          id="page-veil"
          style={{ transform: "translateY(101%)" }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-white/30" />
          <span
            className="font-serif-display text-[clamp(2rem,6vw,4rem)] italic tracking-[-0.02em] text-[#f0f0f0]"
            id="page-veil-label"
          />
        </div>
      </body>
    </html>
  );
}
