import type { JSX } from "react";
import type { Skill } from "@/components/profile";
import { iconColour, skillIcon } from "@/components/skillIcons";

/**
 * One skill's mark: its brand icon in the brand's colour, or, for the
 * things that have no logo (PROS, odometry, a Kalman filter), two or three
 * letters set as type. Sized by the parent through `size`, in any unit.
 */
export default function SkillMark({
  skill,
  size = "1.5rem",
  onDark = true,
  tinted = true,
  className = "",
}: {
  skill: Skill;
  size?: string;
  onDark?: boolean;
  /** false: the icon in the current text colour, not the brand's. */
  tinted?: boolean;
  className?: string;
}): JSX.Element {
  const icon = skillIcon(skill.icon);
  if (icon) {
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill={tinted ? iconColour(icon, onDark) : "currentColor"}
        role="img"
        style={{ width: size, height: size }}
        viewBox="0 0 24 24"
      >
        <path d={icon.path} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center font-sans font-semibold leading-none tracking-[-0.02em] ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size.endsWith("%")
          ? `calc(${parseFloat(size) / 100} * ${skill.mark && skill.mark.length > 2 ? 0.34 : 0.44} * 100cqmin)`
          : `calc(${size} * ${skill.mark && skill.mark.length > 2 ? 0.34 : 0.44})`,
      }}
    >
      {skill.mark ?? skill.name.slice(0, 2)}
    </span>
  );
}
