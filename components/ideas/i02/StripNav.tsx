"use client";

import type { JSX, MouseEvent, ReactNode } from "react";

import { channelByNumber, channelDigits } from "@/components/ideas/i02/channels";
import { tuneTo } from "@/components/ideas/i02/tune";
import { useIdea } from "@/components/ideas/idea";

const STRIP_CHANNELS = [
  { channel: channelByNumber(2), href: "#info" },
  { channel: channelByNumber(3), href: "#work" },
  { channel: channelByNumber(5), href: "#contact" },
];

function ChannelNav(): JSX.Element {
  const tune = (channelNumber: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    tuneTo(channelNumber);
  };
  return (
    <nav className="flex items-center justify-end gap-[1.1rem] sm:gap-[2.2rem]">
      {STRIP_CHANNELS.map(({ channel, href }) => (
        <a
          aria-label={`Channel ${channel.number}, ${channel.name}`}
          className="pointer-events-auto flex items-baseline gap-[0.5em] transition-opacity duration-200 hover:opacity-60"
          href={href}
          key={channel.number}
          onClick={tune(channel.number)}
        >
          <span className="tabular-nums [text-shadow:0_0_6px_rgba(249,185,220,0.8)]">{channelDigits(channel)}</span>
          <span className="hidden sm:inline">{channel.name}</span>
        </a>
      ))}
    </nav>
  );
}

/** The hero strip's section links. On /i/2 they are channel numbers that change channel under static; anywhere else they are the strip's own links, passed in as children and left as they are. */
export default function StripNav({ children }: { children: ReactNode }): JSX.Element {
  return useIdea() === 2 ? <ChannelNav /> : <>{children}</>;
}
