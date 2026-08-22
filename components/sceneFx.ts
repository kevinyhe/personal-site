/**
 * Scroll-driven scene effect levels, shared between the scroll timeline
 * (which tweens them) and the canvas render loop (which reads them every
 * frame). Same plain-mutable pattern as treeTuning: the loop must see
 * changes without a React re-render, and a scrubbed GSAP tween can drive a
 * plain object in both scroll directions for free.
 */
export const sceneFx = {
  /**
   * 0..1 multiplier on the halftone post-pass. 1 = the full dot-matrix hero
   * look; 0 = the smooth render. Faded out as the site view shrinks into
   * the CRT: full-screen the dots ARE the site's texture, but scaled into
   * the monitor they moiré, and the reference screen is smooth glass with
   * scanlines (which the DOM glass overlay provides instead).
   */
  halftone: 1,
  /**
   * 0..1 camera pull-back. 0 = zoomed all the way in (the site view fills
   * the viewport — you are nose-up against the CRT glass), 1 = fully pulled
   * back with the whole monitor in frame. Drives the WebGL camera rig, not
   * a DOM transform: the monitor is a real model in the scene, visible from
   * the first pixel of pull-back.
   */
  crtProgress: 0,
  /**
   * 0..1 tree growth during the CRT transition: the tree scales up as the
   * display extends to the tube's ratio, growing into the taller frame
   * instead of pooling at the bottom of it.
   */
  treeGrow: 0,
  /**
   * Projected corners of the monitor's screen region in NDC, written by the
   * canvas render loop every frame while crtProgress > 0. Order: TL, TR,
   * BR, BL as (x, y) pairs. HeroIntro reads this to warp the DOM hero layer
   * onto the screen with a CSS homography, so the ENTIRE website viewport —
   * text included — appears to live on the monitor.
   */
  screenQuad: new Float32Array(8),
};
