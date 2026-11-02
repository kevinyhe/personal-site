import type { ComponentType } from "react";

import I01 from "@/components/ideas/i01/Extra";
import I02 from "@/components/ideas/i02/Extra";
import I04 from "@/components/ideas/i04/Extra";
import I05 from "@/components/ideas/i05/Extra";
import I06 from "@/components/ideas/i06/Extra";
import I07 from "@/components/ideas/i07/Extra";
import I08 from "@/components/ideas/i08/Extra";
import I09 from "@/components/ideas/i09/Extra";
import I10 from "@/components/ideas/i10/Extra";

/** The ideas shown at /i/N, each the home page with one idea on. Idea 3, Reach, is on the home page itself (luke/Reach.tsx). */
export const IDEAS: { n: number; name: string; Extra: ComponentType }[] = [
  { n: 1, name: "Touch", Extra: I01 },
  { n: 2, name: "Channels", Extra: I02 },
  { n: 4, name: "Type", Extra: I04 },
  { n: 5, name: "Previews", Extra: I05 },
  { n: 6, name: "Flock", Extra: I06 },
  { n: 7, name: "Petals", Extra: I07 },
  { n: 8, name: "Workbench", Extra: I08 },
  { n: 9, name: "Sky", Extra: I09 },
  { n: 10, name: "Knob", Extra: I10 },
];
