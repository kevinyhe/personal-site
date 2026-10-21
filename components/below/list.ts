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
  { n: 21, name: "Diorama", after: "messenger.abeto.co", note: "A small floating island of the valley you turn by dragging; each project a place on it." },
  { n: 22, name: "Gates", after: "fushimi inari, as awwwards scroll tunnels do it", note: "Scroll walks through a tunnel of torii; each run of gates carries one project." },
  { n: 23, name: "Globe", after: "oceanic globe sites on awwwards", note: "A tiny planet of hills, shrines and sakura you spin; projects are pins on it." },
  { n: 24, name: "Letters", after: "locomotive.ca and obys.agency", note: "The name in solid 3D serif letters that shatter into petals and reform as each project." },
  { n: 25, name: "Exploded", after: "product exploded-view pages", note: "Scroll pulls the robot apart into its parts; each part labelled with a project or skill." },
  { n: 26, name: "Lanterns rising", after: "night-sky lantern pieces on awwwards", note: "Paper lanterns rise into a plum night, each one lit with a project." },
  { n: 27, name: "Pond", after: "water-shader sites on awwwards", note: "A koi pond seen from above; the cursor ripples it and each lily pad is a project." },
  { n: 28, name: "Screen", after: "dogstudio.co", note: "A folding screen that opens panel by panel in 3D, each panel painted with a project." },
  { n: 29, name: "Seasons", after: "seasonal scroll stories on awwwards", note: "One sakura tree through four seasons as you scroll; the work hangs on it." },
  { n: 30, name: "Garden", after: "zen garden pieces on awwwards", note: "Raked sand the cursor rakes; stones set in it are the projects." },
  // Short ones: the work and the skills in two or three screens, not nine.
  { n: 31, name: "Sheet", after: "elliott.mangham.dev and wodniack.dev", note: "One screen of ruled cells in small mono, like a data sheet; the work as a strip of bar pictures along the foot." },
  { n: 32, name: "Filmstrip", after: "iamrossmason.com", note: "The five projects as one row of bar pictures; the one under the cursor grows. Strip or list." },
  { n: 33, name: "Numbered", after: "gregorylalle.com", note: "A big number and a small grid of pictures per project, a caps list beside it; scroll steps through." },
  { n: 34, name: "Letters", after: "wodniack.dev's work section", note: "WORK in huge bar letters filling the screen; a project's picture follows the cursor over its name." },
  { n: 35, name: "Recognition", after: "wodniack.dev's awards grid", note: "The results as a grid of cells, organisation large and result small, the empty cells filled with bars." },
  { n: 36, name: "Years", after: "art-yakushev.com", note: "21\u201326 very large, five small preview cards round it, each a bar picture with its index." },
  { n: 37, name: "Mono", after: "olhalazarieva.com", note: "Everything in small uppercase mono with bracket tags; one line a project, one bar picture." },
  // Straight copies of Awwwards portfolios' work and skills sections.
  { n: 38, name: "Inline", after: "adcker.com", note: "A huge centred sentence with each project's picture set inline in brackets; a numbered thumbnail row." },
  { n: 39, name: "Featured", after: "ashfall.studio", note: "Featured work as large pictures, a caption and tag pills under each; show more." },
  { n: 40, name: "Orbit", after: "bleibtgleich.dev", note: "Work 24–26 with a ring of tiny thumbnails; recognition as a ruled table." },
  { n: 41, name: "Capabilities", after: "formandfun.co", note: "WORK in big caps with outlined words; three capability columns with blocks and lists; an awards table." },
  { n: 42, name: "Rows", after: "gilhuybrecht.com", note: "One row of small numbered pictures per project on black, info columns across the top." },
  { n: 43, name: "Carousel", after: "jesperlandberg.com", note: "The work as a curved carousel of cards you drag through." },
  { n: 44, name: "Selected", after: "leoparpeix.com", note: "Selected projects as a strip of large pictures with index, name, year and role under each." },
  { n: 45, name: "Timeline", after: "mariavasilyeva.com", note: "A timeline of tiny thumbnails on a centre line; the active project opens into a collage." },
  { n: 46, name: "Stats", after: "nickho-motorsports.nl", note: "Big numbers, and the tools as logos in a grid round one central picture." },
  { n: 47, name: "Cards", after: "noho.ink", note: "Three stat cards, and recognition as grouped rows with years." },
  { n: 48, name: "Works", after: "noth.in", note: "A black staggered grid of pictures with one-line captions; view all." },
  { n: 49, name: "Services", after: "pensatori-irrazionali.com", note: "Two columns of large names with small details; numbered service blocks with ruled lists." },
  { n: 50, name: "Podium", after: "podium.global", note: "A dark staggered grid with condensed caps titles and years." },
  { n: 51, name: "Stack", after: "snp.agency", note: "Projects as full-screen cards that stack, their title tabs piling at the top." },
  { n: 52, name: "Tiles", after: "fiddle.digital", note: "A row of award tiles, then the work as large named pictures." },
];

export const pad2 = (n: number): string => String(n).padStart(2, "0");
