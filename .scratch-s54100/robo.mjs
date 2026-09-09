import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const t0 = Date.now();
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 180000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 240000, polling: 1000 });
console.log("reveal done", ((Date.now()-t0)/1000).toFixed(0), "s");
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); window.dispatchEvent(new Event("scroll")); });
await page.waitForTimeout(6000);
// force a replay so the run starts from the top
await page.evaluate(() => window.__robotOutro?.replay());
for (let k = 0; k < 6; k++) {
  await page.waitForTimeout(2200);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`.scratch-s54100/run-${k}.png`, Buffer.from(data, "base64"));
  const s = await page.evaluate(() => { const r = window.__robotOutro?.run; return r ? `${r.playing} t=${r.time.toFixed(2)}` : "none"; });
  console.log("frame", k, s);
}
await browser.close();
