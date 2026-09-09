import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 180000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 240000, polling: 1000 });
const cdp = await page.context().newCDPSession(page);
// scroll positions in viewport-heights
for (const vh of [3.32, 3.6, 3.82, 3.95, 4.05, 4.42]) {
  await page.evaluate((v) => { window.scrollTo(0, Math.round(v * window.innerHeight)); window.dispatchEvent(new Event("scroll")); }, vh);
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const p = window.__thinkerStage?.progress;
    const panel = document.querySelector("[data-hero-panel]");
    return { panel: panel ? getComputedStyle(panel).transform : null, statue: p?.value, robot: p?.robot };
  });
  console.log(`vh=${vh}`, JSON.stringify(info));
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`.scratch-s54100/cut-${vh}.png`, Buffer.from(data, "base64"));
}
await browser.close();
