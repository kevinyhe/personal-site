import SubpageShell from "@/components/SubpageShell";
import TransitionLink from "@/components/TransitionLink";

/**
 * Still a static 404 (no dynamic APIs; Next prerenders it as /_not-found).
 * It borrows the subpage frame so a wrong URL lands on a page with the
 * site's nav on it, and so its lines reveal the way every other page's do
 * — the shell runs the reveal hook, this only marks what it should move.
 */
export default function NotFound() {
  return (
    <SubpageShell>
      <section className="flex min-h-[60vh] flex-col justify-center pt-24 sm:pt-36">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          404
        </p>
        <h1
          className="mt-5 font-serif-display text-[clamp(2.5rem,8vw,5rem)] italic leading-none tracking-[-0.02em]"
          data-reveal
        >
          Page not found.
        </h1>
        <div
          aria-hidden="true"
          className="mt-8 h-px w-full max-w-[26rem] bg-white/25"
          data-reveal
          data-rule
        />
        {/* The wrapper is the riser, not the link: the reveal leaves
            `opacity: 1` inline, which would override the link's own 60%
            and its hover for good. */}
        <p className="mt-6 self-start" data-reveal>
          <TransitionLink
            className="inline-block text-[0.85rem] uppercase tracking-[0.04em] opacity-60 transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none"
            href="/"
            veilLabel="Kevin He."
          >
            Back home
          </TransitionLink>
        </p>
      </section>
    </SubpageShell>
  );
}
