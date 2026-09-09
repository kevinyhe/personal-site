// Usage: node capture.mjs <out-prefix> <fraction,fraction,...> [waitMs]
// Loads the page, waits for the scroll scene (window.__scrollScene), then for
// each fraction f scrolls to 200vh + f*400vh (the statue spacer), waits, and
// captures via CDP Page.captureScreenshot. Also samples the thinker progress.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [outPrefix = "shot", fractionsArg = "0", waitArg = "1500"] = process.argv.slice(2);
const fractions = fractionsArg.split(",").map(Number);
const settleMs = Number(waitArg);
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning" || m.text().includes("hinker")) console.log("[console]", m.type(), m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const t0 = Date.now();
await page.goto("http://localhost:3005/?auditChunks=1", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 180000, polling: 500 });
console.log("scroll scene ready after", ((Date.now() - t0) / 1000).toFixed(1), "s");
// The reveal (television -> flat hero) runs far slower than wall-clock under
// software rendering; wait until the site layer's homography is identity.
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 240000, polling: 1000 });
console.log("reveal done after", ((Date.now() - t0) / 1000).toFixed(1), "s");
const cdp = await page.context().newCDPSession(page);
for (const f of fractions) {
  const y = await page.evaluate((f) => {
    const vh = window.innerHeight;
    const y = Math.round(f * vh);
    window.scrollTo(0, y);
    window.dispatchEvent(new Event("scroll"));
    return y;
  }, f);
  await page.waitForTimeout(settleMs);
  const info = await page.evaluate(() => {
    const panel = document.querySelector("[data-hero-panel]");
    const canvas = panel?.querySelector("canvas");
    return {
      scrollY: window.scrollY,
      docH: document.documentElement.scrollHeight,
      panelTransform: panel ? getComputedStyle(panel).transform : null,
      canvasSize: canvas ? [canvas.width, canvas.height] : null,
      thinker: window.__thinkerStage ? [window.__thinkerStage.progress.value, window.__thinkerStage.progress.breakStart] : null,
    };
  });
  console.log(`f=${f} y=${y}`, JSON.stringify(info));
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`${outPrefix}-${f}.png`, Buffer.from(data, "base64"));
}
await browser.close();
