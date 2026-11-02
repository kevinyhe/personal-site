/**
 * The tree's bark, worked out as pixels: colour, bump and roughness, each
 * width x height RGBA. Pure arithmetic on seeded noise, with no DOM, so it
 * runs in a worker (bark.worker.ts) and the 131 072 texels' noise (about
 * 0.3 s on a desktop, 1.4 s on a phone's CPU) is off the main thread while
 * the hero builds. BareThreeCanvas's createBarkTextures puts them in its
 * canvases; the numbers are the ones it worked out itself before.
 */
import { clamp01, fbm2, lerp, makeRng, smoothstep } from "@/components/treeNoise";

export type BarkPixels = { color: Uint8ClampedArray; bump: Uint8ClampedArray; rough: Uint8ClampedArray };

export function barkPixels(width: number, height: number): BarkPixels {
  // fbm made periodic across the u wrap: inside the last wrapMargin of u
  // the sample cross-fades to the sample one period back, so the value at
  // u=1 equals the value at u=0 and the tube circumference tiles without
  // a vertical seam. Outside the margin only one sample is taken.
  const wrapMargin = 0.2;
  const fbmWrapU = (
    u: number,
    uFrequency: number,
    xOffset: number,
    y: number,
    octaves: number,
  ) => {
    const base = fbm2(u * uFrequency + xOffset, y, octaves);
    if (u < 1 - wrapMargin) return base;
    const t = (u - (1 - wrapMargin)) / wrapMargin;
    return lerp(base, fbm2((u - 1) * uFrequency + xOffset, y, octaves), t);
  };

  // Cherry lenticels: horizontal lens-shaped pores at random heights,
  // elongated along the circumference (u). Seeded so rebuilds are stable.
  // Denser than before: the horizontal banding is a primary cherry-bark cue
  // and has to survive the dark scene lighting.
  const lenticelRng = makeRng(0xba7c11);
  const lenticels: {
    vCenter: number;
    uCenter: number;
    uHalfLength: number;
    vSigma: number;
    strength: number;
  }[] = [];
  for (let i = 0; i < 24; i += 1) {
    lenticels.push({
      vCenter: lenticelRng(),
      uCenter: lenticelRng(),
      uHalfLength: 0.13 + lenticelRng() * 0.22,
      vSigma: 0.005 + lenticelRng() * 0.006,
      strength: 0.75 + lenticelRng() * 0.35,
    });
  }

  // Knots: dark sunken cores with a raised rim ring, scattered and seeded.
  // du wraps around the tube seam like the lenticels do.
  const knotRng = makeRng(0x6b07);
  const knots: {
    uCenter: number;
    vCenter: number;
    uRadius: number;
    vRadius: number;
    strength: number;
  }[] = [];
  for (let i = 0; i < 5; i += 1) {
    knots.push({
      uCenter: knotRng(),
      vCenter: knotRng(),
      uRadius: 0.06 + knotRng() * 0.07,
      vRadius: 0.028 + knotRng() * 0.035,
      strength: 0.6 + knotRng() * 0.4,
    });
  }

  // Bark color ramp stops (sRGB bytes): purple-brown shadow, warm
  // gray-brown mid, slightly desaturated highlight. The mid stop is shared
  // by both halves of the ramp so the transition stays continuous. Wider
  // spread than before: the dark stage lighting flattens subtle bump, so
  // the fissure/ridge contrast is baked into the albedo aggressively.
  const rampShadow = [28, 20, 25];
  const rampMid = [104, 84, 74];
  const rampHighlight = [174, 158, 144];

  const colorData = new Uint8ClampedArray(width * height * 4);
  const bumpData = new Uint8ClampedArray(width * height * 4);
  const roughData = new Uint8ClampedArray(width * height * 4);
  const rowLenticels: typeof lenticels = [];
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    // Row prefilter: the v gate below is row-constant up to the +-0.003
    // stroke wobble, so most rows skip the lenticel work entirely.
    rowLenticels.length = 0;
    for (const lenticel of lenticels) {
      let dv0 = v - lenticel.vCenter;
      dv0 -= Math.round(dv0);
      if (Math.abs(dv0) <= lenticel.vSigma * 3.2 + 0.003) {
        rowLenticels.push(lenticel);
      }
    }
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      // Ridge flow along the branch with a slight helical drift (the v*1.4
      // term skews the ridges around the tube as v advances).
      const verticalRaw =
        fbmWrapU(u, 16.0, Math.sin(v * 18.0) * 0.36 + v * 1.4, v * 3.2, 5) *
          0.55 +
        fbmWrapU(u, 44.0, v * 2.1, v * 9.5 - 3.4, 3) * 0.45;
      // Contrast stretch so the fissure threshold below has real spread.
      const vertical = clamp01((verticalRaw - 0.5) * 1.75 + 0.5);
      const fineGrain = fbmWrapU(u, 96.0, -6.8, v * 32.0 + 2.4, 3);
      // Second, higher-frequency cross-grain octave: tight striations that
      // keep the surface busy between the deep fissures.
      const crossGrain =
        fbmWrapU(u, 168.0, 12.3, v * 64.0 + 7.7, 2) - 0.5;
      // Wider threshold + deeper floor than before: fissures claim more
      // area and cut harder.
      const fissure =
        smoothstep(0.5, 0.8, vertical) *
        (0.6 + smoothstep(0.5, 0.8, fineGrain) * 0.4);
      // Knots: sunken dark core inside a raised rim ring, with a slight
      // helical wobble on the center like real occluded branch stubs.
      let knotCore = 0;
      let knotRim = 0;
      for (const knot of knots) {
        let du = u - knot.uCenter - Math.sin(v * 9.0) * 0.02;
        du -= Math.round(du);
        const dv = v - knot.vCenter;
        if (Math.abs(dv) > knot.vRadius * 3) continue;
        const d = Math.sqrt(
          (du * du) / (knot.uRadius * knot.uRadius) +
            (dv * dv) / (knot.vRadius * knot.vRadius),
        );
        if (d > 2.6) continue;
        knotCore += knot.strength * Math.exp(-d * d * 1.6);
        knotRim +=
          knot.strength * Math.exp(-Math.pow((d - 1.35) / 0.42, 2));
      }
      knotCore = clamp01(knotCore);
      knotRim = clamp01(knotRim);
      const ridge = clamp01(
        0.42 +
          vertical * 0.45 +
          fineGrain * 0.18 +
          crossGrain * 0.22 -
          fissure * 0.36,
      );

      // Lenticel profile: gaussian falloff in v, lens taper plus fbm
      // breakup along u so the strokes read as broken pore bands.
      const strokeNoise =
        rowLenticels.length > 0 ? fbmWrapU(u, 26.0, 3.7, v * 88.0, 3) : 0.5;
      let lenticelCore = 0;
      let lenticelRim = 0;
      for (const lenticel of rowLenticels) {
        let dv = v - lenticel.vCenter;
        dv -= Math.round(dv);
        dv += (strokeNoise - 0.5) * 0.006;
        if (Math.abs(dv) > lenticel.vSigma * 3.2) continue;
        let du = u - lenticel.uCenter;
        du -= Math.round(du);
        const along = Math.abs(du) / lenticel.uHalfLength;
        if (along >= 1) continue;
        const gauss = Math.exp(
          -(dv * dv) / (2 * lenticel.vSigma * lenticel.vSigma),
        );
        const profile =
          lenticel.strength *
          (1 - along * along) *
          gauss *
          (0.4 + 0.6 * smoothstep(0.28, 0.72, strokeNoise));
        lenticelCore += smoothstep(0.26, 0.66, profile);
        lenticelRim +=
          smoothstep(0.16, 0.3, profile) * (1 - smoothstep(0.3, 0.5, profile));
      }
      lenticelCore = clamp01(lenticelCore);
      lenticelRim = clamp01(lenticelRim);

      // Horizontal peeling bands (slow in u, fast in v), a cherry-bark cue.
      const peelBand = fbmWrapU(u, 1.6, 7.7, v * 26.0, 2) - 0.5;

      const bump = clamp01(
        0.42 +
          ridge * 0.42 -
          fissure * 0.58 +
          knotRim * 0.34 -
          knotCore * 0.26 +
          crossGrain * 0.16 +
          peelBand * 0.14 +
          lenticelCore * 0.3 -
          lenticelRim * 0.08,
      );

      // Crevice occlusion baked into the color so fissures still read
      // where bump nuance is lost (distance, software rendering, and this
      // scene's dim stage lighting). The coefficients here are tuned as a
      // pair with the bump mix above: retune both together or the albedo
      // shading drifts from the relief. The occlusion floor is deeper than
      // before (0.34 vs 0.5) and a final contrast stretch keeps the
      // fissures near-black under the warm key.
      let shade =
        clamp01(
          0.5 +
            ridge * 0.5 -
            fissure * 0.62 +
            knotRim * 0.2 -
            knotCore * 0.3 +
            crossGrain * 0.2 +
            peelBand * 0.34,
        ) *
        (0.34 + 0.66 * bump);
      shade = clamp01((shade - 0.5) * 1.4 + 0.5);

      // Warm gray-brown ramp: purple-brown shadows, desaturated highlights.
      let r: number;
      let g: number;
      let b: number;
      if (shade < 0.5) {
        const t = shade * 2;
        r = lerp(rampShadow[0], rampMid[0], t);
        g = lerp(rampShadow[1], rampMid[1], t);
        b = lerp(rampShadow[2], rampMid[2], t);
      } else {
        const t = (shade - 0.5) * 2;
        r = lerp(rampMid[0], rampHighlight[0], t);
        g = lerp(rampMid[1], rampHighlight[1], t);
        b = lerp(rampMid[2], rampHighlight[2], t);
      }

      // Low-frequency warm/cool patchiness so the bark is not monochrome.
      const hueShift = fbmWrapU(u, 3.0, 9.1, v * 2.0 + 5.0, 3) - 0.5;
      r += hueShift * 20;
      g += hueShift * 7;
      b -= hueShift * 8;

      // Faint damp sheen in the crevices — a cool plum, not the old green
      // algae (the night palette is pink/plum/violet only).
      const damp =
        smoothstep(0.55, 0.8, fbmWrapU(u, 2.2, -4.3, v * 1.6 + 11.0, 2)) *
        smoothstep(0.25, 0.7, fissure) *
        0.45;
      r = lerp(r, 64, damp);
      g = lerp(g, 50, damp);
      b = lerp(b, 68, damp);

      // Dark rim first, then the light tan-orange lenticel fill.
      r = lerp(r, 38, lenticelRim * 0.35);
      g = lerp(g, 27, lenticelRim * 0.35);
      b = lerp(b, 31, lenticelRim * 0.35);
      r = lerp(r, 176, lenticelCore * 0.85);
      g = lerp(g, 138, lenticelCore * 0.85);
      b = lerp(b, 104, lenticelCore * 0.85);

      const index = (y * width + x) * 4;
      colorData[index] = r;
      colorData[index + 1] = g;
      colorData[index + 2] = b;
      colorData[index + 3] = 255;

      const bumpValue = Math.floor(bump * 255);
      bumpData[index] = bumpValue;
      bumpData[index + 1] = bumpValue;
      bumpData[index + 2] = bumpValue;
      bumpData[index + 3] = 255;

      // Baked roughness variation: crevices stay matte, exposed ridge tops
      // and the waxy lenticel bands turn slightly glossier so the warm key
      // and rose backlight pick up the relief as broken micro-highlights
      // instead of one smooth gradient.
      const roughValue = Math.floor(
        clamp01(
          0.88 +
            fissure * 0.12 -
            smoothstep(0.62, 0.95, shade) * 0.34 -
            lenticelCore * 0.3 -
            knotRim * 0.1 +
            crossGrain * 0.08,
        ) * 255,
      );
      roughData[index] = roughValue;
      roughData[index + 1] = roughValue;
      roughData[index + 2] = roughValue;
      roughData[index + 3] = 255;
    }
  }
  return { color: colorData, bump: bumpData, rough: roughData };
}
