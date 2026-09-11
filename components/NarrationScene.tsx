"use client";

import type { CSSProperties } from "react";
import HalftoneField from "@/components/HalftoneField";
import PetalDrift from "@/components/PetalDrift";
import SakuraStage from "@/components/SakuraStage";
import { makeNarrationBlossomMarks } from "@/components/sakuraBlossomMarks";
import { makeNarrationTree } from "@/components/sakuraTree";

/**
 * The blossom scene behind the narration: the intro's tree in the landing
 * page's own style on its own WebGL stage, the work sections' dot field,
 * and the loose petals falling out of the tree's lowest twigs. Everything
 * here is aria-hidden decoration that is first seen four screens into the
 * scroll, so HeroIntro loads this file with next/dynamic (ssr: false) and
 * only once the reveal is done.
 *
 * This file exists to be that module boundary. The tree factories pull in
 * three, and HeroIntro importing them directly — as it did — kept three
 * and the whole sakura stack in the page's first-load chunk no matter what
 * else was split out of it (measured: 430 kB of First Load JS with the two
 * big stages already lazy, three's 324 kB core still in the route's
 * initial chunk list).
 *
 * The holders read their fade off two custom properties HeroIntro's scroll
 * effect sets on the narration block (`--narration-fx`, its opacity, and
 * `--narration-fx-vis`, visible/hidden): in over the half screen after the
 * scrim shuts over the statue, out over the last screen before the work
 * sections' backdrop takes over. Properties rather than inline styles on
 * the holders themselves because the scroll effect is built the moment the
 * reveal completes and this chunk may not have rendered yet — a
 * querySelectorAll at that point would find nothing to fade.
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
        <HalftoneField />
      </div>
      <div data-narration-fx style={holderStyle}>
        <SakuraStage
          elements={[makeNarrationTree, makeNarrationBlossomMarks]}
          gateSelector="#info"
        />
      </div>
      <div data-narration-fx style={holderStyle}>
        <PetalDrift gateSelector="#info" />
      </div>
    </>
  );
}
