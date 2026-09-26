"use client";

import { useEffect, useRef } from "react";
import { ValleyStatic } from "./ValleyMarkup";
import { mountValley } from "./valleyBehaviour";

/**
 * The home page: the reference's markup (ValleyMarkup) with the behaviour
 * (valleyBehaviour) attached once the DOM is there. The behaviour returns
 * its own teardown, so unmounting kills every tween, ScrollTrigger, bar
 * canvas and WebGL context it created and hands scrolling back to Lenis.
 */
export default function ValleyPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current?.querySelector<HTMLElement>(".valley");
    if (!root) return undefined;
    return mountValley(root);
  }, []);

  return (
    <div ref={ref}>
      <ValleyStatic />
    </div>
  );
}
