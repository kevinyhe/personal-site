// node scripts/contact-statue.mjs
//
// The two statues behind Contact (components/luke/Contact.tsx), God with
// his cherubs and Adam, from the renders in scripts/contact-src/, made
// ready for the site's bars (components/below/barPicture.tsx), which draw
// each cell as wide as it is bright: written to public/work/contact-*.webp
// as plain greys.
//
// Each render's flat background grey (back) goes to black, so it draws no
// bars, and its brightest marble (white, 255 unless given) to white. Where a render crops a figure inside the
// panel, that edge fades out (a share of the width at the sides, of the
// height at the top and foot), eased, so the figure fades rather than
// ending in a straight cut. An edge that sits on the panel's own edge (Adam's
// back) does not fade: the panel cuts it, as it cuts the hands' arms.
import sharp from "sharp";

const JOBS = [
  // Feathers: [left, right, top, foot].
  // God flying in, pointing. Cut at x 1040, through his robe: drawn as big
  // as Contact draws him, the screen never shows past about 1000 of it, and
  // the rest only made his canvas wider. Nothing bright touches
  // the other edges (the rock in the lower left corner is too dark to draw
  // a bar), and only a cherub's foot comes near the foot. Its marble tops
  // out at about 215.
  { src: "scripts/contact-src/god-flying.png", out: "public/work/contact-god.webp", back: 15, white: 215, crop: 1040, fade: [0, 0, 0, 0.03] },
  // Adam reclining on his rock, reaching. Cut at x 1270, between his
  // fingertip (1249) and the render's own God's hand (from 1288): the God
  // statue gives the other hand. The rock behind him sits at grey 18 to
  // 41, so it starts at 28 and draws next to nothing; his legs run off the
  // render's foot, so that fades.
  { src: "scripts/contact-src/adam-reclining.png", out: "public/work/contact-adam.webp", back: 28, white: 213, crop: 1270, fade: [0, 0, 0, 0.12] },
];

const ease = (t) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

for (const job of JOBS) {
  const { data, info } = await sharp(job.src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const stride = info.width;
  const W = job.crop ?? info.width;
  const H = job.cropH ?? info.height;
  const [left, right, top, foot] = job.fade;
  const edge = (d, share, size) => (share > 0 ? ease(d / (share * size)) : 1);
  const out = Buffer.alloc(W * H);
  for (let y = 0; y < H; y += 1) {
    const fy = edge(y, top, H) * edge(H - 1 - y, foot, H);
    for (let x = 0; x < W; x += 1) {
      const v = Math.max(0, Math.min(1, (data[y * stride + x] - job.back) / ((job.white ?? 255) - job.back)));
      out[y * W + x] = Math.round(255 * v * fy * edge(x, left, W) * edge(W - 1 - x, right, W));
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 1 } }).webp({ quality: 82 }).toFile(job.out);
  console.log(job.out, `${W} x ${H}`);
}
