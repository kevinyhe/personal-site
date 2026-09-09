import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const t = process.argv[2];
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { window.__heroHold = true; });
await page.goto(`http://localhost:3005/?tvAt=${t}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(20000);
const cdp = await page.context().newCDPSession(page);
for (let k = 0; k < 6; k++) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`avg-${t}-${k}.png`, Buffer.from(data, "base64"));
  await page.waitForTimeout(700);
}
await browser.close();
