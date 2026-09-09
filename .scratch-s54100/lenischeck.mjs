import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("pageerror", e => console.log("[pageerror]", e.message.slice(0,200)));
p.on("console", m => { if (m.type()==="error") console.log("[err]", m.text().slice(0,160)); });
await p.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);
console.log(await p.evaluate(() => JSON.stringify({
  htmlClass: document.documentElement.className,
  reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  htmlStyle: document.documentElement.getAttribute("style"),
})));
await b.close();
