import { chromium } from "playwright";

const URL = "http://localhost:5173/";
const WIDTHS = [1280, 1536, 1920, 2560];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 830 } });
await page.goto(URL, { waitUntil: "networkidle" });

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 830 });
  await page.waitForTimeout(350);
  const m = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right) };
    };
    const d = document.documentElement;
    const off = [...document.querySelectorAll(".si-content *")].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.right > innerWidth + 1;
    }).slice(0, 5).map((e) => `${e.className || e.tagName}@${Math.round(e.getBoundingClientRect().right)}`);
    return {
      vw: innerWidth,
      docScrollW: d.scrollWidth,
      rail: rect(".si-rail"),
      content: rect(".si-content"),
      deck: rect(".deck-wrap"),
      composer: rect(".composer"),
      ledger: rect(".ledger"),
      clippedByViewport: off,
    };
  });
  const c = m.composer, ct = m.content;
  const pastViewport = c ? c.right > m.vw : false;
  const pastContainer = c && ct ? c.right > ct.right + 1 : false;
  console.log(
    `vw=${String(m.vw).padEnd(5)} rail=${m.rail?.w} content=[${m.content?.x}..${m.content?.right}] w=${m.content?.w}` +
    ` composer=[${c?.x}..${c?.right}] w=${c?.w} ledgerRight=${m.ledger?.right}` +
    ` | PAST_VIEWPORT=${pastViewport} PAST_CONTAINER=${pastContainer} docScroll=${m.docScrollW > m.vw ? "OVERFLOW" : "ok"}` +
    `${m.clippedByViewport.length ? " offenders=" + m.clippedByViewport.join(",") : ""}`
  );
}
await browser.close();
