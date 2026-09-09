import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const t0 = Date.now();
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 200000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 260000, polling: 1000 });
// The statue must exist the moment the reveal is over (the intro now holds for it).
const ready = await page.evaluate(() => !!window.__thinkerStage);
console.log("reveal done at", ((Date.now()-t0)/1000).toFixed(0), "s; thinker stage present:", ready);
const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`.scratch-s54100/${name}.png`, Buffer.from(data, "base64"));
};
// Sit just before the cut, then just after: should be a hard change, no pan.
for (const [vh, name] of [[3.80, "pre"], [3.87, "post"]]) {
  await page.evaluate((v) => { window.scrollTo(0, Math.round(v * window.innerHeight)); window.dispatchEvent(new Event("scroll")); }, vh);
  await page.waitForTimeout(3500);
  await shot(name);
}
// Then the run: sample the robot's screen position over time.
await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); window.dispatchEvent(new Event("scroll")); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__robotOutro?.replay());
for (let k = 0; k < 6; k++) {
  await page.waitForTimeout(1600);
  await shot(`run-${k}`);
}
await browser.close();
