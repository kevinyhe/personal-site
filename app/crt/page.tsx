import HeroChrome from "@/components/HeroChrome";
import HeroIntro from "@/components/HeroIntro";
import HomeSections from "@/components/HomeSections";
import TreeTuner from "@/components/TreeTuner";
import { preloadCrtAssets } from "@/components/crtAssets";

export default function Home() {
  preloadCrtAssets();
  return (
    // Parked here on 2026-09-21: the home page is the valley now (app/page.tsx,
    // components/valley). This is the CRT pull-back home, kept whole so it can
    // be compared or brought back.
    // No data-home-lock any more: the home page scrolls now (the CRT scene
    // lives on scroll). HeroIntro still blocks wheel/touch during the intro.
    <div>
      {/* Renders nothing unless the URL carries ?tune. Visit /?tune to place
          the tree, then Freeze to get the lines that bake it in. */}
      <TreeTuner />
      <HeroIntro>
        {/* The strip and the name lockup, shared with the home page. */}
        <HeroChrome />
      </HeroIntro>

      {/* Below the hero's sticky stage. Reachable now that the stage lives
          in its own scroll room and scrolls away at the end of it. */}
      <HomeSections />
    </div>
  );
}
