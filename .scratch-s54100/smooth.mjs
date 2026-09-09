import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("pageerror", e => console.log("[pageerror]", e.message.slice(0,160)));
await p.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.__scrollScene === true, null, { timeout: 220000, polling: 500 });
await p.waitForFunction(() => { const t=getComputedStyle(document.querySelector("[data-hero-panel]").previousElementSibling).transform; return t==="none"||t==="matrix(1, 0, 0, 1, 0, 0)"; }, null, { timeout: 280000, polling: 1000 });
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(2500);
// one wheel notch, then sample scrollY over time: eased scrolling keeps
// moving after the input, native lands in one step.
await p.mouse.move(640, 400);
await p.mouse.wheel(0, 600);
const samples = [];
for (let i = 0; i < 14; i++) {
  samples.push(await p.evaluate(() => Math.round(window.scrollY)));
  await p.waitForTimeout(90);
}
console.log("scrollY after one 600px wheel notch:");
console.log(" ", samples.join(" -> "));
const moved = samples.filter((v, i) => i > 0 && v !== samples[i-1]).length;
console.log(`distinct movements across ${samples.length} samples: ${moved} (native scrolling would be 0-1)`);
await b.close();
