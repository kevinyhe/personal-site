"use client";

import { useEffect, useState } from "react";

/**
 * The clock where I actually am.
 *
 * "Based in Greater Toronto" is a fact that sits there; the same fact
 * ticking is a sign someone is on the other end of the page. It is the one
 * live thing in the sections, which is the point of it.
 *
 * Renders a placeholder until mounted. The server has no idea what time it
 * is in Toronto for the reader's cache, and a time in the HTML would either
 * mismatch on hydration or be served stale to everyone behind a CDN.
 */

const ZONE = "America/Toronto";

function nowInToronto() {
  const now = new Date();
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    timeZone: ZONE,
  }).format(now);
  // Asked for rather than hardcoded: Toronto is EST for part of the year
  // and EDT for the rest, and a label that is wrong all summer is worse
  // than no label.
  const zone =
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      timeZoneName: "short",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  return { clock, zone };
}

export default function LocalTime() {
  const [time, setTime] = useState<{ clock: string; zone: string } | null>(null);

  useEffect(() => {
    const tick = () => setTime(nowInToronto());
    tick();
    // Lined up to the next whole second, so the display changes when the
    // clock does rather than up to a second late.
    let interval = 0;
    const align = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      window.clearTimeout(align);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <span className="tabular-nums">
      {time?.clock ?? "--:--:--"}
      {time?.zone ? <span className="ml-2 opacity-40">{time.zone}</span> : null}
    </span>
  );
}
