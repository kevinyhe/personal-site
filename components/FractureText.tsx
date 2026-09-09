"use client";

import { useMemo } from "react";

/**
 * Type that comes apart the way the statue does.
 *
 * The hero's whole second act is a solid form breaking into chunks that
 * fly left, a little up, and toward the viewer. This is that, applied to a
 * line of text: each character is a piece, each piece gets its own
 * displacement, and hovering the line releases them.
 *
 * The displacements are decided once, at render, from a hash of the
 * character and its position — so they are stable (the same letter always
 * goes the same way, in and out, however many times you hover) and free
 * (no random, so the server and the client agree). After mount there is no
 * JavaScript in this at all: the offsets ride on custom properties and the
 * motion is a CSS transition, which is why a fifty-character email can do
 * this without touching a frame budget.
 */

/** How far a piece travels at full spread, in em. */
const REACH_X = 0.34;
const REACH_Y = 0.26;
const REACH_ROTATE = 8;
/** A shared lean, so the whole line drifts the way the statue's chunks do. */
const DRIFT_X = -0.06;
/** Seconds between one character leaving and the next. */
const STAGGER = 0.012;

/** Deterministic 0..1 from a string and an index. No Math.random: this renders on the server too. */
function hashed(text: string, index: number, salt: number) {
  let hash = (index + 1) * 2654435761 + salt * 40503;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash ^ text.charCodeAt(i)) * 16777619;
    hash >>>= 0;
  }
  return ((hash >>> 8) % 10000) / 10000;
}

export default function FractureText({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  const pieces = useMemo(
    () =>
      Array.from(text).map((character, index, all) => {
        // Outward from the middle of the line, not all one way. Sending
        // every piece left just stacked the address on top of itself and
        // the break read as a smear; spreading from the centre opens gaps
        // between the letters, which is what a break looks like. The whole
        // line still leans left, the way the statue's chunks fly.
        const fromCentre =
          all.length > 1 ? (index / (all.length - 1) - 0.5) * 2 : 0;
        const spreadX =
          (fromCentre * (0.45 + hashed(character, index, 1) * 0.55) +
            DRIFT_X) *
          REACH_X;
        const spreadY = (hashed(character, index, 2) - 0.68) * REACH_Y;
        const spin = (hashed(character, index, 3) - 0.5) * 2 * REACH_ROTATE;
        // The break runs out from the middle too, so the line opens rather
        // than being wiped across.
        const delay =
          Math.abs(fromCentre) * all.length * STAGGER * 0.5 +
          hashed(character, index, 4) * 0.05;
        return { character, delay, index, spin, spreadX, spreadY };
      }),
    [text],
  );

  return (
    <span
      className={
        "group/fracture inline-flex whitespace-nowrap " + (className ?? "")
      }
    >
      {pieces.map((piece) => (
        <span
          className={
            "inline-block will-change-transform " +
            "transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
            "group-hover/fracture:[transform:translate(var(--fx),var(--fy))_rotate(var(--fr))] " +
            "group-hover/fracture:opacity-80"
          }
          key={piece.index}
          style={
            {
              "--fx": `${piece.spreadX.toFixed(3)}em`,
              "--fy": `${piece.spreadY.toFixed(3)}em`,
              "--fr": `${piece.spin.toFixed(2)}deg`,
              transitionDelay: `${piece.delay.toFixed(3)}s`,
            } as React.CSSProperties
          }
        >
          {/* A space cannot be an inline-block on its own — it collapses. */}
          {piece.character === " " ? " " : piece.character}
        </span>
      ))}
    </span>
  );
}
