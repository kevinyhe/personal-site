/**
 * Ten ways to build what comes after the statement band on the home page
 * (the work, the skills, how to reach me), each a 3D scene. A plain
 * module, not a client one: server routes map over it.
 *
 * `after` names the site whose idea and spatial arrangement the design
 * starts from. The code, the geometry, the words and the colours are this
 * site's own.
 */
export type Below = { n: number; name: string; after: string; note: string };

export const BELOWS: Below[] = [
  { n: 1, name: "Drive", after: "bruno-simon.com", note: "Drive the robot round a floor; the projects are things on it." },
  { n: 2, name: "Cluster", after: "lusion.co", note: "The tools as a knot of solid pieces the cursor pushes apart." },
  { n: 3, name: "Blocks", after: "igloo.inc", note: "The camera travels between lit blocks, one per project." },
  { n: 4, name: "Flight", after: "atmos.leeroy.ca", note: "Scroll flies a path through cloud and petals past the work." },
  { n: 5, name: "Field", after: "activetheory.net", note: "A dark particle field with ribbons, panels hung in depth." },
  { n: 6, name: "Strips", after: "aristidebenoist.com", note: "Tall strips in a row that open into the project under the cursor." },
  { n: 7, name: "Desk", after: "henryheffernan.com", note: "A desk, a television, and the work on its screen." },
  { n: 8, name: "Glass", after: "noomoagency.com", note: "Glass solids drifting over very large type, bending it." },
  { n: 9, name: "Tilt", after: "robin-noguier.com", note: "One tilted plane per project, the ground changing colour with it." },
  { n: 10, name: "Reveal", after: "landonorris.com", note: "The robot drawn two ways; the cursor's trail shows the other." },
];

export const pad2 = (n: number): string => String(n).padStart(2, "0");
