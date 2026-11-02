import type { JSX, ReactNode } from "react";

/**
 * A Contact hand's picture in a box that Reach (Reach.tsx) slides toward
 * the other hand. The arm's far end fades out over its last 8%, which at
 * rest is off the screen, so a hand slid inward never shows the straight
 * edge where its picture is cut off.
 */
export default function ReachHand({ from, children }: { from: "left" | "right"; children: ReactNode }): JSX.Element {
  const fade = `linear-gradient(to ${from === "right" ? "left" : "right"}, transparent, #000 8%)`;
  return (
    <div className="absolute inset-0" data-fig-reach style={{ maskImage: fade, WebkitMaskImage: fade }}>
      {children}
    </div>
  );
}
