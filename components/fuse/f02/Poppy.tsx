"use client";

import { type JSX, useEffect, useRef } from "react";

import { createDotField, type DotField } from "@/components/dotField";

/**
 * The picture behind the last screen, the way lanceyan.com draws its
 * pictures: a grid of overlapping diamonds (dotField, the page's one WebGL
 * canvas). The picture is sondaven's poppy (prolog-r-c.mp4), which opens
 * from nothing to full bloom in five seconds. It plays once, the first time
 * the screen comes into view, then holds on the open flower and stops
 * drawing. With reduced motion it shows the open flower straight away.
 *
 * Brightness is read through the site's palette (plum, rose, blossom,
 * white). The flower stands on the right on a wide screen; on a phone it
 * sits lower right and dimmer, behind the words.
 */

const SRC = "/sonda/prolog-r-c.mp4";
const VW = 594;
const VH = 872;

export default function Poppy({ className }: { className?: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.innerWidth < 1024;

    let field: DotField | null = null;
    try {
      field = createDotField(canvas, {
        cols: phone ? 150 : 240,
        threshold: 0.1,
        brightness: phone ? 0.7 : 1,
        size: 0.85,
        hue: 0.12,
        ground: "#1a0812",
        ramp: [
          [0, "#1a0812"],
          [0.25, "#6a1d44"],
          [0.45, "#b8174f"],
          [0.7, "#f9b9dc"],
          [1, "#fffafc"],
        ],
      });
    } catch {
      field = null;
    }
    if (!field) {
      canvas.style.display = "none";
      return undefined;
    }
    const dots = field;

    const video = document.createElement("video");
    video.src = SRC;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const paint = (x: CanvasRenderingContext2D, W: number, H: number): void => {
      x.fillStyle = "#000";
      x.fillRect(0, 0, W, H);
      if (video.readyState < 2) return;
      // Wide: the flower stands the full height at the right. Narrow: it
      // is sized by the width and stands at the foot, a little off the edge.
      const wide = W / H > 0.9;
      const h = wide ? H * 0.96 : Math.min(H * 0.7, ((W * 0.9) * VH) / VW);
      const w = (h * VW) / VH;
      const left = wide ? W * 0.97 - w : W * 1.08 - w;
      const top = H - h;
      x.drawImage(video, left, top, w, h);
    };

    let raf = 0;
    let playing = false;
    const draw = (): void => dots.render(paint);
    const tick = (): void => {
      raf = 0;
      draw();
      if (playing) raf = requestAnimationFrame(tick);
    };
    const holdOpen = (): void => {
      playing = false;
      draw();
    };
    video.addEventListener("ended", holdOpen);
    video.addEventListener("seeked", draw);
    video.addEventListener("loadeddata", () => {
      if (reduced) video.currentTime = Math.max(0, video.duration - 0.05);
      else draw();
    });

    let started = false;
    const seen = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started || reduced) return;
        started = true;
        playing = true;
        void video.play().catch(() => {
          // Autoplay refused: show the open flower instead.
          playing = false;
          video.currentTime = Math.max(0, (video.duration || 5) - 0.05);
        });
        if (!raf) raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    seen.observe(canvas);
    const sized = new ResizeObserver(() => {
      dots.resize();
      draw();
    });
    sized.observe(canvas);
    draw();

    return () => {
      playing = false;
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      video.removeEventListener("ended", holdOpen);
      video.pause();
      video.removeAttribute("src");
      video.load();
      dots.dispose();
    };
  }, []);

  return <canvas aria-hidden="true" className={className} ref={canvasRef} />;
}
