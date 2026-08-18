import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
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
      <body>{children}</body>
    </html>
  );
}
