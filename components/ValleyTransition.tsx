"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
  createBarCanvas,
  hexToRgb,
  type BarCanvas,
  type BarLayer,
  type BarLayerConfig,
  type CanvasSource,
} from "@/components/valley/barShader";
import { createFrontMass } from "@/components/valley/sources/frontMass";
import {
  createHall,
  createLanternPair,
  createPagodaTower,
  createToriiGate,
} from "@/components/valley/sources/shrine";
import { sceneFx } from "@/components/sceneFx";
import { BAND, BLOSSOM } from "@/components/bandColours";

gsap.registerPlugin(ScrollTrigger);

/**
 * How the page leaves the hero: sondaven.com's own move, in this valley.
 *
 * There the hero does not scroll away — it shrinks. The opening screen scales
 * down into a framed picture in the middle of the page while a landscape
 * drawn in vertical bars rises around it. This does the same to the hero's
 * stage (HeroIntro): the stage is sticky, so scaling it turns the screen the
 * reader has been looking at into a picture of itself.
 *
 * THE TWO MOVES OVERLAP, they do not coincide. The camera inside the picture
 * flies forward and up through the canopy for the whole block and never
 * stops; the frame only starts closing at a bit over a third of the way in,
 * so the flight has the full viewport to itself while it matters. Started
 * together, it was happening in a window that was already halfway shut.
 *
 * It closes to a third of the screen and stops there, in the middle of the
 * frame. No yPercent anywhere: it shrinks toward the centre and stays on the
 * centre, and the page then carries it off the top the way it carries
 * everything else.
 *
 * Every layer is sondaven's own box and grade, read off its app.js
 * (scratchpad/sonda/app.pretty.js: initSceneHeroOver, initSceneHeroBg) — the
 * clouds and the birds are its files, in public/sonda. What stands ON the
 * land is ours: the site's weeping cherry where its fir was, a shack where
 * its hay was, a stand of cherry, and a bank of fallen petals beside its
 * flock. The range behind is generated (mountains.ts) because its own plate
 * is 480 px across and stretches into vertical smears at this size.
 *
 * TWO canvases, in two separate sticky boxes: `position: sticky` makes a
 * stacking context whatever its z-index is, so one wrapper would have sealed
 * the bg scene, the picture and the over scene into a single layer and the
 * framed screen would have sat in front of the whole landscape. As two, the
 * stage's z-[1] lands between them.
 */

/**
 * The bars and the ground under them, the reference's way round.
 *
 * The reference draws DARK bars on a LIGHT ground and the section under its
 * landscape is the dark colour, so a hill starts light at its ridge, where
 * the bars are thin, and fills to solid dark at its foot, where it runs
 * straight into the next section. We had it inverted — light bars on a dark
 * ground — and every consequence of that had to be patched one at a time:
 * the clouds and the back range came out as the dark colour and vanished,
 * the cloud body was too thin to hide the framed picture behind it, and the
 * hills ran light at the bottom into a light band. One swap fixes all of
 * them, and every grade below is the reference's own again.
 *
 * The values themselves are the site's shared pair (bandColours): the foot
 * of the hills runs into the statement band on BAR_FILL.
 */
const BAR_FILL = BAND;
const BAR_BG = BLOSSOM;

/** The reference's own breakpoint: below it, it skips the fir and the near cloud. */
const BREAKPOINT = 992;

/** Where the assets live. */
const ASSETS = "/sonda";

/** The reference's scene box: two screens. Every y and height below is a
 *  percentage of it, so changing it changes the size of everything in the
 *  landscape — which is what a third screen did to the hills. */
const BLOCK_VH = 200;
/**
 * Empty scroll BELOW the scene, in screens. The stage is sticky inside the
 * hero's pin container and that container ends where this block does, so
 * without a tail the framed picture slid off the top the moment the
 * landscape ran out. With one it holds its place in the middle of the screen
 * while the section under it comes up and covers it, which is the only way a
 * fixed thing can leave without moving.
 *
 * StatementSection is pulled back over this tail by the same amount, so the
 * page is no longer for it.
 */
const TAIL_VH = 100;
/**
 * Empty scroll above the scene, in screens. The block used to start where the
 * hero stopped, so the first cloud was already on its way in before the
 * reader had finished looking at the tree. This is the pause before it.
 */
const LEAD_VH = 60;
/**
 * How far the whole scene is dropped down the block, in screens/100.
 *
 * This is the 30vh of extra sky between the clouds and the hills, and it is
 * taken from the BLOCK rather than from inside the scene box. Moving the
 * land down within a fixed box looks like the same thing and is not: the
 * plate's foreground goes into shadow at about 57% of its height, and below
 * that the bars fill their cells and the hillside turns solid — the reference
 * leaves about 50vh of that solid foot between the shadow line and the next
 * section, which is what lets its land end in a colour instead of an edge.
 * Sliding the land down eats that foot, and the shadow line arrives at the
 * seam as a rule drawn across the page. So the scene keeps the reference's
 * own geometry and the whole canvas moves instead; the block grows by the
 * same amount so its bottom still meets the band.
 *
 * The two clouds carry the opposite offset in their own y, so they stay
 * exactly where they were. The sky is what is being made bigger.
 */
const SCENE_DROP = 55;

/**
 * The scroll, in fractions of the block.
 *
 * The camera never stops. It flies for the WHOLE block — through the canopy
 * at full size first, and then on through the valley inside the frame while
 * the frame closes around it and the page carries it off the top. A dolly
 * that finishes halfway leaves a picture that has gone still sitting in the
 * middle of the screen for a screen and a half.
 *
 * The frame starts closing at SHUT_BEGINS, which is late enough that the
 * flight has the whole viewport to itself while it matters.
 */
const SHUT_BEGINS = 0.22;
const PICTURE_SCALE = 0.3;

export default function ValleyTransition() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const farRef = useRef<HTMLCanvasElement | null>(null);
  const nearRef = useRef<HTMLCanvasElement | null>(null);

  // The flight and the shrink. Separate from the scene build below because it
  // must work whether or not WebGL does: if the landscape never arrives the
  // page still closes down from the hero, it just closes into the dark.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const stage = document.querySelector<HTMLElement>("[data-hero-stage]");
    if (!stage) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root,
          // After the lead: the hero holds until the scene is about to
          // arrive, rather than starting to close over an empty block.
          // top+=, not top-=. Minus pushes the start UP the page, which
          // began the shrink before the block had even arrived.
          // The LEAD only — not the lead plus the drop. The shrink begins
          // where it always did and the sky it shrinks into is now 55vh
          // deeper, so there is a long stretch of the picture closing over
          // an empty sky before the first cloud comes in.
          start: () => `top+=${window.innerHeight * (LEAD_VH / 100)} bottom`,
          // The tail is holding time, not shrinking time: the frame is at
          // its size by the end of the scene and just stays there.
          end: () => `bottom-=${window.innerHeight * (TAIL_VH / 100)} bottom`,
          scrub: reduced ? true : 0.3,
        },
      });
      // Written as fractions of the whole block, so the length is pinned to 1
      // explicitly or the scrub would stretch whichever child is longest.
      timeline.set({}, {}, 1);
      // First: the camera inside the picture flies forward and up, through
      // the canopy (BareThreeCanvas, applyScrollDolly).
      timeline.fromTo(sceneFx, { dolly: 0 }, { dolly: 1, duration: 1 }, 0);
      // Then the frame closes, on the spot. No yPercent anywhere: it shrinks
      // toward the middle of the screen and stays there.
      timeline.fromTo(
        stage,
        { scale: 1 },
        {
          scale: PICTURE_SCALE,
          duration: 1 - SHUT_BEGINS,
          transformOrigin: "50% 50%",
        },
        SHUT_BEGINS,
      );

      // And then it goes out, UNDER THE LAND.
      //
      // It is not faded as it shrinks and it does not move — but it has to
      // stop being on the page before anything translucent passes over it,
      // and two things eventually do: the tail of the canvas mask above, and
      // the crest the next section draws, which is a hill with sky between
      // its humps. Either one turns a parked picture into a row of lit slits.
      //
      // So it is taken out while the near skyline is sweeping across it —
      // scrubbed over a fifth of a screen, starting as the ridge reaches the
      // middle of the frame. By the end of that the land is over all of it,
      // and a fade you cannot see is not a fade.
      //
      // The numbers are computed rather than written as trigger strings
      // because what they are measured from is the top of the NEXT section,
      // which is pulled back over this block's tail and so has no edge of
      // its own to key on.
      const statementTop = () =>
        root.offsetTop + root.offsetHeight - window.innerHeight * (TAIL_VH / 100);
      gsap.fromTo(
        stage,
        { autoAlpha: 1 },
        {
          autoAlpha: 0,
          ease: "none",
          scrollTrigger: {
            start: () => statementTop() - window.innerHeight * 0.92,
            end: () => statementTop() - window.innerHeight * 0.71,
            scrub: true,
          },
        },
      );
    }, root);

    return () => {
      context.revert();
      sceneFx.dolly = 0;
      gsap.set(stage, { clearProps: "transform,opacity,visibility" });
    };
  }, []);

  // The landscape. Built lazily: two WebGL contexts, a generated range, a
  // cherry tree and four videos, and none of it should compete with the
  // hero's own scene while the reader is still looking at the hero.
  useEffect(() => {
    const root = rootRef.current;
    const farCanvas = farRef.current;
    const nearCanvas = nearRef.current;
    if (!root || !farCanvas || !nearCanvas) return undefined;

    const engines: BarCanvas[] = [];
    let sources: CanvasSource[] = [];
    let disposed = false;
    let context: gsap.Context | null = null;

    const build = () => {
      if (disposed || engines.length) return;
      const wide = window.innerWidth >= BREAKPOINT;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const box = {
        w: nearCanvas.offsetWidth || window.innerWidth,
        h: nearCanvas.offsetHeight || window.innerHeight * 2,
      };
      // The reference's own `o`: a third of the frame on a desktop, two
      // thirds on a phone.
      const birdSpan = wide ? 33.33 : 66.66;

      // ---- the land, copied from the reference ------------------------
      //
      // Both plates carry NO grid of their own. That is the whole of it:
      // the reference hands its two mountains to the engine's defaults
      // (100 x 100 cells, a bar allowed to reach 102% of its cell), and a
      // bar that can fill its cell is what makes its hills read as solid
      // masses with strands hanging off the bottom. Ours capped the bar at
      // 64% of a 130 x 150 grid, which drew the same picture as a fine
      // hatch — a different material, and one that did not match the flat
      // band below it.
      //
      // The y values are the reference's (near 40%, far 45%) plus the 30vh
      // of extra sky asked for. The box is two screens tall, so 30vh is
      // 15% of it. The far range is lifted a further 7% so it clears the
      // near ridge: the reference's own ranges sit almost on top of each
      // other and at this shift the back one would be behind the front one
      // altogether. Low enough, too, that only its PEAKS clear the near
      // ridge: a range has valleys between its peaks, the plate is black in
      // them and the shader discards black, so any valley sitting above the
      // near hills is a notch of open sky between the two hillsides. Sunk
      // to here, the valleys are behind the near land and only the tops
      // show, which is what a range behind a hill looks like.
      // y 40 / height 60 is the reference's, and the two numbers are not
      // free: they put the plate's LAST ROW on the canvas's bottom edge,
      // which is where the band begins. That row runs 10..44 grey, the
      // grade's black point finishes at 45, so every cell of it is under
      // the point and fills completely — the whole foot of the hill is one
      // solid sheet of fill colour, the same colour as the band. Ending the
      // plate any higher (we had it at 80% of its height) cuts a row that
      // still has cells above the black point, and those come out as
      // hairlines all stopping at the same y: the straight line across the
      // bottom of the hills.
      const near: BarLayerConfig = {
        x: "0%", y: "40%", width: "100%", height: "60%",
        blackPoint: 25, whitePoint: 200, threshold: 255,
        bgOpacity: 1, fillOpacity: 1,
      };
      // THE FRONT HILL ON ITS OWN LAYER, drawn after the buildings that
      // stand behind it. It is the same plate with every pixel over 82 grey
      // painted black (createFrontMass) — the near ridge and the
      // foreground kept, the light ridges behind them gone — and the
      // shader discards black, so this copy is opaque where the front hill
      // is and absent where it is not. Same box and same grade as the
      // plate under it, so where both paint they paint the same cell.
      const nearFront: BarLayerConfig = { ...near };
      // The back range, at the reference's own grade. Its plate is a bright
      // hazy range where the near one is a dark silhouette, and with a light
      // ground that comes out the way it should: thin dark bars, so the
      // range reads pale and far off.
      const far: BarLayerConfig = {
        x: "0%", y: "45%", width: "100%", height: "60%",
        blackPoint: 0, whitePoint: 255, threshold: 255,
        bgOpacity: 1, fillOpacity: 1,
      };

      // ---- and what stands on it ---------------------------------------
      // Buildings, in three dimensions. The reference has one large object
      // on the right of its landscape, a fir; ours is a five-storey pagoda
      // there and, on the left, a hall, a small pagoda, a torii and two
      // stone lanterns, each built as geometry and rendered off screen
      // (components/valley/sources/shrine.ts), because a flat silhouette of
      // any of those reads as a diagram: a torii painted head-on has no
      // depth to its uprights, and a pagoda IS its eaves, which only read
      // when you can see along them. Each is its own layer so each can sit
      // at its own depth in the hills.
      // The grade every built thing here shares, tweening to 50 / 150 on
      // scroll.
      // maxSquareWidth is the difference between a building and a blob.
      // Left at the engine's default a bar may fill its whole cell, so the
      // dark side of a roof becomes one unbroken slab and the eaves, the
      // pillars and the railings inside it are gone. Capped under a cell
      // the darkest part is still a hatch, and the structure reads through
      // it — which is the whole reason these are rendered in three
      // dimensions rather than drawn as silhouettes. The land keeps the
      // reference's uncapped bar: a hillside has no structure to lose.
      // A tight grade: the renders sit in 76..154 grey, and 70 / 165 puts
      // the torii and the roofs' shadowed faces near solid and the walls and
      // lit eaves near clear, so a building is dark structure on a light
      // body rather than a mid-grey hatch. The bar may fill its cell for
      // that reason; the cap that used to sit here was for the OLD polarity,
      // where a filled cell was a light slab that swallowed the detail.
      // 40 / 160: a roof (96 grey) is a half-width bar, a ridge or a torii
      // upright (76-80) about two thirds, a wall (154) a hairline. So a
      // building is dark edges on a light body — legible on the light hill
      // its top shows against. 70 / 165 put the roofs at three quarters and
      // the whole thing read as a black shape.
      const built = {
        blackPoint: 40, whitePoint: 160, threshold: 255,
        maxSquareWidth: "100%",
        bgOpacity: 1, fillOpacity: 1,
      } as const;
      // RIGHT: the five-storey pagoda, in the reference's fir slot. The
      // canvas is two screens tall and one wide, so a vh is 0.5% of it
      // vertically and 1.25% horizontally — which is why the two offsets
      // below are different numbers for the same distance.
      // Each of these comes down with the land, as far as it can: their
      // bases sit on the ground line at the bottom of the box, so the tall
      // ones have almost no room to move and the short ones have plenty.
      // A prop pushed past the bottom is cut flat by the band, which is the
      // one thing the land itself can do and they cannot — its lowest
      // slope is solid fill, the same colour as the band.
      const pagoda: BarLayerConfig = {
        ...built,
        x: "64.7%", y: "48%", width: "38.3%", height: "44%",
        xSquares: 200, ySquares: 150,
      };
      // LEFT, three buildings in a row, each its own layer so each can sit
      // at its own depth. The hall stands ON the front slope, in front of
      // the hill. The two torii and the lanterns stand BEHIND it, placed
      // so the top of each clears the front crest and its feet do not —
      // the crest (where the plate drops under 82 grey) measured under
      // each column: 67.1% of the box under the left torii, 69.1% under
      // the right one, 72.9% under the lanterns.
      const hall: BarLayerConfig = {
        ...built,
        x: "0%", y: "66%", width: "24%", height: "20%",
        xSquares: 200, ySquares: 160, mirrorX: true,
      };
      // A second torii, the same render as the one beside it MIRRORED by
      // the shader, so the two face each other across the approach: one
      // turned a quarter to the left, one a quarter to the right.
      const toriiLeft: BarLayerConfig = {
        ...built,
        x: "24%", y: "57.1%", width: "14%", height: "16%",
        xSquares: 180, ySquares: 180, mirrorX: true,
      };
      const gate: BarLayerConfig = {
        ...built,
        x: "39%", y: "59.2%", width: "14%", height: "16%",
        xSquares: 180, ySquares: 180,
      };
      const lanterns: BarLayerConfig = {
        ...built,
        x: "55%", y: "68.1%", width: "12%", height: "8%",
        xSquares: 180, ySquares: 180,
      };
      // The sky is the reference's, untouched. The near one rides the over
      // scene and the far one the bg scene, one on each, the way the
      // reference splits them — so the low cloud crosses in front of the
      // framed picture.
      // Lower than the reference puts them, and higher than they were. Its
      // scene box hangs at the
      // bottom of a scroll area much longer than this block, so a cloud at
      // the top of the box is still a long way down the page; here the same
      // y put both of them on screen almost as soon as the landscape
      // existed — but at 46% and 28% the near cloud's box ran down into the
      // skyline and the two were touching. These keep most of the wait and
      // give the sky back its gap. The TIMING is untouched either way: the
      // drift below is its own trigger and its own numbers, on the scene.
      // The clouds, at the reference's grade. White cloud on black: the
      // black is discarded, so nothing is painted around them, and the
      // body of the cloud fills with the GROUND colour — which is opaque,
      // which is what finally puts the near cloud in front of the framed
      // picture instead of over it like a gauze.
      const cloudNear: BarLayerConfig = {
        x: "5%", y: "22%", width: "65%", height: "45vw",
        blackPoint: 25, whitePoint: 255, threshold: 255,
        bgOpacity: 1, fillOpacity: 1,
      };
      const cloudFar: BarLayerConfig = {
        x: "30%", y: "4%", width: "65%", height: "45vw",
        blackPoint: 25, whitePoint: 255, threshold: 255,
        bgOpacity: 1, fillOpacity: 1,
      };
      // The birds are NOT at the reference's grade. Its flocks are bright
      // birds on black run inverted, which on a dark fill makes dark birds.
      // Ours were blossom-coloured when the fill was the blossom, and they
      // stay that way: read straight, a bright bird gives a thin bar and
      // fills with the ground, which is the blossom now.
      const birdsNear: BarLayerConfig = {
        x: `${-birdSpan}%`, y: "30%",
        width: `${birdSpan}%`, height: `${birdSpan}vw`,
        blackPoint: 0, whitePoint: 255, threshold: 255,
        bgOpacity: 1, fillOpacity: 1,
      };
      const birdsFar: BarLayerConfig = {
        x: "-33.33%", y: "6%", width: "33.33%", height: "33.33vw",
        blackPoint: 0, whitePoint: 255, threshold: 255,
        bgOpacity: 1, fillOpacity: 1,
      };

      const video = (file: string, config: BarLayerConfig): BarLayer => ({
        type: "video",
        sources: [{ src: `${ASSETS}/${file}`, type: "video/mp4" }],
        config,
      });
      const image = (file: string, config: BarLayerConfig): BarLayer => ({
        type: "image",
        src: `${ASSETS}/${file}`,
        config,
      });
      const still = (src: CanvasSource): CanvasSource =>
        !reduced || !src.animated
          ? src
          : {
              canvas: src.canvas,
              animated: false,
              ready: (src.ready ?? Promise.resolve()).then(() => {
                src.update?.(0, 0);
              }),
              dispose: src.dispose,
            };
      const add = (src: CanvasSource, config: BarLayerConfig): BarLayer => {
        const kept = still(src);
        sources.push(kept);
        return { type: "canvas", source: kept, config };
      };

      const common = {
        colors: () => ({ bg: hexToRgb(BAR_BG), fill: hexToRgb(BAR_FILL) }),
        // These canvases are screens tall; the engine's default reach would
        // start them drawing well before any of it is visible.
        visibleRootMargin: "0px",
        fps: reduced ? 2 : 60,
      };


      const farEngine = createBarCanvas(
        farCanvas,
        [
          // The reference's own back range, not a generated cone. Its plate
          // is 480px across, which was the reason for generating one in the
          // first place — but at the engine's default 100 cells that is 4.8
          // source pixels a cell, which is exactly what the reference feeds
          // it. The smearing came from asking 140 cells of a 480px plate.
          image("hero_mountain_bg.png", far),
          video("claudes_03.mp4", cloudFar),
          video("birds_04.mp4", birdsFar),
        ],
        common,
      );
      const nearEngine = createBarCanvas(
        nearCanvas,
        [
          // The low cloud, on the OVER scene as the reference has it, so it
          // passes in FRONT of the framed picture rather than behind it.
          // First in the list, which means the land below paints over it:
          // it is in front of the picture and still behind the hills.
          ...(wide ? [video("claudes_02.mp4", cloudNear)] : []),
          image("intro_mountain.png", near),

          ...(wide
            ? [
                // Behind the front hill: the two torii, the lanterns. Then the front hill. Then, standing on it in
                // full view, the hall on the left and the big pagoda on
                // the right.
                add(
                  createToriiGate({
                    seed: 47,
                    width: Math.round(box.w * 0.14),
                    height: Math.round(box.h * 0.16),
                  }),
                  toriiLeft,
                ),
                add(
                  createToriiGate({
                    seed: 71,
                    width: Math.round(box.w * 0.14),
                    height: Math.round(box.h * 0.16),
                  }),
                  gate,
                ),
                add(
                  createLanternPair({
                    seed: 83,
                    width: Math.round(box.w * 0.12),
                    height: Math.round(box.h * 0.08),
                  }),
                  lanterns,
                ),
                add(createFrontMass(`${ASSETS}/intro_mountain.png`, 82), nearFront),
                add(
                  createPagodaTower({
                    seed: 41,
                    width: Math.min(980, Math.round(box.w * 0.383)),
                    height: Math.min(1200, Math.round(box.h * 0.44)),
                  }),
                  pagoda,
                ),
                add(
                  createHall({
                    seed: 59,
                    width: Math.round(box.w * 0.24),
                    height: Math.round(box.h * 0.2),
                  }),
                  hall,
                ),
              ]
            : []),
          video("birds_04.mp4", birdsNear),
        ],
        common,
      );
      if (farEngine) engines.push(farEngine);
      if (nearEngine) engines.push(nearEngine);
      if (!engines.length) {
        for (const src of sources) src.dispose?.();
        sources = [];
        return;
      }
      const repaint = () => {
        for (const e of engines) e.redraw({ reupload: false });
      };

      context = gsap.context(() => {
        // The reference's own scroll tweens, on its own triggers.
        // Measured on the SCENE, not on the block — the reference's own
        // trigger is its scene element. The block carries a 60vh lead and a
        // 100vh tail that the scene does not, so keying the grade to it
        // stretched the tween over nearly twice the scroll and left it 40%
        // done at the point where the land meets the band. That is what put
        // a line there: the land grades to solid fill at its foot, and a
        // black point still sitting at 33 instead of 45 leaves the shadowed
        // foreground a hatch instead, so the hatch stopped dead where the
        // section began. On the scene the grade is all but finished by the
        // time the seam is on screen, and the foot of the hill is solid.
        gsap
          .timeline({
            scrollTrigger: {
              trigger: nearCanvas,
              start: "50% bottom",
              end: "bottom top",
              scrub: true,
              onUpdate: repaint,
            },
          })
          .to([near, nearFront], { blackPoint: 45, whitePoint: 175, ease: "none" }, 0)
          .to([pagoda, toriiLeft, gate, lanterns, hall], { blackPoint: 50, whitePoint: 150, ease: "none" }, 0);
        // The reference's own: "top bottom" to "bottom 50%", measured on the
        // SCENE rather than on the block, since the block now carries a lead
        // and a tail that its scroll area did not.
        const drift = {
          trigger: nearCanvas,
          start: "top bottom",
          end: "bottom 50%",
          scrub: true,
          onUpdate: repaint,
        } as const;
        // NO parallax on the back range. It lagged the page by 7% of the
        // canvas for a while, and that read as the range sliding down the
        // hill: a notch of sky between the two ranges at the top of the
        // scroll that had closed by the bottom. It sits where that lag
        // finished instead, so the join is the same at every scroll.
        if (wide) gsap.to(cloudNear, { x: "-30%", ease: "none", scrollTrigger: { ...drift } });
        gsap.to(cloudFar, { x: "62%", ease: "none", scrollTrigger: { ...drift } });

        if (reduced) return;
        // The flocks cross on their own clock, and only while the scene is on
        // screen: five seconds to cross, five between, the near one offset by
        // five so the two take turns.
        const loop = gsap
          .timeline({ paused: true })
          .to(birdsNear, { x: "100%", duration: 5, ease: "none", delay: 5, repeat: -1, repeatDelay: 5 }, 0)
          .to(birdsFar, { x: "100%", duration: 5, ease: "none", repeat: -1, repeatDelay: 5 }, 0);
        const io = new IntersectionObserver(
          (entries) => {
            const on = entries.some((e) => e.isIntersecting);
            if (on && loop.paused()) loop.play();
            else if (!on && !loop.paused()) loop.pause();
          },
          { threshold: 0.01, rootMargin: "20% 0px 20% 0px" },
        );
        io.observe(nearCanvas);
        return () => {
          io.disconnect();
          loop.kill();
        };
      }, root);
    };

    // Within a screen of the block, start building.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          build();
        }
      },
      { rootMargin: "100% 0px 100% 0px" },
    );
    io.observe(root);

    return () => {
      disposed = true;
      io.disconnect();
      context?.revert();
      for (const e of engines) e.destroy();
      engines.length = 0;
      for (const src of sources) src.dispose?.();
      sources = [];
    };
  }, []);

  return (
    <div
      className="relative"
      data-valley-transition
      ref={rootRef}
      style={{
        height: `${BLOCK_VH + LEAD_VH + SCENE_DROP + TAIL_VH}vh`,
        // NO background. Every plate is its subject on pure black, and the
        // shader discards black, so the sky is never painted by anything —
        // the page's aurora is what shows through it.
        // (was: the scene's own ground, behind the scene.
        //
        // The shader DISCARDS a cell whose plate pixel is black, so every
        // black part of a plate — all the sky in both of them — draws
        // nothing at all and whatever is behind the canvas shows through.
        // Behind it was the page: near black, with the aurora drifting over
        // it. So the sky came out in two different darks, the scene's
        // #2a0d1e where a cell was kept and the page's where one was not,
        // meeting along whatever line the plate happened to cross its black
        // point. That is the hole in the hillside — not a gap in the land,
        // a gap in the colour behind it.
        //
        // The reference has the same discard and never shows it, because
        // its page is painted the same colour its scene grounds are. This
        // is that: one colour behind the whole block, the one the cells are
        // grounded in.)
      }}
    >
      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-0 block w-full"
        data-valley-scene="far"
        style={{
          top: `${LEAD_VH + SCENE_DROP}vh`,
          height: `${BLOCK_VH}vh`,
          // Its own compositing layer: two screens of canvas rasterised
          // inside a scrolling, sticky-containing block shimmered.
          willChange: "transform",
        }}
        ref={farRef}
      />
      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-[2] block w-full"
        data-valley-scene="near"
        style={{
          top: `${LEAD_VH + SCENE_DROP}vh`,
          height: `${BLOCK_VH}vh`,
          willChange: "transform",
          // NO MASK. A mask fades the whole canvas, cell grounds and all, so
          // the bars went grey on their way out and the dark behind the page
          // came through them — which is the muddy band that used to sit
          // above the crest. The section below eats this one with a row of
          // bars in its own colour instead (NeedleSeam), which is what the
          // reference does and never puts a half-transparent pixel on the
          // page.
        }}
        ref={nearRef}
      />
    </div>
  );
}
