import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./release/node_modules/playwright/index.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const svg = await fs.readFile(path.join(root, "架構圖.svg"), "utf8");
const output = path.join(root, "架構圖.png");
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--no-sandbox"] });

try {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1500 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>html,body{margin:0;width:2400px;height:1500px;overflow:hidden;background:#f5f7fb}</style></head><body>${svg}</body></html>`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, fullPage: false });
} finally {
  await browser.close();
}

console.log(`已輸出 ${output}`);
