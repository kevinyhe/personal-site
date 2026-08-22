/**
 * The site's background colour field: large, heavily blurred blobs drifting
 * over near-black, in the same sakura pinks the hero canvas uses.
 *
 * This is the page background, not the WebGL backdrop inside the hero canvas.
 * The canvas only mounts on the home route, so /work, /info and /contact were
 * rendering on flat #0a0a0a with nothing behind the type.
 *
 * Pure CSS on purpose. It sits behind every page including the home hero, and
 * a second WebGL context (or a full-screen 2D canvas repainting every frame)
 * would compete with the tree scene for the GPU on the one route where the
 * budget is already spent. Layered radial-gradients under a single blur cost
 * nothing after the first paint.
 *
 * Structure: .site-bg paints the base, its ::before and ::after each carry a
 * set of blobs drifting on their own long loop (64s and 87s, so they never
 * settle into a repeating pattern), and .site-bg-vignette crushes the corners
 * back to black so the field reads as light in a dark room rather than as
 * wallpaper.
 */
export default function SiteBackground() {
  return (
    <div aria-hidden="true" className="site-bg">
      <div className="site-bg-vignette" />
      <div className="site-bg-grain" />
    </div>
  );
}
