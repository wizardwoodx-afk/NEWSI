import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "D:/selfimpulse-work/shots/v3-dark.png" });

await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
await page.waitForTimeout(400);
await page.screenshot({ path: "D:/selfimpulse-work/shots/v3-light.png" });
await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
await page.waitForTimeout(300);

// walk the screens that have real content
for (const n of ["Specialists", "Receipts", "Settings"]) {
  try {
    await page.getByText(n, { exact: true }).first().click({ timeout: 4000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `D:/selfimpulse-work/shots/v3-${n.toLowerCase()}.png` });
    console.log(`  ${n} shot ok`);
  } catch (e) { console.log(`  ${n}: ${e.message.split("\n")[0]}`); }
}

// measure real contrast on what is actually on screen
await page.getByText("Specialists", { exact: true }).first().click();
await page.waitForTimeout(700);
const samples = await page.evaluate(() => {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const bg = getComputedStyle(document.body).backgroundColor;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!el.textContent?.trim() || el.children.length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    const size = parseFloat(cs.fontSize);
    const r = ratio(cs.color, bg);
    const need = size >= 18.66 ? 3 : 4.5;
    if (r < need) out.push({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 40), size, ratio: +r.toFixed(2), need });
  }
  return { bg, failures: out.slice(0, 12) };
});
console.log("\ncontrast on specialists screen, body bg", samples.bg);
console.log(samples.failures.length ? "  FAILING:" : "  all measured text passes WCAG AA");
for (const f of samples.failures) console.log(`   ${f.tag}.${f.cls} "${f.text}" ${f.size}px -> ${f.ratio}:1 (needs ${f.need})`);

console.log(errs.length ? "\nCONSOLE ERRORS:\n  " + errs.slice(0, 8).join("\n  ") : "\nno console errors");
await browser.close();
