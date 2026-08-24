import type { Metadata } from "next";
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
const displaySerif = localFont({
  display: "swap",
  variable: "--font-instrument-serif",
  src: [
    {
      path: "./fonts/Fontspring-DEMO-apparel-regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Fontspring-DEMO-apparel-regularit.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/Fontspring-DEMO-apparel-boldit.otf",
      weight: "700",
      style: "italic",
    },
  ],
});

export const metadata: Metadata = {
  title: "Kevin He, Creative Developer",
  description:
    "Quiet creator, bringing ideas to life through motion, detail and softness.",
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
