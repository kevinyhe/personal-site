import type { Metadata } from "next";
import { Bodoni_Moda, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500"],
});

// Closest free stand-in for the reference serif (Apparel It, commercial):
// a high-contrast fashion didone with true italic weights 400-900.
const displaySerif = Bodoni_Moda({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
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
