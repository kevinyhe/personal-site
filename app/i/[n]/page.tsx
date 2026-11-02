import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
import ValleyTransition from "@/components/ValleyTransition";
import { preloadCrtAssets } from "@/components/crtAssets";
import { IdeaProvider } from "@/components/ideas/idea";
import IdeaSwitch from "@/components/ideas/IdeaSwitch";
import { IDEAS } from "@/components/ideas/list";

/** /i/N: the home page with idea N switched on (components/ideas/list.ts). The home page itself is unchanged. */
export function generateStaticParams(): { n: string }[] {
  return IDEAS.map((idea) => ({ n: String(idea.n) }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  const idea = IDEAS.find((x) => String(x.n) === n);
  return { title: idea ? `${idea.name}, idea ${idea.n}. Kevin He` : "Kevin He" };
}

export default async function IdeaPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const idea = IDEAS.find((x) => String(x.n) === n);
  if (!idea) notFound();
  preloadCrtAssets();
  const { Extra } = idea;
  return (
    <IdeaProvider n={idea.n}>
      <div>
        <HeroIntro tail={<ValleyTransition />}>
          <HeroValley />
          <HeroChrome />
        </HeroIntro>
        <div className="relative z-20 -mt-[100vh]" style={{ backgroundColor: GROUND }}>
          <StatementSection />
          <Passage />
          <WorkIndex />
          <Skills />
        </div>
        <div className="relative z-10">
          <Contact />
          <Ending />
        </div>
      </div>
      <Extra />
      <IdeaSwitch n={idea.n} />
    </IdeaProvider>
  );
}
