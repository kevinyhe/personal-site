"use client";

import { useCallback, useRef, useState } from "react";
import BranchRule from "@/components/BranchRule";
import FractureText from "@/components/FractureText";
import HalftoneField from "@/components/HalftoneField";
import LocalTime from "@/components/LocalTime";
import { Narration, Stanza } from "@/components/Narration";
import PetalDrift from "@/components/PetalDrift";
import SakuraStage from "@/components/SakuraStage";
import makeSakuraBlossomMarks from "@/components/sakuraBlossomMarks";
import makeSakuraBough from "@/components/sakuraBough";
import SectionHeader from "@/components/SectionHeader";
import WorkPlate, { type PlateContent } from "@/components/WorkPlate";
import {
  EMAIL,
  elsewhere,
  GITHUB,
  selected,
  workEntries,
  type WorkEntry,
} from "@/components/siteContent";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

/**
 * The page below the hero, told rather than listed.
 *
 * The hero is a sticky stage inside its own scroll room (see HeroIntro); it
 * scrolls away at the end of it and hands the page to this.
 *
 * Arranged after etiennepharabot.fr's 2021 portfolio, which is one
 * continuous first-person sentence set at heading size the whole way down
 * — see components/Narration for what that means and why. The order is its
 * order too: who I am, then the work, then how to reach me. The list of
 * projects is introduced by a line of the same narration at the same size,
 * so it reads as a clause rather than a new document.
 *
 * The hero's two ideas still carry down: the dot matrix (HalftoneField,
 * WorkPlate) and the statue's fracture (FractureText on the email).
 *
 * The tree itself is now down here too, and that is the point of this
 * round: the petals used to fall from nowhere, so they read as confetti
 * over a text page. There is one WebGL stage below the fold (SakuraStage)
 * and exactly two things stand on it:
 *
 *   - sakuraBough: one heavy cherry limb hung off this block's top edge,
 *     cut out of a real generated tree, with the hero's bark, the hero's
 *     blossoms and the hero's wind. Its blossoms open as you come down into
 *     the page, and it publishes its twig tips so PetalDrift's petals fall
 *     out of it. This is the element the whole thing was for.
 *   - sakuraBlossomMarks: thirteen five-petal flowers at the page's
 *     landmarks, each a bud that opens as it climbs the screen. One
 *     InstancedMesh, one draw call, ~2.5k triangles — it carries the tree
 *     down the page after the bough has drifted off, for about the cost of
 *     nothing.
 *
 * Plus the two cheap layers that were already here:
 *
 *   - PetalDrift: the hero's loose petals keep falling over the whole of
 *     this block, one fixed canvas, ~80 of them. Ambient, always there.
 *   - BranchRule: the hairline under a work row grows as a twig on hover.
 *     Costs nothing until a pointer is on a row.
 *
 * Five more components were built and are deliberately NOT mounted; see the
 * note above the mount point below for which and why. The rule that decided
 * all five: the hero is one idea done properly, and a page that answers it
 * with six simultaneous decorations reads as a demo reel.
 */

/**
 * A caption, at roughly a quarter of the narration — the reference's own
 * ratio between a project title and its line.
 *
 * Sans, not the display serif, and that is not a style choice. The serif is
 * a Fontspring DEMO cut which draws its watermark instead of "4" and "$";
 * everything down here is dates, money and a clock that ticks through 4
 * several times an hour. See the note in Narration.
 */
function Aside({ children }: { children: React.ReactNode }) {
  return (
    // 60%, not the 45% this was drawn at. #f0f0f0 at 0.45 over #0a0a0a
    // renders a glyph core of rgb(114) — 4.09:1, under the 4.5:1 floor for
    // 15px text. 0.60 puts it at 6.53:1 and still reads as a caption
    // against the full-strength headlines.
    <p className="text-[0.95rem] leading-[1.7] opacity-60" data-reveal>
      {children}
    </p>
  );
}

function WorkRow({
  entry,
  onHover,
}: {
  entry: WorkEntry;
  onHover: (content: PlateContent | null) => void;
}) {
  const inner = (
    <div className="py-7 sm:py-10">
      <h3 className="font-serif-display text-[clamp(1.7rem,4.4vw,4rem)] leading-[1.15] tracking-[-0.02em] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-3">
        {entry.title}
        {entry.href ? (
          <span
            aria-hidden="true"
            className="ml-3 inline-block align-middle text-[0.9rem] opacity-0 transition-opacity duration-300 group-hover:opacity-60"
          >
            {"↗"}
          </span>
        ) : null}
      </h3>
      {/* Title big, caption small, nothing in between — the reference's
          projects are 75px over a 20px line and that gap is the design.
          Sans for the same reason as Aside: these lines carry "$140,000"
          and "40,000", and the serif has neither glyph.

          The year sits on its own line rather than opening the caption: an
          ongoing one already ends in a dash, and "2026 —. Co-founder" is
          not a sentence anybody wrote on purpose. */}
      {/* 55% and 60%, up from 35% and 45%. The year is 12.8px uppercase on
          0.1em tracking — the hardest text on the page to read — and at 35%
          it came out at 2.89:1, well under half the 4.5:1 floor. The
          summary was 4.09:1, and its group-hover lift to 85% is not a fix
          because hover is not the default state and does not exist on
          touch. */}
      <p className="mt-3 text-[0.8rem] uppercase tracking-[0.1em] opacity-55">
        {entry.year}
      </p>
      <p className="mt-2 max-w-[40rem] text-[0.95rem] leading-[1.7] opacity-60 transition-opacity duration-300 group-hover:opacity-85">
        {entry.description}
      </p>
    </div>
  );

  const content: PlateContent = {
    key: entry.title,
    lead: entry.year.replace(/[^0-9]/g, "").slice(0, 4) || entry.year,
    tag: entry.tag,
  };

  return (
    <li
      className="group relative"
      data-branch-host
      data-reveal
      // Pointer only. The plate is decorative (aria-hidden) and is placed at
      // the cursor, so opening it on keyboard focus would put it wherever
      // the mouse happened to be left.
      onPointerEnter={() => onHover(content)}
      onPointerLeave={() => onHover(null)}
    >
      {/* The rule arrives on hover rather than sitting there, and it
          arrives as a twig: BranchRule draws the hairline itself, on the
          same progress that grows the branch, so the two land together.
          It listens on this li for pointer and focus. */}
      <BranchRule seed={entry.title} />
      {entry.href ? (
        <a href={entry.href} rel="noreferrer" target="_blank">
          {inner}
        </a>
      ) : (
        inner
      )}
    </li>
  );
}

function CopyEmail() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused (insecure origin, or permission denied). The
      // address is right there as a mailto link; nothing needs saying.
    }
  }, []);

  return (
    <button
      className="font-serif-display text-[1.05rem] italic opacity-50 transition-opacity duration-200 hover:opacity-100"
      onClick={copy}
      type="button"
    >
      {copied ? "Copied" : "Copy it"}
    </button>
  );
}

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, options?: object) => void;
};

export default function HomeSections() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [plate, setPlate] = useState<PlateContent | null>(null);

  useRevealOnScroll(rootRef);

  const toTop = useCallback(() => {
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (lenis) lenis.scrollTo(0, { duration: 2 });
    else window.scrollTo({ behavior: "smooth", top: 0 });
  }, []);

  return (
    // relative + an opaque ground, both load-bearing: the hero's stage is a
    // sticky box that scrolls up behind this, so without them the statue
    // would show through the type all the way down the page.
    <div
      className="relative z-10 bg-[#0a0a0a] text-[#f0f0f0]"
      data-sections
      ref={rootRef}
    >
      <HalftoneField />
      {/* One WebGL context below the fold, and only one. The stage boots a
          viewport early, runs only while this block is on screen and the tab
          is visible, and draws behind the type at z-0 like the dot field.

          Order matters: the bough is the expensive build and everything else
          reads better once it is up, so it goes first.

          Not mounted, and left on disk:
            - sakuraContactTree: a whole tree at the Contact panel. It cannot
              be seen. #contact is opaque cream at z-[1] over the stage at
              z-0, so every pixel of the tree behind it is painted out, and
              the stage's mix-blend-lighten can only ADD light — a dark tree
              composited onto cream is that cream exactly. Its own author
              said so. It would have cost ~0.87M triangles a frame to render
              nothing.
            - sakuraMargins: sixteen twig families creeping in from both
              screen edges around the reading column. Cheap (6 draw calls)
              and good on its own, but with the bough overhead and the marks
              on the landmarks it makes a frame around every screen of text,
              which is the demo reel. It also carries a hand-copy of the
              hero's wind GLSL that nothing checks, so it can drift out of
              step with the tree silently.
            - BloomCursor (a second falling-petal system in the same space as
              PetalDrift), BranchProgress (a twig down the right margin — a
              second twig, competing with the work rows' own, repainting
              continuously, and now plainly redundant against the bough),
              PetalReveal (a third petal system, one canvas per text block). */}
      <SakuraStage
        elements={[makeSakuraBough, makeSakuraBlossomMarks]}
        gateSelector="[data-sections]"
      />
      {/* Behind the type, at z-0 with the stage and the dot field: body copy
          here runs to 55-60% white on #0a0a0a and any opaque pixel in front
          of a glyph puts it under 4.5:1. The cost is that the cream Contact
          panel covers the field outright, so the petals stop at the flip.

          data-sections gates it. Without a gate the field runs over the hero
          too, which already drops its own petals in WebGL.

          Its petals now come off the bough's twig tips whenever the bough is
          overhead (components/boughSpawn.ts) and off the top edge the rest of
          the time. */}
      <PetalDrift gateSelector="[data-sections]" />
      <WorkPlate content={plate} />
      <SectionHeader />

      {/* The narration that used to open this file now plays over the
          statue, inside the hero's pin (see HeroIntro). What is left of it
          is the part a sentence should not carry — a list of dates, and a
          clock — which lands here, quietly, before the work. */}
      <section className="relative z-[1] px-6 pt-28 sm:px-16 sm:pt-40">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-16">
          <ul className="space-y-3">
            {selected.map((item) => (
              <li data-reveal key={item.title}>
                <Aside>
                  {item.year}. {item.title}
                </Aside>
              </li>
            ))}
          </ul>
          <ul className="space-y-3">
            <li data-reveal>
              <Aside>
                {/* The one live thing on the page. */}
                Local time in Toronto: <LocalTime />
              </Aside>
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ Work */}
      <section className="relative z-[1] px-6 pt-32 sm:px-16 sm:pt-48" id="work">
        <h2 className="sr-only">Work</h2>
        {/* Same size as the narration, because it is the next clause of it. */}
        <Narration>
          {/* "Here is some of it" dangled: the narration ends on where I
              study, so "it" pointed at nothing. The reference names its own
              list at the same size as its sentence and so does this. */}
          <Stanza
            far
            lines={[
              {
                indent: 4,
                runs: [
                  { text: "Selected", voice: "soft" },
                  { text: "work", voice: "strong" },
                ],
              },
            ]}
          />
        </Narration>

        <ul className="mt-20 sm:mt-28" data-work-list>
          {workEntries.map((entry) => (
            <WorkRow entry={entry} key={entry.title} onHover={setPlate} />
          ))}
        </ul>
        <p className="mt-12" data-reveal>
          <a
            className="font-serif-display text-[1.05rem] italic opacity-60 transition-opacity duration-200 hover:opacity-100"
            href={GITHUB}
            rel="noreferrer"
            target="_blank"
          >
            The rest is on GitHub {"↗"}
          </a>
        </p>
      </section>

      {/* --------------------------------------------------------- Contact */}
      {/* The flip. The reference is a cream page whose contact turns black;
          this is a black page whose contact turns cream. Full bleed and
          opaque, so it covers the dot field rather than sitting on it. */}
      <section
        className="relative z-[1] mt-40 bg-[#f4ece1] px-6 pb-10 pt-32 text-[#0a0a0a] sm:mt-64 sm:px-16 sm:pb-14 sm:pt-48"
        id="contact"
      >
        <h2 className="sr-only">Contact</h2>
        <div className="mx-auto max-w-[54rem] text-center">
          <Narration>
            <Stanza
              lines={[
                { indent: 0, runs: [{ text: "If you have", voice: "soft" }] },
                {
                  indent: 0,
                  runs: [{ text: "a hard problem,", voice: "strong" }],
                },
                { indent: 0, runs: [{ text: "write to me" }] },
              ]}
            />
          </Narration>

          <div className="mt-16 sm:mt-24" data-reveal>
            {/* The one thing here NOT in the serif. The demo cut has no "@"
                — it draws its watermark there — and substituting a
                fullwidth one would put a character in the address that is
                not in the address. */}
            <a
              aria-label={`Email ${EMAIL}`}
              className="text-[clamp(1.05rem,3.4vw,2.6rem)] font-light leading-none tracking-[-0.02em] transition-opacity duration-300 hover:opacity-70"
              href={`mailto:${EMAIL}`}
            >
              <FractureText text={EMAIL} />
            </a>
            <div className="mt-7">
              <CopyEmail />
            </div>
          </div>

          <ul
            className="mt-20 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-3 sm:mt-28"
            data-reveal
          >
            {elsewhere.map((social) => (
              <li key={social.label}>
                <a
                  className="group font-serif-display text-[1.2rem] transition-opacity duration-200 hover:opacity-60"
                  href={social.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {social.label}
                  <span
                    aria-hidden="true"
                    className="ml-1.5 inline-block text-[0.75rem] opacity-0 transition-opacity duration-300 group-hover:opacity-60"
                  >
                    {"↗"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <footer
          className="mt-28 flex flex-wrap items-baseline justify-between gap-4 font-serif-display text-[1rem] italic opacity-50 sm:mt-40"
          data-reveal
        >
          {/* Sans, and not by preference. The serif is the Fontspring DEMO
              cut, which draws its watermark flower instead of "4" — so this
              line renders a flower in 2034 and right through the 2040s. The
              work-row year has the same problem and the same answer, so this
              borrows its size and tracking rather than inventing a third
              treatment. */}
          <p
            aria-label="Copyright"
            className="font-sans text-[0.8rem] uppercase not-italic tracking-[0.1em]"
          >
            {"©"} {new Date().getFullYear()}
          </p>
          <button
            className="transition-opacity duration-200 hover:opacity-100"
            onClick={toTop}
            type="button"
          >
            Back to top {"↑"}
          </button>
        </footer>
      </section>
    </div>
  );
}
