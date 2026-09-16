/**
 * The brand marks the skills pages draw, from simple-icons, imported one
 * by one so the bundle carries these and not the other three thousand.
 * Each is { title, hex, path } — a 24x24 path and the brand's own colour.
 */
import {
  siArduino,
  siAutodesk,
  siC,
  siCmake,
  siCplusplus,
  siElectron,
  siEspressif,
  siFastapi,
  siFfmpeg,
  siFlask,
  siGit,
  siGithub,
  siGnubash,
  siJavascript,
  siLinux,
  siMediapipe,
  siNextdotjs,
  siNodedotjs,
  siNumpy,
  siOpencv,
  siOpenjdk,
  siPandas,
  siPostgresql,
  siPython,
  siReact,
  siRos,
  siScikitlearn,
  siTensorflow,
  siThreedotjs,
  siTypescript,
  siVitest,
} from "simple-icons";

export type SkillIcon = { title: string; hex: string; path: string };

const all: Record<string, SkillIcon> = {
  siArduino,
  siAutodesk,
  siC,
  siCmake,
  siCplusplus,
  siElectron,
  siEspressif,
  siFastapi,
  siFfmpeg,
  siFlask,
  siGit,
  siGithub,
  siGnubash,
  siJavascript,
  siLinux,
  siMediapipe,
  siNextdotjs,
  siNodedotjs,
  siNumpy,
  siOpencv,
  siOpenjdk,
  siPandas,
  siPostgresql,
  siPython,
  siReact,
  siRos,
  siScikitlearn,
  siTensorflow,
  siThreedotjs,
  siTypescript,
  siVitest,
};

export function skillIcon(name?: string): SkillIcon | null {
  return name ? (all[name] ?? null) : null;
}

/** Brands whose colour is black or near it, which vanish on a dark page:
 *  drawn in the page's ink instead. */
export function iconColour(icon: SkillIcon, onDark: boolean): string {
  const v = parseInt(icon.hex, 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (onDark && lum < 40) return "currentColor";
  if (!onDark && lum > 215) return "currentColor";
  return `#${icon.hex}`;
}
