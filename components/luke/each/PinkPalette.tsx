"use client";

import { useEffect } from "react";

import { setPalette } from "@/components/cloudPalette";

/** Puts the cloud palette where the home page has it by the time the
 *  sentence is on screen: pink ground, plum type. For /e/N. */
export default function PinkPalette(): null {
  useEffect(() => {
    setPalette(1);
  }, []);
  return null;
}
