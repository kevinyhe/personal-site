"use client";

import type { CSSProperties } from "react";
import PetalDrift from "@/components/PetalDrift";
import SakuraStage from "@/components/SakuraStage";
import { makeNarrationTree } from "@/components/sakuraTree";

/**
 * The blossom scene behind the about-and-work run: the intro's tree in the
 * landing page's own style on its own WebGL stage, and the loose petals
 * falling out of the tree's lowest twigs. The tree is hung off the Work
 * section's top edge (sakuraTree's makeNarrationTree anchors on #work)
 * and flowers as that edge rises through the viewport — which is the
 * transition from the television shot to the projects, and the holders here are
 * faded in over the first part of exactly that rise, so the flowering is
 * seen. It used to hang off the narration's top and open behind a holder
 * still at opacity 0.
 *
 * The blossom marks (sakuraBlossomMarks) stood here too and are gone: the
 * tree, the petals and the dot field are the backdrop, and one more kind
 * of flower on top of them is the demo reel.
 *
 * Everything here is aria-hidden decoration that is first seen four
 * screens into the scroll, so HeroIntro loads this file with next/dynamic
 * (ssr: false) and only once the reveal is done.
 *
 * This file exists to be that module boundary. The tree factory pulls in
 * three, and HeroIntro importing it directly — as it did — kept three and
 * the whole sakura stack in the page's first-load chunk no matter what
 * else was split out of it (measured: 430 kB of First Load JS with the two
 * big stages already lazy, three's 324 kB core still in the route's
 * initial chunk list).
 *
 * The holders read their fade off two custom properties HeroIntro's scroll
 * effect sets on the run (`--narration-fx`, its opacity, and
 * `--narration-fx-vis`, visible/hidden): in over the tree's flowering,
 * out over the last screen before the Contact plate takes the page.
 * Properties rather than inline styles on the holders themselves because
 * the scroll effect is built the moment the reveal completes and this
 * chunk may not have rendered yet — a querySelectorAll at that point would
 * find nothing to fade.
 */
//
// The cast: csstype lists `visibility` as its keywords only, but any
// property accepts a var() whose value resolves to one of them, and the
// fallback keeps the holders hidden until the scroll effect has spoken.
const holderStyle: CSSProperties = {
  opacity: "var(--narration-fx, 0)",
  visibility: "var(--narration-fx-vis, hidden)" as CSSProperties["visibility"],
};

export default function NarrationScene() {
  return (
    <>
      <div data-narration-fx style={holderStyle}>
        <SakuraStage elements={[makeNarrationTree]} gateSelector="[data-about-work]" />
      </div>
      <div data-narration-fx style={holderStyle}>
        <PetalDrift gateSelector="[data-about-work]" />
      </div>
    </>
  );
}
