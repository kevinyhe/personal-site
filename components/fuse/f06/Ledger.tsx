"use client";

import { type JSX, type KeyboardEvent, type PointerEvent, useId, useMemo, useRef, useState } from "react";

import { activeIn, MONTHS, month, monthName, monthShort, NOW, type Stream, TIMELINE, TONE_INK, type Tone } from "./data";
import LedgerCanvas from "./LedgerCanvas";
import { BODY, Chip, PageHead, PERIOD_COL, Runs, TINY } from "./parts";

/**
 * Page two: the timeline as a picture, then the timeline as text.
 *
 * The chart is one column of bars a month. Pointing at a column (or
 * focusing the chart and using the arrow keys) writes that month out
 * underneath, the way lanceyan's timeline rows read: the month dim on the
 * left, what began on the right, then everything that was running.
 *
 * Under it, lanceyan's rows by year, with lukebaffait's big index type for
 * the years. Opening or pointing at a row lights its streams in the chart
 * and fades the rest. On a tall enough desktop window the chart stays
 * pinned while the rows scroll under it, so the two can be read together.
 */

const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const LEGEND: { tone: Tone; label: string }[] = [
  { tone: "school", label: "School" },
  { tone: "blossom", label: "Robotics" },
  { tone: "rose", label: "Companies" },
  { tone: "white", label: "Projects" },
];

/** What a month says: what began in it, or the newest thing still running. */
function monthText(m: number): { head: string; active: Stream[] } {
  const active = activeIn(m);
  if (m > NOW) return { head: "Not yet.", active };
  if (!active.length) return { head: "Nothing on the record this month.", active };
  const began = active.filter((s) => s.start === m);
  if (began.length) return { head: `${began.map((s) => s.began).join(". ")}.`, active };
  const newest = active.reduce((a, b) => (b.start > a.start ? b : a));
  return { head: `${newest.name}, ${newest.role}, since ${monthName(newest.start)}.`, active };
}

function Swatch({ tone }: { tone: Tone }): JSX.Element {
  const ink = TONE_INK[tone];
  const o = tone === "school" ? 0.5 : 1;
  return (
    <svg aria-hidden className="h-[1.1em] w-[0.9em]" viewBox="0 0 9 11">
      {[2.2, 3, 1.6].map((w, i) => (
        <rect fill={ink} height="11" key={i} opacity={o} width={w} x={i * 3 + (3 - w) / 2} y="0" />
      ))}
    </svg>
  );
}

function Chart({ highlight }: { highlight: string[] }): JSX.Element {
  const [hover, setHover] = useState(-1);
  const [picked, setPicked] = useState(-1);
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  const shown = hover >= 0 ? hover : picked >= 0 ? picked : NOW;
  const marked = hover >= 0 ? hover : focused && picked >= 0 ? picked : -1;
  const { head, active } = monthText(shown);

  const at = (e: PointerEvent<HTMLDivElement>): number => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return -1;
    return Math.max(0, Math.min(MONTHS - 1, Math.floor(((e.clientX - r.left) / r.width) * MONTHS)));
  };

  // A finger has no hover: what it touched stays picked after it lifts.
  const point = (e: PointerEvent<HTMLDivElement>): void => {
    const m = at(e);
    setHover(m);
    if (e.pointerType !== "mouse" && m >= 0) setPicked(m);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const from = picked >= 0 ? picked : NOW;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 };
    let next = from;
    if (e.key in step) next = from + step[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = MONTHS - 1;
    else return;
    e.preventDefault();
    setHover(-1);
    setPicked(Math.max(0, Math.min(MONTHS - 1, next)));
  };

  const tagX = marked < 0 ? 0 : ((marked + 0.5) / MONTHS) * 100;
  const tagShift = marked < 5 ? "0%" : marked > MONTHS - 6 ? "-100%" : "-50%";

  return (
    <div>
      <div className={`${TINY} mb-[clamp(30px,4.4rem,64px)] flex flex-wrap items-center justify-between gap-x-[2.4rem] gap-y-[0.8rem] text-white/60`}>
        <span>
          <span className="text-white/40">(72)</span> Months, 2021 to 2026
        </span>
        <ul className="flex flex-wrap items-center gap-x-[1.6em] gap-y-[0.4em]">
          {LEGEND.map((l) => (
            <li className="flex items-center gap-[0.55em]" key={l.tone}>
              <Swatch tone={l.tone} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <div
        aria-label="Timeline by month. Use the arrow keys to move a month, Page Up and Page Down to move a year."
        aria-valuemax={MONTHS - 1}
        aria-valuemin={0}
        aria-valuenow={shown}
        aria-valuetext={`${monthName(shown)}. ${head}`}
        className="relative h-[clamp(190px,34vh,520px)] cursor-crosshair touch-pan-y select-none outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[6px] focus-visible:outline-[#f9b9dc]/70"
        onBlur={() => setFocused(false)}
        onFocus={() => {
          setFocused(true);
          if (picked < 0) setPicked(NOW);
        }}
        onKeyDown={onKey}
        onPointerDown={(e) => point(e)}
        onPointerLeave={() => setHover(-1)}
        onPointerMove={(e) => point(e)}
        ref={box}
        role="slider"
        tabIndex={0}
      >
        <LedgerCanvas highlight={highlight} hover={marked} />

        {/* Now: a dashed hairline at the end of October 2026. */}
        <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-white/30" style={{ left: `${((NOW + 1) / MONTHS) * 100}%` }}>
          <span className={`${TINY} absolute -top-[1.9em] left-0 -translate-x-full whitespace-nowrap pr-[0.5em] text-white/55 transition-opacity ${marked >= 0 ? "opacity-0" : ""}`}>(Now)</span>
        </div>

        {marked >= 0 && (
          <span aria-hidden className={`${TINY} pointer-events-none absolute -top-[1.9em] whitespace-nowrap text-white`} style={{ left: `${tagX}%`, transform: `translateX(${tagShift})` }}>
            {monthShort(marked)}
          </span>
        )}
      </div>

      {/* Years along the foot. */}
      <div aria-hidden className={`${TINY} relative h-[2.6em] border-t border-white/20 text-white/55`}>
        {YEARS.map((y) => (
          <span className="absolute top-0 pl-[0.5em] pt-[0.7em]" key={y} style={{ left: `${(month(y, 1) / MONTHS) * 100}%` }}>
            <span className="absolute left-0 top-0 h-[0.9em] border-l border-white/40" />
            {y}
          </span>
        ))}
      </div>

      {/* The month, written out. */}
      <div className={`mt-[clamp(14px,2.4rem,36px)] grid ${PERIOD_COL} min-h-[clamp(104px,14rem,210px)] gap-x-[2rem] border-t border-white/10 pt-[clamp(12px,1.8rem,26px)]`}>
        <p className="text-[clamp(14px,1.85rem,26px)] leading-[1.5] text-white/45">{monthName(shown)}</p>
        <div>
          <p className="text-[clamp(15px,2.1rem,30px)] leading-[1.45] text-white">{head}</p>
          {active.length > 0 && (
            <ul className="mt-[0.7em] flex flex-wrap gap-x-[1.6em] gap-y-[0.35em] text-[clamp(13px,1.65rem,23px)] leading-[1.5] text-white/55">
              {active.map((s) => (
                <li key={s.id}>
                  <Chip org={s.org} />
                  <span className="text-white/85">{s.name}</span>, {s.role}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg aria-hidden className={`h-[0.7em] w-[0.7em] text-white/50 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 10 6">
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export default function Ledger(): JSX.Element {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const [pointed, setPointed] = useState(-1);
  const uid = useId();

  const highlight = useMemo(() => {
    if (pointed >= 0) return TIMELINE[pointed].streams;
    const ids = new Set<string>();
    open.forEach((i) => TIMELINE[i].streams.forEach((s) => ids.add(s)));
    return [...ids];
  }, [open, pointed]);

  const toggle = (i: number): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <section aria-label="Timeline" className="relative" id="ledger">
      <div className="pt-[clamp(80px,16rem,260px)]">
        <PageHead of={3} page={2} to="skills" />
        <p className={`${BODY} mt-[clamp(14px,2.4rem,36px)] max-w-[64rem] text-white/75`}>
          Here&rsquo;s a rough timeline of what I&rsquo;ve done so far, one column of bars a month:
        </p>
      </div>

      {/* Pinned on a tall desktop window; in the flow anywhere else. */}
      <div className="relative z-10 -mx-[clamp(16px,4.8rem,96px)] mt-[clamp(40px,7rem,110px)] px-[clamp(16px,4.8rem,96px)] pb-[clamp(8px,1.6rem,24px)] pt-[clamp(28px,4rem,60px)] [@media(min-width:1024px)_and_(min-height:860px)]:sticky [@media(min-width:1024px)_and_(min-height:860px)]:top-0 [@media(min-width:1024px)_and_(min-height:860px)]:bg-[linear-gradient(to_bottom,rgba(26,8,18,0.86)_0%,rgba(26,8,18,0.8)_88%,rgba(26,8,18,0)_100%)] [@media(min-width:1024px)_and_(min-height:860px)]:backdrop-blur-[6px]">
        <Chart highlight={highlight} />
      </div>

      <ol className="mt-[clamp(28px,5rem,80px)]" onMouseLeave={() => setPointed(-1)}>
        {TIMELINE.map((row, i) => {
          const isOpen = open.has(i);
          const lit = isOpen || pointed === i;
          const panel = `${uid}-row-${i}`;
          return (
            <li className="border-t border-white/15 last:border-b" key={row.period}>
              <button
                aria-controls={panel}
                aria-expanded={isOpen}
                className={`grid w-full ${PERIOD_COL} items-baseline gap-x-[2rem] py-[clamp(12px,2rem,30px)] text-left outline-none focus-visible:bg-white/[0.04]`}
                onBlur={() => setPointed(-1)}
                onClick={() => toggle(i)}
                onFocus={() => setPointed(i)}
                onMouseEnter={() => setPointed(i)}
                type="button"
              >
                <span className={`font-sans text-[clamp(38px,8.4rem,140px)] font-light leading-[0.9] tracking-[-0.045em] transition-colors duration-300 ${lit ? "text-white" : "text-white/25"}`}>
                  {row.period}
                </span>
                <span className="flex items-baseline justify-between gap-[1.2rem]">
                  <span className={`text-[clamp(16px,2.5rem,36px)] leading-[1.35] transition-colors duration-300 ${lit ? "text-white" : "text-white/70"}`}>
                    <Runs links={false} runs={row.head} />
                  </span>
                  <span className="shrink-0 text-[clamp(16px,2.5rem,36px)]">
                    <Chevron open={isOpen} />
                  </span>
                </span>
              </button>
              <div
                aria-hidden={!isOpen}
                className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.7,.1,1)] motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                id={panel}
                inert={!isOpen}
              >
                <div className="overflow-hidden">
                  <div className="grid gap-x-[2rem] pb-[clamp(18px,3rem,44px)] sm:grid-cols-[clamp(96px,24rem,400px)_minmax(0,1fr)]">
                    <span className="hidden sm:block" />
                    <div>
                      <ul className="space-y-[0.45em] text-[clamp(14px,1.85rem,26px)] leading-[1.55] text-white/65">
                        {row.facts.map((f, k) => (
                          <li key={k}>
                            <Runs runs={f} />
                          </li>
                        ))}
                      </ul>
                      {row.quote && (
                        <blockquote className="mt-[1.2em] border-l border-[#f9b9dc]/60 pl-[1em] text-[clamp(15px,2.1rem,30px)] italic leading-[1.45] text-white/90">
                          {row.quote}
                        </blockquote>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
