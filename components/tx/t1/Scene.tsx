import type { JSX } from "react";

import Statement from "./Statement";
import Work from "./Work";

/**
 * Transition design 1: the "o" of "to" opens into Work (Statement.tsx).
 * The work section starts a screen early, under the band's last held
 * screen, so it is already rising behind the window as the window opens and
 * comes to rest exactly as the band lets go.
 */
export default function Scene(): JSX.Element {
  return (
    <>
      <Statement />
      <div className="relative z-0 -mt-[100vh]">
        <Work />
      </div>
    </>
  );
}
