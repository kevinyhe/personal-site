import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text().slice(0, 200)); });
await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 220000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 280000, polling: 1000 });
console.log("reveal done");
const cdp = await page.context().newCDPSession(page);
for (const vh of [4.05, 4.2, 4.35, 4.5, 4.9]) {
  await page.evaluate((v) => { window.scrollTo(0, Math.round(v * window.innerHeight)); window.dispatchEvent(new Event("scroll")); }, vh);
  await page.waitForTimeout(9000);
  const info = await page.evaluate(() => ({ t: window.__robotOutro?.run?.time, p: window.__thinkerStage?.progress?.robot, c: window.__thinkerStage?.camera }));
  const c=info.c||{}; const d=c.camera&&c.robot?Math.hypot(c.camera[0]-c.robot[0],c.camera[1]-c.robot[1],c.camera[2]-c.robot[2]):-1; console.log(`vh=${vh} t=${info.t?.toFixed(2)} dist=${d.toFixed(2)} resting=${c.resting} speed=${c.speed?.toFixed(2)} cam=${c.camera?.map(n=>+n.toFixed(1))} robot=${c.robot?.map(n=>+n.toFixed(1))}`);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`.scratch-s54100/game-${vh}.png`, Buffer.from(data, "base64"));
}
await browser.close();
