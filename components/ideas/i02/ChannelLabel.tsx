"use client";

import { type JSX, useEffect, useRef, useState } from "react";

import { CHANNELS, channelDigits, channelSection } from "@/components/ideas/i02/channels";
import { runStatic } from "@/components/ideas/i02/staticNoise";
import { INK } from "@/components/luke/theme";

const FLICKER_MS = 150;
const HOME = 0;
const WIDEST = CHANNELS.reduce((widest, channel, index) => (channel.name.length > CHANNELS[widest].name.length ? index : widest), 0);

type Change = { from: number; to: number };

function Line({ index }: { index: number }): JSX.Element {
  const channel = CHANNELS[index];
  return (
    <span className="block whitespace-pre leading-[1.8]">
      CH {channelDigits(channel)}
      {"  "}
      <span className="opacity-80">{channel.name}</span>
    </span>
  );
}

/**
 * Idea 2: an old TV's on-screen display, fixed in the corner once the hero
 * is passed, naming the section on screen as a channel ("CH 03  WORK").
 * Crossing into another section, it flickers with static and the line
 * rolls over to the new channel: up going down the page, down going up.
 * It fades as the end page switches off (PowerOff sets --i02-picture).
 */
export default function ChannelLabel(): JSX.Element {
  const [change, setChange] = useState<Change>({ from: HOME, to: HOME });
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const rollRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const sections = CHANNELS.map(channelSection);
    const crossingMiddle = new Set<number>();
    const middleLine = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = sections.indexOf(entry.target as HTMLElement);
          if (entry.isIntersecting) crossingMiddle.add(index);
          else crossingMiddle.delete(index);
        }
        if (crossingMiddle.size === 0) return;
        const index = Math.max(...crossingMiddle);
        setChange((current) => (current.to === index ? current : { from: current.to, to: index }));
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const section of sections) middleLine.observe(section);
    return () => middleLine.disconnect();
  }, []);

  const goingDown = change.to >= change.from;

  useEffect(() => {
    if (change.from === change.to) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = staticRef.current;
    const roll = rollRef.current;
    if (!canvas || !roll) throw new Error("Channels: the label did not mount");
    void runStatic(canvas, FLICKER_MS, 1.5, (t) => (t < 0.6 ? 0.9 : 0.9 * (1 - (t - 0.6) / 0.4)));
    const rolled = roll.animate(
      goingDown
        ? [{ transform: "translateY(0)" }, { transform: "translateY(-50%)" }]
        : [{ transform: "translateY(-50%)" }, { transform: "translateY(0)" }],
      { duration: FLICKER_MS, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
    );
    return () => rolled.cancel();
  }, [change, goingDown]);

  const onAir = change.to !== HOME;
  const lines = goingDown ? [change.from, change.to] : [change.to, change.from];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-[10px] top-[8px] z-[60] sm:left-[16px] sm:right-auto sm:top-[14px]"
      style={{ opacity: "var(--i02-picture, 1)" }}
    >
      <div
        className="relative overflow-hidden rounded-[3px] px-[0.7em] py-[0.1em] font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.16em] tabular-nums transition-opacity duration-300 sm:text-[12px]"
        style={{
          opacity: onAir ? 1 : 0,
          color: INK,
          backgroundColor: "rgba(23, 10, 20, 0.72)",
          boxShadow: "inset 0 0 0 1px rgba(249, 185, 220, 0.16)",
          textShadow: "0 0 4px rgba(249, 185, 220, 0.85), 0 0 12px rgba(224, 69, 127, 0.6)",
        }}
      >
        <span className="invisible block h-0 overflow-hidden">
          <Line index={WIDEST} />
        </span>
        <span className="block h-[1.8em] overflow-hidden">
          <span className="block" ref={rollRef} style={{ transform: goingDown ? "translateY(-50%)" : "translateY(0)" }}>
            <Line index={lines[0]} />
            <Line index={lines[1]} />
          </span>
        </span>
        <span
          className="absolute inset-0"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 3px)" }}
        />
        <canvas className="absolute inset-0 block h-full w-full [image-rendering:pixelated]" ref={staticRef} style={{ opacity: 0 }} />
      </div>
    </div>
  );
}
