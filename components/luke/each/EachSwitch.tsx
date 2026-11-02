import type { JSX } from "react";

import { DEFAULT, EACH } from "@/components/luke/each/list";

/** Design `n` of the sentence (list.ts), or the home page's own. */
export default function EachSwitch({ n }: { n?: number }): JSX.Element {
  const pick = EACH.find((e) => e.n === n) ?? EACH.find((e) => e.n === DEFAULT) ?? EACH[0];
  const { Component } = pick;
  return <Component />;
}
