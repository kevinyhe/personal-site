import type { ComponentType } from "react";

import E01Words from "@/components/luke/each/E01Words";
import E02Marquee from "@/components/luke/each/E02Marquee";
import E03Lines from "@/components/luke/each/E03Lines";
import E04Path from "@/components/luke/each/E04Path";
import E05Bars from "@/components/luke/each/E05Bars";
import E06Gather from "@/components/luke/each/E06Gather";
import E07Depth from "@/components/luke/each/E07Depth";
import E08Phrases from "@/components/luke/each/E08Phrases";
import E09Stack from "@/components/luke/each/E09Stack";
import E10Water from "@/components/luke/each/E10Water";
import G11Gallery from "@/components/luke/each/G11Gallery";
import G12Pond from "@/components/luke/each/G12Pond";
import G13Boughs from "@/components/luke/each/G13Boughs";
import G14Moon from "@/components/luke/each/G14Moon";
import G15Birds from "@/components/luke/each/G15Birds";
import G16Petals from "@/components/luke/each/G16Petals";
import G17Glass from "@/components/luke/each/G17Glass";
import G18Mountains from "@/components/luke/each/G18Mountains";
import G19Stroke from "@/components/luke/each/G19Stroke";
import G20Valley from "@/components/luke/each/G20Valley";
import H21Pictures from "@/components/luke/each/H21Pictures";
import H22Windows from "@/components/luke/each/H22Windows";
import H23Poppies from "@/components/luke/each/H23Poppies";
import H24Bloom from "@/components/luke/each/H24Bloom";
import H25Cutouts from "@/components/luke/each/H25Cutouts";
import H26Lines from "@/components/luke/each/H26Lines";

/**
 * The displays of the "Each project..." sentence, one component each
 * (components/luke/each): 1-10 are the type alone, 11-20 put a graphic
 * with it. /e/N shows design N alone on the pink ground; DEFAULT is the
 * one /e shows with no number. None is on the home page any more: the
 * skill icons' flight (components/luke/SkillFlight.tsx) stands there.
 */
export const EACH: { n: number; name: string; Component: ComponentType }[] = [
  { n: 1, name: "Words", Component: E01Words },
  { n: 2, name: "Marquee", Component: E02Marquee },
  { n: 3, name: "Lines", Component: E03Lines },
  { n: 4, name: "Path", Component: E04Path },
  { n: 5, name: "Bars", Component: E05Bars },
  { n: 6, name: "Gather", Component: E06Gather },
  { n: 7, name: "Depth", Component: E07Depth },
  { n: 8, name: "Phrases", Component: E08Phrases },
  { n: 9, name: "Stack", Component: E09Stack },
  { n: 10, name: "Water", Component: E10Water },
  { n: 11, name: "Gallery", Component: G11Gallery },
  { n: 12, name: "Pond", Component: G12Pond },
  { n: 13, name: "Boughs", Component: G13Boughs },
  { n: 14, name: "Moon", Component: G14Moon },
  { n: 15, name: "Birds", Component: G15Birds },
  { n: 16, name: "Petals", Component: G16Petals },
  { n: 17, name: "Glass", Component: G17Glass },
  { n: 18, name: "Mountains", Component: G18Mountains },
  { n: 19, name: "Stroke", Component: G19Stroke },
  { n: 20, name: "Valley", Component: G20Valley },
  // The three built at the size the sentence needed: a photograph a third
  // of the screen wide, type a sixth of the screen tall, the band's
  // flower a screen tall.
  { n: 21, name: "Pictures", Component: H21Pictures },
  { n: 22, name: "Windows", Component: H22Windows },
  { n: 23, name: "Poppies", Component: H23Poppies },
  // Abstract and flowery, in vectors, no pictures of the projects (user).
  { n: 24, name: "Bloom", Component: H24Bloom },
  { n: 25, name: "Cut-outs", Component: H25Cutouts },
  { n: 26, name: "Lines", Component: H26Lines },
];
export const DEFAULT = 24;
