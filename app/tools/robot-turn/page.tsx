import { notFound } from "next/navigation";

import Bake from "./Bake";

/**
 * A tool, not a page of the site: bakes the robot's turn under Skills into
 * public/models/robot-turn/ (see Bake.tsx). Development only.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Bake />;
}
