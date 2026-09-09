import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 200000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 260000, polling: 1000 });
const cdp = await page.context().newCDPSession(page);
const shots = [];
for (const vh of [3.90, 4.15, 4.45, 4.7, 4.95, 5.2, 5.45]) {
  await page.evaluate((v) => { window.scrollTo(0, Math.round(v * window.innerHeight)); window.dispatchEvent(new Event("scroll")); }, vh);
  await page.waitForTimeout(2600);
  const info = await page.evaluate(() => ({ t: window.__robotOutro?.run?.time, robot: window.__thinkerStage?.progress?.robot }));
  console.log(`vh=${vh} playhead=${info.t?.toFixed(2)}s robotPhase=${info.robot?.toFixed(3)}`);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  const f = `.scratch-s54100/scrub-${vh}.png`; writeFileSync(f, Buffer.from(data, "base64")); shots.push(f);
}
// hold still: the playhead must not advance on its own
const a = await page.evaluate(() => window.__robotOutro?.run?.time);
await page.waitForTimeout(3000);
const b = await page.evaluate(() => window.__robotOutro?.run?.time);
console.log(`held still 3s: ${a?.toFixed(3)} -> ${b?.toFixed(3)} (must not move)`);
await browser.close();
