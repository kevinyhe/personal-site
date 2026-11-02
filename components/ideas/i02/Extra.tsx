"use client";

import type { JSX } from "react";

import ChannelLabel from "@/components/ideas/i02/ChannelLabel";
import PowerOff from "@/components/ideas/i02/PowerOff";
import StaticWipe from "@/components/ideas/i02/StaticWipe";

/** Idea 2, "Channels": the TV the site opens on stays on down the page. A channel label in the corner, static between sections, and the picture switching off at the very end. */
export default function Extra(): JSX.Element {
  return (
    <>
      <ChannelLabel />
      <StaticWipe />
      <PowerOff />
    </>
  );
}
