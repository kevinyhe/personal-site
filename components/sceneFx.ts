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
   * 0..1 tree drop during the scroll-out. 0 = the tree at its tuned
   * placement, 1 = the whole tree (wood, blossoms, loose petals) translated
   * straight down until it is fully below the frame. Pure translation — no
   * scaling or fading — timed to finish before the page text has faded, so
   * the tree is gone by the time the text is.
   */
  treeDrop: 0,
  /**
   * Projected corners of the monitor's screen region in NDC, written by the
   * canvas render loop every frame while crtProgress > 0. Order: TL, TR,
   * BR, BL as (x, y) pairs. HeroIntro reads this to warp the DOM hero layer
   * onto the screen with a CSS homography, so the ENTIRE website viewport —
   * text included — appears to live on the monitor.
   */
  screenQuad: new Float32Array(8),
  /**
   * 0..1 opacity of the name painted on the monitor's glass while the page
   * loads as the television shot (see the glass-name overlay in
   * BareThreeCanvas).
   */
  glassName: 0,
  /** 0..1 opacity of the tagline under the name on the glass. */
  glassTagline: 0,
  /**
   * 0..1 warm-up glow of the tube during the television shot: brighter,
   * breathing and flickering glass, heavier bloom into the room. Fades
   * out as the reveal starts.
   */
  screenGlow: 0,
  /**
   * 0..1 power of the tube: 0 = dark glass, ramped through the classic
   * line-then-open start when the television shot begins. 1 on the page.
   */
  screenPower: 1,
  /**
   * The room's lamp, as a multiplier on every light in the television
   * scene: 0 = dark room, then the incandescent switch-on (a flare past
   * 1, a sag, a settle) when the television shot begins. 1 on the page.
   */
  roomLight: 1,
  /**
   * Scroll-driven orbit of the tree camera about the hero target, in
   * radians (positive = counter-clockwise from above). 0 on the page.
   */
  orbit: 0,
  /**
   * Level of the tree scene's void backdrop, 1 = the page's look. Held
   * down while the scene is the picture on the television and brought up
   * as the camera pushes in.
   */
  backdropLevel: 1,
};
