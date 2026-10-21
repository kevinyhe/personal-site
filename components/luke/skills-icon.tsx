import type { JSX } from "react";

import type { Skill } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * One skill's icon, in the site's own colours rather than each brand's: a
 * rounded tile with a fine pink edge and a faint pink fill, and the
 * brand's mark (simple-icons) in the pink inside it. Skills with no brand
 * (Odometry, PID...) get their short letters in the same place, so every
 * tile in the section reads as one set.
 */
export default function SkillTile({ skill, size }: { skill: Skill; size: string }): JSX.Element {
  const brand = skillIcon(skill.icon);
  const mark = skill.mark ?? skill.name.slice(0, 2);
  return (
    <svg aria-hidden="true" className="block shrink-0" style={{ width: size, height: size }} viewBox="0 0 256 256">
      <rect fill="currentColor" fillOpacity="0.07" height="248" rx="58" stroke="currentColor" strokeOpacity="0.3" strokeWidth="5" width="248" x="4" y="4" />
      {brand ? (
        <g fill="currentColor" transform="translate(68 68) scale(5)">
          <path d={brand.path} />
        </g>
      ) : (
        <text
          dominantBaseline="central"
          fill="currentColor"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={mark.length > 2 ? 70 : 86}
          fontWeight="500"
          letterSpacing="-2"
          textAnchor="middle"
          x="128"
          y="132"
        >
          {mark}
        </text>
      )}
    </svg>
  );
}
