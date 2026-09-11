"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
 *
 * Nothing here moves. The placeholder fades into the first real time, and a
 * digit group that changes dips in opacity for the frame it changes on, so
 * the tick is visible as a tick rather than as a hard repaint. Both are Web
 * Animations on opacity: they run off the compositor and never hold a
 * requestAnimationFrame open, which matters on a page that counts them.
 */

const ZONE = "America/Toronto";
/** The page's CSS curve (globals.css uses it for every transition). */
const CURVE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Built once. An Intl.DateTimeFormat loads locale data on construction and
// this used to build two of them every second.
const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: ZONE,
});
// Asked for rather than hardcoded: Toronto is EST for part of the year and
// EDT for the rest, and a label that is wrong all summer is worse than no
// label.
const ZONE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  timeZoneName: "short",
});

type Time = {
  /** Hours, minutes, seconds — the groups between the colons. */
  groups: string[];
  zone: string;
};

function nowInToronto(): Time {
  const now = new Date();
  return {
    groups: CLOCK_FORMAT.format(now).split(":"),
    zone:
      ZONE_FORMAT.formatToParts(now).find((part) => part.type === "timeZoneName")
        ?.value ?? "",
  };
}

const PLACEHOLDER = ["--", "--", "--"];

let reducedMotionQuery: MediaQueryList | null = null;
const prefersReducedMotion = () =>
  (reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)"))
    .matches;

export default function LocalTime() {
  const [time, setTime] = useState<Time | null>(null);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const groupRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastGroupsRef = useRef<string[] | null>(null);

  useEffect(() => {
    const tick = () => setTime(nowInToronto());
    let align = 0;
    let interval = 0;
    const stop = () => {
      window.clearTimeout(align);
      window.clearInterval(interval);
      align = 0;
      interval = 0;
    };
    const start = () => {
      stop();
      tick();
      // Lined up to the next whole second, so the display changes when the
      // clock does rather than up to a second late.
      align = window.setTimeout(() => {
        tick();
        interval = window.setInterval(tick, 1000);
      }, 1000 - (Date.now() % 1000));
    };
    // A hidden tab has no reader. The interval stops and the clock is
    // re-read the moment the tab is back, so it never shows the time it
    // was hidden at; the browser would only have throttled it to once a
    // minute anyway, which is a clock that is wrong by up to 59 seconds.
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    if (document.hidden) tick();
    else start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Before paint, so the changed digits are never seen at full opacity for
  // a frame before the dip starts.
  useLayoutEffect(() => {
    if (!time || prefersReducedMotion()) return;
    const last = lastGroupsRef.current;
    lastGroupsRef.current = time.groups;
    if (!last) {
      // The handoff from the placeholder: the real time fades up in place.
      hostRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        easing: CURVE,
      });
      return;
    }
    time.groups.forEach((group, i) => {
      if (group === last[i]) return;
      groupRefs.current[i]?.animate([{ opacity: 0.3 }, { opacity: 1 }], {
        duration: 120,
        easing: CURVE,
      });
    });
  }, [time]);

  const groups = time?.groups ?? PLACEHOLDER;

  return (
    <span className="tabular-nums" ref={hostRef}>
      {groups.map((group, i) => (
        <span key={i}>
          {i > 0 ? ":" : null}
          <span
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
          >
            {group}
          </span>
        </span>
      ))}
      {time?.zone ? <span className="ml-2 opacity-40">{time.zone}</span> : null}
    </span>
  );
}
