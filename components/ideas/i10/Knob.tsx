"use client";

import { type JSX, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

import { SCHEMES } from "@/components/ideas/i10/schemes";

const NOTCH_DEGREES = 360 / SCHEMES.length;
/** A press that turns the knob less than this is a click, which turns it one notch. */
const CLICK_DEGREES = 4;
const NAME_SHOWN_MS = 1400;

function notchOf(angle: number): number {
  const count = SCHEMES.length;
  return ((Math.round(angle / NOTCH_DEGREES) % count) + count) % count;
}

function snapped(angle: number): number {
  return Math.round(angle / NOTCH_DEGREES) * NOTCH_DEGREES;
}

type Drag = { centreX: number; centreY: number; lastPointerAngle: number; turned: number };

function pointerAngle(event: PointerEvent<HTMLElement>, drag: Pick<Drag, "centreX" | "centreY">): number {
  return (Math.atan2(event.clientY - drag.centreY, event.clientX - drag.centreX) * 180) / Math.PI;
}

/**
 * Idea 10: a TV knob in the bottom-left corner. A click (or Enter, Space,
 * an arrow key) turns it one notch; a drag turns it freely and it settles
 * on the nearest notch. Each notch is a colour scheme, marked by a dot
 * round the knob; the scheme's name shows for a moment beside it.
 */
export default function Knob({ scheme, onTurn }: { scheme: number; onTurn: (next: number) => void }): JSX.Element {
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [nameShown, setNameShown] = useState(false);
  const angleRef = useRef(0);
  const notchRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);

  const hideNameRef = useRef(0);

  useEffect(() => () => window.clearTimeout(hideNameRef.current), []);

  const showName = (): void => {
    setNameShown(true);
    window.clearTimeout(hideNameRef.current);
    hideNameRef.current = window.setTimeout(() => setNameShown(false), NAME_SHOWN_MS);
  };

  const turnTo = (nextAngle: number): void => {
    angleRef.current = nextAngle;
    setAngle(nextAngle);
    const notch = notchOf(nextAngle);
    if (notch === notchRef.current) return;
    notchRef.current = notch;
    onTurn(notch);
    showName();
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const centre = { centreX: box.left + box.width / 2, centreY: box.top + box.height / 2 };
    dragRef.current = { ...centre, lastPointerAngle: pointerAngle(event, centre), turned: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const now = pointerAngle(event, drag);
    const delta = ((now - drag.lastPointerAngle + 540) % 360) - 180;
    drag.lastPointerAngle = now;
    drag.turned += Math.abs(delta);
    turnTo(angleRef.current + delta);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    const wasClick = event.type === "pointerup" && drag.turned < CLICK_DEGREES;
    turnTo(snapped(angleRef.current) + (wasClick ? NOTCH_DEGREES : 0));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const forward = ["Enter", " ", "ArrowRight", "ArrowUp"].includes(event.key);
    const back = ["ArrowLeft", "ArrowDown"].includes(event.key);
    if (!forward && !back) return;
    event.preventDefault();
    turnTo(snapped(angleRef.current) + (forward ? NOTCH_DEGREES : -NOTCH_DEGREES));
  };

  const current = SCHEMES[scheme];

  return (
    <div className="fixed bottom-[12px] left-[12px] z-[2147483600] h-[64px] w-[64px] sm:bottom-[16px] sm:left-[16px]">
      {SCHEMES.map((option, index) => (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-[5px] w-[5px] rounded-full transition-opacity duration-200"
          key={option.name}
          style={{
            backgroundColor: option.mark,
            opacity: index === scheme ? 1 : 0.35,
            boxShadow: index === scheme ? `0 0 6px ${option.mark}` : "none",
            transform: `translate(-50%, -50%) rotate(${index * NOTCH_DEGREES}deg) translateY(-29px)`,
          }}
        />
      ))}
      <button
        aria-label={`Colours: ${current.name}. Turn for the next scheme.`}
        className={`absolute left-1/2 top-1/2 h-[44px] w-[44px] -translate-x-1/2 -translate-y-1/2 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#f9b9dc] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onKeyDown={onKeyDown}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          background: "radial-gradient(circle at 35% 30%, #4a3240 0%, #23141d 55%, #0d060a 100%)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.65), inset 0 1px 1px rgba(255, 255, 255, 0.16), 0 0 0 1px rgba(249, 185, 220, 0.22)",
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="absolute inset-[2px] rounded-full"
          style={{
            transform: `rotate(${angle}deg)`,
            transition: dragging ? "none" : "transform 220ms cubic-bezier(0.3, 0.7, 0.2, 1)",
            background: "repeating-conic-gradient(rgba(255, 255, 255, 0.09) 0deg 3deg, transparent 3deg 12deg)",
          }}
        >
          <span className="absolute inset-[7px] rounded-full" style={{ background: "radial-gradient(circle at 40% 35%, #3a2532, #160c12)" }} />
          <span
            className="absolute left-1/2 top-[3px] h-[40%] w-[2px] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: "#fbeef4", boxShadow: "0 0 4px rgba(249, 185, 220, 0.85)" }}
          />
        </span>
      </button>
      <span
        aria-live="polite"
        className="pointer-events-none absolute left-[70px] top-1/2 -translate-y-1/2 whitespace-nowrap font-sans text-[10px] font-semibold uppercase tracking-[0.16em] transition-opacity duration-300 sm:text-[11px]"
        style={{ color: current.mark, opacity: nameShown ? 1 : 0, textShadow: `0 0 6px ${current.mark}` }}
      >
        {current.name}
      </span>
    </div>
  );
}
