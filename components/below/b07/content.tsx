import type { JSX } from "react";
import { BLOSSOM } from "@/components/bandColours";
import { type Project, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";

/**
 * What the windows hold. The desktop on the television and the flat page
 * under the still frame both draw these, so the two cannot drift apart.
 *
 * Everything is set in mono or sans. The display serif is a demo cut and
 * draws a flower for digits and hyphens, which project titles have.
 */

export const pad2 = (n: number): string => String(n).padStart(2, "0");
export const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

const LABEL = "text-[1.3rem] uppercase tracking-[0.18em] opacity-70";
const LINK = "underline underline-offset-[0.35em] outline-none hover:text-white focus-visible:bg-[#f9b9dc] focus-visible:text-[#1a0812]";

/** One project in full. `bullets` false leaves the long lines out. */
export function ProjectFacts({ project, bullets }: { project: Project; bullets: boolean }): JSX.Element {
  return (
    <div className="font-mono text-[1.6rem] leading-[1.55]">
      <p className="text-white">{project.tagline}</p>
      <dl className="mt-[1.6rem] grid grid-cols-[9rem_1fr] gap-x-[1.6rem] gap-y-[0.6rem]">
        <dt className={LABEL}>Year</dt>
        <dd>{project.year}</dd>
        {project.award ? (
          <>
            <dt className={LABEL}>Award</dt>
            <dd className="text-white">{project.award}</dd>
          </>
        ) : null}
        <dt className={LABEL}>Stack</dt>
        <dd>{project.stack.join(", ")}</dd>
        {project.href ? (
          <>
            <dt className={LABEL}>Link</dt>
            <dd>
              <a className={LINK} href={project.href} rel="noreferrer" target="_blank">
                {hostOf(project.href)}
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {bullets ? (
        <div className="mt-[1.8rem] border-t-[0.15rem] pt-[1.6rem]" style={{ borderColor: "rgba(249, 185, 220, 0.35)" }}>
          <ProjectBullets project={project} />
        </div>
      ) : null}
    </div>
  );
}

/** The long lines about a project. */
export function ProjectBullets({ project }: { project: Project }): JSX.Element {
  return (
    <ul className="space-y-[1rem] font-mono text-[1.6rem] leading-[1.55]">
      {project.bullets.map((b) => (
        <li className="flex gap-[1.2rem]" key={b}>
          <span aria-hidden className="mt-[0.75em] block h-[0.5rem] w-[0.5rem] shrink-0" style={{ backgroundColor: BLOSSOM }} />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** The five groups, each a column of marks and names. */
export function SkillGroups(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-x-[2.4rem] gap-y-[2.4rem] font-mono sm:grid-cols-2 lg:grid-cols-5">
      {skillGroups.map((g) => (
        <div key={g.label}>
          <h3 className="border-b-[0.15rem] pb-[0.8rem] text-[1.5rem] uppercase tracking-[0.12em] text-white" style={{ borderColor: "rgba(249, 185, 220, 0.35)" }}>
            {g.label}
          </h3>
          <ul className="mt-[1.2rem] space-y-[0.9rem] text-[1.5rem] leading-[1.3]">
            {g.skills.map((s) => (
              <li className="flex items-center gap-[1rem]" key={s.name}>
                <SkillMark className="shrink-0" onDark size="2rem" skill={s} />
                <span>{s.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The email and where else to find him. */
export function ContactLinks(): JSX.Element {
  return (
    <div className="font-mono">
      <p className={LABEL}>Email</p>
      <a className={`mt-[0.6rem] inline-block break-all font-sans text-[3.4rem] font-light leading-[1.1] tracking-[-0.02em] text-white ${LINK}`} href={`mailto:${EMAIL}`}>
        {EMAIL}
      </a>
      <ul className="mt-[2.4rem] grid grid-cols-2 gap-x-[2.4rem] gap-y-[1.6rem] text-[1.6rem]">
        {elsewhere.map((l) => (
          <li key={l.href}>
            <span className={`block ${LABEL}`}>{l.label}</span>
            <a className={`mt-[0.3rem] inline-block ${LINK}`} href={l.href} rel="noreferrer" target="_blank">
              {l.handle}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
