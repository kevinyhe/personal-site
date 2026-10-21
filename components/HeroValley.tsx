"use client";

import { useEffect } from "react";

import { sceneFx } from "@/components/sceneFx";

/**
 * The sky behind the hero tree.
 *
 * It used to hand the hero a canvas of the /valley hills (hutScene), laid
 * over the backdrop. The hills are gone (user: they did not look good
 * against the aurora). What is left is an empty, see-through canvas handed
 * over the same way: with it in place the backdrop shader draws the site
 * aurora's colours and the stars over the whole frame
 * (BareThreeCanvas, uScene), and there is no second WebGL scene to run.
 *
 * Renders nothing.
 */
export default function HeroValley() {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    sceneFx.backdropScene = canvas;
    // At once, not faded: the television's first frame is already in the
    // aurora's colours, the same as the still under the loading veil.
    sceneFx.backdropSceneMix = 1;
    return () => {
      sceneFx.backdropSceneMix = 0;
      sceneFx.backdropScene = null;
    };
  }, []);

  return null;
}
