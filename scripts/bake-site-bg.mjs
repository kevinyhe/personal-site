// Pre-renders the two drifting blob layers behind every page (app/globals.css,
// "Site background field") to public/bg/field-warm.webp and field-cool.webp.
//
// Why an image and not `filter: blur(90px)` in CSS: a blur filter on an
// animated, promoted layer is re-applied by the compositor every frame, for
// the whole layer, on every route — including the home hero, where the GPU is
// already spent on the tree. A pre-blurred texture costs one textured quad per
// layer per frame, and the drift is the same translate it always was.
//
// The gradients below are the CSS the layers used to carry, verbatim, so the
// look is the CSS look captured once. Rendered at 384x240 with the blur scaled
// to match: the live layer was 1.6x a 1280x800 viewport (2048x1280) under
// blur(90px), so this is the same picture at 3/16 scale. That is enough
// because the blur radius is 90 screen px and bilinear upscaling only has to
// bridge ~5px texel gaps; a 1024x640 render came out at 80 kB a layer against
// 10 kB here and looked the same under the grain. Then cropped to the central
// 75%, because the layer box shrank from inset:-30% to inset:-10% once there
// was no blur rim to hide (see the CSS), and that 120%-of-viewport box is the
// central 120/160 of the old one.
//
//   npm run bake:bg           (BG_W, BG_H, BG_Q override the render size/quality)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const W = Number(process.env.BG_W || 384);
const H = Number(process.env.BG_H || 240);
const BLUR = W * (90 / 2048); // 90px on the 2048px-wide live layer, scaled with the render.
const CROP = 0.75;
const QUALITY = Number(process.env.BG_Q || 0.85);

const LAYERS = {
  "field-warm": `
    radial-gradient(40% 48% at 66% 15%, #c9648e 0%, rgba(201, 100, 142, 0) 66%),
    radial-gradient(46% 38% at 82% 46%, #a62c5c 0%, rgba(166, 44, 92, 0) 70%),
    radial-gradient(34% 42% at 44% 66%, #64143a 0%, rgba(100, 20, 58, 0) 72%)`,
  "field-cool": `
    radial-gradient(44% 38% at 88% 66%, #33285c 0%, rgba(51, 40, 92, 0) 74%),
    radial-gradient(28% 34% at 26% 24%, #9a4352 0%, rgba(154, 67, 82, 0) 70%),
    radial-gradient(54% 44% at 68% 92%, #240b1a 0%, rgba(36, 11, 26, 0) 76%)`,
};

mkdirSync("public/bg", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });

for (const [name, background] of Object.entries(LAYERS)) {
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;background:transparent}
    #l{position:absolute;inset:0;filter:blur(${BLUR}px);background:${background}}
  </style><div id="l"></div>`);
  const png = await page.screenshot({ omitBackground: true, type: "png" });
  // Crop and encode in-page: a canvas is the only WebP encoder already here.
  const dataUrl = await page.evaluate(
    async ([b64, crop, quality]) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const w = Math.round(img.width * crop);
      const h = Math.round(img.height * crop);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(
        img,
        (img.width - w) / 2,
        (img.height - h) / 2,
        w,
        h,
        0,
        0,
        w,
        h,
      );
      return c.toDataURL("image/webp", quality);
    },
    [png.toString("base64"), CROP, QUALITY],
  );
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(`public/bg/${name}.webp`, bytes);
  console.log(`public/bg/${name}.webp ${bytes.length} bytes`);
}
await browser.close();
