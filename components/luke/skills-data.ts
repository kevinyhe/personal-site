/**
 * The skill groups the Skills section lists, in its order.
 * Facts from the résumé (Kevin_He_Resume.pdf) and components/profile.ts
 * only.
 */

import { type SkillGroup, skillGroups } from "@/components/profile";

const ORDER = ["Languages", "Embedded & robotics", "Software & networking", "DevOps & tooling", "CAD & data"];

export const SKILLS: SkillGroup[] = ORDER.map((label) => {
  const g = skillGroups.find((s) => s.label === label);
  if (!g) throw new Error(`skills-data: no skill group named "${label}" in profile.ts`);
  return g;
});
