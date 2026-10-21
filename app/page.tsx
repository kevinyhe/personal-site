import HeroChrome from "@/components/HeroChrome";
import HeroIntro from "@/components/HeroIntro";
import HeroValley from "@/components/HeroValley";
import StatementSection from "@/components/StatementSection";
import WorkIndex from "@/components/luke/WorkIndex";
import Passage from "@/components/CloudPassage";
import Skills from "@/components/luke/Skills";
import Contact from "@/components/luke/Contact";
import { GROUND } from "@/components/luke/theme";
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
      {pick ? (
        <>
          <div className="relative z-20 -mt-[100vh]">
            <StatementSection />
          </div>
          {/* Where the reference copy stops. From the prologue down the page
              is in the site's own language again — see BelowIntro. */}
          <div className="relative z-10">
            <BelowSwitch base="/?below=" n={pick} />
          </div>
        </>
      ) : (
        <>
          {/* The statement, the bank of cloud that rolls in over it
              (Passage), and Work in the cloud's colours behind the bank's
              parting, in one block so the bank's track can run over both.
              The bank turns the page back to plum under Work's last
              project, so the sections below carry on on the dark ground. */}
          <div className="relative z-20 -mt-[100vh]" style={{ backgroundColor: GROUND }}>
            <StatementSection />
            <Passage />
            <WorkIndex />
          </div>
          {/* Projects done: skills and the record, contact, and
              lukebaffait.fr's end page with the mountain behind it. */}
          <div className="relative z-10" style={{ backgroundColor: GROUND }}>
            <Skills />
            <Contact />
            <Ending />
          </div>
        </>
      )}
    </div>
  );
}
