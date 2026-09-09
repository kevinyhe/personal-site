import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("pageerror", e => console.log("[pageerror]", e.message.slice(0,200)));
await p.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.__scrollScene === true, null, { timeout: 220000, polling: 500 });
await p.waitForFunction(() => { const t = getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t==="none"||t==="matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 280000, polling: 1000 });
await p.evaluate(() => { window.scrollTo(0, 4.4*window.innerHeight); window.dispatchEvent(new Event("scroll")); });
await p.waitForTimeout(8000);
console.log(await p.evaluate(() => JSON.stringify({
  hasStage: !!window.__thinkerStage,
  keys: window.__thinkerStage ? Object.keys(window.__thinkerStage) : null,
  camKeys: window.__thinkerStage?.camera ? Object.keys(window.__thinkerStage.camera) : null,
  progress: window.__thinkerStage ? [window.__thinkerStage.progress.value, window.__thinkerStage.progress.robot] : null,
  runTime: window.__robotOutro?.run?.time,
})));
await b.close();
