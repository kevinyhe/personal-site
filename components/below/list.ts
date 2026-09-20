/**
 * Ways to build what comes after the statement band on the home page
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
  { n: 11, name: "Plates", after: "sondaven.com", note: "Each project a bar-dithered picture that opens out of the page as it scrolls." },
  { n: 12, name: "Map", after: "mount.jp", note: "An illustrated valley map; the camera travels between shrines, one per project." },
  { n: 13, name: "Index", after: "lukebaffait.fr", note: "A serif project list; hovering a row raises its bar-dithered scene behind the type." },
  { n: 14, name: "Paper", after: "niccolomiranda.com", note: "Printed halftone pages on blossom paper that turn in 3D." },
  { n: 15, name: "Dusk", after: "taotajima.jp", note: "A dusk sky of dithered cloud; the work is set in wide-spaced serif across it." },
  { n: 16, name: "Bough", after: "the site's own sakura tree", note: "Scroll climbs the tree; each project a branch that blossoms as you reach it." },
  { n: 17, name: "Lanterns", after: "the site's own shrine", note: "A night path of lanterns under the torii; each lantern lights one project." },
  { n: 18, name: "Channels", after: "the site's own television", note: "The work on the hero's television; scroll turns the dial through static." },
  { n: 19, name: "Relief", after: "garden-eight.com", note: "Blossoms and the robot as a pale plaster relief under moving light." },
  { n: 20, name: "Brush", after: "junni.co.jp", note: "A dark grid where brush strokes write each project and bloom into petals." },
];

export const pad2 = (n: number): string => String(n).padStart(2, "0");
