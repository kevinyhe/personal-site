import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 200000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 260000, polling: 1000 });
await page.evaluate(() => { window.scrollTo(0, Math.round(4.8 * window.innerHeight)); window.dispatchEvent(new Event("scroll")); });
for (const w of [3000, 4000, 5000, 6000]) {
  await page.waitForTimeout(w === 3000 ? 3000 : 4000);
  const v = await page.evaluate(() => ({ t: window.__robotOutro?.run?.time, p: window.__thinkerStage?.progress?.robot }));
  console.log(`after settling: playhead=${v.t?.toFixed(4)} phase=${v.p?.toFixed(4)}`);
}
await browser.close();
