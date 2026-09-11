/**
 * A hairline that draws itself across.
 *
 * useRevealOnScroll has had a second path for rules since it was written —
 * scaleX 0 → 1 from the left edge, power3.inOut over 0.9 s — and nothing on
 * the site carried the marker. This does. `data-reveal="rule"` is the one
 * attribute: it is the selector the hook observes, the value it dispatches
 * on (as it already does for "far" and "slide"), and the attribute the
 * <noscript> rule in app/layout.tsx restores to opacity 1 — so with
 * JavaScript off the line sits there, full width, which is right.
 *
 * `ink` is for the cream Contact panel, where a white line is invisible.
 * Both are 25%, the same weight as BranchRule's resting hairline and the
 * subpage footer's (SubpageShell), so there is one kind of rule on the site.
 *
 * Its own file so the subpages can use the same one; HomeSections is the
 * first caller.
 */
export default function Rule({
  className = "",
  ink = false,
}: {
  className?: string;
  ink?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={
        "h-px w-full " + (ink ? "bg-[#0a0a0a]/25 " : "bg-white/25 ") + className
      }
      data-reveal="rule"
    />
  );
}
