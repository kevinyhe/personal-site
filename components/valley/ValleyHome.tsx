"use client";

import { useEffect, useRef } from "react";
import { ValleyIntroHome } from "./ValleyMarkup";
import { mountValley } from "./valleyBehaviour";

/**
 * The home page's opening: the reference's preloader and hero (see
 * ValleyMarkup) with the same behaviour module driving them, on the site's
 * own near-black ground.
 *
 * The only difference from the standalone valley (ValleyPage, /valley) is
 * that there is no prologue after the hero — the page carries on into the
 * narration, the work and the contact plate instead. The behaviour needs no
 * flag for that: every scene it builds is looked up by a data attribute, so
 * the prologue's simply is not found and is skipped.
 */
export default function ValleyHome() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current?.querySelector<HTMLElement>(".valley");
    if (!root) return undefined;
    return mountValley(root);
  }, []);

  return (
    <div ref={ref}>
      <ValleyIntroHome />
    </div>
  );
}
