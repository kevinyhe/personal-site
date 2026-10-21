import type { JSX } from "react";

import WorkIndex from "@/components/luke/WorkIndex";
import StatementSection from "@/components/StatementSection";
import Passage from "@/components/CloudPassage";

/**
 * Transition design 4, as merged into the home page: the statement, the
 * cloud passage over it, and Work in the cloud's colours. See CloudPassage.tsx.
 */
export default function Scene(): JSX.Element {
  return (
    <div className="relative">
      <StatementSection />
      <Passage />
      <WorkIndex />
    </div>
  );
}
