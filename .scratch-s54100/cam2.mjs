import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text().slice(0, 200)); });
await page.goto("http://localhost:3007/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__scrollScene === true, null, { timeout: 240000, polling: 500 });
await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 300000, polling: 1000 });
console.log("reveal done");
const cdp = await page.context().newCDPSession(page);
const vhs = process.argv.slice(2).map(Number);
for (const vh of vhs) {
  await page.evaluate((v) => {
    const y = Math.round(v * window.innerHeight);
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
    window.dispatchEvent(new Event("scroll"));
  }, vh);
  await page.waitForTimeout(9000);
  const info = await page.evaluate(() => ({ t: window.__robotOutro?.run?.time, p: window.__thinkerStage?.progress?.robot, c: window.__thinkerStage?.camera }));
  const c = info.c || {};
  console.log(`vh=${vh} robotPhase=${info.p?.toFixed(3)} t=${info.t?.toFixed(2)} cam=${c.camera?.map(n=>+n.toFixed(2))} look=${c.look?.map(n=>+n.toFixed(2))} robot=${c.robot?.map(n=>+n.toFixed(2))} speed=${c.speed?.toFixed(2)}`);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
  writeFileSync(`.scratch-s54100/cam-${vh}.png`, Buffer.from(data, "base64"));
}
await browser.close();
