"use client";

import type { JSX } from "react";

import Panel from "@/components/ideas/i05/Panel";
import Preview from "@/components/ideas/i05/Preview";

/** Idea 5, "Previews": the Work rows' picture beside the cursor and the case-study panel (the rows are in WorkIndex.tsx). */
export default function Extra(): JSX.Element {
  return (
    <>
      <Preview />
      <Panel />
    </>
  );
}
