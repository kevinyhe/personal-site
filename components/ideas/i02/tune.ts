/** Idea 2: changing channel from the hero strip. The full-screen static (StaticWipe) does the jump; the strip only asks for it. */

import { channelByNumber, type Channel } from "@/components/ideas/i02/channels";

type Tuner = (channel: Channel) => void;

let tuner: Tuner | null = null;

export function setTuner(next: Tuner | null): void {
  tuner = next;
}

export function tuneTo(channelNumber: number): void {
  if (!tuner) throw new Error("Channels: the static wipe is not on the page");
  tuner(channelByNumber(channelNumber));
}
