/**
 * Calls `onChange` whenever `el`'s client rectangle may have moved.
 *
 * getBoundingClientRect forces layout, so a frame loop that needs an
 * element's position cannot afford to ask every frame. Only two things can
 * move the rectangle: a scroll and a reflow. A scroll is a scroll event; a
 * reflow that moves THIS element is a resize of the viewport or a change in
 * the element's own size (a section revealing, a font swapping in), which
 * a ResizeObserver reports. The caller sets a stale flag from `onChange`
 * and reads the rectangle at most once per frame, and not at all while the
 * page sits still. Returns the function that stops tracking.
 *
 * The scroll listener is passive: it must never be able to hold up a
 * scroll, and it does no work beyond setting the caller's flag.
 */
export function trackClientRect(
  el: Element | null,
  onChange: () => void,
): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  const observer = new ResizeObserver(onChange);
  if (el) observer.observe(el);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
    observer.disconnect();
  };
}
