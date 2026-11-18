// Renders the PWA icons (PNG) from inline SVG with Playwright's Chromium. Re-run after changing the design:
//   node scripts/make-icons.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

// Blue tile, white face outline with a check mark. `pad` shrinks the art for maskable icons (safe zone 80 %).
const svg = (pad, rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#1d4ed8"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M136 176V140a28 28 0 0 1 28-28h36M312 112h36a28 28 0 0 1 28 28v36M376 336v36a28 28 0 0 1-28 28h-36M200 400h-36a28 28 0 0 1-28-28v-36" stroke-width="28"/>
    <path d="M184 262l52 52 96-104" stroke-width="40"/>
  </g>
</svg>`;

const badge = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="M26 50l15 15 30-32" fill="none" stroke="#000" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192, body: svg(0, true) },
  { file: "icon-512.png", size: 512, body: svg(0, true) },
  { file: "maskable-512.png", size: 512, body: svg(56, false) },
  { file: "apple-touch-icon.png", size: 180, body: svg(20, false) },
  { file: "badge-96.png", size: 96, body: badge, transparent: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.body.replace("<svg ", `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: `${OUT}/${t.file}`, omitBackground: true });
  console.log("wrote", `${OUT}/${t.file}`);
}
await browser.close();
