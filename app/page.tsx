import HeroChrome from "@/components/HeroChrome";
import HeroIntro from "@/components/HeroIntro";
import HeroValley from "@/components/HeroValley";
import StatementSection from "@/components/StatementSection";
import Projects from "@/components/Projects";
import Ending from "@/components/Ending";
import BelowSwitch from "@/components/below/BelowSwitch";
import { BELOWS } from "@/components/below/list";
import TreeTuner from "@/components/TreeTuner";
import ValleyTransition from "@/components/ValleyTransition";
import { preloadCrtAssets } from "@/components/crtAssets";

export default async function Home({ searchParams }: { searchParams: Promise<{ below?: string }> }) {
  preloadCrtAssets();
  // /?below=3 puts design 3 of components/below under the statement band
  // in place of the page's own. Nothing else about the page changes.
  const { below } = await searchParams;
  const pick = BELOWS.find((b) => String(b.n) === below)?.n;
  return (
    // No data-home-lock any more: the home page scrolls now (the CRT scene
    // lives on scroll). HeroIntro still blocks wheel/touch during the intro.
    <div>
      {/* Renders nothing unless the URL carries ?tune. Visit /?tune to place
          the tree, then Freeze to get the lines that bake it in. */}
      <TreeTuner />
      {/* The television's own opening — the veil, the tube powering up, the
          push-in onto the name — over the valley's hills (HeroValley),
          which is what the tube is showing and what the push-in lands in.
          Then, instead of the camera backing out of it with the narration
          on the glass, sondaven.com's move: the whole stage shrinks into a framed
          picture while a valley of bars rises around it
          (ValleyTransition). The sentence and the projects follow on the
          page proper. The old arrangement is whole at /crt. */}
      <HeroIntro tail={<ValleyTransition />}>
        {/* The hills the tree stands in: the /valley scene built bare, drawn
            off screen and handed to the tree scene's backdrop. Renders no
            element of its own. */}
        <HeroValley />
        {/* The strip and the name lockup, shared with /crt. */}
        <HeroChrome />
      </HeroIntro>

      {/* The landscape gives way to a flat band of its own colour, with one
          stem in it and one sentence. Pulled back over the transition's
          tail: the hero's framed picture is still pinned in the middle of
          the screen there, and this is what comes up and covers it. */}
      <div className="relative z-10 -mt-[100vh]">
        <StatementSection />
        {/* Plum under the band for the robot's lower half: its scene canvas
            hangs below the band, and this is what it is drawn over as the
            page scrolls on. */}
        <div aria-hidden className="h-[90vh]" style={{ backgroundColor: "rgba(42, 13, 30, 0.4)" }} />
      </div>

      {/* Where the reference copy stops. From the prologue down the page is
          in the site's own language again — see BelowIntro. */}
      {pick ? (
        <div className="relative z-10">
          <BelowSwitch base="/?below=" n={pick} />
        </div>
      ) : (
        // Under the band: the work, one project a screen, with a brush
        // stroke painting for each; the skills; then the sky and the moon.
        <div className="relative z-10">
          <Projects />
          <Ending />
        </div>
      )}
    </div>
  );
}
