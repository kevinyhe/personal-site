import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("pageerror", e => console.log("[pageerror]", e.message.slice(0,200)));
await p.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.__scrollScene === true, null, { timeout: 220000, polling: 500 });
await p.waitForFunction(() => { const t=getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t==="none"||t==="matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 280000, polling: 1000 });
console.log("state:", await p.evaluate(() => JSON.stringify({
  limit: window.__lenis?.limit, docH: document.documentElement.scrollHeight,
  animated: Math.round(window.__lenis?.animatedScroll ?? -1), isStopped: window.__lenis?.isStopped })));
await p.evaluate(() => { window.__lenis.options.duration = 8; window.__lenis.scrollTo(1500); });
const s=[];
for (let i=0;i<12;i++){ s.push(await p.evaluate(()=>Math.round(window.__lenis.animatedScroll))); await p.waitForTimeout(500); }
console.log("animatedScroll after scrollTo(1500):", s.join(" -> "));
await b.close();
