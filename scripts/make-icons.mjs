// Renders the Cadence icon (public/favicon.svg motif) to every PNG size the web app and phone builds need.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GREEN = "#234E3C", CREAM = "#F4F7F5", CANVAS = "#f3f1ec";
const mark = (size, pad = 0) => {
  const s = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${pad} ${pad}) scale(${s / 32})">
    <circle cx="16" cy="16" r="6" fill="none" stroke="${CREAM}" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="2" fill="${CREAM}"/>
  </g></svg>`;
};
const full = (size, radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>${mark(size).replace(/<\/?svg[^>]*>/g, "")}</svg>`;

const jobs = [
  ["public/icon-180.png", 180, full(180, 0)],
  ["public/icon-192.png", 192, full(192, 40)],
  ["public/icon-512.png", 512, full(512, 110)],
  ["public/icon-maskable-512.png", 512, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${GREEN}"/><g transform="translate(96 96) scale(${320 / 512})">${mark(512).replace(/<\/?svg[^>]*>/g, "")}</g></svg>`],
  ["assets/icon-only.png", 1024, full(1024, 0)],
  ["assets/icon-background.png", 1024, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${GREEN}"/></svg>`],
  ["assets/icon-foreground.png", 1024, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><g transform="translate(192 192) scale(${640 / 1024})">${mark(1024).replace(/<\/?svg[^>]*>/g, "")}</g></svg>`, true],
  ["assets/splash.png", 2732, `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="${CANVAS}"/><rect x="1166" y="1166" width="400" height="400" rx="90" fill="${GREEN}"/><g transform="translate(1166 1166) scale(${400 / 1024})">${mark(1024).replace(/<\/?svg[^>]*>/g, "")}</g></svg>`],
  ["assets/splash-dark.png", 2732, `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#121311"/><rect x="1166" y="1166" width="400" height="400" rx="90" fill="${GREEN}"/><g transform="translate(1166 1166) scale(${400 / 1024})">${mark(1024).replace(/<\/?svg[^>]*>/g, "")}</g></svg>`],
];

mkdirSync("public", { recursive: true });
mkdirSync("assets", { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [path, size, svg, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  writeFileSync(path, await page.screenshot({ omitBackground: !!transparent, type: "png" }));
  await page.close();
}
await browser.close();
console.log("icons done");
