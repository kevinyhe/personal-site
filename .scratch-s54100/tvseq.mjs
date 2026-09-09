import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const times = (process.argv[2] ?? "6,10,14,18,24,32,45,60").split(",").map(Number);
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { window.__heroHold = true; });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
const cdp = await page.context().newCDPSession(page);
let elapsed = 0;
for (const t of times) {
  await page.waitForTimeout((t - elapsed) * 1000);
  elapsed = t;
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`/tmp/claude-1000/-home-kevin-projects-arbor-web/54100826-470d-415c-9137-9830d97c804a/scratchpad/tvseq-${t}.png`, Buffer.from(data, "base64"));
  console.log("shot", t);
}
await browser.close();
