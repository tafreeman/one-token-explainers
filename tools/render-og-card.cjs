#!/usr/bin/env node
// Renders tools/og-card.html to shared/og-one-token.png (1200x630), the Open Graph / Twitter card
// every entrypoint points at. Run after editing the card: `node tools/render-og-card.cjs`.
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const WIDTH = 1200;
const HEIGHT = 630;

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(ROOT, 'tools', 'og-card.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(ROOT, 'shared', 'og-one-token.png');
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    console.log('wrote', path.relative(ROOT, out));
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
