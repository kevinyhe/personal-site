import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { window.__heroHold = true; });
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
const cdp = await page.context().newCDPSession(page);
// Wait for the loader to give way to the scene (canvas painting non-black).
await page.waitForTimeout(5000);
let elapsed = 5;
for (const t of [6.4, 6.8, 7.2, 7.6, 8.0, 8.4, 8.8, 9.2]) {
  await page.waitForTimeout((t - elapsed) * 1000);
  elapsed = t;
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`fine-${t.toFixed(1)}.png`, Buffer.from(data, "base64"));
}
await browser.close();
